// Plays the full Nebula Rift course with a heuristic bot and reports
// where difficulty comes from (damage per phase, lives, clear/death).
//
// Input mode:
//   PERFECT=1 (default) — steer by writing g.target directly (zero latency, perfect play)
//   PERFECT=0           — steer via emulated mouse (adds realistic input lag)
import { chromium } from 'playwright'

const url = process.env.URL || 'http://localhost:4180/'
const RUNS = parseInt(process.env.RUNS || '1')
const PERFECT = (process.env.PERFECT || '1') === '1'

const PHASES = ['LASER LABYRINTH', 'PRISM LATTICE', 'LASER VEIL', 'SERPENT RIFT', 'NEBULA CLEAR']

async function playRun(browser, runIdx) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errs = []
  page.on('pageerror', e => errs.push(String(e.message)))
  await page.goto(url, { waitUntil: 'load' })
  await page.getByRole('button', { name: /start mission/i }).click()
  await page.getByRole('button', { name: /nebula rift/i }).click()
  await page.getByRole('button', { name: /full nebula course/i }).click()
  await page.waitForSelector('canvas.game-canvas', { timeout: 15000 })
  const box = await page.locator('canvas.game-canvas').boundingBox()
  const W = box.width, H = box.height
  const mouseY = box.y + H - 80
  if (!PERFECT) {
    // engine is touch-driven: press and hold, then move
    await page.mouse.move(box.x + W / 2, mouseY)
    await page.mouse.down()
  }

  const report = {
    run: runIdx, clear: false, died: false, livesEnd: null,
    score: 0, totalTime: 0,
    damage: PHASES.map(() => 0),   // hits per phase
    phaseTimes: PHASES.map(() => 0),
    phases: [],                      // {t, phase} transition times
    hits: [],                       // {t, phase, cause}
    bossTime: 0,
    powerups: { spread: 0, rapid: 0, shield: 0, health: 0 },
    maxCover: PHASES.map(() => 0),
    saturatedTime: PHASES.map(() => 0), // seconds where >90% of the row is dangerous
  }
  let prevLives = null, lastT = 0, lastPhase = 0
  let stepT = 0, stepOff = 0, lastPhaseIdx = 0

  for (let frame = 0; frame < 60 * 240; frame++) {
    // persistent random shuffles during the boss fight (fans are aimed at us)
    if (lastPhaseIdx >= 3 && lastT - stepT > 0.9) {
      stepT = lastT
      stepOff = Math.round(Math.random() * 120 - 60)
    } else if (lastPhaseIdx < 3) stepOff = 0
    const st = await page.evaluate(([perfect, stepOff]) => {
      const g = window.__game
      if (!g) return null
      const w = g.w
      const sy = g.ship.y
      const rowY = g.h - 150
      // ---- collect danger zones at the ship row as [x, halfWidth]
      const zones = []
      let gap = null
      // laser bars (on now or arriving soon at the ship row)
      for (const bar of g.laserBars) {
        const alpha = bar.alpha ?? 1
        if (alpha <= 0.5) continue
        const on = t => ((t + bar.phase) % bar.cycle) < bar.cycle * 0.5
        if (on(g.time) && Math.abs(sy - bar.y) < 40) {
          gap = [bar.gapX - bar.gapW / 2, bar.gapX + bar.gapW / 2]
          break
        }
        const tHit = bar.vy > 0 ? (rowY - bar.y) / bar.vy : Infinity
        if (tHit > 0.05 && tHit < 1.5 && on(g.time + tHit)) {
          gap = [bar.gapX - bar.gapW / 2, bar.gapX + bar.gapW / 2]
          break
        }
      }
      // drone / sentinel beams (predict positions/angles ~0.15s ahead, like a human)
      const LA = 0.15
      for (const d of g.drones) {
        if (d.laserT === undefined || d.laserAngle === undefined || (d.alpha ?? 1) <= 0.5) continue
        if (d.laserT >= 1.0) continue
        let px = d.x, py = d.y
        if (d.orbit) {
          const p2 = d.orbit.phase + d.orbit.speed * LA
          px = d.orbit.cx + Math.cos(p2) * d.orbit.r
          py = d.orbit.cy + Math.sin(p2) * d.orbit.r * 0.62
        } else px = d.x + d.vx * LA
        const a = d.laserAngle + (d.spinSpeed ?? 0.4) * LA
        const fx = Math.sin(a), fy = -Math.cos(a)
        if (fy <= 0.1) continue
        const tt = (rowY - py) / fy
        if (tt < 0) continue
        zones.push([px + fx * tt, 0.22 * tt + 12])
      }
      // enemy bullets (fans take ~1.5s to reach the row, so look that far ahead)
      for (const b of g.bullets) {
        if (b.friendly || b.vy < 40) continue
        const tt = (rowY - b.y) / b.vy
        if (tt < 0 || tt > 2.0) continue
        zones.push([b.x + b.vx * tt, tt > 0.8 ? 60 : 22])
      }
      // drone bodies
      for (const d of g.drones) {
        if (Math.abs(d.y - rowY) < d.r + 30) zones.push([d.x, d.r + 24])
      }
      // snake segments
      if (g.boss?.snake) {
        for (const s of g.boss.snake.segs) {
          if (s.hidden) continue
          if (Math.abs(s.y - rowY) < s.r + 34) zones.push([s.x, s.r + 22])
        }
      }
      // boss body (non-snake)
      if (g.boss && !g.boss.snake && Math.abs(g.boss.y - rowY) < g.boss.r + 30) {
        zones.push([g.boss.x, g.boss.r + 26])
      }
      // no head bias while the serpent's body descends in from above
      const hx = (g.boss && !g.boss.dying && g.boss.t > 6) ? g.boss.x : null
      // measure how much of the row is covered by danger (merged intervals)
      let covFrac = 0
      if (gap) {
        covFrac = Math.min(1, 1 - (gap[1] - gap[0] - 16) / (w - 52))
      } else if (zones.length) {
        const ivs = zones.map(([zx, hw]) => [zx - hw, zx + hw]).sort((a, b) => a[0] - b[0])
        let covered = 0, curS = ivs[0][0], curE = ivs[0][1]
        for (let i = 1; i < ivs.length; i++) {
          const s = ivs[i][0], e = ivs[i][1]
          if (s > curE) { covered += curE - curS; curS = s; curE = e }
          else curE = Math.max(curE, e)
        }
        covered += curE - curS
        covFrac = Math.min(1, covered / (w - 52))
      }
      let best
      if (gap) {
        best = (gap[0] + gap[1]) / 2
      } else if (g.phaseIdx === 1 && !g.boss) {
        // shoot a sentinel down when the lane to it is safe (vertical auto-fire)
        let tgt = null, td = Infinity
        for (const d of g.drones) {
          if (!d.orbit || (d.alpha ?? 1) < 1) continue
          const dd = Math.abs(d.x - g.ship.x)
          if (dd < td) { td = dd; tgt = d }
        }
        best = g.ship.x
        if (tgt && td < 90 && zones.every(([zx, hw]) => Math.abs(zx - tgt.x) > hw + 30)) best = tgt.x
      } else {
        best = w / 2
        let bs = -Infinity
        for (let cx = 26; cx <= w - 26; cx += 8) {
          let minD = Infinity
          for (const [zx, hw] of zones) minD = Math.min(minD, Math.abs(cx - zx) - hw)
          if (!isFinite(minD)) minD = 1e9
          // during boss: worth taking up to ~30px less clearance to line up under the head
          const score = hx !== null ? minD + 30 * (1 - Math.abs(cx - hx) / w) : minD
          if (score > bs) { bs = score; best = cx }
        }
      }
      // shuffle offset just before the aimed fan fires, otherwise stay aligned on the head for max DPS
      if (g.boss && !g.boss.dying && g.boss.atk < 0.7) best += stepOff
      if (perfect) {
        // zero-latency perfect input
        g.target.x = Math.max(26, Math.min(w - 26, best))
        g.target.y = rowY
        g.target.active = true
      }
      return { state: g.state, lives: g.lives, phaseIdx: g.phaseIdx, time: g.time, x: best, cov: covFrac, score: g.score, pu: g.pSpread > 0 ? 'spread' : g.pRapid > 0 ? 'rapid' : g.pShield > 0 ? 'shield' : null }
    }, [PERFECT, stepOff])
    if (!st) break

    const now = lastT + 1 / 60
    // bookkeeping
    if (st.phaseIdx !== lastPhase) {
      report.phaseTimes[lastPhase] += now - lastT
      report.phases.push({ t: Math.round(st.time * 10) / 10, phase: PHASES[st.phaseIdx] })
      lastPhase = st.phaseIdx
      lastT = now
    } else {
      report.phaseTimes[lastPhase] += 1 / 60
    }
    lastPhaseIdx = st.phaseIdx
    if (st.phaseIdx >= 3 && st.state === 'playing') report.bossTime += 1 / 60
    if (prevLives === null) prevLives = st.lives
    if (st.lives < prevLives) {
      const cause = st.phaseIdx === 0 ? 'laser-bar' : st.phaseIdx === 1 ? 'sentinel-beam' : st.phaseIdx === 2 ? 'drone-beam' : 'boss'
      report.damage[st.phaseIdx] += prevLives - st.lives
      report.hits.push({ t: Math.round(st.time * 10) / 10, phase: PHASES[st.phaseIdx], cause })
      prevLives = st.lives
    }
    if (st.pu) report.powerups[st.pu]++
    report.maxCover[st.phaseIdx] = Math.max(report.maxCover[st.phaseIdx], st.cov)
    if (st.cov > 0.9) report.saturatedTime[st.phaseIdx] += 1 / 60

    if (st.state === 'clear') { report.clear = true; report.score = st.score; break }
    if (st.state === 'dead') { report.died = true; report.livesEnd = st.lives; break }

    if (!PERFECT) await page.mouse.move(box.x + Math.max(18, Math.min(W - 18, st.x)), mouseY)
    await page.waitForTimeout(1000 / 60)
  }
  report.totalTime = Math.round(lastT * 10) / 10
  console.log(JSON.stringify(report))
  if (errs.length) console.log('page errors:', errs)
  await page.close()
  return report
}

const browser = await chromium.launch()
const results = []
for (let i = 0; i < RUNS; i++) results.push(await playRun(browser, i))
await browser.close()

// summary
for (const r of results) {
  console.log(`\n=== RUN ${r.run}: ${r.clear ? 'CLEARED' : 'DIED'} lives=${r.livesEnd ?? '-'} t=${r.totalTime}s score=${r.score}`)
  console.log('phase times:', r.phaseTimes.map((s, i) => `${PHASES[i]}=${s.toFixed(0)}s`).join(' '))
  console.log('transitions:', r.phases.map(p => `${p.phase}@${p.t}s`).join(' '))
  console.log('hits:', r.hits.map(h => `${h.cause}@${h.t}s(${h.phase})`).join(', ') || 'none')
  console.log('maxCover:', r.maxCover.map((s, i) => `${PHASES[i]}=${s.toFixed(2)}`).join(' '))
  console.log('saturated(>90% row) time:', r.saturatedTime.map((s, i) => `${PHASES[i]}=${s.toFixed(1)}s`).join(' '))
}
