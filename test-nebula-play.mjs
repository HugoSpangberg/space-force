// Plays the current 6-phase Nebula Rift course (LASER LABYRINTH -> SERPENT RIFT)
// with a heuristic bot and reports difficulty metrics per phase.
//
// Modes:
//   MODE=play    (default) full course from menu
//   MODE=direct  direct-starts every nebula menu entry, runs ~12s, checks for errors
// Input:
//   PERFECT=1 (default) — steer by writing g.target directly (zero latency)
//   PERFECT=0           — steer via emulated pointer drag (realistic input path)
//
// Env: URL, RUNS, WIDTH, HEIGHT, SEED (optional, seeds Math.random in-page)
import { chromium } from 'playwright'

const url = process.env.URL || 'http://localhost:4180/'
const MODE = process.env.MODE || 'play'
const RUNS = parseInt(process.env.RUNS || '1')
const PERFECT = (process.env.PERFECT || '1') === '1'
const W = parseInt(process.env.WIDTH || '390')
const H = parseInt(process.env.HEIGHT || '844')
const SEED = process.env.SEED || null

const PHASES = [
  'LASER LABYRINTH', 'PRISM LATTICE', 'KAMIKAZE PURSUIT',
  'LASER GATES', 'METEOR SLALOM', 'SERPENT RIFT', 'NEBULA CLEAR',
]

