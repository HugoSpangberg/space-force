import { drawAsteroid, drawNebulaAsteroid } from './asteroids'
import { drawCitadel, drawCrusher, drawManta, drawNemesis, drawOrochi, drawSerpent, drawSerpentWarden } from './bosses'
import type { Motion } from './drawing'
import { drawInterceptor, drawKamikaze, drawLaserMob, drawScout, drawSpike } from './mobs'
import { drawPlayer, PLAYER_PALETTES } from './players'

export { PLAYER_PALETTES }
export type { PlayerColor } from './players'
export { serpentPhase } from './bosses'

export const DESIGN_CATALOG = [
  { id: 'mob-scout-drone', name: 'Scout Drone', category: 'mobs', description: 'Tre ledade fenor. En glödande röd sensorkärna.', accent: '#ff594a' },
  { id: 'mob-spike', name: 'Spike', category: 'mobs', description: 'Segmenterat metallskal med radiella röda taggar.', accent: '#ff913e' },
  { id: 'mob-interceptor', name: 'Interceptor', category: 'mobs', description: 'Spetsigt silverpansar och dubbla orange motorer.', accent: '#ffa638' },
  { id: 'mob-laser', name: 'Laser', category: 'mobs', description: 'Fyra roterande silverpinnar med laddande rosa laserlinser.', accent: '#ff2d78' },
  { id: 'mob-kamikaze', name: 'Kamikaze', category: 'mobs', description: 'Rödpulsande kärna med spetsade taggar och en kort svans.', accent: '#ff4b3a' },
  { id: 'boss-crusher', name: 'Crusher', category: 'bosses', description: 'Stenpansar, lavasprickor och tunga mekaniska klor.', accent: '#ff9b38' },
  { id: 'boss-orochi', name: 'Orochi', category: 'bosses', description: 'En ringlande maskinorm med violetta energisegment.', accent: '#d778ff' },
  { id: 'boss-nemesis', name: 'Nemesis', category: 'bosses', description: 'Ett tungt slagskepp byggt runt en röd reaktor.', accent: '#ff5b6b' },
  { id: 'boss-manta', name: 'Manta', category: 'bosses', description: 'Svepta pansarvingar, böjlig svans och turkos energi.', accent: '#59ebd4' },
  { id: 'boss-citadel', name: 'Citadel', category: 'bosses', description: 'En roterande ringfästning med åtta yttre torn.', accent: '#ffbe66' },
  { id: 'boss-serpent-warden', name: 'Serpent Warden', category: 'bosses', description: 'En skuggorm i skifferplattor som vaktar en roterande färgskiftande portal.', accent: '#c249f0' },
  { id: 'boss-serpent', name: 'Serpent', category: 'bosses', description: 'En lång segementsorm med glödande ögon och färgskiftande segment i tre faser.', accent: '#39d98a' },
  { id: 'asteroid-cratered', name: 'Crater', category: 'asteroids', description: 'Grå bergyta med djupa kratrar och slitna kanter.', accent: '#b4c3d3' },
  { id: 'asteroid-fractured', name: 'Fracture', category: 'asteroids', description: 'Avlång brungrå sten med skarpa brottytor.', accent: '#c7ae90' },
  { id: 'asteroid-nebula', name: 'Nebula', category: 'asteroids', description: 'Klumpig violett belyst sten omsluten av drivande nebulatöcke.', accent: '#a855f7' },
  { id: 'player-blue', name: 'Azure', category: 'players', description: 'Blå paneler och isblå motorglöd.', accent: '#5daeff' },
  { id: 'player-green', name: 'Viridian', category: 'players', description: 'Gröna paneler och mintgrön motorglöd.', accent: '#64e5a9' },
  { id: 'player-yellow', name: 'Solar', category: 'players', description: 'Gula paneler och gyllene motorglöd.', accent: '#ffd46c' },
  { id: 'player-pink', name: 'Nova', category: 'players', description: 'Rosa paneler och ljusrosa motorglöd.', accent: '#ff91c8' },
] as const

export type DesignId = typeof DESIGN_CATALOG[number]['id']
export type DesignCategory = typeof DESIGN_CATALOG[number]['category']
export interface DrawDesignOptions {
  id: DesignId
  /** Center and total footprint in the caller's logical canvas units. */
  x: number
  y: number
  size: number
  /** Seconds supplied by the caller. Zero gives a deterministic still image. */
  time?: number
  /** Radians around the center. Players point up; directional mobs point down. */
  rotation?: number
  /** 0–1 glow pulse strength, engine power, and joint motion amplitude. */
  energy?: number
  thrust?: number
  articulation?: number
}

const renderers: Record<DesignId, (ctx: CanvasRenderingContext2D, motion: Motion) => void> = {
  'mob-scout-drone': drawScout,
  'mob-spike': drawSpike,
  'mob-interceptor': drawInterceptor,
  'mob-laser': drawLaserMob,
  'mob-kamikaze': drawKamikaze,
  'boss-crusher': drawCrusher,
  'boss-orochi': drawOrochi,
  'boss-nemesis': drawNemesis,
  'boss-manta': drawManta,
  'boss-citadel': drawCitadel,
  'boss-serpent-warden': drawSerpentWarden,
  'boss-serpent': drawSerpent,
  'asteroid-cratered': (ctx, motion) => drawAsteroid(ctx, 'cratered', motion),
  'asteroid-fractured': (ctx, motion) => drawAsteroid(ctx, 'fractured', motion),
  'asteroid-nebula': drawNebulaAsteroid,
  'player-blue': (ctx, motion) => drawPlayer(ctx, 'blue', motion),
  'player-green': (ctx, motion) => drawPlayer(ctx, 'green', motion),
  'player-yellow': (ctx, motion) => drawPlayer(ctx, 'yellow', motion),
  'player-pink': (ctx, motion) => drawPlayer(ctx, 'pink', motion),
}
function unit(value: number | undefined) {
  return value === undefined ? 1 : Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1
}

/**
 * Draw one layered, animatable asset. No images, DOM, timers, random state or game state.
 * Does not clear the canvas. Restores the caller's transform, styles and compositing.
 * size includes exhaust and moving appendages; use your own independent hitbox.
 */
export function drawDesign(ctx: CanvasRenderingContext2D, options: DrawDesignOptions): void {
  const { id, x, y, size } = options
  if (!Number.isFinite(size) || size <= 0 || !Number.isFinite(x) || !Number.isFinite(y)) return
  const render = renderers[id]
  if (!render) return
  const motion: Motion = {
    time: Number.isFinite(options.time) ? options.time! : 0,
    thrust: unit(options.thrust), energy: unit(options.energy), articulation: unit(options.articulation),
  }
  ctx.save()
  try {
    ctx.translate(x, y)
    ctx.rotate(Number.isFinite(options.rotation) ? options.rotation! : 0)
    ctx.scale(size / 280, size / 280)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.setLineDash([]); ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0
    render(ctx, motion)
  } finally {
    ctx.restore()
  }
}
