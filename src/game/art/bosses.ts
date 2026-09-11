import { at, bolt, BRONZE, circle, core, exhaust, fill, glow, IRON, lamp, line, mirror, OBSIDIAN, plate, ring, SILVER, vent } from './drawing'
import type { Ctx, Motion } from './drawing'

function rockPlate(c: Ctx, d: string, span = 50) {
  plate(c, d, BRONZE, span)
  line(c, d, '#c7b6a1', 0.7)
}

export function drawCrusher(c: Ctx, m: Motion) {
  mirror(c, side => {
    // Shoulder, elbow and claw use independent pivots, all driven by the caller's clock.
    at(c, 42, -2, Math.sin(m.time * 1.6 + side * 0.8) * 0.08 * m.articulation, () => {
      plate(c, 'M-3-12L24-24 44-8 38 18 17 28-6 12Z', IRON)
      circle(c, 18, 9, 11, '#18212b'); ring(c, 18, 9, 8, '#8f928c', 3)
      lamp(c, 'M12 8L18 12 25 9', '#ff752b', 2)
      at(c, 23, 22, -0.08 + Math.sin(m.time * 2 + side) * 0.09 * m.articulation, () => {
        rockPlate(c, 'M-14-20L5-25 26-12 31 10 21 28 6 32-16 13-20-4Z')
        fill(c, 'M-14-17L4-21 11-8-2 11-15 5Z', '#a3998880')
        line(c, 'M9-20L4-7 15 5 8 25', '#2c2a2c', 3)
        lamp(c, 'M7-17L3-8 11 3', '#ff8831', 1.2)
        at(c, 8, 27, Math.sin(m.time * 1.7) * 0.1 * m.articulation, () => {
          plate(c, 'M-5-8L12-3 17 19 8 41-7 54 0 30-7 11Z', IRON)
          rockPlate(c, 'M-4-6L10-1 13 16 6 30 2 18-6 8Z')
          fill(c, 'M9 20L6 36-5 48 2 28Z', '#ff8c32')
          line(c, 'M8 24L0 42', '#ffe1a1', 1)
          plate(c, 'M-8-2L-19 10-15 31-5 41-11 18-1 10Z', IRON)
          lamp(c, 'M-16 15L-12 28', '#ff7327', 1.5)
        })
      })
    })
    at(c, 40, -39, Math.sin(m.time * 1.5 + side) * 0.06 * m.articulation, () => {
      plate(c, 'M-7-4L11-18 28-13 39 14 25 5 8 5 0 19Z', IRON)
      rockPlate(c, 'M0-7L12-15 26-9 29 1 12-2 2 7Z')
      lamp(c, 'M23-4L30 2', '#ff8830', 1)
    })
  })
  plate(c, 'M0-80L29-72 50-47 55-10 42 29 19 49 0 64-19 49-42 29-55-10-50-47-29-72Z', IRON)
  glow(c, 0, -5, 65, '#ff772d', 0.35 * m.energy)
  fill(c, 'M0-68L-10-39 3-19-4 10 8 27 0 51 16 21 6-9 15-32Z', '#ff8136')
  mirror(c, () => {
    rockPlate(c, 'M5-76L24-70 43-49 35-30 11-34 0-45Z')
    fill(c, 'M9-70L25-62 36-48 29-43 16-47Z', '#dad0ba50')
    rockPlate(c, 'M44-43L51-19 42 2 23 10 9-11 15-28 35-25Z')
    fill(c, 'M43-36L47-18 39-6 22-4 17-12 24-23Z', '#b6ab9665')
    rockPlate(c, 'M42 10L34 31 18 46 14 25 21 12Z')
    line(c, 'M18-66L22-55 34-49 M29-17L39-21 43-15 M25 26L29 19', '#383533', 1.4)
    lamp(c, 'M36-30L43-23', '#ff8531', 1.4)
    bolt(c, 17, 35, 2)
  })
  core(c, 0, 22, 17, '#ff941f', m)
  plate(c, 'M-15 46L-5 52 0 71 5 52 15 46 10 69 0 83-10 69Z', IRON)
  lamp(c, 'M0 67V76', '#ff8a22', 2)
  // A few attached stone fragments break up the manufactured silhouette.
  at(c, -33, -80, 0.3, () => rockPlate(c, 'M-8-5L3-9 9-1 6 7-4 9-10 2Z'))
  at(c, 28, -86, -0.4, () => rockPlate(c, 'M-5-4L4-7 8 0 2 6-7 2Z'))
}

