// Phase-0 (LASER LABYRINTH) forensics: direct-starts the phase, plays it with the
// same heuristic bot, and dumps a per-frame timeline of bar state vs ship position
// around every hit, so we can tell "unfair moment" from "bot limitation".
import { chromium } from 'playwright'
const url = process.env.URL || 'http://localhost:4180/'
const RUNS = parseInt(process.env.RUNS || '3')

const browser = await chromium.launch()
for (let run = 0; run < RUNS; run++) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.goto(url, { waitUntil: 'load' })
  await page.getByRole('button', { name: /start mission/i }).click()
  await page.getByRole('button', { name: /nebula rift/i }).click()
  await page.getByRole('button', { name: 'LASER LABYRINTH' }).click()
  await page.waitForSelector('canvas.game-canvas', { timeout: 15000 })
  const frames = []
  let hits = 0, prevLives = null
  for (let f = 0; f < 60 * 40; f++) {
    const st = await page.evaluate(() => {
      const g = window.__game
      const w = g.w, h = g.h, rowY = h - 150
      const bars = g.laserBars.filter(b => (b.alpha ?? 1) > 0.5).map(b => ({
        y: Math.round(b.y), gapX: Math.round(b.gapX), gapW: Math.round(b.gapW),
        on: ((g.time + b.phase) % b.cycle) < b.cycle * 0.5,
        band: Math.abs(g.ship.y - b.y) < 6 + 20,
        tHit: b.vy > 0 ? +(((rowY - b.y) / b.vy).toFixed(2)) : -1,
        nextOnIn: (() => { const t = (g.time + b.phase) % b.cycle; const onW = b.cycle * 0.5; return t < onW ? 0 : +(onW - t).toFixed(2) })(),
      }))
      // steer: intersection of gaps of all bars that are ON (or will be) while crossing the row band
      const rawBars = g.laserBars.filter(b => (b.alpha ?? 1) > 0.5)
      const cons = []
      for (const b of rawBars) {
        const inBand = Math.abs(g.ship.y - b.y) < 40
        const tHit = b.vy > 0 ? (rowY - b.y) / b.vy : -1
        if (!(inBand || (tHit > 0 && tHit < 0.9))) continue
        const onAt = ta => ((ta + b.phase) % b.cycle) < b.cycle * 0.5
        let must = false
        const t1 = g.time + Math.max(0, tHit) + 0.45
        for (let ta = g.time; ta <= t1; ta += 0.05) { if (onAt(ta)) { must = true; break } }
        if (!must && !(onAt(g.time) && inBand)) continue
        cons.push([b.gapX - b.gapW / 2 - 6, b.gapX + b.gapW / 2 + 6])
      }
      let lo = 0, hi = w, best = w / 2
      for (const [a, b] of cons) { lo = Math.max(lo, a); hi = Math.min(hi, b) }
      if (lo <= hi) best = (lo + hi) / 2
      else {
        let bs = 1e18
        for (let cx = 20; cx <= w - 20; cx += 4) {
          let s = 0
          for (const [a, b] of cons) s += Math.max(0, a - cx) + Math.max(0, cx - b)
          if (s < bs) { bs = s; best = cx }
        }
      }
      g.target.x = best; g.target.y = rowY; g.target.active = true
      g.__infeasible = lo > hi
      return {
        t: +g.time.toFixed(2), x: Math.round(g.ship.x), inv: +g.ship.inv.toFixed(2),
        lives: g.lives, bars, stage: g.phaseStage, infeasible: g.__infeasible ?? false
      }
    })
    if (st && st.infeasible && !st.__warned) { st.__warned = true; console.log(`INFEASIBLE moment at t=${st.t}s (no x safe against all ON bars)`) }
    if (!st) break
    frames.push(st)
    if (prevLives !== null && st.lives < prevLives) hits += prevLives - st.lives
    prevLives = st.lives
    if (st.lives <= 0) break
    await page.waitForTimeout(1000 / 60)
  }
  // dump windows around each hit
  const hitIdx = []
  for (let i = 1; i < frames.length; i++) if (frames[i].lives < frames[i - 1].lives) hitIdx.push(i)
  if (hitIdx.length === 0) console.log(`\n### RUN ${run}: CLEAN, no hits, finalLives=${prevLives}`)
  console.log(`\n### RUN ${run}: hits=${hits} finalLives=${prevLives}`)
  for (const hi of hitIdx) {
    const from = Math.max(0, hi - 12), to = Math.min(frames.length, hi + 4)
    console.log(`-- hit at t=${frames[hi].t}s, ship.x=${frames[hi].x}`)
    for (let i = from; i < to; i++) {
      const f = frames[i]
      const bs = f.bars.filter(b => b.tHit > -1 && b.tHit < 2.5 && b.y < 780).map(b =>
        `y${b.y}${b.band ? '*' : ''} g${b.gapX - b.gapW / 2}-${b.gapX + b.gapW / 2}${b.on ? 'ON' : 'off'}`).join(' | ')
      console.log(`  t=${f.t} x=${f.x} inv=${f.inv} [${bs}]`)
    }
  }
  await page.close()
}
await browser.close()
