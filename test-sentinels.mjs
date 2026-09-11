import { chromium } from 'playwright'

const url = process.env.URL || 'http://localhost:4180/'
const SECS = parseInt(process.env.SECONDS || '6')

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
const cx = box.x + box.width / 2

// Track one sentinel's laserAngle delta (should be ~constant = spin, no snap-to-aim)
// and the angle error vs the vector pointing at the ship (should NOT hover near 0).
let prevA = null
const deltas = []
const aimErr = []
let maxN = 0, lives0 = null
let last = null
for (let i = 0; i < SECS * 60; i++) {
  // dodge: sweep the ship left/right so it's not parked under a sentinel
  const x = cx + Math.sin(i / 12) * 120
  await page.mouse.move(x, box.y + box.height - 80)
  const st = await page.evaluate(() => {
    const g = window.__game
    if (!g) return null
    const d = g.drones.find(z => z.orbit)
    return d ? { a: d.laserAngle, x: d.x, y: d.y, shipX: g.ship.x, shipY: g.ship.y, n: g.drones.length, lives: g.lives, state: g.state } : null
  })
  if (st) {
    maxN = Math.max(maxN, st.n)
    if (lives0 === null) lives0 = st.lives
    if (prevA !== null) {
      let da = st.a - prevA
      while (da > Math.PI) da -= Math.PI * 2
      while (da < -Math.PI) da += Math.PI * 2
      deltas.push(da)
    }
    // aim error: angle the ship is at (relative to sentinel) vs facing
    const toShip = Math.atan2(st.shipY - st.y, st.shipX - st.x) + Math.PI / 2
    let err = toShip - st.a
    while (err > Math.PI) err -= Math.PI * 2
    while (err < -Math.PI) err += Math.PI * 2
    aimErr.push(Math.abs(err))
    prevA = st.a
    last = st
    if (st.state !== 'playing') break
  }
  await page.waitForTimeout(1000 / 60)
}

const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : NaN
const nearZero = aimErr.filter(e => e < 0.2).length
console.log(`sentinels seen: ${maxN}`)
console.log(`spin: avgDelta=${avg(deltas).toFixed(3)} rad/frame, min=${Math.min(...deltas).toFixed(3)} max=${Math.max(...deltas).toFixed(3)}`)
console.log(`aim-lock: avgErr=${avg(aimErr).toFixed(3)} rad, frames within 0.2rad of ship=${nearZero}/${aimErr.length}`)
console.log(`lives: ${lives0} -> ${last?.lives ?? '?'} state=${last?.state ?? '?'}`)
console.log('page errors:', errs.length ? errs : 'none')
await browser.close()
