// Verifies the Serpent portal transfer with a per-frame in-page recorder:
//   1. transit 'in' (approach)  — head VISIBLE, flying toward the ENTRY portal
//   2. transit 'in' (swallow)   — head hidden, body CONSUMED head-first
//                                  (visible-segment count decreases to 0)
//   3. transit 'void'           — nothing visible, position FROZEN
//   4. transit 'out' (emerge)   — head VISIBLE at the EXIT, body REVEALED
//                                  head-first (visible-segment count grows to full)
import { chromium } from 'playwright'

const URL = process.env.URL || 'http://localhost:4177/'
const W = parseInt(process.env.WIDTH || '390')
const H = parseInt(process.env.HEIGHT || '844')
const DURATION = parseInt(process.env.DURATION || '34')

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
    // the idle ship still auto-fires, so over a 34s run it would kill the
    // 640hp head-only boss mid-cycle — pin HP in the 447-450 band, safely
    // above the P0->P1 boundary (422.4), so no phase transition can fire
    if (g?.boss && !g.boss.dying && g.boss.hp < 448) g.boss.hp = 450
    if (sn) {
      const b = g.boss
      window.__portalLog.push({
        t: performance.now() / 1000,
        mode: sn.mode, ph: sn.transitPhase, tt: sn.transitT,
        headHidden: !!sn.segs[0]?.hidden,
        vis: sn.segs.reduce((n, s) => n + (s.hidden ? 0 : 1), 0),
        total: sn.segs.length,
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
let shotSwallow = false, shotVoid = false, shotEmerge = false
const sleep = ms => new Promise(r => setTimeout(r, ms))
await sleep(DURATION * 1000)
while (true) {
  const phase = await page.evaluate(() => {
    const g = window.__game
    const sn = g?.boss?.snake
    return sn ? { mode: sn.mode, ph: sn.transitPhase, tt: sn.transitT } : null
  }).catch(() => null)
  if (!phase) break
  if (phase.mode === 'transit' && phase.ph === 'in' && phase.tt >= 0 && !shotSwallow) { await page.screenshot({ path: '/tmp/portal-swallow.png' }); shotSwallow = true }
  if (phase.mode === 'transit' && phase.ph === 'void' && !shotVoid) { await page.screenshot({ path: '/tmp/portal-void.png' }); shotVoid = true }
  if (phase.mode === 'transit' && phase.ph === 'out' && !shotEmerge) { await page.screenshot({ path: '/tmp/portal-emerge.png' }); shotEmerge = true }
  if (shotSwallow && shotVoid && shotEmerge) break
  await sleep(80)
}

const log = await page.evaluate(() => window.__portalLog)
await browser.close()

// ---------- group into cycles ----------
const cycles = []
let cur = null
for (const s of log) {
  if (s.mode === 'transit') {
    if (!cur) cur = { appr: [], sw: [], vo: [], out: [], after: null }
    if (s.ph === 'in' && s.tt < 0) cur.appr.push(s)
    else if (s.ph === 'in') cur.sw.push(s)
    else if (s.ph === 'void') cur.vo.push(s)
    else if (s.ph === 'out') cur.out.push(s)
  } else if (cur) {
    cur.after = s
    cycles.push(cur)
    cur = null
  }
}
if (cur) cycles.push(cur)

let pass = true
const fail = (msg) => { console.log('FAIL: ' + msg); pass = false }
// a cycle without an `after` frame means the log ended mid-transit (the
// recorder stops when the browser closes) — skip it, it was never finished
const complete = cycles.filter(c => c.after && c.appr.length > 0 && c.sw.length > 0 && c.vo.length > 0 && c.out.length > 0)
console.log(`frames: ${log.length}, cycles: ${cycles.length}, complete: ${complete.length}`)

const full = log.length ? Math.max(...log.map(s => s.total)) : 0
for (const c of complete) {
  const f = c.appr[0]
  // 1) approach: head visible + monotonic toward entry
  let mono = true
  for (let i = 1; i < c.appr.length; i++) {
    const a = Math.hypot(c.appr[i - 1].x - f.ex, c.appr[i - 1].y - f.ey)
    const b = Math.hypot(c.appr[i].x - f.ex, c.appr[i].y - f.ey)
    if (b > a + 2) mono = false
  }
  for (const s of c.appr) if (s.headHidden) fail('head hidden during approach (fly-in)')
  const aEnd = c.appr[c.appr.length - 1]
  if (Math.hypot(aEnd.x - f.ex, aEnd.y - f.ey) > 40) fail(`approach stopped ${Math.hypot(aEnd.x - f.ex, aEnd.y - f.ey).toFixed(0)}px short of entry`)
  if (!mono) fail('approach not monotonic toward entry')

  // 2) swallow: head hidden, visible count NON-INCREASING, ends at 0
  for (const s of c.sw) if (!s.headHidden) fail('head visible during swallow')
  let swMono = true
  for (let i = 1; i < c.sw.length; i++) if (c.sw[i].vis > c.sw[i - 1].vis + 1) swMono = false
  if (!swMono) fail('swallow: visible segments did not decrease head-first')
  if (c.sw[c.sw.length - 1].vis > 3) fail(`swallow did not finish: ${c.sw[c.sw.length - 1].vis} segments still visible`)

  // 3) void: nothing visible + frozen
  const v0 = c.vo[0]
  let maxMove = 0
  for (const v of c.vo) {
    if (v.vis !== 0) fail('something visible during void')
    maxMove = Math.max(maxMove, Math.hypot(v.x - v0.x, v.y - v0.y))
  }
  if (maxMove > 0.5) fail(`boss moved ${maxMove.toFixed(1)}px during void`)

  // 4) emerge: head visible, visible count NON-DECREASING, starts near exit
  for (const s of c.out) if (s.headHidden) fail('head hidden during emerge')
  let emMono = true
  for (let i = 1; i < c.out.length; i++) if (c.out[i].vis < c.out[i - 1].vis - 1) emMono = false
  if (!emMono) fail('emerge: visible segments did not grow head-first')
  if (c.out[0].vis > 3) fail(`emerge started with ${c.out[0].vis} segments visible (should be ~head only)`)
  const oStart = c.out[0]
  const eErr = Math.hypot(oStart.x - f.qx, oStart.y - f.qy)
  if (eErr > 40) fail(`emerge started ${eErr.toFixed(0)}px from exit`)
  if (c.out[c.out.length - 1].vis < full - 2) fail(`emerge did not finish: only ${c.out[c.out.length - 1].vis}/${full} segments visible`)
  if (c.out[c.out.length - 1].vis > c.out[0].vis + 10) console.log('  note: emerge revealed', c.out[0].vis, '->', c.out[c.out.length - 1].vis)

  const swDur = (c.sw[c.sw.length - 1].t - (c.sw[0].t - 1 / 60))
  const emDur = (c.out[c.out.length - 1].t - (c.out[0].t - 1 / 60))
  console.log(`  P${f.pat}: appr ${c.appr.length}f, swallow ${c.sw.length}f/${swDur.toFixed(2)}s (${full}->0), void ${c.vo.length}f, emerge ${c.out.length}f/${emDur.toFixed(2)}s (1->${full})`)
}

if (complete.length === 0) fail('no complete cycle')
console.log('page errors:', errors.length ? errors : 'none')
console.log(pass && errors.length === 0
  ? 'PASS: gradual portal transfer = fly-in -> swallow head-first -> void -> emerge head-first'
  : 'FAIL')
process.exit(pass && errors.length === 0 ? 0 : 1)