// Returns [targetX, targetY, cov, minClear, hazardCount]
function steeringScript() {
  return ({ stepOff }) => {
    const g = window.__game
    if (!g) return null
    const w = g.w, h = g.h
    const sy = g.ship.y, sx = g.ship.x
    const rowY = h - 150
    const zones = []   // [x, halfWidth] lethal danger at ship row
    let hardGap = null // [lo, hi] interval that is mandatory (bars/gates)

    const push = (x, hw) => zones.push([x, hw])

    // --- phase 0: laser bars — must be inside the gap if the bar is ON at any time
    // while it crosses our row band; use ~0.9s lookahead to pre-position
    const barCons = []
    for (const bar of g.laserBars) {
      if ((bar.alpha ?? 1) <= 0.5) continue
      const on = t => ((t + bar.phase) % bar.cycle) < bar.cycle * 0.5
      const tHit = bar.vy > 0 ? (rowY - bar.y) / bar.vy : Infinity
      const inBandNow = Math.abs(sy - bar.y) < 40
      if (!(inBandNow || (tHit > 0 && tHit < 0.9))) continue
      let must = false
      const t1 = g.time + Math.max(0, tHit) + 0.45
      for (let ta = g.time; ta <= t1; ta += 0.05) { if (on(ta)) { must = true; break } }
      if (!must && !(on(g.time) && inBandNow)) continue
      const lo = bar.gapX - bar.gapW / 2 - 6, hi = bar.gapX + bar.gapW / 2 + 6
      barCons.push([lo, hi])
      zones.push([lo / 2, lo / 2 + 1]); zones.push([w / 2 + hi / 2, (w - hi) / 2 + 1])
    }
    if (barCons.length) {
      let lo = 0, hi = w
      for (const [a, b] of barCons) { lo = Math.max(lo, a); hi = Math.min(hi, b) }
      hardGap = [lo, hi]
    }
    // --- phase 1: sentinel beams (locked angle during warning+firing)
    const SENT_SLOT = 1.95, SENT_TOTAL = 5.85
    for (const d of g.drones) {
      if (!d.orbit || (d.alpha ?? 1) <= 0.5 || d.laserAngle === undefined) continue
      if (d.sentinelSlot !== undefined) {
        const local = (g.phaseT - d.sentinelSlot * SENT_SLOT + SENT_TOTAL) % SENT_TOTAL
        const firing = local >= 0.8 && local < 1.6
        if (!firing) continue
        const a = d.laserAngle
        const fx = Math.sin(a), fy = -Math.cos(a)
        if (fy <= 0.05) continue
        let len = Infinity
        if (fx > 0.0001) len = Math.min(len, (w - d.x) / fx)
        else if (fx < -0.0001) len = Math.min(len, -d.x / fx)
        if (fy > 0.0001) len = Math.min(len, (h - d.y) / fy)
        const tt = (rowY - d.y) / fy
        if (tt < 0 || tt * fy > len) continue
        push(d.x + fx * tt, 26 + 10)
      }
      // sentinel body
      if (Math.abs(d.y - rowY) < d.r + 34) push(d.x, d.r + 24)
    }
    // --- phase 2: kamikaze homers — zones from short prediction; detailed
    // arrival-time scoring is done in the candidate loop below
    const kams = g.drones.filter(d => d.kind === 'mob-kamikaze' && (d.alpha ?? 1) > 0.35)
    for (const d of kams) {
      let x = d.x, y = d.y, hd = d.heading ?? 0
      if ((d.warning ?? 0) <= 0) {
        for (let s = 0; s < 25; s++) {
          const ta = Math.atan2(rowY - y, sx - x)
          let dl = ta - hd
          dl = Math.atan2(Math.sin(dl), Math.cos(dl))
          hd += Math.max(-1.45 / 60, Math.min(1.45 / 60, dl))
          x += Math.cos(hd) * 142 / 60
          y += Math.sin(hd) * 142 / 60
        }
      }
      if (Math.abs(y - rowY) < 70) push(x, d.r + 20 + 8)
    }
    // first time each kamikaze comes within 45px of a static point (px, rowY)
    const kamThreatTime = (d, px) => {
      let x = d.x, y = d.y, hd = d.heading ?? 0
      const t0 = (d.warning ?? 0)
      if (t0 > 0) return 99 // stationary during warning
      for (let s = 0; s < 150; s++) {
        const ta = Math.atan2(rowY - y, px - x)
        let dl = ta - hd
        dl = Math.atan2(Math.sin(dl), Math.cos(dl))
        hd += Math.max(-1.45 / 60, Math.min(1.45 / 60, dl))
        x += Math.cos(hd) * 142 / 60
        y += Math.sin(hd) * 142 / 60
        if (Math.hypot(px - x, rowY - y) < 45) return s / 60
        if (x < -60 || x > w + 60 || y > h + 60 || y < -100) return 99
      }
      return 99
    }
    // --- phase 3: laser gates
    for (const gate of g.laserGates) {
      if (gate.alpha <= 0.3) continue
      const armed = gate.warning <= 0 && gate.active > 0
      const coming = gate.warning > 0 && gate.warning < 0.55 // close enough that we must be ready
      if (!armed && !coming) continue
      if (gate.orientation === 'vertical') {
        const gapLo = gate.gap - gate.gapSize / 2 + 20 * 0.35
        const gapHi = gate.gap + gate.gapSize / 2 - 20 * 0.35
        if (rowY < gapLo || rowY > gapHi) {
          // row is outside the gap: the whole column band is dangerous
          zones.push([gate.pos, 400])
          hardGap = null
        } else {
          // row is inside the gap: nothing extra to do, the vertical override below keeps y
        }
      } else {
        // horizontal gates live mid-screen; only a threat if we play up high
        if (Math.abs(rowY - gate.pos) < 60) {
          const lo = gate.gap - gate.gapSize / 2 + 7, hi = gate.gap + gate.gapSize / 2 - 7
          zones.push([lo / 2, lo / 2 + 1]); zones.push([(w + hi) / 2, (w - hi) / 2 + 1])
        }
      }
    }
    // --- phase 4: meteors
    for (const a of g.asteroids) {
      if (a.kind !== 'nebula') continue
      if (Math.abs(a.y - rowY) < a.r + 40) push(a.x, a.r + 20 + 8)
      else if (Math.abs(a.y - rowY) < a.r + 140 && Math.abs(a.vx) > 50) {
        const tt = Math.abs(a.vx) > 1 ? (Math.abs(sx - a.x) < 300 ? (rowY - a.y) / Math.max(1, a.vy) : Infinity) : Infinity
        if (isFinite(tt) && tt > 0 && tt < 2.2) push(a.x + a.vx * tt, a.r + 20 + 10)
      }
    }
    // --- phase 5: serpent boss (three escalating phases)
    let headX = null, bossMode = null
    let ringGap = null
    if (g.boss && !g.boss.dying) {
      const sn = g.boss.snake
      if (sn) {
        bossMode = sn.mode
        // body
        for (const s of sn.segs) {
          if (s.hidden) continue
          if (Math.abs(s.y - rowY) < s.r + 40) push(s.x, s.r + 20 + 6)
        }
        // teleport dash line: entry -> exit while transiting / telegraphing
        if ((sn.mode === 'telegraph' || sn.mode === 'transit') && sn.targetPath && sn.targetPath.length >= 2) {
          g.__dashLine = [ { x: g.boss.x, y: g.boss.y }, sn.targetPath[1] ]
        } else if (sn.mode === 'transit' && sn.dashFrom && sn.dashTo) {
          g.__dashLine = [sn.dashFrom, sn.dashTo]
        } else g.__dashLine = null
        headX = g.boss.x
        // rings: find the safe gap angle of the most imminent ring
        for (const r of sn.rings) {
          if (r.t < r.warn && (!ringGap || r.t < ringGap.t)) ringGap = { t: r.t, ang: r.gapAngle }
        }
        // body sweep: avoid the tip while it sweeps
        if (sn.sweep && sn.sweep.t >= sn.sweep.warn) {
          const f = (sn.sweep.t - sn.sweep.warn) / sn.sweep.fire
          const ang = sn.sweep.a0 + (sn.sweep.a1 - sn.sweep.a0) * f
          const R = sn.sweep.r0 + (sn.sweep.r1 - sn.sweep.r0) * f
          const tx = g.boss.x + Math.cos(ang) * R, ty = g.boss.y + Math.sin(ang) * R
          if (Math.abs(ty - rowY) < 80) push(tx, 40)
        }
        // lasers: avoid the beam column while charging/firing
        for (const l of sn.lasers) {
          if (l.t < l.warn) continue
          const dx = Math.cos(l.angle), dy = Math.sin(l.angle)
          if (dy <= 0.2) continue
          const tt = (rowY - l.y) / dy
          if (tt < 0) continue
          push(l.x + dx * tt, 26)
        }
      } else {
        if (Math.abs(g.boss.y - rowY) < g.boss.r + 34) push(g.boss.x, g.boss.r + 26)
        headX = g.boss.x
      }
    } else g.__dashLine = null
    // enemy bullets (rings / fans / sweeps from the boss)
    for (const b of g.bullets) {
      if (b.friendly) continue
      const tt = (rowY - b.y) / (b.vy >= 40 ? b.vy : 0.0001)
      if (tt < 0 || tt > 2.0) continue
      push(b.x + b.vx * tt, tt > 0.8 ? 60 : 22)
    }

    // ---- coverage of the row by merged intervals
    let cov = 0
    if (zones.length) {
      const ivs = zones.map(([zx, hw]) => [zx - hw, zx + hw]).sort((a, b) => a[0] - b[0])
      let covered = 0, curS = ivs[0][0], curE = ivs[0][1]
      for (let i = 1; i < ivs.length; i++) {
        const s = ivs[i][0], e = ivs[i][1]
        if (s > curE) { covered += curE - curS; curS = s; curE = e }
        else curE = Math.max(curE, e)
      }
      covered += curE - curS
      cov = Math.min(1, covered / (w - 36))
    }

    // ---- choose target
    const st_ringGap = window.__lastRingGap ?? null
    let best, by = rowY
    const clearAt = (cx, cy) => {
      let minD = 1e9
      for (const [zx, hw] of zones) {
        const dz = Math.abs(cy - rowY)
        if (dz > 80) { minD = Math.min(minD, Math.hypot(cx - zx, dz) - hw); continue }
        minD = Math.min(minD, Math.abs(cx - zx) - hw)
      }
      return minD
    }
    if (g.__dashLine) {
      // maximise distance from the dash sweep line, anywhere in the lower band
      const [p0, p1] = g.__dashLine
      const distSeg = (px, py) => {
        const vx = p1.x - p0.x, vy = p1.y - p0.y
        const den = vx * vx + vy * vy || 1
        const u = Math.max(0, Math.min(1, ((px - p0.x) * vx + (py - p0.y) * vy) / den))
        return Math.hypot(px - (p0.x + vx * u), py - (p0.y + vy * u))
      }
      let bs = -1
      for (let cx = 26; cx <= w - 26; cx += 10) for (const cy of [rowY, h - 60]) {
        const s = distSeg(cx, cy) * 0.7 + clearAt(cx, cy)
        if (s > bs) { bs = s; best = cx; by = cy }
      }
    } else if (headX !== null) {
      // boss: stand in the ring gap / under the head for DPS, keep row clearance
      const pat = g.boss && g.boss.pattern !== undefined ? g.boss.pattern : 0
      const dps = (cx) => {
        let d = 0
        // align with the telegraphed ring gap when present
        if (st_ringGap) {
          const gx = g.boss.x + Math.cos(st_ringGap) * 120
          const gy = g.boss.y + Math.sin(st_ringGap) * 120
          d += 90 * (1 - Math.abs(cx - gx) / w)
        }
        // later phases need more room to escape
        d += 40 * (1 - pat * 0.35) * (1 - Math.abs(cx - headX) / w)
        return d
      }
      let bs = -1e9
      for (let cx = 26; cx <= w - 26; cx += 8) {
        const c = clearAt(cx, rowY)
        if (c < (pat === 2 ? 24 : 34)) continue // never risk the body for DPS
        const s = c + dps(cx)
        if (s > bs) { bs = s; best = cx; by = rowY }
      }
      if (bs === -1e9) best = w / 2
    } else if (kams.length) {
      // kamikaze kiting: maximise the minimum arrival time of any homing drone,
      // tie-break toward current position (don't waste motion) and center
      let bs = -1e9
      for (let cx = 26; cx <= w - 26; cx += 8) {
        let minT = 99
        for (const d of kams) minT = Math.min(minT, kamThreatTime(d, cx))
        const c = clearAt(cx, rowY)
        const s = minT * 60 + Math.min(c, 200) - Math.abs(cx - sx) * 0.15 + 6 * (1 - Math.abs(cx - w / 2) / w)
        if (s > bs) { bs = s; best = cx; by = rowY }
      }
    } else {
      // generic: safe x with max clearance, biased to gap / center
      let bs = -1e9
      for (let cx = 26; cx <= w - 26; cx += 8) {
        const c = clearAt(cx, rowY)
        if (!isFinite(c)) c = 1e9
        let bias = 0
        if (hardGap && cx >= hardGap[0] && cx <= hardGap[1]) bias = 5000
        else if (hardGap) bias = -Math.min(Math.abs(cx - hardGap[0]), Math.abs(cx - hardGap[1]))
        bias += 8 * (1 - Math.abs(cx - w / 2) / w)
        const s = c + bias
        if (s > bs) { bs = s; best = cx; by = rowY }
      }
      if (!isFinite(bs)) best = w / 2
    }
    // vertical intent from gates/meteor telegraphs overrides rowY
    for (const gate of g.laserGates) {
      if (gate.orientation === 'vertical' && gate.alpha > 0.3 &&
          (gate.warning <= 0.55 || gate.active > 0) &&
          (rowY < gate.gap - gate.gapSize / 2 + 7 || rowY > gate.gap + gate.gapSize / 2 - 7)) {
        by = gate.gap
      }
    }
    for (const wave of g.meteorWaves) {
      if (!wave.spawned && wave.t < 0.75 && wave.kind === 'horizontal') by = wave.gap * h
    }
    best += stepOff
    const tx = Math.max(20, Math.min(w - 20, best))
    const ty = Math.max(60, Math.min(h - 30, by))
    const minClear = clearAt(best, by)
    return { x: tx, y: ty, cov, minClear: isFinite(minClear) ? minClear : 999, n: zones.length,
      state: g.state, lives: g.lives, phaseIdx: g.phaseIdx, stage: g.phaseStage, time: g.time,
      score: g.score, boss: g.boss ? { hp: g.boss.hp, maxHp: g.boss.maxHp, mode: g.boss.snake?.mode ?? 'plain', pattern: g.boss.pattern } : null,
      pu: g.pSpread > 0 ? 'spread' : g.pRapid > 0 ? 'rapid' : g.pShield > 0 ? 'shield' : null,
      ringGap: ringGap ? ringGap.ang : null }
  }
}

