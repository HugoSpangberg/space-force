import { mkdirSync, readFileSync, writeFileSync, renameSync, lstatSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const budgets = { plan: 600_000, implement: 1_200_000, verify: 1_200_000 };
const readOnlyTools = new Set(['read', 'glob', 'grep', 'find', 'search', 'list']);
const rootReadOnlyLimit = 4;
const specialistReadOnlyLimit = 12;
const identicalReadLimit = 2;
const staleChildLimit = 600_000;
const systemAgents = new Set(['compaction', 'title', 'summary']);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clean = value => typeof value === 'string' ? value.slice(0, 2000) : '';
export const STOP_REASONS = Object.freeze({
  none: 'none',
  loopDetected: 'loop_detected',
  contextOverflow: 'context_overflow',
  compactionFailed: 'compaction_failed',
  providerError: 'provider_error',
  stalled: 'stalled',
  userCancelled: 'user_cancelled',
  budgetExhausted: 'budget_exhausted',
});
const repairableStops = new Set([
  STOP_REASONS.loopDetected,
  STOP_REASONS.contextOverflow,
  STOP_REASONS.compactionFailed,
  STOP_REASONS.providerError,
  STOP_REASONS.stalled,
]);
const repairLimit = 2;

function stopReasonFromLegacy(reason) {
  if (!reason) return STOP_REASONS.none;
  if (/read-only|unsuccessful tool/i.test(reason)) return STOP_REASONS.loopDetected;
  if (/context/i.test(reason)) return STOP_REASONS.contextOverflow;
  if (/compact/i.test(reason)) return STOP_REASONS.compactionFailed;
  if (/provider|retry/i.test(reason)) return STOP_REASONS.providerError;
  if (/cancel|interrupt|abort/i.test(reason)) return STOP_REASONS.userCancelled;
  if (/budget|deadline|time/i.test(reason)) return STOP_REASONS.budgetExhausted;
  return STOP_REASONS.none;
}

function migrateState(value) {
  if (!value || typeof value !== 'object') return value;
  if (value.version === 1) {
    if (!value.sessions || !value.permissions || !value.attempts || !Array.isArray(value.seen) || !Number.isFinite(value.used) || !Number.isFinite(value.tick)) {
      throw new Error('Unsupported pipeline state; preserve it and repair before running.');
    }
    value.version = 2;
    value.stopReason = stopReasonFromLegacy(value.reason);
    value.childResults = {};
    value.pendingRepairs = [];
    value.repairs = value.repairs || {};
    value.currentTask ||= 'default';
    value.tasks ||= { [value.currentTask]: value.attempts };
    if (Number.isFinite(value.repairAttempts) && value.repairAttempts > 0) {
      value.repairs[value.currentTask || 'default'] = Math.min(repairLimit, value.repairAttempts);
    }
    delete value.repairAttempts;
    for (const session of Object.values(value.sessions)) session.task ||= value.currentTask || 'default';
  }
  if (value.version !== 2 || !value.sessions || !value.permissions || !value.attempts || !Array.isArray(value.seen) ||
      !Number.isFinite(value.used) || !Number.isFinite(value.tick) || !value.childResults ||
      !Array.isArray(value.pendingRepairs) || !value.repairs || !Object.values(STOP_REASONS).includes(value.stopReason || STOP_REASONS.none)) {
    throw new Error('Unsupported pipeline state; preserve it and repair before running.');
  }
  value.stopReason ||= STOP_REASONS.none;
  return value;
}

function classifySessionError(error) {
  let text = '';
  try { text = JSON.stringify(error || {}).toLowerCase(); } catch {}
  if (/messageabortederror|user.?cancel|user.?abort|interrupt/.test(text)) return STOP_REASONS.userCancelled;
  if (/compact|summari[sz].*fail/.test(text)) return STOP_REASONS.compactionFailed;
  if (/context.{0,24}(length|window|limit|overflow)|too many tokens|token limit/.test(text)) return STOP_REASONS.contextOverflow;
  return STOP_REASONS.providerError;
}

// SDK-independent core. Disk writes are synchronous and atomic; no raw tool inputs,
// outputs, provider errors, credentials or permission descriptions are retained.
export function createGuard({ directory, client, now = Date.now, runBudget = 3_600_000 }) {
  const dir = join(directory, '.ai', 'runs');
  const path = join(dir, 'pipeline-state.json');
  const leasePath = join(dir, 'pipeline-owner.json');
  for (const location of [join(directory, '.ai'), dir, path]) {
    try { if (lstatSync(location).isSymbolicLink()) throw new Error('Pipeline state must not use symbolic links.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  let state = null;
  try { state = migrateState(JSON.parse(readFileSync(path, 'utf8'))); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Pipeline state is unreadable; preserve it and repair before running.'); }
  let pending = Promise.resolve();
  const latestUser = new Map();
  let claimed = false;
  let runtimeReconciled = false;
  const claim = () => {
    if (claimed) return;
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    try { writeFileSync(leasePath, JSON.stringify({ pid: process.pid }), { flag: 'wx', mode: 0o600 }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (lstatSync(leasePath).isSymbolicLink()) throw new Error('Pipeline ownership record must not be a symbolic link.');
      let owner;
      try { owner = JSON.parse(readFileSync(leasePath, 'utf8')).pid; } catch { throw new Error('Invalid pipeline ownership record.'); }
      if (!Number.isInteger(owner) || owner <= 0) throw new Error('Invalid pipeline owner PID.');
      if (owner !== process.pid) {
        let alive = true;
        try { process.kill(owner, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
        if (alive) throw new Error('Another OpenCode process owns this project pipeline. Use its session or close it first.');
        unlinkSync(leasePath);
        writeFileSync(leasePath, JSON.stringify({ pid: process.pid }), { flag: 'wx', mode: 0o600 });
      }
    }
    claimed = true;
  };
  const serial = fn => { const next = pending.then(fn); pending = next.catch(() => {}); return next; };
  const save = () => {
    if (!state) return;
    claim();
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    renameSync(tmp, path);
  };
  const account = () => {
    if (!state) return;
    const time = now();
    const elapsed = Math.max(0, time - state.tick);
    if (state.status === 'running' && !Object.keys(state.permissions).length) {
      state.used += elapsed;
      for (const session of Object.values(state.sessions)) {
        if (!session.stopped && !session.idle) session.used += elapsed;
      }
    }
    state.tick = time;
  };
  async function attach(id) {
    if (!state || !id) return false;
    if (state.sessions[id]) return true;
    const seen = new Set();
    const chain = [];
    let cursor = id;
    while (cursor && !state.sessions[cursor] && !seen.has(cursor)) {
      seen.add(cursor);
      const result = await client.session.get({ path: { id: cursor } });
      if (!result.data?.parentID || result.error) return false;
      chain.push(result.data);
      cursor = result.data.parentID;
    }
    if (!state.sessions[cursor]) return false;
    for (const info of chain.reverse()) {
      const updated = info.time?.updated;
      state.sessions[info.id] = { parent: info.parentID, phase: 'implement', task: state.currentTask || 'default', used: 0, stopped: false, lastProgress: Number.isFinite(updated) ? Math.min(now(), updated) : now(), readOnlyCalls: 0, readFingerprints: {} };
    }
    return true;
  }
  function recordStop(id, stopReason, detail, { guardInitiated = true } = {}) {
    const session = state.sessions[id];
    if (!session) return null;
    const task = session.task || state.currentTask || 'default';
    const result = {
      sessionID: id,
      parentSessionID: session.parent || null,
      task,
      phase: session.phase,
      status: stopReason === STOP_REASONS.userCancelled ? 'cancelled' : 'blocked',
      reason: stopReason,
      guardInitiated,
      repairAttempt: state.repairs[task] || 0,
      repairLimit,
    };
    if (guardInitiated && id !== state.root && session.phase === 'implement' && repairableStops.has(stopReason)) {
      const used = state.repairs[task] || 0;
      if (used < repairLimit) {
        result.status = 'needs_revision';
        result.repairAttempt = used + 1;
        state.repairs[task] = result.repairAttempt;
        state.pendingRepairs.push({
          failedSessionID: id,
          parentSessionID: session.parent || state.root,
          task,
          phase: session.phase,
          reason: stopReason,
          attempt: result.repairAttempt,
          limit: repairLimit,
          status: 'pending',
        });
      } else {
        state.status = 'blocked';
      }
    } else if (id === state.root) {
      state.status = stopReason === STOP_REASONS.userCancelled ? 'paused' : 'blocked';
    } else if (stopReason === STOP_REASONS.userCancelled) {
      state.status = 'paused';
    }
    // A real user cancellation ends the current generation but leaves the
    // session resumable. Guard stops remain hard-stopped until recovery.
    session.stopped = stopReason !== STOP_REASONS.userCancelled;
    state.stopReason = stopReason;
    state.reason = detail;
    state.childResults[id] = result;
    return result;
  }
  async function abortTree(id, stopReason, detail) {
    if (state.sessions[id]?.stopped) return;
    const targets = new Set([id]);
    async function discover(parent) {
      try {
        const response = await client.session.children({ path: { id: parent } });
        if (response.error || !Array.isArray(response.data)) throw new Error();
        for (const child of response.data) if (child.parentID === parent && !targets.has(child.id)) {
          targets.add(child.id); await discover(child.id);
        }
      } catch { state.abortDiscoveryFailed = true; }
    }
    await discover(id);
    // Persisted ancestry also covers children absent from a failed SDK response.
    let added = true;
    while (added) {
      added = false;
      for (const [child, session] of Object.entries(state.sessions)) {
        if (targets.has(session.parent) && !targets.has(child)) { targets.add(child); added = true; }
      }
    }
    recordStop(id, stopReason, detail);
    for (const target of targets) if (target !== id && state.sessions[target]) {
      state.sessions[target].stopped = true;
      state.childResults[target] ||= {
        sessionID: target,
        parentSessionID: state.sessions[target].parent || null,
        task: state.sessions[target].task || state.currentTask || 'default',
        phase: state.sessions[target].phase,
        status: 'cancelled',
        reason: stopReason,
        guardInitiated: true,
        repairAttempt: state.repairs[state.sessions[target].task || state.currentTask || 'default'] || 0,
        repairLimit,
      };
    }
    // The structured result and repair signal must reach disk before the SDK
    // abort emits a generic MessageAbortedError.
    save();
    state.abortFailed = [];
    for (const target of [...targets].reverse()) {
      try {
        const result = await client.session.abort({ path: { id: target } });
        if (result.error || result.data !== true) throw new Error();
      } catch { state.abortFailed.push(target); }
    }
    save();
  }
  async function enforce() {
    if (state) claim();
    account();
    if (!state || state.status !== 'running') return;
    const time = now();
    let runtimeStatus = null;
    const activeChildren = Object.entries(state.sessions).filter(([id, session]) => id !== state.root && !session.stopped && !session.idle);
    if (!runtimeReconciled && activeChildren.length && typeof client.session.status === 'function') {
      try {
        const response = await client.session.status();
        if (!response.error && response.data && typeof response.data === 'object') runtimeStatus = response.data;
      } catch {}
      runtimeReconciled = true;
    }
    for (const [id, session] of Object.entries(state.sessions)) {
      if (id !== state.root && !session.stopped && !session.idle && runtimeStatus && !Object.hasOwn(runtimeStatus, id)) {
        session.lastProgress = time - staleChildLimit;
        continue;
      }
      if (Number.isFinite(session.lastProgress)) continue;
      try {
        const response = await client.session.get({ path: { id } });
        const updated = response.data?.time?.updated;
        session.lastProgress = Number.isFinite(updated) ? Math.min(time, updated) : time;
      } catch { session.lastProgress = time; }
    }
    if (state.used >= runBudget) await abortTree(state.root, STOP_REASONS.budgetExhausted, 'Run active-time budget exhausted.');
    else for (const [id, session] of Object.entries(state.sessions)) {
      const waiting = Object.values(state.permissions).includes(id);
      if (id !== state.root && !session.stopped && !session.idle && !waiting && time - session.lastProgress >= staleChildLimit) {
        await abortTree(id, STOP_REASONS.stalled, 'Child session produced no observable progress within ten active minutes.');
      } else if (!session.stopped && !session.idle && session.used >= budgets[session.phase]) {
        await abortTree(id, STOP_REASONS.budgetExhausted, 'Session active-time budget exhausted.');
      }
    }
    save();
  }
  function requireRoot(id) {
    if (!state || state.root !== id) throw new Error('Only the registered root session may manage this pipeline.');
  }
  function validate(args) {
    if (!['begin', 'checkpoint', 'finish', 'pause', 'resume'].includes(args.action)) throw new Error('Unknown pipeline action.');
    if (args.phase && !Object.hasOwn(budgets, args.phase)) throw new Error('Unknown pipeline phase.');
    if (args.task && (typeof args.task !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(args.task))) throw new Error('Task must be a short stable identifier.');
    if (args.run && (typeof args.run !== 'string' || args.run.length > 128)) throw new Error('Run must be a valid pipeline identifier.');
    if (args.status && !['running', 'blocked', 'completed'].includes(args.status)) throw new Error('Unknown pipeline status.');
    if (args.action === 'begin' && !clean(args.goal).trim()) throw new Error('A goal is required.');
    if (args.action === 'finish' && args.status === 'completed') {
      const acceptance = args.acceptance || state?.acceptance;
      if (!Array.isArray(acceptance) || !acceptance.length || !acceptance.every(x => typeof x === 'string' && x.trim()) ||
          !Array.isArray(args.checks) || !args.checks.length || !args.checks.every(x => typeof x.name === 'string' && x.name.trim() && x.passed === true)) {
        throw new Error('Completion requires explicit satisfied acceptance criteria and named passing checks.');
      }
      if (state?.acceptance?.length && args.acceptance && digest(args.acceptance) !== digest(state.acceptance)) {
        throw new Error('Completion must preserve the original acceptance criteria.');
      }
    }
  }
  async function transferPausedRoot(id, task) {
    if (state.status !== 'paused') throw new Error('Only a paused pipeline may be resumed by a different root session.');
    if (task && task !== state.currentTask) throw new Error('Root handoff must preserve the current pipeline task.');
    const oldRoot = state.root;
    const oldSession = state.sessions[oldRoot];
    if (!oldSession || (!oldSession.idle && !oldSession.stopped)) throw new Error('The existing pipeline root is still active.');
    if (state.resumeCandidate && state.resumeCandidate !== id) throw new Error('Another root session is already preparing to resume this pipeline.');
    const candidate = await client.session.get({ path: { id } });
    if (candidate.error || !candidate.data || candidate.data.parentID) throw new Error('Pipeline root handoff requires a confirmed primary session.');
    oldSession.historical = true;
    oldSession.idle = true;
    oldSession.stopped = true;
    state.sessions[id] = {
      phase: state.phase,
      task: state.currentTask || 'default',
      // Preserve the phase budget already consumed by the old root. The old
      // historical record is stopped, so this value is never double-counted.
      used: oldSession.used,
      stopped: false,
      idle: false,
      readOnlyCalls: 0,
      readFingerprints: {},
    };
    state.root = id;
    delete state.resumeCandidate;
  }
  async function handoffRoot(args, id) {
    if (!state || args.run !== state.id) throw new Error('Resume requires the exact paused pipeline run ID.');
    await transferPausedRoot(id, args.task);
  }
  function contextPacket() {
    if (!state) return { type: 'pipeline.context.v2', run: null, status: 'idle' };
    const task = state.currentTask || 'default';
    const repairs = state.repairs[task] || 0;
    return {
      type: 'pipeline.context.v2',
      run: state.id,
      status: state.status,
      phase: state.phase,
      task,
      goal: state.goal,
      acceptance: structuredClone(state.acceptance || []),
      activeMilliseconds: state.used,
      stop: { reason: state.stopReason || STOP_REASONS.none, detail: clean(state.reason) },
      repair: {
        used: repairs,
        limit: repairLimit,
        remaining: Math.max(0, repairLimit - repairs),
        pending: state.pendingRepairs.filter(item => item.status === 'pending').map(item => ({
          failedSessionID: item.failedSessionID,
          task: item.task,
          reason: item.reason,
          attempt: item.attempt,
        })),
      },
    };
  }
  function createAutomaticRun(args, id) {
    const goal = clean(args.goal).trim();
    const acceptance = (args.acceptance || []).map(clean).filter(value => value.trim());
    if (!goal || !acceptance.length) throw new Error('Automatic pipeline start requires a scoped goal and acceptance criteria.');
    if (args.phase && !Object.hasOwn(budgets, args.phase)) throw new Error('Unknown pipeline phase.');
    if (args.task && (typeof args.task !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(args.task))) throw new Error('Task must be a short stable identifier.');
    if (state) writeFileSync(join(dir, `${state.id}.json`), JSON.stringify(state, null, 2), { mode: 0o600 });
    const phase = args.phase || 'plan';
    const task = args.task || 'default';
    state = {
      version: 2, id: randomUUID(), root: id, goal, acceptance, status: 'running', phase,
      used: 0, tick: now(), attempts: { plan: 0, implement: 0, verify: 0 }, sessions: {},
      failures: {}, seen: [], permissions: {}, evidence: [], revision: 0,
      stopReason: STOP_REASONS.none, childResults: {}, pendingRepairs: [], repairs: {},
      currentTask: task, tasks: {}, automaticDraft: true,
    };
    state.attempts[phase] = 1;
    state.tasks[task] = state.attempts;
    state.sessions[id] = { phase, task, used: 0, stopped: false, idle: false, readOnlyCalls: 0, readFingerprints: {} };
    state.userMessage = latestUser.get(id);
  }
  return {
    inspect: () => structuredClone(state),
    contextPacket: () => structuredClone(contextPacket()),
    ensureRootRun: (args, id) => serial(async () => {
      await enforce();
      const candidate = await client.session.get({ path: { id } });
      if (candidate.error || !candidate.data || candidate.data.parentID) throw new Error('Automatic pipeline root requires a confirmed primary session.');
      if (!state || ['completed', 'idle'].includes(state.status)) {
        claim();
        createAutomaticRun(args, id);
        save();
        return contextPacket();
      }
      if (state.root === id) {
        if (args.task && args.task !== state.currentTask) throw new Error('Automatic resume must preserve the current pipeline task.');
        if (state.status === 'paused') {
          state.status = 'running'; state.tick = now(); state.sessions[id].idle = false;
          save();
        } else if (state.status !== 'running') {
          throw new Error('The existing pipeline is not resumable.');
        }
        return contextPacket();
      }
      if (state.status !== 'paused') throw new Error('Another pipeline root is active in this project.');
      await transferPausedRoot(id, args.task);
      // Preserve the typed stop and detail so the new Lead understands why it
      // inherited the run; only explicit command resume clears those fields.
      state.status = 'running'; state.tick = now();
      save();
      return contextPacket();
    }),
    consumeRootResult: (result, id) => serial(async () => {
      await enforce();
      requireRoot(id);
      if (!result || !['completed', 'needs_revision', 'blocked', 'user_cancelled'].includes(result.status)) {
        throw new Error('Unknown root result status.');
      }
      if (result.task && result.task !== state.currentTask) throw new Error('Root result must preserve the current pipeline task.');
      const summary = clean(result.summary);
      if (result.status === 'completed') {
        if (result.timedOut === true || result.reason === STOP_REASONS.budgetExhausted) {
          throw new Error('A timeout or exhausted budget cannot be reported as successful.');
        }
        validate({ action: 'finish', status: 'completed', acceptance: result.acceptance, checks: result.checks });
        if (state.status !== 'running' || state.sessions[id].stopped) throw new Error('A blocked run cannot be marked completed.');
        if (Object.entries(state.sessions).some(([key, session]) => key !== id && !session.stopped && !session.idle && !session.historical)) {
          throw new Error('Wait for active children before completing the run.');
        }
        state.status = 'completed';
        state.evidence = {
          acceptance: (result.acceptance || state.acceptance).map(clean),
          checks: result.checks.map(check => ({ name: clean(check.name), passed: true })),
        };
      } else if (result.status === 'needs_revision') {
        if (state.status !== 'running') throw new Error('Resume the run before checkpointing.');
        if (result.phase && !Object.hasOwn(budgets, result.phase)) throw new Error('Unknown pipeline phase.');
        if (result.phase && result.phase !== state.phase) {
          const attempts = state.tasks[state.currentTask] || state.attempts;
          const max = result.phase === 'plan' ? 2 : 3;
          if (attempts[result.phase] >= max) throw new Error('Phase attempt limit reached.');
          attempts[result.phase]++;
          state.attempts = attempts;
          state.phase = result.phase;
          state.sessions[id].phase = result.phase;
          state.sessions[id].used = 0;
        }
      } else if (result.status === 'blocked') {
        state.status = 'blocked';
        state.evidence = [];
        if (result.reason && Object.values(STOP_REASONS).includes(result.reason)) state.stopReason = result.reason;
      } else {
        state.status = 'paused';
        state.stopReason = STOP_REASONS.userCancelled;
        state.sessions[id].stopped = false;
        state.sessions[id].idle = true;
      }
      state.summary = summary;
      state.rootResult = { status: result.status, reason: state.stopReason || STOP_REASONS.none };
      save();
      return contextPacket();
    }),
    // The adapter consumes one signal and must launch a fresh child session.
    // Consuming the signal never changes run, phase, session, or time budgets.
    nextRepair: () => serial(async () => {
      if (!state) return null;
      const repair = state.pendingRepairs.find(item => item.status === 'pending');
      if (!repair) return null;
      repair.status = 'dispatched';
      save();
      return structuredClone(repair);
    }),
    tick: () => serial(enforce),
    command: (args, id) => serial(async () => {
      validate(args);
      await enforce();
      if (args.action === 'begin') {
        claim();
        const session = await client.session.get({ path: { id } });
        if (session.error || !session.data || session.data.parentID) throw new Error('Begin requires a confirmed root session.');
        if (state?.automatic && state.root === id && state.status === 'running') {
          state.goal = clean(args.goal); state.acceptance = (args.acceptance || []).map(clean); state.automatic = false; state.summary = clean(args.summary);
          state.userMessage = latestUser.get(id) || state.userMessage;
          if (args.phase && args.phase !== state.phase) { state.phase = args.phase; state.sessions[id].phase = args.phase; }
          state.currentTask = args.task || 'default'; state.tasks = { [state.currentTask]: state.attempts };
          save();
          return JSON.stringify({ run: state.id, status: state.status, phase: state.phase, activeMilliseconds: state.used });
        }
        // Compaction can make a local model repeat its first action. Treat a
        // duplicate begin from the owning root as an idempotent status lookup:
        // keep the original goal, criteria, attempts and consumed budget.
        if (state?.root === id && state.status === 'running') {
          if (clean(args.summary).trim()) state.summary = clean(args.summary);
          save();
          return JSON.stringify({ run: state.id, status: state.status, phase: state.phase, activeMilliseconds: state.used, alreadyStarted: true });
        }
        if (state && !['completed', 'idle'].includes(state.status)) throw new Error('A run already exists; resume it without resetting its budget.');
        if (state) { save(); writeFileSync(join(dir, `${state.id}.json`), JSON.stringify(state, null, 2), { mode: 0o600 }); }
        state = { version: 2, id: randomUUID(), root: id, goal: clean(args.goal), status: 'running', phase: args.phase || 'plan', used: 0, tick: now(), attempts: { plan: 1, implement: 0, verify: 0 }, sessions: {}, failures: {}, seen: [], permissions: {}, evidence: [], revision: 0, stopReason: STOP_REASONS.none, childResults: {}, pendingRepairs: [], repairs: {} };
        state.sessions[id] = { phase: state.phase, task: args.task || 'default', used: 0, stopped: false, readOnlyCalls: 0, readFingerprints: {} };
        state.attempts = { plan: 0, implement: 0, verify: 0 }; state.attempts[state.phase] = 1;
        state.currentTask = args.task || 'default'; state.tasks = { [state.currentTask]: state.attempts };
        state.acceptance = (args.acceptance || []).map(clean);
        state.userMessage = latestUser.get(id);
      } else {
        if (id !== state?.root && args.action === 'resume') await handoffRoot(args, id);
        else requireRoot(id);
        if (state.status === 'completed') throw new Error('Run is already completed.');
        if (args.action === 'resume') {
          if (state.used >= runBudget) throw new Error('The run budget is exhausted and cannot be reset by resume.');
          if (state.sessions[id].stopped) {
            const task = state.sessions[id].task || state.currentTask || 'default';
            const attempts = state.repairs[task] || 0;
            if (attempts >= repairLimit) throw new Error('The bounded repair attempts are exhausted; preserve the blocker and stop.');
            state.repairs[task] = attempts + 1;
            state.sessions[id].stopped = false;
            state.sessions[id].readOnlyCalls = 0;
            state.sessions[id].readFingerprints = {};
          }
          state.status = 'running'; state.tick = now();
          delete state.resumeCandidate;
          delete state.reason;
          state.stopReason = STOP_REASONS.none;
        } else if (args.action === 'pause') {
          state.status = 'paused';
        } else if (args.action === 'finish') {
          if (args.status === 'completed' && (state.status !== 'running' || state.sessions[id].stopped)) throw new Error('A blocked run cannot be marked completed.');
          if (args.status === 'completed' && Object.entries(state.sessions).some(([key, s]) => key !== id && !s.stopped && !s.idle)) throw new Error('Wait for active children before completing the run.');
          state.status = args.status === 'completed' ? 'completed' : 'blocked';
          state.evidence = args.status === 'completed' ? { acceptance: (args.acceptance || state.acceptance).map(clean), checks: args.checks.map(c => ({ name: clean(c.name), passed: true })) } : [];
        } else {
          if (state.status !== 'running') throw new Error('Resume the run before checkpointing.');
          state.currentTask ||= 'default'; state.tasks ||= { [state.currentTask]: state.attempts };
          const task = args.task || state.currentTask;
          const taskChanged = task !== state.currentTask;
          const attempts = state.tasks[task] || { plan: 0, implement: 0, verify: 0 };
          if (taskChanged && !args.phase) throw new Error('A new task checkpoint needs a phase.');
          if (args.phase && (args.phase !== state.phase || taskChanged)) {
            const max = args.phase === 'plan' ? 2 : 3;
            if (attempts[args.phase] >= max) throw new Error('Phase attempt limit reached.');
            attempts[args.phase]++;
            state.tasks[task] = attempts; state.currentTask = task; state.attempts = attempts;
            state.phase = args.phase;
            state.sessions[id].phase = args.phase;
            state.sessions[id].task = task;
            state.sessions[id].used = 0;
          }
        }
      }
      state.summary = clean(args.summary);
      save();
      return JSON.stringify({ run: state.id, status: state.status, phase: state.phase, activeMilliseconds: state.used, reason: state.reason, stopReason: state.stopReason });
    }),
    before: (input) => serial(async () => {
      await enforce();
      if (state?.resumeCandidate === input.sessionID) {
        if (input.tool !== 'pipeline') throw new Error('This Lead must resume the exact paused run before using project tools.');
        return;
      }
      if (await attach(input.sessionID)) {
        if (state.status !== 'running' || state.sessions[input.sessionID].stopped) throw new Error('Pipeline is paused or blocked; root must resolve the recorded state.');
        if (state.automatic && input.tool !== 'question') throw new Error('Begin the pipeline with the scoped goal and acceptance criteria before using project tools.');
        if (readOnlyTools.has(input.tool) && state.sessions[input.sessionID].discoveryLocked) {
          throw new Error('Discovery limit reached. Use the evidence already gathered, checkpoint, and implement or return a concrete blocker.');
        }
        state.sessions[input.sessionID].lastProgress = now();
        save();
      }
    }),
    agent: (id, agent) => serial(async () => {
      await enforce();
      const result = await client.session.get({ path: { id } });
      if (result.error || !result.data) throw new Error('Cannot confirm pipeline session ancestry.');
      const rootSession = !result.data.parentID;
      if (rootSession && !systemAgents.has(agent) && agent !== 'lead') {
        throw new Error('Start project conversations with the lead agent. Specialist agents may run only as delegated child sessions.');
      }
      // This hook precedes the first model generation, so a stalled first token
      // is timed without depending on the model successfully calling begin.
      if ((!state || state.status === 'idle' || (state.status === 'completed' && (state.root !== id || state.nextUser))) && agent === 'lead') {
        claim();
        if (rootSession) {
          if (state) writeFileSync(join(dir, `${state.id}.json`), JSON.stringify(state, null, 2), { mode: 0o600 });
          state = { version: 2, id: randomUUID(), root: id, goal: 'Awaiting scoped goal from the lead.', status: 'running', phase: 'plan', used: 0, tick: now(), attempts: { plan: 1, implement: 0, verify: 0 }, sessions: { [id]: { phase: 'plan', task: 'default', used: 0, stopped: false, readOnlyCalls: 0, readFingerprints: {} } }, failures: {}, seen: [], permissions: {}, evidence: [], revision: 0, automatic: true, stopReason: STOP_REASONS.none, childResults: {}, pendingRepairs: [], repairs: {} };
          state.userMessage = latestUser.get(id);
          save();
        }
      }
      // finish is followed by another generation for the final user-facing text.
      // That generation is still part of the completed task, not a new run.
      if (state?.status === 'completed') return;
      if (await attach(id)) {
        if (id === state.root && state.status === 'paused') {
          state.status = 'running'; state.tick = now(); delete state.resumeCandidate;
        }
        // A root that deliberately finished as blocked still needs one final
        // generation to explain the blocker. Project tools remain unavailable
        // because before() continues to require running status.
        if (id === state.root && state.status === 'blocked' && !state.sessions[id].stopped) return;
        // Let the stopped root receive a user follow-up and call pipeline
        // resume. Other tools remain blocked until that explicit repair action.
        const task = state.sessions[id].task || state.currentTask || 'default';
        if (id === state.root && state.status === 'blocked' && state.sessions[id].stopped && (state.repairs[task] || 0) < repairLimit) {
          state.sessions[id].idle = false;
          save();
          return;
        }
        if (state.status !== 'running' || state.sessions[id].stopped) throw new Error('Pipeline execution is stopped.');
        if (id !== state.root) state.sessions[id].phase = agent === 'planner' ? 'plan' : 'implement';
        state.sessions[id].idle = false;
        state.sessions[id].lastProgress = now();
        save();
      } else if (state && state.status !== 'completed' && agent === 'lead') {
        const oldRoot = state.sessions[state.root];
        if (rootSession && state.status === 'paused' && oldRoot && (oldRoot.idle || oldRoot.stopped)) {
          if (state.resumeCandidate && state.resumeCandidate !== id) {
            throw new Error('Another root session is already preparing to resume this pipeline.');
          }
          state.resumeCandidate = id;
          save();
          return;
        }
        throw new Error('Another pipeline root exists in this project. Resume its session; archive a stopped run with ai-kit archive-run before starting a different task.');
      }
    }),
    event: event => serial(async () => {
      const observed = event.properties?.sessionID || event.properties?.part?.sessionID || event.properties?.info?.sessionID;
      if (state?.sessions[observed] && (event.type === 'message.updated' || event.type === 'message.part.updated' || event.type === 'session.status')) {
        state.sessions[observed].lastProgress = now();
      }
      await enforce();
      if (event.type === 'message.updated' && event.properties?.info?.role === 'user') {
        const info = event.properties.info;
        latestUser.set(info.sessionID, info.id);
        if (state?.status === 'completed' && state.root === info.sessionID && info.id !== state.userMessage) {
          state.nextUser = true; save();
        }
      }
      if (!state || state.status === 'completed') return;
      const p = event.properties || {};
      const candidateID = p.sessionID || p.part?.sessionID || p.info?.id;
      if (candidateID && state.resumeCandidate === candidateID &&
          (event.type === 'session.idle' || event.type === 'session.error' ||
           (event.type === 'session.status' && p.status?.type === 'idle'))) {
        delete state.resumeCandidate;
        save();
        return;
      }
      if (event.type === 'file.edited') {
        state.revision++;
        for (const session of Object.values(state.sessions)) {
          session.readOnlyCalls = 0;
          session.readFingerprints = {};
          session.discoveryLocked = false;
        }
        save(); return;
      }
      const id = p.sessionID || p.part?.sessionID || p.info?.id;
      if (!await attach(id)) return;
      if (event.type === 'message.updated' || event.type === 'message.part.updated' || event.type === 'session.status') {
        state.sessions[id].lastProgress = now();
      }
      if (event.type === 'session.error') {
        // An SDK abort initiated by this guard produces the same public error as
        // a user cancel. The pre-abort record is the source of truth.
        if (state.childResults[id]?.guardInitiated && state.sessions[id]?.stopped) return;
        const stopReason = classifySessionError(p.error);
        if (stopReason === STOP_REASONS.userCancelled) {
          recordStop(id, stopReason, 'Execution cancelled by the user.', { guardInitiated: false });
          save();
        } else {
          const detail = stopReason === STOP_REASONS.contextOverflow ? 'Model context limit exceeded.' :
            stopReason === STOP_REASONS.compactionFailed ? 'Context compaction failed.' : 'Provider execution failed.';
          await abortTree(id, stopReason, detail);
        }
        return;
      }
      if (event.type === 'session.idle' || (event.type === 'session.status' && p.status?.type === 'idle')) {
        state.sessions[id].idle = true;
        if (id === state.root && state.status === 'running') {
          state.status = state.automatic ? 'idle' : 'paused';
          if (state.automatic) {
            state.reason = 'Unscoped conversation ended; no development run was started.';
            state.stopReason = STOP_REASONS.none;
          }
        }
      }
      if (event.type === 'permission.updated' || event.type === 'permission.asked') state.permissions[p.id] = id;
      if (event.type === 'permission.replied') delete state.permissions[p.permissionID || p.requestID];
      if (event.type === 'question.asked') state.permissions[`question:${p.id}`] = id;
      if (event.type === 'question.replied' || event.type === 'question.rejected') delete state.permissions[`question:${p.requestID}`];
      if (event.type === 'session.status' && p.status?.type === 'retry' && p.status.attempt >= 3) {
        await abortTree(id, STOP_REASONS.providerError, 'Provider retry limit reached.');
      }
      if (event.type === 'message.part.updated' && p.part.type === 'tool' && p.part.tool !== 'pipeline') {
        const part = p.part;
        if (['completed', 'error'].includes(part.state?.status) && !state.seen.includes(part.id)) {
          state.seen.push(part.id);
          const failed = part.state.status === 'error' || (typeof part.state.metadata?.exit === 'number' && part.state.metadata.exit !== 0);
          if (failed) {
            const key = digest([id, part.tool, part.state.input, state.revision]);
            state.failures[key] = (state.failures[key] || 0) + 1;
            if (state.failures[key] >= 3) await abortTree(id, STOP_REASONS.loopDetected, 'Repeated unsuccessful tool call without a file change.');
          } else if (state.sessions[id]) {
            const session = state.sessions[id];
            if (readOnlyTools.has(part.tool)) {
              session.readOnlyCalls = (session.readOnlyCalls || 0) + 1;
              session.readFingerprints ||= {};
              const fingerprint = digest([part.tool, part.state.input, state.revision]);
              session.readFingerprints[fingerprint] = (session.readFingerprints[fingerprint] || 0) + 1;
              if (session.readFingerprints[fingerprint] >= identicalReadLimit) {
                await abortTree(id, STOP_REASONS.loopDetected, 'Repeated read-only inspection without a file change.');
              } else {
                const limit = id === state.root ? rootReadOnlyLimit : specialistReadOnlyLimit;
                if (session.readOnlyCalls >= limit) session.discoveryLocked = true;
              }
            }
          }
        }
      }
      save();
    }),
  };
}
