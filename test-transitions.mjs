import { chromium } from 'playwright'

const url = process.env.URL || 'http://localhost:4180/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errs = []
page.on('pageerror', e => errs.push(String(e.message)))
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })

await page.goto(url, { waitUntil: 'load' })
await page.getByRole('button', { name: /start mission/i }).click()
await page.getByRole('button', { name: /nebula rift/i }).click()
await page.getByRole('button', { name: /full nebula course/i }).click()
await page.waitForSelector('canvas.game-canvas', { timeout: 15000 })
const box0 = await page.locator('canvas.game-canvas').boundingBox()
await page.mouse.click(box0.x + box0.width / 2, box0.y + box0.height - 100) // focus + unlock audio

const snap = () => page.evaluate(() => {
  const g = window.__game
  if (!g) return null
  return {
    state: g.state, phaseIdx: g.phaseIdx, lives: g.lives,
    bars: g.laserBars.length, drones: g.drones.length,
    retiring: g.retiring.length,
    transT: g.transT, time: g.time,
  }
})

// --- Phase 0 warmup: keep the ship invincible so laser bars accumulate ---
const WARM = 2.5
let warm = 0
while (warm < WARM) {
  await page.evaluate(() => { const g = window.__game; if (g) g.ship.inv = 99 })
  warm += 1 / 60
  await page.waitForTimeout(1000 / 60)
}
const before = await snap()

// --- Force the 0 -> 1 transition on the next update ---
await page.evaluate(() => {
  const g = window.__game
  g.ship.inv = 99
  g.phaseT = g.phaseDurations[g.phaseIdx]
})
const after = await snap()

// --- Observe retiring entities scroll out of the frame over ~1.4s ---
let maxRetiring = 0
let retiredToZero = false
let obs = 0
const OBS = 1.4
while (obs < OBS) {
  const s = await snap()
  if (s) {
    maxRetiring = Math.max(maxRetiring, s.retiring)
    if (s.retiring === 0 && maxRetiring > 0) retiredToZero = true
    await page.evaluate(() => { const g = window.__game; if (g) g.ship.inv = 99 })
  }
  obs += 1 / 60
  await page.waitForTimeout(1000 / 60)
}
const end = await snap()

console.log('BEFORE :', JSON.stringify(before))
console.log('AFTER  :', JSON.stringify(after))
console.log('END    :', JSON.stringify(end))
console.log('max retiring      :', maxRetiring)
console.log('retiring drained  :', retiredToZero)
console.log('page errors       :', errs.length ? errs : 'none')

const pass =
  end && end.phaseIdx === 1 &&
  end.lives === 3 &&
  maxRetiring > 0 && retiredToZero &&
  bannerSeen === 'PRISM LATTICE' &&
  !errs.length

console.log(pass ? 'RESULT: PASS' : 'RESULT: FAIL')
await browser.close()
process.exit(pass ? 0 : 1)
