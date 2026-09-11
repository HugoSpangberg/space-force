import { at, bolt, exhaust, fill, IRON, lamp, line, linear, mirror, plate, SILVER, vent } from './drawing'
import type { Ctx, Motion } from './drawing'

export const PLAYER_PALETTES = {
  blue: { accent: '#238bff', light: '#85e6ff', dark: '#123d8b' },
  green: { accent: '#35d887', light: '#a0ffd0', dark: '#136044' },
  yellow: { accent: '#ffc641', light: '#fff0a2', dark: '#996316' },
  pink: { accent: '#fa5eae', light: '#ffc0e6', dark: '#942450' },
} as const
export type PlayerColor = keyof typeof PLAYER_PALETTES

/** Every player variant uses this exact geometry; only the material palette changes. */
export function drawPlayer(c: Ctx, color: PlayerColor, m: Motion) {
  const p = PLAYER_PALETTES[color]
  mirror(c, () => {
    exhaust(c, 25, 61, 5.5, 37, p.accent, m)
    at(c, 18, 18, Math.sin(m.time * 1.8) * 0.025 * m.articulation, () => {
      plate(c, 'M0-22 L26 4 62 48 65 63 34 50 8 38Z', IRON)
      plate(c, 'M4-17 L26 8 58 46 35 37 10 25Z', SILVER)
      fill(c, 'M15 0 L27 13 50 42 33 34 22 19Z', p.accent)
      fill(c, 'M9-9 L17 5 27 19 13 12Z', '#ffffff65')
      line(c, 'M16 20L38 41 57 49 M28 31L26 38', '#243446', 0.9)
      lamp(c, 'M53 40L60 49', p.light, 1.4)
      bolt(c, 11, 22); bolt(c, 40, 34)
      plate(c, 'M56 18 L60 10 64 48 61 63 57 48Z', IRON)
      lamp(c, 'M60 20L62 43', p.accent, 1.1)
    })
    plate(c, 'M17 13 L23 1 33 17 33 58 29 65 20 65 16 55Z', IRON)
    plate(c, 'M18 22L24 11 29 22 29 43 18 43Z', SILVER)
    vent(c, 20, 34, 7, 5)
    fill(c, 'M18 54H32V61H18Z', p.dark)
    lamp(c, 'M19 61H31', p.light, 2.2)
    bolt(c, 24, 24)
  })
  plate(c, 'M0-97 L10-57 17-7 16 42 8 65 0 58-8 65-16 42-17-7-10-57Z', SILVER)
  fill(c, 'M0-91 L-3-56-10 9-7 42 0 48Z', '#eff9ff75')
  fill(c, 'M0-91 L3-56 10 9 7 42 0 48Z', '#39485865')
  mirror(c, () => {
    fill(c, 'M6-49 L9-31 13 17 9 10 5-22Z', p.accent)
    line(c, 'M3-63L7-38 M10 20L7 44', '#4a5b6d', 0.8)
    bolt(c, 10, 24, 1)
  })
  plate(c, 'M0-42 C9-34 10-17 8-1 L0 12-8-1 C-10-17-9-34 0-42Z', IRON)
  fill(c, 'M0-38 C6-30 7-17 6-3 L0 6-6-3 C-7-17-6-30 0-38Z', linear(c, -7, -20, 8, -15, [p.dark, p.light, p.dark]))
  line(c, 'M-5-10Q0-7 5-10 M0-34L-3-18', '#eaffffb0', 0.8)
  fill(c, 'M-4 18H4L5 39 0 47-5 39Z', p.accent)
  lamp(c, 'M0 23V36', p.light, 1.8)
  line(c, 'M-5 50L0 53 5 50', '#d9eafa', 0.75)
}