function serpentPoint(t: number, time: number, articulation: number): [number, number] {
  // S-curve: a curled neck above, and a tapered tail turning out below.
  return [48 * Math.sin(t * Math.PI * 2 - 0.85) + Math.sin(time * 1.6 - t * 8) * 4 * articulation, -67 + t * 145]
}

const OROCHI_PHASES = [
  { energy: '#b83cea', bright: '#f1a1ff', deep: '#1c102d' },
  { energy: '#d24bf4', bright: '#fac6ff', deep: '#251035' },
  { energy: '#ee63ff', bright: '#ffffff', deep: '#310e3f' },
] as const

/** One local-space mechanical Orochi body link, pointing toward +Y. */
export function drawOrochiSegment(c: Ctx, m: Motion, scale = 1, phase = 0) {
  const palette = OROCHI_PHASES[Math.max(0, Math.min(2, phase))]
  c.save()
  c.scale(scale, scale)
  glow(c, 0, 0, 25, palette.energy, (0.16 + phase * 0.05) * m.energy)
  plate(c, 'M-17-9L-23-1-20 9-12 14 12 14 20 9 23-1 17-9Z', OBSIDIAN, 25)
  mirror(c, () => {
    plate(c, 'M13-1L24 7 34 21 20 16 11 9Z', OBSIDIAN, 30)
    fill(c, 'M22 9L31 19 22 15Z', palette.energy)
    lamp(c, 'M15 6L11 9', palette.bright, 1.25)
    bolt(c, 14, 0, 1.1)
  })
  plate(c, 'M-9-9L9-9 12 3 7 9-7 9-12 3Z', IRON, 16)
  fill(c, 'M-4-7H4L6 2 0 6-6 2Z', palette.energy)
  line(c, 'M-3-6L3-6 4 1', palette.bright, 0.8)
  lamp(c, 'M-12 11H12', palette.energy, 1)
  c.restore()
}

/** Local-space Orochi head, nose pointing toward -Y and neck toward +Y. */
export function drawOrochiHead(c: Ctx, m: Motion, phase = 0) {
  const palette = OROCHI_PHASES[Math.max(0, Math.min(2, phase))]
  glow(c, 0, 8, 45 + phase * 4, palette.energy, (0.22 + phase * 0.08) * m.energy)
  plate(c, 'M-14-20L-24-8-26 12-14 32 0 40 14 32 26 12 24-8 14-20Z', OBSIDIAN, 42)
  mirror(c, () => {
    plate(c, 'M9-11L16-35 24-50 22-20 17 3Z', IRON, 40)
    plate(c, 'M3-13L15-10 21 7 10 17 3 27Z', SILVER, 45)
    fill(c, 'M6 5L16 2 14 11 7 16Z', palette.energy)
    lamp(c, 'M8 9L14 5', palette.bright, 1.35)
    at(c, 11, 25, Math.sin(m.time * 2.5) * 0.07 * m.articulation, () => {
      plate(c, 'M0-6L10-1 6 18-3 27-1 6Z', OBSIDIAN, 28)
      fill(c, 'M-1 8L3 7 1 19Z', palette.bright)
    })
    glow(c, -1, -18, 16 + phase * 3, palette.bright, 0.35 + phase * 0.1)
    circle(c, -1, -18, 5.5, '#090e18')
    circle(c, -1.5, -18.8, 3.2, palette.bright)
    circle(c, -2.3, -19.6, 1.1, '#ffffff')
  })
  fill(c, 'M-8 25L0 21 8 25 5 39 0 45-5 39Z', palette.energy)
  lamp(c, 'M0 27V36', palette.bright, 2)
  line(c, 'M-6-4L0-12 6-4', '#c6c7d5', 0.8)
}

