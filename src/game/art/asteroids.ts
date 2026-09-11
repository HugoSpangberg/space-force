import { at, circle, glow, line, linear, path, ring } from './drawing'
import type { Ctx, Motion } from './drawing'

export type RockKind = 'cratered' | 'fractured'
interface RockSurface {
  outline: string
  vertices: [number, number][]
  pits: { x: number; y: number; r: number; squash: number }[]
  chips: { x: number; y: number; r: number; a: number }[]
}
function seeded(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
}
function makeRock(seed: number, kind: RockKind): RockSurface {
  const rng = seeded(seed)
  const vertices: [number, number][] = Array.from({ length: 17 }, (_, i) => {
    const a = i / 17 * Math.PI * 2
    const r = 68 + rng() * 19
    return [Math.cos(a) * r * (kind === 'fractured' ? 0.74 : 1), Math.sin(a) * r * (kind === 'fractured' ? 1.1 : 1)]
  })
  return {
    vertices,
    outline: vertices.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ') + 'Z',
    pits: Array.from({ length: kind === 'cratered' ? 22 : 12 }, () => ({ x: (rng() - 0.5) * 120, y: (rng() - 0.5) * 140, r: 3 + rng() * 14, squash: 0.6 + rng() * 0.3 })),
    chips: Array.from({ length: 230 }, () => ({ x: (rng() - 0.5) * 175, y: (rng() - 0.5) * 190, r: 0.3 + rng() * 2, a: rng() * Math.PI * 2 })),
  }
}
const rocks = { cratered: makeRock(824, 'cratered'), fractured: makeRock(1718, 'fractured') }

export function drawAsteroid(c: Ctx, kind: RockKind, m: Motion) {
  const rock = rocks[kind]
  const warm = kind === 'fractured'
  at(c, 0, 0, (warm ? -0.48 : 0.1) + m.time * 0.1 * m.articulation, () => {
    const outline = path(rock.outline)
    c.fillStyle = linear(c, -70, -80, 65, 80, warm ? ['#b9a998', '#76695f', '#272931'] : ['#bac3ca', '#727e8b', '#272e3a'])
    c.fill(outline); c.lineWidth = 1; c.strokeStyle = warm ? '#c1b1a1' : '#c1cdd4'; c.stroke(outline)
    c.save(); c.clip(outline)
    // Facets share the silhouette vertices; no texture files or per-frame randomness.
    rock.vertices.forEach(([x, y], i) => {
      const next = rock.vertices[(i + 1) % rock.vertices.length]
      c.beginPath(); c.moveTo(x, y); c.lineTo(next[0], next[1]); c.lineTo(-12 + Math.cos(i * 2.3) * 20, -9 + Math.sin(i * 2.3) * 22); c.closePath()
      c.fillStyle = i % 3 === 0 ? '#ebf0ed22' : i % 3 === 1 ? '#13192750' : '#ffffff08'; c.fill()
      c.lineWidth = 0.6; c.strokeStyle = '#e5e7e619'; c.stroke()
    })
    for (const p of rock.pits) {
      at(c, p.x, p.y, -0.3, () => {
        c.scale(1, p.squash)
        circle(c, 0, 0, p.r + 2.4, linear(c, 0, -p.r, 0, p.r, warm ? ['#504840', '#b3a08c'] : ['#485362', '#acb7bf']))
        circle(c, 0, -0.8, p.r, linear(c, 0, -p.r, 0, p.r, ['#111822', warm ? '#847564' : '#697681']))
        const inner = c.createRadialGradient(p.r * 0.1, -p.r * 0.25, 0, 0, 0, p.r)
        inner.addColorStop(0, '#101724d0'); inner.addColorStop(1, '#10172400'); circle(c, 0, -1, p.r, inner)
        line(c, 'M-2 3L0 2 3 4', '#c5c8c342', 0.6)
      })
    }
    for (const [i, chip] of rock.chips.entries()) {
      at(c, chip.x, chip.y, chip.a, () => {
        c.fillStyle = i % 3 === 0 ? '#edf2ee50' : '#11192455'
        c.fillRect(0, 0, chip.r, chip.r * 0.55)
      })
    }
    if (warm) {
      line(c, 'M-34-87L-12-54-23-24-3-8-13 22 9 46 5 93 M-23-24L-62-17 M-3-8L27-26 52-15 M9 46L48 36', '#25232a', 4)
      line(c, 'M-31-86L-9-54-20-24 0-8-10 22 12 46 8 93 M0-8L28-24 53-13', '#ccb19a', 1)
      line(c, 'M32-66L20-45 39-31 M-50 30L-27 45-31 74', '#39343b', 2)
    } else {
      line(c, 'M-67-19L-50-30-31-26-23-47 M43 24L29 40 38 58 M-33 68L-23 55-27 35', '#293440', 1.5)
      line(c, 'M-65-18L-49-28-31-24 M44 25L31 40', '#c8d0d25a', 0.7)
    }
    c.restore()
  })
}

