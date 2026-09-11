import { chromium } from 'playwright'

const url = process.env.URL || 'http://localhost:4176/'
const N = parseInt(process.env.N || '3')
const MAXS = parseFloat(process.env.MAXS || '70')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errs = []
page.on('pageerror', e => errs.push(String(e.message)))
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })

await page.goto(url, { waitUntil: 'load' })
const start = page.getByRole('button', { name: /start mission/i })
await start.waitFor({ timeout: 15000 })
await start.click()
// course select -> nebula
const nebula = page.getByRole('button', { name: /nebula rift/i })
await nebula.waitFor({ timeout: 15000 })
await nebula.click()
// phase select -> serpent warden boss (all three phases)
const bossBtn = page.getByRole('button', { name: /serpent warden/i })
await bossBtn.waitFor({ timeout: 15000 })
await bossBtn.click()
await page.waitForSelector('canvas.game-canvas', { timeout: 15000 })

const canvas = page.locator('canvas.game-canvas')
const box = await canvas.boundingBox()
const cx = box.x + box.width / 2

let first = true
let prevP
let prevT
let sawBeam = false
let maxPortals = 0
let minPortals = Infinity
let transits = 0
let segCount = 0
let visibleSegs = 0

for (let i = 0; i < N * 60; i++) {
  // steer ship: stay low-center, wobble slightly
  const x = cx + Math.sin(i / 25) * 60
  await page.mouse.move(x, box.y + box.height - 70)
  if (first) {
    await page.mouse.down()
    first = false
  }

  // read live state
  const st = await page.evaluate(() => {
    const g = (window).__game
    const b = g && g.boss
    const sn = b && b.snake
    return g
      ? {
          state: g.state,
          bossHp: b ? b.hp : null,
          pattern: b ? b.pattern : null,
          beam: !!g.beam,
          lives: g.lives,
          portals: sn ? sn.portals.length : 0,
          transit: sn && !!sn.transit,
          segs: sn ? sn.segs.length : 0,
          visible: sn ? sn.segs.filter(s => !s.hidden).length : 0,
          tunnels: sn ? sn.tunnels.length : 0,
        }
      : null
  })

  if (st && st.bossHp !== null) {
    if (st.beam) sawBeam = true
    if (st.transit) transits++
    maxPortals = Math.max(maxPortals, st.portals)
    minPortals = Math.min(minPortals, st.portals)
    segCount = st.segs
    visibleSegs = st.visible
    const t = (i / 60).toFixed(1)
    if (i % 30 === 0 || (i > 0 && (st.pattern !== prevP || st.transit !== prevT))) {
      console.log(`${t}s hp=${st.bossHp} pattern=${st.pattern} portals=${st.portals} transit=${st.transit} tunnels=${st.tunnels} segs=${st.segs} vis=${st.visible} beam=${st.beam} lives=${st.lives}`)
    }
    prevP = st.pattern
    prevT = st.transit
  }
  if (st && st.state === 'dead') {
    console.log(`DEAD at ~${(i / 60).toFixed(1)}s lives=${st.lives}`)
    await page.screenshot({ path: `test-boss-${N}.png` })
    break
  }
  if (st && st.state === 'clear') {
    console.log(`CLEAR at ~${(i / 60).toFixed(1)}s`)
    await page.screenshot({ path: `test-boss-${N}.png` })
    break
  }
  await page.waitForTimeout(1000 / 60)
  if (i / 60 > MAXS) { console.log(`timeout ${MAXS}s`); break }
}

console.log(`summary: portals=${minPortals === Infinity ? 'n/a' : `${minPortals}-${maxPortals}`} transits=${transits} beamEver=${sawBeam} segs=${segCount} visibleLast=${visibleSegs}`)
console.log('page errors:', errs.length ? errs : 'none')
await browser.close()