export function drawOrochi(c: Ctx, m: Motion) {
  for (let i = 22; i >= 0; i--) {
    const t = i / 22
    const [x, y] = serpentPoint(t, m.time, m.articulation)
    const [nx, ny] = serpentPoint(t + 0.01, m.time, m.articulation)
    const a = Math.atan2(ny - y, nx - x) - Math.PI / 2
    const size = (1 - t * 0.72)
    at(c, x, y, a, () => {
      c.scale(size, size)
      glow(c, 0, 0, 23, '#c53aff', 0.18 * m.energy)
      plate(c, 'M-16-7L-22 0-20 8-12 12 12 12 20 8 22 0 16-7Z', OBSIDIAN, 24)
      mirror(c, () => {
        plate(c, 'M14 0L24 8 34 23 20 16 12 9Z', OBSIDIAN, 28)
        fill(c, 'M24 11L31 20 23 15Z', '#d147fa')
        lamp(c, 'M16 6L12 9', '#e75bff', 1.4)
        bolt(c, 15, 1, 1.1)
      })
      plate(c, 'M-8-8L8-8 11 3 6 8-6 8-11 3Z', IRON, 15)
      fill(c, 'M-3-6H3L5 2 0 5-5 2Z', '#b73be9')
      line(c, 'M-2-5L2-5 3 1', '#f3c1ff', 0.8)
      lamp(c, 'M-12 10H12', '#b22ad9', 1)
    })
  }
  const [x, y] = serpentPoint(0, m.time, m.articulation)
  at(c, x - 7, y - 2, 0.55 + Math.sin(m.time * 1.6) * 0.06 * m.articulation, () => {
    plate(c, 'M-13-16L-21-7-23 11-13 30 0 37 13 30 23 11 21-7 13-16Z', OBSIDIAN, 35)
    mirror(c, () => {
      plate(c, 'M9-8L15-30 22-44 21-18 16 2Z', IRON, 35)
      plate(c, 'M3-11L14-9 19 5 9 14 3 23Z', SILVER, 40)
      fill(c, 'M5 5L15 2 13 9 6 13Z', '#ec62ff')
      lamp(c, 'M7 8L13 5', '#ffa3ff', 1.2)
      at(c, 10, 21, Math.sin(m.time * 2.5) * 0.05 * m.articulation, () => {
        plate(c, 'M0-5L9-1 5 16-3 23-1 5Z', OBSIDIAN, 25)
        fill(c, 'M-1 6L2 5 0 16Z', '#faadff')
      })
    })
    glow(c, 0, 28, 20, '#d73af7', 0.38 * m.energy)
    fill(c, 'M-7 22L0 18 7 22 4 34 0 40-4 34Z', '#9c27d1')
    lamp(c, 'M0 23V32', '#f6a1ff', 2)
    line(c, 'M-5-4L0-10 5-4', '#b2b5c8', 0.7)
  })
}