async function newGamePage(browser, label = null) {
  const page = await browser.newPage({ viewport: { width: W, height: H } })
  const errs = []
  page.on('pageerror', e => errs.push(String(e.message)))
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()) })
  await page.goto(url, { waitUntil: 'load' })
  await page.getByRole('button', { name: /start mission/i }).click()
  await page.getByRole('button', { name: /nebula rift/i }).click()
  if (label) await page.getByRole('button', { name: label }).click()
  else await page.getByRole('button', { name: /full nebula course/i }).click()
  await page.waitForSelector('canvas.game-canvas', { timeout: 15000 })
  const box = await page.locator('canvas.game-canvas').boundingBox()
  if (SEED) {
    let s = parseInt(SEED)
    await page.evaluate(() => { Math.random = (function () { const f = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }; f(); return f })() })
  }
  if (!PERFECT) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 80)
    await page.mouse.down()
  }
  return { page, box, errs }
}

async function playRun(browser, runIdx, label = null) {
  const { page, box, errs } = await newGamePage(browser, label)
  const report = {
    run: runIdx, clear: false, died: false, livesEnd: null, score: 0, totalTime: 0,
    damage: PHASES.map(() => 0), phaseTimes: PHASES.map(() => 0),
    hits: [], freezes: [], bossTime: 0, bossHp: null,
    powerups: { spread: 0, rapid: 0, shield: 0, health: 0 },
    maxCover: PHASES.map(() => 0), saturatedTime: PHASES.map(() => 0),
    minClear: PHASES.map(() => 999),
  }
  let prevLives = null, lastT = 0, lastPhase = 0, lastPhaseIdx = 0, stepOff = 0, stepT = 0
  for (let frame = 0; frame < 60 * 320; frame++) {
    if (lastPhaseIdx >= 5 && lastT - stepT > 1.1) {
      stepT = lastT
      stepOff = Math.round((Math.random() * 2 - 1) * 70)
    } else if (lastPhaseIdx < 5) stepOff = 0
    const st = await page.evaluate(steeringScript(), { stepOff })
    if (!st) break
    const now = lastT + 1 / 60
    if (st.phaseIdx !== lastPhase) {
      report.phaseTimes[lastPhase] += now - lastT
      lastPhase = st.phaseIdx
      lastT = now
    } else report.phaseTimes[lastPhase] += 1 / 60
    lastPhaseIdx = st.phaseIdx
    if (st.phaseIdx >= 5 && st.state === 'playing') report.bossTime += 1 / 60
    // Workaround for the kamikaze exit bug: force stuck retiring entities offscreen
    if (st.stage === 'exit') {
      const unstuck = await page.evaluate(() => {
        const g = window.__game
        if (g.phaseStage !== 'exit' || g.phaseStageT < 3.5) return false
        let n = 0
        for (const r of g.retiring) {
          if (r.drone) { r.drone.x = -900; r.drone.y = -900; n++ }
          if (r.bar) { r.bar.y = g.h + 900; n++ }
        }
        return n > 0
      })
      if (unstuck) report.freezes.push({ phase: PHASES[st.phaseIdx], t: Math.round(st.time * 10) / 10 })
    }
    if (st.boss && st.boss.hp < (report.bossHp ?? Infinity)) report.bossHp = st.boss.hp
    if (prevLives === null) prevLives = st.lives
    if (st.lives < prevLives) {
      const lost = prevLives - st.lives
      report.damage[st.phaseIdx] += lost
      report.hits.push({ t: Math.round(st.time * 10) / 10, phase: PHASES[st.phaseIdx], lost })
      prevLives = st.lives
    }
    if (st.pu) report.powerups[st.pu]++
    report.maxCover[st.phaseIdx] = Math.max(report.maxCover[st.phaseIdx], st.cov)
    if (st.cov > 0.9) report.saturatedTime[st.phaseIdx] += 1 / 60
    report.minClear[st.phaseIdx] = Math.min(report.minClear[st.phaseIdx], st.minClear)
    if (st.state === 'clear') { report.clear = true; report.score = st.score; break }
    if (st.state === 'dead') { report.died = true; report.livesEnd = st.lives; break }
    if (!PERFECT) await page.mouse.move(box.x + st.x, box.y + st.y + 90)
    await page.waitForTimeout(1000 / 60)
  }
  report.totalTime = Math.round(lastT * 10) / 10
  report.livesEnd = prevLives
  console.log(JSON.stringify(report))
  if (errs.length) console.log('page errors:', errs.slice(0, 5))
  await page.close()
  return report
}

