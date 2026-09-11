import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

// Run against this project's Vite dev server. --export also refreshes the review PNGs.
const baseURL = process.env.URL || 'http://localhost:4176/'
const exportImages = process.argv.includes('--export')
const output = fileURLToPath(new URL('../public/art/designs/', import.meta.url))
const previews = fileURLToPath(new URL('../public/art/previews/', import.meta.url))
const browser = await chromium.launch()
const errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(new URL('?designs', baseURL).href, { waitUntil: 'networkidle' })
  await page.locator('[data-design-id]').last().waitFor({ state: 'attached' })
  const catalogCount = await page.evaluate(async () => (await import('/src/game/art/index.ts')).DESIGN_CATALOG.length)
  assert.equal(await page.locator('[data-design-id]').count(), catalogCount)

  const results = await page.evaluate(async () => {
    const { DESIGN_CATALOG, drawDesign } = await import('/src/game/art/index.ts')
    function require(condition, message) { if (!condition) throw new Error(message) }
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 320
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    function pixels(id, time, extra = {}) {
      ctx.clearRect(0, 0, 320, 320)
      drawDesign(ctx, { id, x: 160, y: 160, size: 280, time, ...extra })
      return ctx.getImageData(0, 0, 320, 320).data
    }
    const alphaMasks = []
    const stats = []
    for (const design of DESIGN_CATALOG) {
      const first = pixels(design.id, 0)
      const repeat = pixels(design.id, 0)
      require(first.every((n, i) => n === repeat[i]), `${design.id}: nondeterministic frame`)
      const changed = pixels(design.id, 0.85)
      require(first.some((n, i) => n !== changed[i]), `${design.id}: animation did not change`)
      let minMargin = 320
      for (const time of [0, 0.85, 2, 4, 8, 16, 30]) {
        const data = pixels(design.id, time)
        let count = 0
        for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) {
          if (data[(y * 320 + x) * 4 + 3] > 0) {
            count++
            minMargin = Math.min(minMargin, x, y, 319 - x, 319 - y)
          }
        }
        require(count > 500, `${design.id}: blank or too small`)
      }
      // The laser mob's beam is an intentional full-screen ray that extends
      // beyond the caller's bounds, so it may reach the test canvas edge.
      if (design.id !== 'mob-laser') require(minMargin >= 14, `${design.id}: moving parts touch bounds (${minMargin}px)`)
      if (design.category === 'players') alphaMasks.push(first.filter((_, i) => i % 4 === 3))
      // Check the contract under non-default caller state, as used inside the game renderer.
      ctx.save()
      ctx.translate(3, 4); ctx.rotate(0.2); ctx.globalAlpha = 0.7
      ctx.fillStyle = '#123456'; ctx.strokeStyle = '#654321'; ctx.lineWidth = 7
      ctx.setLineDash([3, 4]); ctx.shadowBlur = 5; ctx.globalCompositeOperation = 'source-atop'
      const before = [ctx.getTransform().toString(), ctx.globalAlpha, ctx.fillStyle, ctx.strokeStyle, ctx.lineWidth, ctx.getLineDash().join(), ctx.shadowBlur, ctx.globalCompositeOperation].join('|')
      drawDesign(ctx, { id: design.id, x: 0, y: 0, size: 100, time: 1 })
      const after = [ctx.getTransform().toString(), ctx.globalAlpha, ctx.fillStyle, ctx.strokeStyle, ctx.lineWidth, ctx.getLineDash().join(), ctx.shadowBlur, ctx.globalCompositeOperation].join('|')
      require(before === after, `${design.id}: leaked canvas state`)
      ctx.restore()
      stats.push({ id: design.id, minMargin })
    }
    require(alphaMasks.slice(1).every(mask => mask.every((n, i) => n === alphaMasks[0][i])), 'Player colors differ in geometry or alpha')
    const pixelsWithThrust = pixels('player-blue', 0, { thrust: 1 })
    require(pixels('player-blue', 0, { thrust: 0 }).some((n, i) => n !== pixelsWithThrust[i]), 'Thrust control has no effect')
    function noOpInput(size) {
      ctx.clearRect(0, 0, 320, 320)
      drawDesign(ctx, { id: 'player-blue', x: 160, y: 160, size })
      require(ctx.getImageData(0, 0, 320, 320).data.every(n => n === 0), `Invalid size ${size} drew pixels`)
    }
    for (const size of [0, -1, NaN, Infinity]) noOpInput(size)
    return stats

  })
  console.log('Renderer:', results)

  const scout = page.locator('canvas[data-art-id="mob-scout-drone"]')
  const frame = () => scout.evaluate(canvas => canvas.toDataURL())
  const still = await frame()
  await page.waitForTimeout(120)
  assert.equal(await frame(), still, 'Reduced-motion preview should stay still')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByRole('button', { name: 'Pausa animationer' }).waitFor()
  await page.waitForTimeout(150)
  assert.notEqual(await frame(), still, 'Live preference change should start animation')
  await page.getByRole('button', { name: 'Pausa animationer' }).click()
  const paused = await frame()
  await page.waitForTimeout(120)
  assert.equal(await frame(), paused, 'Pause should freeze the preview')
  await page.getByRole('button', { name: 'Ljus bakgrund' }).click()
  assert.equal(await page.locator('.design-gallery--light-preview').count(), 1)
  await page.getByRole('button', { name: 'Ljus bakgrund' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Ladda ner Scout Drone som transparent PNG' }).click()
  const download = await downloadPromise
  assert.equal(download.suggestedFilename(), 'space-force-mob-scout-drone.png')
  assert.equal(await download.failure(), null)

  if (exportImages) {
    await mkdir(output, { recursive: true }); await mkdir(previews, { recursive: true })
    const exports = await page.evaluate(async () => {
      const { DESIGN_CATALOG, drawDesign } = await import('/src/game/art/index.ts')
      const assets = DESIGN_CATALOG.map(design => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024
        drawDesign(canvas.getContext('2d'), { id: design.id, x: 512, y: 512, size: 960, time: 0, thrust: 0.8 })
        return { name: design.id, data: canvas.toDataURL().split(',')[1] }
      })
      const groups = [
        ['mobs', 'MOBBAR', '03 / ENEMY DESIGNS', 3],
        ['bosses', 'BOSSAR', '05 / BOSS DESIGNS', 3],
        ['asteroids', 'ASTEROIDER', '02 / ROCK DESIGNS', 2],
        ['players', 'SPELARSKEPP', '04 / COLOR VARIANTS', 4],
      ]
      const sheets = groups.map(([category, title, subtitle, cols]) => {
        const designs = DESIGN_CATALOG.filter(d => d.category === category)
        const cellW = category === 'players' ? 370 : 460
        const cellH = category === 'bosses' ? 470 : 450
        const width = cols * cellW + 96, height = Math.ceil(designs.length / cols) * cellH + 208
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#07111d'; ctx.fillRect(0, 0, width, height)
        ctx.fillStyle = '#91def3'; ctx.font = '700 17px Arial'; ctx.fillText('SPACE FORCE  /  DESIGN COLLECTION 01', 48, 45)
        ctx.fillStyle = '#f1f6fc'; ctx.font = '700 44px Arial'; ctx.fillText(title, 48, 103)
        ctx.fillStyle = '#96a9be'; ctx.font = '13px monospace'; ctx.textAlign = 'right'; ctx.fillText(subtitle, width - 48, 100); ctx.textAlign = 'left'
        ctx.strokeStyle = '#30465d'; ctx.beginPath(); ctx.moveTo(48, 130); ctx.lineTo(width - 48, 130); ctx.stroke()
        designs.forEach((design, i) => {
          const col = i % cols, row = Math.floor(i / cols)
          const remaining = designs.length - row * cols
          const offset = remaining < cols ? (cols - remaining) * cellW / 2 : 0
          const x = 48 + col * cellW + offset, y = 155 + row * cellH
          const g = ctx.createRadialGradient(x + cellW / 2, y + 180, 0, x + cellW / 2, y + 180, cellW * 0.5)
          g.addColorStop(0, '#182d40'); g.addColorStop(1, '#07111d'); ctx.fillStyle = g; ctx.fillRect(x, y, cellW, cellH)
          drawDesign(ctx, { id: design.id, x: x + cellW / 2, y: y + (cellH - 70) / 2, size: Math.min(cellW, cellH - 40), time: 0, thrust: 0.8 })
          ctx.fillStyle = design.accent; ctx.fillRect(x + 24, y + cellH - 61, 4, 20)
          ctx.fillStyle = '#edf4fc'; ctx.font = '700 23px Arial'; ctx.fillText(design.name.toUpperCase(), x + 38, y + cellH - 43)
          ctx.fillStyle = '#8fa6bc'; ctx.font = '12px monospace'; ctx.fillText(design.id, x + 38, y + cellH - 20)
        })
        ctx.fillStyle = '#6e8ba5'; ctx.font = '12px monospace'; ctx.fillText('CODE-DRAWN / CANVAS 2D / ANIMATABLE PARTS', 48, height - 22)
        return { name: category, data: canvas.toDataURL().split(',')[1] }
      })
      return { assets, sheets }
    })
    for (const asset of exports.assets) await writeFile(`${output}${asset.name}.png`, Buffer.from(asset.data, 'base64'))
    for (const sheet of exports.sheets) await writeFile(`${previews}${sheet.name}.png`, Buffer.from(sheet.data, 'base64'))
    await page.screenshot({ path: `${previews}gallery-desktop.png` })
    console.log(`Exported ${exports.assets.length} transparent PNGs and ${exports.sheets.length} category sheets.`)
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.design-gallery').evaluate(el => { el.scrollTop = 0 })
  await page.waitForTimeout(120)
  assert.equal(await page.locator('.design-gallery').evaluate(el => el.scrollWidth > el.clientWidth), false, 'Mobile gallery overflows horizontally')
  for (const category of ['mobs', 'bosses', 'asteroids', 'players']) {
    await page.locator(`[data-category="${category}"]`).scrollIntoViewIfNeeded()
    const cards = await page.locator(`[data-category="${category}"] canvas`).evaluateAll(canvases => canvases.every(c => c.width > 0 && c.height > 0))
    assert.ok(cards, `${category}: canvas missing after mobile resize`)
  }
  if (exportImages) {
    await page.locator('.design-gallery').evaluate(el => { el.scrollTop = 0 })
    await page.screenshot({ path: `${previews}gallery-mobile.png` })
  }
  await page.goto(baseURL, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Start Mission' }).click()
  await page.getByRole('button', { name: /Nebula Rift/ }).click()
  await page.getByRole('button', { name: /Full Nebula Course/ }).click()
  await page.locator('canvas.game-canvas').waitFor()
  assert.equal(await page.locator('.design-gallery').count(), 0)
  assert.deepEqual(errors, [], 'Browser runtime errors')
  console.log('PASS: renderer determinism, animation, bounds, transparency, identical player geometry, canvas state, invalid inputs, gallery controls, PNG download, mobile layout, game launch.')
} finally {
  await browser.close()
}
