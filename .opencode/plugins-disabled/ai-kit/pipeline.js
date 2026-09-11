import { tool } from '@opencode-ai/plugin';
import { createGuard } from '../lib/pipeline-guard.mjs';
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function canonicalPath(path) {
  try { return realpathSync(path); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export default async function Pipeline({ client, directory }) {
  directory = canonicalPath(directory);
  if (!directory) throw new Error('OpenCode project directory does not exist.');
  const projectPlugin = join(directory, '.opencode', 'plugins', 'pipeline.js');
  // The project's pinned implementation wins over a globally installed version.
  const authoritativePlugin = existsSync(projectPlugin) ? canonicalPath(projectPlugin) : null;
  const executingPlugin = canonicalPath(fileURLToPath(import.meta.url));
  if (authoritativePlugin && executingPlugin !== authoritativePlugin) return {};
  const origin = authoritativePlugin === executingPlugin ? 'project' : 'global';
  const auditEnabled = process.env.AI_KIT_PIPELINE_AUDIT === '1';
  const safeSessionID = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : 'unknown';
  const audit = (hook, sessionID, statusReturned = false) => {
    if (!auditEnabled) return;
    process.stderr.write(`AI_KIT_PIPELINE_AUDIT ${JSON.stringify({
      timestamp: new Date().toISOString(), origin, hook, sessionID: safeSessionID(sessionID), statusReturned: statusReturned === true,
    })}\n`);
  };
  const registry = globalThis[Symbol.for('ai-kit.pipeline.guards')] ??= new Map();
  if (registry.has(directory)) return {};
  const guard = createGuard({ client, directory });
  registry.set(directory, guard);
  const userRequests = new Map();
  const assistantText = new Map();
  const begunMessages = new Map();
  let failure;
  // Start immediately, but do not make OpenCode's plugin bootstrap wait on SDK
  // session metadata served by that same instance.
  guard.tick().catch(error => { failure = error; });
  const timer = setInterval(() => {
    guard.tick().catch(error => { failure = error; });
  }, 1000);
  timer.unref?.();
  const ensureHealthy = () => {
    if (failure) throw new Error('Pipeline watchdog failed; stop and inspect the local state before resuming.');
  };
  const requestFor = (sessionID, messageID) => {
    const request = userRequests.get(sessionID);
    return request && (!messageID || request.messageID === messageID) ? request.text : 'Complete the current user request.';
  };
  const prepareLead = async ({ sessionID, agent, message }) => {
    ensureHealthy();
    const session = await client.session.get({ path: { id: sessionID } });
    if (session.error || !session.data) throw new Error('Cannot confirm pipeline session ancestry.');
    const effectiveAgent = agent || session.data.agent;
    if (effectiveAgent !== 'lead') { await guard.agent(sessionID, effectiveAgent); return false; }
    if (session.data.parentID) { await guard.agent(sessionID, effectiveAgent); return false; }
    const state = guard.inspect();
    const messageID = message?.id || userRequests.get(sessionID)?.messageID;
    const previousMessage = begunMessages.get(sessionID) || state?.userMessage;
    const newCompletedRequest = state?.status === 'completed' && messageID && previousMessage !== messageID;
    if (!state || state.status === 'idle' || state.status === 'paused' || newCompletedRequest) {
      const packet = await guard.ensureRootRun({
        goal: requestFor(sessionID, messageID),
        acceptance: ['The current user request is completed and verified with appropriate checks.'],
        task: state?.status === 'paused' ? state.currentTask : undefined,
      }, sessionID);
      if (messageID) begunMessages.set(sessionID, messageID);
      return typeof packet?.status === 'string';
    }
    await guard.agent(sessionID, agent);
    return false;
  };
  const injectContext = async (sessionID, output) => {
    ensureHealthy();
    const state = guard.inspect();
    if (!state || state.root !== sessionID) return false;
    const context = guard.contextPacket();
    const repair = await guard.nextRepair();
    const repairPacket = repair ? {
      type: 'pipeline.repair.v2',
      child: { sessionID: repair.failedSessionID, status: 'needs_revision', reason: repair.reason, task: repair.task, phase: repair.phase },
      repair: { attempt: repair.attempt, limit: repair.limit, action: 'launch_fresh_child' },
    } : null;
    output.system ??= [];
    const lines = [
      `PIPELINE_CONTEXT ${JSON.stringify(context)}`,
      'When this Lead turn reaches a terminal pipeline state, return only one JSON object shaped as {"type":"pipeline.result.v2","run":"<run>","status":"completed|needs_revision|blocked|user_cancelled","task":"<task>","summary":"<concise result>","checks":[{"name":"<check>","passed":true}]}.',
    ];
    if (repairPacket) {
      lines.push(`PIPELINE_REPAIR ${JSON.stringify(repairPacket)}`);
      lines.push('The guard stopped that child. Delegate one fresh, narrower specialist from saved evidence; do not resume the stopped child or pause the run.');
    }
    const instruction = lines.join('\n');
    // Keep one system message for OpenAI-compatible local providers such as
    // llama.cpp: mutate the existing block instead of appending another one.
    if (output.system.length) output.system[0] += `\n\n${instruction}`;
    else output.system.push(instruction);
    return typeof context?.status === 'string';
  };
  const exactRootResult = (text, state) => {
    if (typeof text !== 'string' || !text.trim().startsWith('{') || !text.trim().endsWith('}')) return null;
    let value;
    try { value = JSON.parse(text.trim()); } catch { return null; }
    if (!value || Array.isArray(value) || value.type !== 'pipeline.result.v2' || value.run !== state.id) return null;
    const { type: _type, run: _run, ...result } = value;
    return result;
  };
  const observeAssistant = async event => {
    const p = event.properties || {};
    if (event.type === 'message.part.updated' && p.part?.type === 'text') {
      assistantText.set(p.part.messageID, { sessionID: p.part.sessionID, text: p.part.text });
      return false;
    }
    if (event.type !== 'message.updated' || p.info?.role !== 'assistant' || !p.info.time?.completed) return false;
    const state = guard.inspect();
    const cached = assistantText.get(p.info.id);
    assistantText.delete(p.info.id);
    if (!state || state.root !== p.info.sessionID || p.info.error || !cached || cached.sessionID !== p.info.sessionID) return false;
    const result = exactRootResult(cached.text, state);
    if (!result) return false;
    const packet = await guard.consumeRootResult(result, p.info.sessionID);
    return typeof packet?.status === 'string';
  };
  const auditedEvent = event => {
    if (!['session.created', 'session.idle', 'message.updated', 'message.part.updated'].includes(event.type)) return null;
    const p = event.properties || {};
    return {
      hook: `event.${event.type}`,
      sessionID: p.sessionID || p.part?.sessionID || p.info?.sessionID || (event.type === 'session.created' ? p.info?.id : undefined),
    };
  };
  return {
    dispose: async () => { clearInterval(timer); registry.delete(directory); userRequests.clear(); assistantText.clear(); begunMessages.clear(); },
    // Do not make SDK abort responses wait on their own emitted idle events.
    // The core still serializes these events before the next model/tool hook.
    event: async ({ event }) => {
      const work = guard.event(event).then(() => observeAssistant(event));
      if (event.type === 'session.error' || (event.type === 'message.part.updated' && event.properties?.part?.type === 'tool')) {
        work.catch(error => { failure = error; });
        return;
      }
      try {
        const statusReturned = await work;
        const entry = auditedEvent(event);
        if (entry) audit(entry.hook, entry.sessionID, statusReturned);
      } catch (error) { failure = error; throw error; }
    },
    'chat.message': async ({ sessionID, messageID, agent }, output) => {
      const text = (output.parts || []).filter(part => part.type === 'text' && !part.synthetic && !part.ignored).map(part => part.text).join('\n').trim();
      const currentMessageID = messageID || output.message?.id;
      if (text) userRequests.set(sessionID, { messageID: currentMessageID, text });
      const statusReturned = await prepareLead({ sessionID, agent, message: { id: currentMessageID } });
      audit('chat.message', sessionID, statusReturned);
    },
    'chat.params': async input => audit('chat.params', input.sessionID, await prepareLead(input)),
    'experimental.chat.system.transform': async ({ sessionID }, output) => audit('experimental.chat.system.transform', sessionID, await injectContext(sessionID, output)),
    'tool.execute.before': async input => {
      if (failure) throw new Error('Pipeline watchdog failed; stop and inspect the local state before resuming.');
      if (input.tool !== 'pipeline') await guard.before(input);
      audit('tool.execute.before', input.sessionID);
    },
    tool: {
      pipeline: tool({
        description: 'Root-only development run control. Begin with a non-sensitive goal; checkpoint phase transitions; pause before waiting for user input and resume afterward. Never include secrets. Finish completed requires satisfied acceptance criteria and named passing verification checks. Budgets survive restart.',
        args: {
          action: tool.schema.enum(['begin', 'checkpoint', 'finish', 'pause', 'resume']),
          goal: tool.schema.string().optional(),
          phase: tool.schema.enum(['plan', 'implement', 'verify']).optional(),
          task: tool.schema.string().optional(),
          status: tool.schema.enum(['running', 'blocked', 'completed']).optional(),
          summary: tool.schema.string().optional(),
          acceptance: tool.schema.array(tool.schema.string()).optional(),
          checks: tool.schema.array(tool.schema.object({ name: tool.schema.string(), passed: tool.schema.boolean() })).optional(),
        },
        execute: (args, context) => guard.command(args, context.sessionID),
      }),
    },
  };
}