async function directRun(browser) {
  const labels = ['LASER LABYRINTH', 'PRISM LATTICE', 'KAMIKAZE PURSUIT', 'LASER GATES', 'METEOR SLALOM', 'SERPENT RIFT']
  const out = []
  for (const label of labels) {
    const page = await browser.newPage({ viewport: { width: W, height: H } })
    const errs = []
    page.on('pageerror', e => errs.push(String(e.message)))
    await page.goto(url, { waitUntil: 'load' })
    await page.getByRole('button', { name: /start mission/i }).click()
    await page.getByRole('button', { name: /nebula rift/i }).click()
    await page.getByRole('button', { name: label }).click()
    await page.waitForSelector('canvas.game-canvas', { timeout: 15000 })
    // let it play 14s with the bot
    await page.waitForTimeout(14000)
    const snap = await page.evaluate(() => {
      const s = window.__game.getDebugSnapshot()
      return {
        state: s.state, phase: s.phase.name, stage: s.phase.stage,
        drones: s.drones.items.filter(d => d.position.x > 0 && d.position.x < s.canvas.width && d.position.y > 0 && d.position.y < s.canvas.height).length,
        droneCount: s.drones.count, boss: s.boss ? { hp: s.boss.hp, mode: s.boss.state, portals: s.boss.portalCount } : null,
        bars: s.laserBars.count, gates: s.laserGates.count, meteors: s.meteors.count, telegraphs: s.telegraphs.count,
      }
    })
    out.push({ label, ...snap, errors: errs.length ? errs.slice(0, 3) : [] })
    await page.close()
  }
  return out
}

