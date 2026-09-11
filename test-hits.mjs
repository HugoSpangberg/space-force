// One run: logs the call source of every damageShip()
import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const logs = []
page.on('console', m => { if (m.type() === 'log' && m.text().startsWith('HIT')) logs.push(m.text()) })
await page.goto(process.env.URL || 'http://localhost:4180/', { waitUntil: 'load' })
await page.getByRole('button', { name: /start mission/i }).click()
await page.getByRole('button', { name: /nebula rift/i }).click()
await page.getByRole('button', { name: /full nebula course/i }).click()
await page.waitForSelector('canvas.game-canvas', { timeout: 15000 })
await page.evaluate(() => {
  const g = window.__game
  const orig = g.damageShip
  g.damageShip = function () {
    const st = (new Error()).stack.split('\n').slice(1, 4).map(s => s.trim())
    console.log(`HIT t=${g.time.toFixed(1)} lives=${g.lives} inv=${g.ship.inv.toFixed(1)} bossHp=${g.boss ? Math.round(g.boss.hp) : '-'} shipX=${Math.round(g.ship.x)} :: ${st.join(' << ')}`)
    return orig.call(this)
  }
})
// simple player: same steering as test-nebula but minimal — reuse perfect steering
const box = await page.locator('canvas.game-canvas').boundingBox()
for (let frame = 0; frame < 60 * 240; frame++) {
  const st = await page.evaluate(() => {
    const g = window.__game
    if (!g) return null
    const rowY = g.h - 150
    const zones = []
    let gap = null
    for (const bar of g.laserBars) {
      const alpha = bar.alpha ?? 1
      if (alpha <= 0.5) continue
      const on = t => ((t + bar.phase) % bar.cycle) < bar.cycle * 0.5
      if (on(g.time) && Math.abs(g.ship.y - bar.y) < 40) { gap = [bar.gapX - bar.gapW / 2, bar.gapX + bar.gapW / 2]; break }
      const tHit = bar.vy > 0 ? (rowY - bar.y) / bar.vy : Infinity
      if (tHit > 0.05 && tHit < 1.5 && on(g.time + tHit)) { gap = [bar.gapX - bar.gapW / 2, bar.gapX + bar.gapW / 2]; break }
    }
    const LA = 0.15
    for (const d of g.drones) {
      if (d.laserT === undefined || d.laserAngle === undefined || (d.alpha ?? 1) <= 0.5 || d.laserT >= 1.0) continue
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
    for (const b of g.bullets) {
      if (b.friendly || b.vy < 40) continue
      const tt = (rowY - b.y) / b.vy
      if (tt < 0 || tt > 0.6) continue
      zones.push([b.x + b.vx * tt, 22])
    }
    for (const d of g.drones) if (Math.abs(d.y - rowY) < d.r + 30) zones.push([d.x, d.r + 24])
    if (g.boss?.snake) for (const s of g.boss.snake.segs) {
      if (s.hidden) continue
      if (Math.abs(s.y - rowY) < s.r + 34) zones.push([s.x, s.r + 22])
    }
    const hx = (g.boss && !g.boss.dying && g.boss.t > 6) ? g.boss.x : null
    let best
    if (gap) best = (gap[0] + gap[1]) / 2
    else {
      best = g.w / 2; let bs = -Infinity
      for (let cx = 26; cx <= g.w - 26; cx += 8) {
        let minD = Infinity
        for (const [zx, hw] of zones) minD = Math.min(minD, Math.abs(cx - zx) - hw)
        if (!isFinite(minD)) minD = 1e9
        const score = hx !== null ? minD + 30 * (1 - Math.abs(cx - hx) / g.w) : minD
        if (score > bs) { bs = score; best = cx }
      }
    }
    if (g.boss && !g.boss.dying) best += Math.sin(g.time * 4.2) * 35
    best = Math.max(26, Math.min(g.w - 26, best))
    g.target.x = best; g.target.y = rowY; g.target.active = true
    return { state: g.state }
  })
  if (!st) break
  if (st.state === 'clear' || st.state === 'dead') break
  await page.waitForTimeout(1000 / 60)
}
await page.close()
await browser.close()
for (const l of logs) console.log(l)
