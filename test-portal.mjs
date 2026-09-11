// Verifies the Serpent portal transfer with a per-frame in-page recorder:
//   1. 'transit/in'   — boss VISIBLE, flying toward the ENTRY portal (dist decreases)
//   2. 'transit/void' — boss HIDDEN, position FROZEN (it does not exist)
//   3. 'attack'       — boss re-emerges AT the exit portal
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:4177/'
const W = parseInt(process.env.WIDTH || '390')
const H = parseInt(process.env.HEIGHT || '844')
const DURATION = parseInt(process.env.DURATION || '30')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H } })
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto(URL)
await page.locator('button', { hasText: 'Start Mission' }).first().click()
await page.locator('button', { hasText: 'Nebula Rift' }).first().click()
await page.locator('button', { hasText: 'SERPENT RIFT' }).first().click()
await page.waitForTimeout(300)
await page.evaluate(() => { if (window.__game) window.__game.godMode = true })

// wait for the boss
const t0 = Date.now()
while (Date.now() - t0 < 15000) {
  const b = await page.evaluate(() => !!window.__game?.boss)
  if (b) break
  await page.waitForTimeout(100)
}

// start per-frame recorder
await page.evaluate(() => {
  window.__portalLog = []
  const rec = () => {
    const g = window.__game
    const sn = g?.boss?.snake
    if (sn) {
      const b = g.boss
      window.__portalLog.push({
        t: performance.now() / 1000,
        mode: sn.mode, ph: sn.transitPhase, hidden: !!sn.segs[0]?.hidden,
        x: b.x, y: b.y, pat: b.pattern,
        ex: sn.targetPath[0]?.x ?? null, ey: sn.targetPath[0]?.y ?? null,
        qx: sn.targetPath[1]?.x ?? null, qy: sn.targetPath[1]?.y ?? null,
      })
      if (window.__portalLog.length > 30000) window.__portalLog.length = 15000
    }
    requestAnimationFrame(rec)
  }
  requestAnimationFrame(rec)
})

// screenshots at each sub-phase (checked each poll)
let shotIn = false, shotVoid = false, shotOut = false
const sleep = ms => new Promise(r => setTimeout(r, ms))
await sleep(DURATION * 1000)
while (true) {
  const phase = await page.evaluate(() => {
    const g = window.__game
    const sn = g?.boss?.snake
    return sn ? { mode: sn.mode, ph: sn.transitPhase } : null
  }).catch(() => null)
  if (!phase) break
  if (phase.mode === 'transit' && phase.ph === 'in' && !shotIn) { await page.screenshot({ path: '/tmp/portal-in.png' }); shotIn = true }
  if (phase.mode === 'transit' && phase.ph === 'void' && !shotVoid) { await page.screenshot({ path: '/tmp/portal-void.png' }); shotVoid = true }
  if (phase.mode === 'attack' && !shotOut) { await page.screenshot({ path: '/tmp/portal-out.png' }); shotOut = true }
  if (shotIn && shotVoid && shotOut) break
  await sleep(100)
}

const log = await page.evaluate(() => window.__portalLog)
await browser.close()

// ---------- analyze ----------
// group into cycles: a cycle = transit(in frames) + transit(void frames) + first attack frame
const cycles = []
let cur = null
for (const s of log) {
  if (s.mode === 'transit') {
    if (!cur) cur = { in: [], vo: [], emerge: null }
    ;(s.ph === 'void' ? cur.vo : cur.in).push(s)
    if (cur.in.length && !shotIn && s.ph === 'in') {} // noop
  } else if (s.mode === 'attack' && cur) {
    cur.emerge = s
    cycles.push(cur)
    cur = null
  } else if (s.mode !== 'transit' && s.mode !== 'attack') {
    if (cur && cur.in.length + cur.vo.length > 0 && !cur.emerge) cycles.push(cur) // aborted cycle (phase change)
    cur = null
  }
}
if (cur && cur.in.length + cur.vo.length > 0) cycles.push(cur)

let pass = true
const complete = cycles.filter(c => c.in.length > 0 && c.vo.length > 0 && c.emerge)
console.log(`frames: ${log.length}, cycles: ${cycles.length}, complete: ${complete.length}`)
const speeds = []
for (const c of complete) {
  const f = c.in[0], l = c.in[c.in.length - 1]
  const d0 = Math.hypot(f.x - f.ex, f.y - f.ey)
  const d1 = Math.hypot(l.x - f.ex, l.y - f.ey)
  // 1) fly-in visible + distance to ENTRY strictly decreasing
  let mono = true
  for (let i = 1; i < c.in.length; i++) {
    const a = Math.hypot(c.in[i - 1].x - f.ex, c.in[i - 1].y - f.ey)
    const b2 = Math.hypot(c.in[i].x - f.ex, c.in[i].y - f.ey)
    if (b2 > a + 2) mono = false
  }
  for (const s of c.in) if (s.hidden) { console.log('FAIL: visible boss hidden during fly-in'); pass = false }
  const dur = (c.vo[0].t - f.t) || 1 / 60
  const sp = (d0 - d1) / dur
  speeds.push(sp)
  if (d1 > 30) { console.log(`FAIL: fly-in stopped ${d1.toFixed(0)}px short of entry`); pass = false }
  if (!mono) { console.log('FAIL: fly-in not monotonic toward entry'); pass = false }

  // 2) void: hidden, frozen
  const v0 = c.vo[0]
  let maxMove = 0
  for (const v of c.vo) {
    if (!v.hidden) { console.log('FAIL: boss visible during void'); pass = false }
    maxMove = Math.max(maxMove, Math.hypot(v.x - v0.x, v.y - v0.y))
  }
  if (maxMove > 0.5) { console.log(`FAIL: boss moved ${maxMove.toFixed(1)}px during void`); pass = false }
  const voidDur = (c.vo[c.vo.length - 1].t - v0.t) + 1 / 60
  console.log(`  P${c.in[0].pat}: fly-in ${d0.toFixed(0)}px @ ${sp.toFixed(0)}px/s, void ${voidDur.toFixed(2)}s frozen, frames in/void=${c.in.length}/${c.vo.length}`)

  // 3) emerge at exit
  const e = c.emerge
  const eErr = Math.hypot(e.x - f.qx, e.y - f.qy)
  if (eErr > 8) { console.log(`FAIL: emerged ${eErr.toFixed(1)}px from exit`); pass = false }
}
if (complete.length === 0) { console.log('FAIL: no complete cycle'); pass = false }
if (speeds.length) console.log(`fly-in speeds: min ${Math.min(...speeds).toFixed(0)} / avg ${(speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(0)} / max ${Math.max(...speeds).toFixed(0)} px/s`)
console.log('page errors:', errors.length ? errors : 'none')
console.log(pass && errors.length === 0 ? 'PASS: portal transfer = fly-in -> void (frozen) -> emerge at exit' : 'FAIL')
process.exit(pass && errors.length === 0 ? 0 : 1)
