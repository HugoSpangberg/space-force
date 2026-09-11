import { chromium } from 'playwright'
const url = process.env.URL || 'http://localhost:4199/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
await page.goto(url, { waitUntil: 'load' })
await page.getByRole('button', { name: /start mission/i }).click()
await page.getByRole('button', { name: /boss fight/i }).click()
await page.waitForSelector('canvas.game-canvas', { timeout: 15000 })
await page.waitForTimeout(300)

// Isolated RING-collision check: remove the boss so only the ring can hurt the ship.
const res = await page.evaluate(() => {
  const g = window.__game
  const b = g.boss
  const savedBoss = g.boss
  g.boss = null            // no boss-body collision, no aimed bullets
  g.bullets = []
  const run = (gapAngle, shipAngle, label) => {
    g.godMode = false; g.ship.inv = 0; g.pShield = 0
    g.beam = { cx: savedBoss.x, cy: savedBoss.y, radius: 50, speed: 0, maxR: 99999, gap: 0.6, gapAngle, width: 6 }
    g.ship.x = savedBoss.x + 50 * Math.cos(shipAngle)
    g.ship.y = savedBoss.y + 50 * Math.sin(shipAngle)
    g.target.active = false
    const before = g.lives
    g.update(1 / 60)
    g.beam = null
    return `${label}: lives ${before}->${g.lives} (hit=${g.lives < before})`
  }
  const lines = [
    run(Math.PI, 0, 'OUTSIDE-GAP (expect hit=true)'),
    run(0, 0, 'INSIDE-GAP  (expect hit=false)'),
  ]
  g.boss = savedBoss        // restore
  return lines.join('\n')
})
console.log(res)
await browser.close()