function wardenPoint(t: number, time: number, articulation: number): [number, number] {
  // Loose S-coil: a wide curl at the top, an undulating body, and a thin tail unwinding at the bottom.
  return [
    42 * Math.sin(t * Math.PI * 2.3 - 1.05) + Math.sin(time * 1.4 - t * 7) * 4.5 * articulation,
    -70 + t * 148,
  ]
}
function serpentPhase(m: Motion): number {
  // 0 calm / 1 surging / 2 enraged; energy and articulation push the serpent upward through them.
  const w = Math.max(0, m.energy) * Math.max(0, m.articulation)
  const f = Math.sin(m.time * 0.6) * 0.5 + 0.5
  return Math.min(2, Math.floor(w * 3 * (0.55 + 0.45 * f)))
}
export { serpentPhase }
function serpentCurve(t: number, time: number, articulation: number): [number, number] {
  // Long loose coil: wide sweep at the head, an undulating mid body, and a thin tapering tail.
  const amp = 55 + Math.sin(time * 1.2) * 6 * articulation
  return [amp * Math.sin(t * Math.PI * 2.6 - 0.5) + Math.sin(time * 1.7 - t * 9) * 5 * articulation, -80 + t * 160]
}
export function drawSerpent(c: Ctx, m: Motion) {
  const phase = serpentPhase(m)
  const palettes: Array<[string, string, string, number]> = [
    ['#39d98a', '#9dffcb', '#0e3323', 0.35],
    ['#2f9fe6', '#9fdcff', '#122a4a', 0.62],
    ['#e24b4b', '#ffb199', '#3a0f0f', 1],
  ]
  const [hue, bright, deep, strength] = palettes[phase]
  // Faint undulating trail behind the body, strongest when enraged.
  for (let i = 14; i >= 1; i--) {
    const t = i / 14
    const [x, y] = serpentCurve(t, m.time - i * 0.04, m.articulation)
    const alpha = (1 - i / 15) * 0.12 * strength
    c.save(); c.globalAlpha *= alpha
    circle(c, x, y, 16 * (1 - t * 0.6), hue)
    c.restore()
  }
  // Body: overlapping tapered segments from head to tail.
  const N = 26
  for (let i = N - 1; i >= 0; i--) {
    const t = i / N
    const [x, y] = serpentCurve(t, m.time, m.articulation)
    const [nx, ny] = serpentCurve(t + 0.012, m.time, m.articulation)
    const a = Math.atan2(ny - y, nx - x) - Math.PI / 2
    const size = 1.15 - t * 0.82
    at(c, x, y, a, () => {
      c.scale(size, size)
      glow(c, 0, 0, 21, hue, (0.1 + phase * 0.12) * strength)
      plate(c, 'M-15-8L-21 0-18 9-11 13 11 13 18 9 21 0 15-8Z', OBSIDIAN, 23)
      mirror(c, () => {
        plate(c, 'M13 0L22 8 29 21 18 15 11 8Z', OBSIDIAN, 27)
        fill(c, 'M20 9L26 18 20 14Z', hue)
        lamp(c, 'M14 6L11 9', bright, 1.1)
        bolt(c, 13, 0, 1)
      })
      plate(c, 'M-8-8L8-8 11 3 6 9-6 9-11 3Z', IRON, 15)
      fill(c, 'M-4-6H4L5 2 0 5-5 2Z', hue)
      line(c, 'M-3-5L3-5 4 1', bright, 0.7)
      lamp(c, 'M-11 10H11', hue, 0.9)
      if (phase > 1) {
        fill(c, 'M-17-11L17-11 21-6-21-6Z', bright)
        line(c, 'M-15-9H15', '#ffffff', 0.7)
        glow(c, 0, -2, 24, bright, 0.35 * strength)
      }
    })
  }
  // Head: armored skull with two glowing eyes and a lower jaw.
  const [hx, hy] = serpentCurve(0, m.time, m.articulation)
  at(c, hx, hy, -0.1 + Math.sin(m.time * 1.5) * 0.07 * m.articulation, () => {
    plate(c, 'M-14-17L-23-6-25 13-13 32 0 39 13 32 25 13 23-6 14-17Z', OBSIDIAN, 36)
    mirror(c, () => {
      plate(c, 'M9-10L15-32 22-46 21-18 16 3Z', IRON, 35)
      plate(c, 'M3-12L14-9 19 7 9 16 3 25Z', SILVER, 42)
      fill(c, 'M5 6L15 3 13 10 6 15Z', hue)
      at(c, 10, 24, Math.sin(m.time * 2.4) * 0.06 * m.articulation, () => {
        plate(c, 'M0-6L10-1 6 18-3 26-1 6Z', OBSIDIAN, 25)
        fill(c, 'M-1 8L3 7 1 18Z', bright)
      })
      // Glowing eye, brighter and flared as the phase rises.
      glow(c, -1, -18, 15 + phase * 5, bright, 0.4 + phase * 0.25)
      circle(c, -1, -18, 5.2, '#0b101c')
      ring(c, -1, -18, 5.2, deep, 1.2)
      circle(c, -1.6, -19, 3.1, bright)
      c.fillStyle = '#ffffff'
      c.fillRect(-2.2, -19.8, 1.3, 1.3)
      if (phase > 0) line(c, 'M-5-24L0-21 M5-24L0-21', bright, 0.9)
    })
    glow(c, 0, 30, 22, hue, 0.3 * strength + 0.1)
    fill(c, 'M-8 24L0 20 8 24 5 37 0 43-5 37Z', hue)
    lamp(c, 'M0 25V34', bright, 2)
    if (phase > 1) {
      at(c, 0, 32, m.time * 3.5, () => {
        ring(c, 0, 0, 13, hue, 1.6)
        line(c, 'M0-9V9 M-9 0H9', bright, 0.9)
      })
      glow(c, 0, 32, 18, bright, 0.5)
    }
    line(c, 'M-6-4L0-11 6-4', '#b2b5c8', 0.7)
  })
}