const browser = await chromium.launch()
// MODE=direct: PHASE="KAMIKAZE PURSUIT" (or comma list / all) plays a single menu phase with the bot
const directLabels = MODE === 'direct'
  ? (process.env.PHASE ? process.env.PHASE.split(',') : ['LASER LABYRINTH', 'PRISM LATTICE', 'KAMIKAZE PURSUIT', 'LASER GATES', 'METEOR SLALOM', 'SERPENT RIFT'])
  : [null]
for (const label of directLabels) {
  const results = []
  for (let i = 0; i < RUNS; i++) results.push(await playRun(browser, i, label))
  console.log(`\n##### ${label ?? 'FULL COURSE'} ${'x' + RUNS}`)
  for (const r of results) {
  console.log(`\n=== RUN ${r.run}: ${r.clear ? 'CLEARED' : r.died ? 'DIED' : 'TIMEOUT'} lives=${r.livesEnd} t=${r.totalTime}s score=${r.score}`)
  if (r.freezes.length) console.log('EXIT-FREEZE BUG hit (unstick workaround):', r.freezes.map(f => `${f.phase}@${f.t}s`).join(', '))
  console.log('phase times:', r.phaseTimes.map((s, i) => `${PHASES[i]}=${s.toFixed(0)}s`).join(' '))
  console.log('hits:', r.hits.map(h => `${h.phase}@${h.t}s(-${h.lost})`).join(', ') || 'none')
  console.log('maxCover:', r.maxCover.map((s, i) => `${PHASES[i]}=${s.toFixed(2)}`).join(' '))
  console.log('saturatedTime(>90%):', r.saturatedTime.map((s, i) => `${PHASES[i]}=${s.toFixed(1)}s`).join(' '))
  console.log('minClearance:', r.minClear.map((s, i) => `${PHASES[i]}=${s.toFixed(0)}px`).join(' '))
  console.log(`boss: hpLeft=${r.bossHp ?? '-'} time=${r.bossTime.toFixed(1)}s`)
  console.log('powerups seen:', JSON.stringify(r.powerups))
  }
}
await browser.close()
