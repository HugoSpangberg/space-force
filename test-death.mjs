import { chromium } from 'playwright'

// Verifies the dramatic boss death sequence:
//   A. The boss enters a "dying" state the instant its HP reaches 0.
//   B. The beam is cleared the moment the death sequence starts.
//   C. The boss lingers (blinking) ~1.5s before detonating.
//   D. The boss is removed and the level is cleared ("Sector 01 Cleared").
//   E. Auto-fire is suppressed while the boss is dying (no fresh bullets).

const url = process.env.URL || 'http://localhost:4199/'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errs = []
page.on('pageerror', e => errs.push(String(e.message)))
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })

await page.goto(url, { waitUntil: 'load' })
await page.getByRole('button', { name: /start mission/i }).click()
await page.getByRole('button', { name: /boss fight/i }).click()
await page.waitForSelector('canvas.game-canvas', { timeout: 15000 })
await page.waitForTimeout(1000) // let boss enter play, clear any residual bullets

// Simulate the moment the final bullet lands: HP reaches 0.
// godMode + corner ship keeps the player safe through the sequence.
await page.evaluate(() => {
  const g = window.__game
  g.godMode = true
  g.ship.x = 40
  g.ship.y = 40
  if (g.boss) g.boss.hp = 0 // trigger the dying branch on the next update
})

let sawDying = false
let beamClearedOnDying = false
let sawBeamDuringDying = false
let maxDeathT = 0
let bossGone = false
let cleared = false
// auto-fire suppression: track friendly-bullet count over the dying window
const bulletSamples = []
let prevBullets = await page.evaluate(() => window.__game?.bullets.filter(b => b.friendly).length ?? 0)
let suppressed = true

const MAXS = 9
for (let i = 0; i < MAXS * 60; i++) {
  const st = await page.evaluate(() => {
    const g = window.__game
    return g ? {
      state: g.state,
      bossDying: g.boss ? g.boss.dying : null,
      deathT: g.boss ? g.boss.deathT : null,
      beam: !!g.beam,
      bullets: g.bullets.filter(b => b.friendly).length,
    } : null
  })
  if (!st) { await page.waitForTimeout(16); continue }

  if (st.bossDying) {
    sawDying = true
    if (!st.beam) beamClearedOnDying = true
    else sawBeamDuringDying = true
    if (st.deathT !== null) maxDeathT = Math.max(maxDeathT, st.deathT)
    // fresh bullets mean auto-fire was NOT suppressed
    if (st.bullets > prevBullets) suppressed = false
    bulletSamples.push(st.bullets)
  }
  prevBullets = st.bullets

  if (!st.bossDying) bossGone = bossGone || (st.bossDying === false)
  if (st.state === 'clear') cleared = true

  const overlay = await page.getByRole('button', { name: /fly again/i }).count()
  if (cleared || overlay > 0) break

  await page.waitForTimeout(1000 / 60)
}

const results = [
  ['A. boss entered dying state', sawDying],
  ['B. beam cleared when dying started', beamClearedOnDying],
  ['C. death sequence ran ~1.5s (maxDeathT)', maxDeathT >= 1.4],
  ['D. level cleared (Sector 01 Cleared overlay)', cleared || (await page.getByRole('button', { name: /fly again/i }).count()) > 0],
  ['E. auto-fire suppressed while dying', suppressed],
]

let pass = 0
for (const [name, ok] of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (ok) pass++
}
console.log(`beamDuringDying=${sawBeamDuringDying}  maxDeathT=${maxDeathT.toFixed(2)}`)
console.log(`bullet samples (first 10): ${bulletSamples.slice(0, 10).join(',')}`)
console.log(`page errors: ${errs.length ? errs : 'none'}`)
console.log(`\n${pass}/${results.length} checks passed`)
await browser.close()
process.exit(pass === results.length && !errs.length ? 0 : 1)