function wardenPhase(m: Motion): number {
  const w = Math.max(0, m.energy) * Math.max(0, m.articulation)
  const f = Math.sin(m.time * 0.75) * 0.5 + 0.5
  return Math.min(2, Math.floor(w * 3 * (0.55 + 0.45 * f)))
}
export function drawSerpentWarden(c: Ctx, m: Motion) {
  // Phase 0 calm / 1 surging / 2 rift-open; energy and articulation push the warden upward through them.
  const phase = wardenPhase(m)
  const palettes: Array<[string, string, string, number]> = [
    ['#2fae8f', '#63f0c2', '#113c30', 0.3],
    ['#2f8fe6', '#74c9ff', '#122a4a', 0.62],
    ['#c249f0', '#f09bff', '#2c0f3e', 1],
  ]
  const [hue, bright, deep, strength] = palettes[phase]
  // Portal rings: a dark rim, a hue-tinted ring, and a brighter ring whose spin speed marks the phase order.
  at(c, 0, -10, m.time * (0.09 + phase * 0.14), () => {
    ring(c, 0, 0, 70, deep, 5)
    ring(c, 0, 0, 65, hue, 1.6)
    ring(c, 0, 0, 59, bright, 0.9)
  })
  for (let i = 0; i < 6; i++) {
    at(c, 0, -10, m.time * (0.22 + phase * 0.16) + i * Math.PI / 3, () => {
      line(c, 'M0-62L0-70', bright, 1.4)
      circle(c, 0, -66, 1.3, hue)
    })
  }
  at(c, 0, -10, -m.time * 0.2, () => {
    for (let i = 0; i < 6; i++) {
      at(c, 0, 0, i * Math.PI / 3, () => line(c, 'M0 52L0 60', bright, 1.1))
    }
  })
  // Serpent body: overlapping tapered plates from head to tail.
  for (let i = 20; i >= 0; i--) {
    const t = i / 20
    const [x, y] = wardenPoint(t, m.time, m.articulation)
    const [nx, ny] = wardenPoint(t + 0.01, m.time, m.articulation)
    const a = Math.atan2(ny - y, nx - x) - Math.PI / 2
    const size = 1 - t * 0.7
    at(c, x, y, a, () => {
      c.scale(size, size)
      glow(c, 0, 0, 20, hue, 0.14 * strength)
      plate(c, 'M-14-8L-20 0-17 9-10 12 10 12 17 9 20 0 14-8Z', OBSIDIAN, 22)
      mirror(c, () => {
        plate(c, 'M12 0L21 7 28 21 17 15 10 8Z', OBSIDIAN, 26)
        fill(c, 'M19 8L25 17 19 13Z', hue)
        lamp(c, 'M13 5L10 8', bright, 1.1)
        bolt(c, 12, 0, 1)
      })
      plate(c, 'M-7-7L7-7 10 3 5 8-5 8-10 3Z', IRON, 14)
      fill(c, 'M-3-5H3L4 2 0 4-4 2Z', hue)
      line(c, 'M-2-4L2-4 3 1', bright, 0.7)
      lamp(c, 'M-10 9H10', hue, 0.9)
      if (phase > 0) {
        glow(c, 0, -1, 26, bright, 0.3 * strength)
      }
      if (phase > 1) {
        fill(c, 'M-16-11L16-11 20-6-20-6Z', bright)
        line(c, 'M-14-9H14', '#ffffff', 0.7)
      }
    })
  }
  // Head above the portal ring: horned obsidian skull, glowing jaw.
  const [hx, hy] = wardenPoint(0, m.time, m.articulation)
  at(c, hx, hy, -0.12 + Math.sin(m.time * 1.5) * 0.06 * m.articulation, () => {
    plate(c, 'M-13-16L-21-6-23 12-12 31 0 38 12 31 23 12 21-6 13-16Z', OBSIDIAN, 34)
    mirror(c, () => {
      plate(c, 'M9-9L15-31 22-45 21-18 16 2Z', IRON, 34)
      plate(c, 'M3-11L14-9 19 6 9 15 3 24Z', SILVER, 40)
      fill(c, 'M5 6L15 3 13 10 6 14Z', hue)
      lamp(c, 'M7 9L13 6', bright, 1.2)
      at(c, 10, 22, Math.sin(m.time * 2.4) * 0.05 * m.articulation, () => {
        plate(c, 'M0-5L9-1 5 17-3 24-1 5Z', OBSIDIAN, 24)
        fill(c, 'M-1 7L2 6 0 17Z', bright)
      })
    })
    glow(c, 0, 28, 20, hue, 0.35 * strength)
    fill(c, 'M-7 23L0 19 7 23 4 35 0 41-4 35Z', hue)
    lamp(c, 'M0 24V33', bright, 2)
    line(c, 'M-5-3L0-9 5-3', '#b2b5c8', 0.7)
    if (phase > 1) {
      at(c, 0, 30, m.time * 3.5, () => {
        ring(c, 0, 0, 13, hue, 1.6)
        line(c, 'M0-9V9 M-9 0H9', bright, 0.9)
      })
      glow(c, 0, 30, 16, bright, 0.5)
    }
  })
}

