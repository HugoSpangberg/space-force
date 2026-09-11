/** Small, resolution-independent Canvas 2D primitives. All dimensions are local art units. */
export type Ctx = CanvasRenderingContext2D
export interface Motion { time: number; energy: number; thrust: number; articulation: number }
export interface Metal { light: string; mid: string; dark: string; edge: string }
export const SILVER: Metal = { light: '#edf3f6', mid: '#8e9dad', dark: '#344353', edge: '#c3d3df' }
export const IRON: Metal = { light: '#91a2b1', mid: '#465566', dark: '#141e2b', edge: '#7d93a7' }
export const OBSIDIAN: Metal = { light: '#76758e', mid: '#343348', dark: '#111524', edge: '#9393af' }
export const BRONZE: Metal = { light: '#b9a391', mid: '#706355', dark: '#292a2d', edge: '#c3ae96' }

// Only static geometry is passed here; animated parts use context transforms.
const paths = new Map<string, Path2D>()
export function path(d: string) {
  let p = paths.get(d)
  if (!p) { p = new Path2D(d); paths.set(d, p) }
  return p
}
export function fill(c: Ctx, d: string, color: string | CanvasGradient) {
  c.fillStyle = color; c.fill(path(d))
}
export function line(c: Ctx, d: string, color = '#1c2a3c', width = 1) {
  c.strokeStyle = color; c.lineWidth = width; c.stroke(path(d))
}
export function linear(c: Ctx, x1: number, y1: number, x2: number, y2: number, stops: readonly string[]) {
  const g = c.createLinearGradient(x1, y1, x2, y2)
  stops.forEach((color, i) => g.addColorStop(i / (stops.length - 1), color))
  return g
}
export function plate(c: Ctx, d: string, m = SILVER, span = 80) {
  const p = path(d)
  c.lineJoin = 'round'
  c.strokeStyle = '#090f1b'; c.lineWidth = 3; c.stroke(p)
  c.fillStyle = linear(c, -span, -span, span, span, [m.light, m.mid, m.dark]); c.fill(p)
  c.strokeStyle = m.edge; c.lineWidth = 0.65; c.stroke(p)
}
export function circle(c: Ctx, x: number, y: number, r: number, color: string | CanvasGradient) {
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = color; c.fill()
}
export function ring(c: Ctx, x: number, y: number, r: number, color: string, width = 1) {
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.strokeStyle = color; c.lineWidth = width; c.stroke()
}
export function at(c: Ctx, x: number, y: number, a: number, draw: () => void) {
  c.save(); c.translate(x, y); c.rotate(a); draw(); c.restore()
}
export function mirror(c: Ctx, draw: (side: number) => void) {
  for (const side of [-1, 1]) { c.save(); c.scale(side, 1); draw(side); c.restore() }
}
export function glow(c: Ctx, x: number, y: number, r: number, color: string, strength = 0.4) {
  c.save(); c.globalAlpha *= strength
  const g = c.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, color); g.addColorStop(0.25, color + '90'); g.addColorStop(1, color + '00')
  circle(c, x, y, r, g); c.restore()
}
export function bolt(c: Ctx, x: number, y: number, r = 1.4) {
  circle(c, x, y, r + 0.7, '#121b26'); circle(c, x, y - 0.2, r, '#98a5b1')
  c.fillStyle = '#303d4b'; c.fillRect(x - r * 0.6, y - 0.3, r * 1.2, 0.6)
}
export function vent(c: Ctx, x: number, y: number, w: number, count: number) {
  c.fillStyle = '#101926'; c.fillRect(x - 1, y - 1, w + 2, count * 3 + 1)
  for (let i = 0; i < count; i++) {
    c.fillStyle = '#687585'; c.fillRect(x, y + i * 3, w, 1)
    c.fillStyle = '#2b3848'; c.fillRect(x, y + i * 3 + 1, w, 0.7)
  }
}
export function lamp(c: Ctx, d: string, color: string, width = 1.5) {
  line(c, d, '#07101b', width + 2.5); line(c, d, color, width)
  line(c, d, '#f5ffff', width * 0.24)
}
export function core(c: Ctx, x: number, y: number, r: number, color: string, m: Motion) {
  at(c, x, y, 0, () => {
    const pulse = (0.8 + Math.sin(m.time * 3.2) * 0.12) * m.energy
    glow(c, 0, 0, r * 2.3, color, 0.5 * pulse)
    circle(c, 0, 0, r * 1.37, '#0b101c')
    ring(c, 0, 0, r * 1.3, '#8194a4', r * 0.14)
    ring(c, 0, 0, r * 1.13, '#252f40', r * 0.17)
    for (let i = 0; i < 8; i++) {
      at(c, 0, 0, i * Math.PI / 4 + m.time * 0.16, () => {
        c.fillStyle = '#e1e7ed'; c.fillRect(-r * 0.055, -r * 1.34, r * 0.11, r * 0.14)
      })
    }
    const g = c.createRadialGradient(-r * 0.22, -r * 0.25, 0, 0, 0, r)
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, '#fff4df'); g.addColorStop(0.4, color); g.addColorStop(1, '#250d20')
    circle(c, 0, 0, r, g)
    ring(c, 0, 0, r * 0.84, color, r * 0.07)
    c.save(); c.globalAlpha *= Math.min(1, 0.25 + pulse)
    line(c, 'M-6 0H6 M0-6V6', '#fff9e9', 0.6); c.restore()
  })
}
/** Exhaust points toward +Y. Attach it under an engine's local transform. */
export function exhaust(c: Ctx, x: number, y: number, width: number, length: number, color: string, m: Motion) {
  if (m.thrust <= 0) return
  const l = length * m.thrust * (0.86 + Math.sin(m.time * 23 + x) * 0.065 + Math.sin(m.time * 37) * 0.045)
  at(c, x, y, 0, () => {
    glow(c, 0, l * 0.2, width * 2.5, color, 0.45 * m.thrust)
    c.beginPath(); c.moveTo(-width, 0)
    c.bezierCurveTo(-width, l * 0.4, -width * 0.3, l * 0.8, 0, l)
    c.bezierCurveTo(width * 0.3, l * 0.8, width, l * 0.4, width, 0)
    c.closePath()
    c.fillStyle = linear(c, 0, 0, 0, l, ['#ffffff', color, color + '00']); c.fill()
    c.beginPath(); c.moveTo(-width * 0.33, 0); c.quadraticCurveTo(0, l * 0.9, width * 0.33, 0)
    c.fillStyle = linear(c, 0, 0, 0, l * 0.6, ['#ffffff', '#ffffff00']); c.fill()
  })
}