const nebulaSeeds = [
  { x: -58, y: -42, r: 34, a: 0.22, d: -2.1 },
  { x: 42, y: -55, r: 40, a: 0.18, d: 0.7 },
  { x: 55, y: 35, r: 44, a: 0.24, d: 2.4 },
  { x: -45, y: 58, r: 36, a: 0.2, d: 3.9 },
  { x: 0, y: 2, r: 62, a: 0.28, d: 1.3 },
  { x: -15, y: -80, r: 30, a: 0.16, d: -0.4 },
]
function nebulaRock(seed: number): string {
  const rng = seeded(seed)
  const vertices = Array.from({ length: 19 }, (_, i) => {
    const a = i / 19 * Math.PI * 2
    const r = 74 + rng() * 22
    return [Math.cos(a) * r, Math.sin(a) * r * 0.92]
  })
  return vertices.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ') + 'Z'
}
export function drawNebulaAsteroid(c: Ctx, m: Motion) {
  at(c, 0, 0, 0.18 + m.time * 0.12 * m.articulation, () => {
    // Drifting nebula haze behind the obstacle: violet clumps with additive soft glow.
    c.save(); c.globalCompositeOperation = 'lighter'
    for (const s of nebulaSeeds) {
      glow(c, s.x + Math.sin(m.time * 0.4 + s.d) * 6 * m.articulation, s.y + Math.cos(m.time * 0.35 + s.d) * 6 * m.articulation, s.r, '#a855f7', s.a * (0.5 + 0.5 * m.energy))
    }
    c.restore()
    // Violet-lit asteroid-field obstacle: chunky silhouette with craters and debris chips.
    const outline = path(nebulaRock(2471))
    c.fillStyle = linear(c, -80, -85, 80, 85, ['#b490e8', '#5d4a86', '#1d1830'])
    c.fill(outline); c.lineWidth = 1; c.strokeStyle = '#c9a9f2'; c.stroke(outline)
    c.save(); c.clip(outline)
    for (let i = 0; i < 8; i++) {
      at(c, (i - 3.5) * 22, -20 + Math.sin(i * 1.9) * 34, 0.2, () => {
        c.beginPath(); c.ellipse(0, 0, 26, 15, 0, 0, Math.PI * 2)
        c.fillStyle = i % 2 ? '#7c5cc42e' : '#4c3a7526'; c.fill()
      })
    }
    const craters = [
      { x: -34, y: -28, r: 11 }, { x: 18, y: -44, r: 8 }, { x: 40, y: 12, r: 12 },
      { x: -8, y: 18, r: 9 }, { x: -48, y: 34, r: 7 }, { x: 24, y: 52, r: 10 },
    ]
    for (const p of craters) {
      at(c, p.x, p.y, -0.3, () => {
        circle(c, 0, 0, p.r + 2.4, linear(c, 0, -p.r, 0, p.r, ['#4a3a6e', '#8f74c4']))
        circle(c, 0, -0.8, p.r, linear(c, 0, -p.r, 0, p.r, ['#131022', '#5c4a82']))
        const inner = c.createRadialGradient(p.r * 0.1, -p.r * 0.25, 0, 0, 0, p.r)
        inner.addColorStop(0, '#0d0a1ad0'); inner.addColorStop(1, '#0d0a1a00'); circle(c, 0, -1, p.r, inner)
        line(c, 'M-2 3L0 2 3 4', '#cbb4f042', 0.6)
      })
    }
    for (let i = 0; i < 120; i++) {
      const a = i * 2.4; const r = 14 + (i * 5.3) % 66
      at(c, Math.cos(a) * r, Math.sin(a) * r * 0.9, a, () => {
        c.fillStyle = i % 3 === 0 ? '#e6d5ff50' : '#17122a55'
        c.fillRect(0, 0, 0.5 + (i % 3), 0.4)
      })
    }
    line(c, 'M-40-64L-16-34-30-8-6 10-18 44 12 70 M-30-8L-58 2 M-6 10L26-4 44 8 M12 70L40 58', '#241a3d', 2.4)
    line(c, 'M-37-62L-14-33-27-9 M12 71L39 60', '#d9c4fa55', 0.8)
    c.restore()
    // Violet rim glow scales with energy.
    c.lineWidth = 2; c.strokeStyle = '#b57bff'; c.globalAlpha = 0.25 + 0.45 * m.energy; c.stroke(outline); c.globalAlpha = 1
    glow(c, 0, 0, 92, '#9b5cff', 0.22 + 0.3 * m.energy)
    // Debris ring: small rocks and shards orbiting the obstacle.
    at(c, 0, 0, m.time * 0.16 * (0.4 + m.energy), () => {
      ring(c, 0, 0, 96, '#6d4d9e', 0.8)
      for (let i = 0; i < 7; i++) {
        at(c, 0, 0, i * Math.PI / 3.5 + 0.4, () => {
          at(c, 0, -96, Math.sin(m.time * 1.3 + i) * 0.2 * m.articulation, () => {
            const s = 3.5 + (i % 3) * 2.5
            c.beginPath(); c.moveTo(-s, 0); c.lineTo(0, -s * 1.2); c.lineTo(s, 0); c.lineTo(0, s); c.closePath()
            c.fillStyle = linear(c, -s, -s, s, s, ['#8f6cc9', '#3a2c5c']); c.fill()
            c.lineWidth = 0.7; c.strokeStyle = '#bfa3ee'; c.stroke()
          })
        })
      }
    })
  })
}