function turret(c: Ctx, x: number, y: number, color: string, m: Motion, scale = 1) {
  at(c, x, y, Math.sin(m.time * 1.1 + x * 0.1) * 0.07 * m.articulation, () => {
    c.scale(scale, scale)
    plate(c, 'M-6-10L6-10 8 8 5 14-5 14-8 8Z', IRON, 20)
    plate(c, 'M-3 1H3V29H-3Z', SILVER, 20)
    fill(c, 'M-2 8H2V23H-2Z', '#1a2738')
    lamp(c, 'M0 24V31', color, 1.5)
    bolt(c, 0, -5, 1.2)
  })
}

export function drawNemesis(c: Ctx, m: Motion) {
  mirror(c, () => {
    at(c, 46, -54, Math.PI, () => exhaust(c, 0, 0, 6, 30, '#ff333e', m))
    plate(c, 'M14-39L41-56 59-48 66-20 95 0 102 37 71 25 61 41 21 30Z', IRON)
    plate(c, 'M25-34L43-47 55-40 59-9 86 5 94 26 63 16 48 26 27 18Z', SILVER)
    fill(c, 'M45-40L50-34 53-7 82 9 87 20 60 10 46 18 38 12Z', '#405064')
    plate(c, 'M54 27L67 20 76 34 77 68 65 80 55 59Z', IRON)
    plate(c, 'M18-72L28-87 38-70 39-11 32 7 19-3Z', IRON)
    plate(c, 'M22-63L27-73 32-61 32-24 23-19Z', SILVER)
    lamp(c, 'M27-67V-81', '#ff414b', 1.4)
    vent(c, 24, -39, 7, 5)
    lamp(c, 'M64 1L83 10', '#ff3b42', 2)
    line(c, 'M34-16L42-21 46-9 M56 4L60 12 M80 19L88 23', '#1b2a3c', 1)
    bolt(c, 45, -33, 1.7); bolt(c, 57, 9, 1.6); bolt(c, 87, 20, 1.4)
    turret(c, 65, 48, '#ff454b', m, 1.1)
    turret(c, 91, 11, '#ff454b', m, 0.8)
    turret(c, 36, 44, '#ff454b', m, 1.4)
  })
  plate(c, 'M0-99L16-66 23-13 23 29 11 77 0 98-11 77-23 29-23-13-16-66Z', IRON)
  mirror(c, () => {
    plate(c, 'M3-87L12-59 16-15 8-4 3-14Z', SILVER)
    plate(c, 'M15 40L16 56 7 78 4 42Z', SILVER)
    line(c, 'M8-61L10-44 7-40 M7 53L7 63', '#223145', 0.8)
    lamp(c, 'M10-24L12-12', '#ff414c', 1)
  })
  lamp(c, 'M0-83V-28', '#ff3c4c', 2.3)
  core(c, 0, 14, 21, '#ff3848', m)
  lamp(c, 'M0 47V76', '#ff3848', 2)
  bolt(c, 0, -12, 1.4)
}

