import { chromium } from 'playwright'

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
await page.waitForTimeout(300)

// ---- A: ring expands (radius grows with speed*dt) ----
const expand = await page.evaluate(async () => {
  const g = window.__game
  g.godMode = true
  g.beam = { cx: g.boss.x, cy: g.boss.y, radius: 60, speed: 160, maxR: 99999, gap: 0.45, gapAngle: 0, width: 6 }
  const r0 = g.beam.radius
  await new Promise(r => setTimeout(r, 600))
  return { r0, r1: g.beam ? g.beam.radius : null }
})
const dR = expand.r1 - expand.r0
console.log(`A EXPAND: r0=${expand.r0} r1=${Math.round(expand.r1)} delta=${Math.round(dR)} (expect ~96)`)

// ---- B: ship sitting on the ring (outside gap) takes a hit ----
const hit = await page.evaluate(() => {
  const g = window.__game
  g.godMode = false; g.ship.inv = 0; g.pShield = 0
  const b = g.boss
  g.beam = { cx: b.x, cy: b.y, radius: 100, speed: 0, maxR: 99999, gap: 0.45, gapAngle: Math.PI, width: 6 }
  g.ship.x = b.x + 100; g.ship.y = b.y; g.target.active = false
  const before = g.lives
  g.update(0.016)
  return { before, after: g.lives, damaged: g.lives < before }
})
console.log(`B HIT: lives ${hit.before}->${hit.after} damaged=${hit.damaged} (expect true)`)

// ---- C: ship on the ring but INSIDE the gap survives ----
const safe = await page.evaluate(() => {
  const g = window.__game
  g.godMode = false; g.ship.inv = 0; g.pShield = 0
  const b = g.boss
  g.beam = { cx: b.x, cy: b.y, radius: 100, speed: 0, maxR: 99999, gap: 0.6, gapAngle: 0, width: 6 }
  g.ship.x = b.x + 100; g.ship.y = b.y; g.target.active = false
  const before = g.lives
  g.update(0.016)
  return { before, after: g.lives, safe: g.lives === before }
})
console.log(`C GAP: lives ${safe.before}->${safe.after} safe=${safe.safe} (expect true)`)

// ---- D: full phase-2 soak — ring spawns, expands, and damages a far ship ----
const soak = await page.evaluate(async () => {
  const g = window.__game
  const b = g.boss
  g.godMode = false
  g.ship.inv = 0; g.pShield = 0
  // park ship at bottom-center, far from the boss (no boss-body collision)
  g.ship.x = g.w / 2; g.ship.y = g.h - 90
  g.target.active = false
  b.pattern = 2; b.hp = 500; b.tele = 0; g.beam = null
  const startLives = g.lives
  let sawBeam = false, rings = 0, maxBeamR = 0, prevBeam = null
  for (let i = 0; i < 600 && g.lives > 0; i++) {
    b.hp = 500
    if (!g.beam && prevBeam) rings++
    if (g.beam) { sawBeam = true; maxBeamR = Math.max(maxBeamR, g.beam.radius) }
    b.atk = 0            // re-arm so a new ring spawns right after the old one dies
    prevBeam = g.beam
    g.update(1 / 60)
  }
  return { startLives, endLives: g.lives, sawBeam, rings, maxBeamR: Math.round(maxBeamR), tookDamage: g.lives < startLives }
})
console.log(`D SOAK: sawBeam=${soak.sawBeam} rings=${soak.rings} maxBeamR=${soak.maxBeamR} lives ${soak.startLives}->${soak.endLives} tookDamage=${soak.tookDamage} (expect sawBeam=true, tookDamage=true)`)

console.log('page errors:', errs.length ? errs : 'none')
await browser.close()
