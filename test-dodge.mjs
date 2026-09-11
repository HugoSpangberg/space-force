import { chromium } from 'playwright'

const url = process.env.URL || 'http://localhost:4180/'
const SECS = parseInt(process.env.SECONDS || '20')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errs = []
page.on('pageerror', e => errs.push(String(e.message)))
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })

await page.goto(url, { waitUntil: 'load' })
await page.getByRole('button', { name: /start mission/i }).click()
await page.getByRole('button', { name: /nebula rift/i }).click()
await page.getByRole('button', { name: /prism lattice/i }).click()
await page.waitForSelector('canvas.game-canvas', { timeout: 15000 })

const box = await page.locator('canvas.game-canvas').boundingBox()
const W = box.width, H = box.height
const shipY = H - 80
// candidate x columns across the bottom
const cols = [40, W * 0.28, W * 0.5, W * 0.72, W - 40]

function pickSafeX(dangers) {
  // dangers: array of beam x-positions at the ship's row (only downward beams)
  let best = W / 2, bestScore = -Infinity
  for (const cx of cols) {
    let minD = Infinity
    for (const dx of dangers) minD = Math.min(minD, Math.abs(cx - dx))
    if (minD > bestScore) { bestScore = minD; best = cx }
  }
  return best
}

let t = 0
let final = null
let minLives = 99
while (t < SECS) {
  const st = await page.evaluate(() => {
    const g = window.__game
    if (!g) return null
    const sy = g.ship.y
    const dangers = []
    for (const d of g.drones) {
      if (!d.orbit || d.laserT === undefined || d.laserAngle === undefined) continue
      if (d.laserT >= 1.0) continue // off
      const fx = Math.sin(d.laserAngle), fy = -Math.cos(d.laserAngle)
      if (fy < 0.15) continue // not pointing down toward ship row
      const tt = (sy - d.y) / fy
      if (tt < 0) continue
      dangers.push(d.x + fx * tt)
    }
    // pick x farthest from all danger points
    let best = g.w / 2, bs = -Infinity
    for (let cx = 30; cx < g.w - 30; cx += 8) {
      let minD = Infinity
      for (const dx of dangers) minD = Math.min(minD, Math.abs(cx - dx))
      if (minD > bs) { bs = minD; best = cx }
    }
    return { state: g.state, lives: g.lives, phaseIdx: g.phaseIdx, n: g.drones.length, x: best, time: g.time }
  })
  if (!st) break
  minLives = Math.min(minLives, st.lives)
  if (st.state === 'clear' || st.state === 'dead' || st.phaseIdx > 1) { final = st; break }
  await page.mouse.move(box.x + st.x, box.y + shipY)
  t += 1 / 60
  await page.waitForTimeout(1000 / 60)
}
console.log(`final: state=${final?.state ?? '?'} phaseIdx=${final?.phaseIdx ?? '?'} lives=${final?.lives ?? '?'} minLives=${minLives} t=${t.toFixed(1)}s`)
console.log('page errors:', errs.length ? errs : 'none')
await browser.close()