export function drawManta(c: Ctx, m: Motion) {
  mirror(c, side => {
    at(c, 14, 0, Math.sin(m.time * 1.5) * 0.035 * m.articulation, () => {
      plate(c, 'M-7-32C21-45 47-72 78-66L92-57 94-38 75-42 59-22 72 15 56 35 39 7 17 23-5 39Z', OBSIDIAN)
      plate(c, 'M0-27C30-38 49-64 76-61L87-53 74-51 52-26 50-8 62 13 53 20 32-2 14 13 0 23Z', IRON)
      fill(c, 'M14-28L47-47 37-25 47-1 37-8 28-17Z', '#708a9650')
      fill(c, 'M51-40L72-56 82-53 66-45 51-24Z', '#a3bcc64a')
      lamp(c, 'M8-14L28-27 40-18 50 4', '#39ecdd', 1.8)
      lamp(c, 'M53-36L70-49 80-48', '#5cf8e0', 1.3)
      lamp(c, 'M31-5L43 10 52 21', '#29cdbf', 1.2)
      bolt(c, 48, -22, 1.7); bolt(c, 65, -49, 1.3); bolt(c, 18, -7)
      at(c, 43, -44, Math.PI, () => exhaust(c, 0, 0, 3, 16, '#38ead7', m))
      turret(c, 55, 5, '#46eed8', { ...m, time: m.time + side }, 0.65)
    })
  })
  // Flexible tail is made of overlapping articulated armor links.
  for (let i = 7; i >= 0; i--) {
    const y = -43 - i * 7
    at(c, Math.sin(m.time * 2 - i * 0.4) * i * 0.45 * m.articulation, y, Math.sin(m.time * 2 - i * 0.4) * 0.06 * m.articulation, () => {
      const width = 5 - i * 0.42
      c.scale(width / 5, 1)
      plate(c, 'M-5 5L-4-5 0-10 4-5 5 5Z', OBSIDIAN, 20)
      lamp(c, 'M0-5V0', '#47e7d2', 0.8)
    })
  }
  plate(c, 'M0-49L15-32 23-7 19 18 7 48 0 60-7 48-19 18-23-7-15-32Z', OBSIDIAN)
  mirror(c, () => {
    plate(c, 'M3-36L12-22 15-4 10 7 4-4Z', IRON, 45)
    plate(c, 'M12 12L16 20 7 39 3 44 5 24Z', IRON, 35)
    lamp(c, 'M6 26L9 16', '#57f2df', 1.4)
    fill(c, 'M4 40L8 34 5 47 1 54Z', '#62f8e2')
  })
  core(c, 0, -3, 12, '#35e9cd', m)
  lamp(c, 'M0 18V32', '#8fffee', 1.5)
}

export function drawCitadel(c: Ctx, m: Motion) {
  at(c, 0, 0, m.time * 0.075 * m.articulation, () => {
    ring(c, 0, 0, 64, '#0c1522', 28)
    ring(c, 0, 0, 70, '#8296a8', 1.2)
    ring(c, 0, 0, 52, '#42556a', 3)
    for (let i = 0; i < 8; i++) {
      at(c, 0, 0, i * Math.PI / 4, () => {
        // Radial bridge with a lit energy conduit and a raised armor segment.
        plate(c, 'M-5-18H5L8-62H-8Z', IRON, 70)
        lamp(c, 'M0-25V-46', '#ff9830', 1.7)
        plate(c, 'M-23-51L-28-65-20-81 0-87 20-81 28-65 23-51 10-55-10-55Z', IRON)
        plate(c, 'M-18-59L-21-68-15-77 0-81 15-77 21-68 18-59 7-62-7-62Z', SILVER)
        fill(c, 'M0-79L14-75 17-69 13-64 0-67Z', '#455b70')
        lamp(c, 'M-13-58L-6-60 6-60 13-58', '#ffaa41', 1.5)
        bolt(c, -16, -68); bolt(c, 16, -68)
        at(c, 0, -82, Math.PI, () => turret(c, 0, 0, '#ffc268', m, 0.76))
      })
    }
    ring(c, 0, 0, 29, '#101a27', 8)
    ring(c, 0, 0, 31, '#c8a87b', 1.5)
    core(c, 0, 0, 21, '#ff9f2b', m)
  })
  // Inner reactor reticle counter-rotates independently of the outer fortress.
  at(c, 0, 0, -m.time * 0.22 * m.articulation, () => {
    for (let i = 0; i < 4; i++) {
      at(c, 0, 0, i * Math.PI / 2, () => {
        c.beginPath(); c.arc(0, 0, 36, 0.1, 0.65)
        c.strokeStyle = '#ffd282'; c.lineWidth = 1.2; c.stroke()
        circle(c, 36, 0, 1.4, '#fff1be')
      })
    }
  })
}
