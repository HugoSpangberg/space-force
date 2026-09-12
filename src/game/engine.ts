// Space Force — canvas game engine (60fps, touch-driven, auto-fire)

import { playShoot, playExplosion, playPowerUp, playHit, playShield, playGameOver, playLevelComplete, playBossFlash, playTransition, startEngine, stopEngine, unlock, setMuted } from './audio'
import { initMusic, setMusicPhase, destroyMusic } from './music'
import { drawDesign } from './art'
import type { DesignId } from './art'
import { drawOrochiHead, drawOrochiSegment } from './art/bosses'

export interface HudState {
  score: number
  lives: number
  phase: string
  boss: number | null
  state: 'playing' | 'paused' | 'dead' | 'clear'
  bossDying: boolean
  godMode: boolean
  powerups: { spread: number; rapid: number; shield: number }
}

export type CourseId = 'graveyard' | 'nebula'

export interface GameDebugSnapshot {
  course: CourseId
  state: HudState['state']
  phase: {
    index: number
    name: string
    bossIndex: number
    stage: 'intro' | 'active' | 'exit'
    elapsed: number
    duration: number
    stageElapsed: number
    transitionRemaining: number
  }
  canvas: { width: number; height: number }
  ship: { x: number; y: number; radius: number; lives: number; invincibleFor: number; godMode: boolean }
  drones: {
    count: number
    items: Array<{
      design: DesignId
      hp: number
      position: { x: number; y: number }
      radius: number
      behavior: 'scout' | 'laser' | 'sentinel' | 'kamikaze'
      armed: boolean
      attacking: boolean
      entry?: { alpha: number; origin?: { x: number; y: number } }
      warningRemaining?: number
      heading?: number
      laserAngle?: number
    }>
  }
  bullets: {
    count: number
    items: Array<{ position: { x: number; y: number }; velocity: { x: number; y: number }; radius: number; friendly: boolean }>
  }
  laserBars: {
    count: number
    items: Array<{ y: number; velocityY: number; gapX: number; gapWidth: number; active: boolean; energy: number; alpha: number }>
  }
  laserGates: {
    count: number
    items: Array<{ orientation: LaserGate['orientation']; position: number; gap: number; gapSize: number; warningRemaining: number; activeRemaining: number; alpha: number }>
  }
  meteors: {
    count: number
    items: Array<{ position: { x: number; y: number }; velocity: { x: number; y: number }; radius: number; hp: number }>
  }
  telegraphs: {
    count: number
    items: Array<{ kind: MeteorWave['kind']; remaining: number; gap: number; spawned: boolean }>
  }
  boss: null | {
    design: DesignId
    hp: number
    maxHp: number
    pattern: number
    state: 'active' | 'telegraph' | 'dying' | BossSnake['mode']
    position: { x: number; y: number }
    radius: number
    attacking: boolean
    hidden?: boolean
    segmentCount?: number
    bodyLength?: number
    portalCount: number
    portals: Array<{ position: { x: number; y: number }; radius: number; edge: 'left' | 'right' | 'top' | 'bottom' }>
    targetPortal?: number
    targetPassages?: number
    remainingPassages?: number
    targetPath?: Array<{ x: number; y: number }>
    targetIdx?: number
    targetT?: number
    transitPhase?: 'in' | 'void' | 'out'
    transitT?: number
    transitDir?: { x: number; y: number }
    attacks: {
      rings: Array<{ position: { x: number; y: number }; remaining: number; state: 'warning' | 'firing' }>
      lasers: Array<{ position: { x: number; y: number }; angle: number; remaining: number; state: 'warning' | 'charging' | 'firing' }>
      sweep: { remaining: number; state: 'warning' | 'firing' } | null
      nova: { remaining: number; state: 'warning' | 'charging' | 'releasing' } | null
    }
  }
}

interface Star { x: number; y: number; r: number; s: number }
interface Bullet { x: number; y: number; vx: number; vy: number; r: number; friendly: boolean }
interface Asteroid { x: number; y: number; vx: number; vy: number; r: number; hp: number; spin: number; rot: number; verts: number[]; kind: 'cratered' | 'fractured' | 'nebula'; alpha?: number }
interface Drone { x: number; y: number; vx: number; vy: number; r: number; t: number; hp: number; kind: DesignId; laserAngle?: number; laserT?: number; laserHit?: boolean; spinSpeed?: number; alpha?: number; enterX?: number; enterY?: number; exitVX?: number; exitVY?: number; orbit?: { cx: number; cy: number; r: number; speed: number; phase: number }; sentinelSlot?: number; lockedAngle?: number; lockedX?: number; lockedY?: number; warning?: number; heading?: number }
interface LaserBar { y: number; vy: number; gapX: number; gapW: number; cycle: number; phase: number; alpha?: number }
interface LaserGate { orientation: 'horizontal' | 'vertical'; pos: number; gap: number; gapSize: number; warning: number; active: number; alpha: number }
interface MeteorWave { t: number; kind: 'diagonal' | 'horizontal'; gap: number; spawned: boolean }
interface Retiring { type: 'bar' | 'drone'; bar?: LaserBar; drone?: Drone; alpha: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; color: string }
type PowerupKind = 'spread' | 'rapid' | 'shield' | 'health'
interface Powerup { x: number; y: number; vy: number; kind: PowerupKind; t: number }

const COURSE_CONFIG = {
  graveyard: {
    phases: ['ASTEROID FIELD', 'DRONE SQUAD', 'INTERCEPTOR SURGE', 'THE ORBITAL WARDEN', 'SECTOR CLEAR'],
    durations: [14, 16, 18, 26, 6],
    bossIndex: 3,
  },
  nebula: {
    phases: ['LASER LABYRINTH', 'PRISM LATTICE', 'KAMIKAZE PURSUIT', 'LASER GATES', 'METEOR SLALOM', 'SERPENT RIFT', 'NEBULA CLEAR'],
    durations: [18, 20, 24, 22, 24, 34, 8],
    bossIndex: 5,
  },
} as const
const BOSS_MAX = 1400
const SPAWN_FADE = 0.7
const PHASE_INTRO = 1.4
const PHASE_EXIT = 1.05

interface BossPortal { x: number; y: number; r: number; color: string; life: number; max: number; role: 'in' | 'out' | 'decoy'; spin: number; flash: number }
interface BossTunnel { d0: number; d1: number; ex: number; ey: number; qx: number; qy: number; inColor: string; outColor: string }
interface BossTrailNode { d: number; x: number; y: number }
interface BossSnakeSeg { x: number; y: number; r: number; hidden: boolean; color: string }
interface BossEcho { x: number; y: number; t: number; max: number; fireT: number; scale: number }
interface BossSweep { t: number; warn: number; fire: number; r0: number; r1: number; a0: number; a1: number }
interface BossNova { t: number; warn: number; spin: number }
interface BossRing { cx: number; cy: number; t: number; warn: number; fire: number; n: number; speed: number; gap: number; gapAngle: number; r0: number; width: number; color: string; hiColor: string }
interface BossLaser { x: number; y: number; angle: number; t: number; warn: number; grow: number; fire: number; width: number; len: number; spin: number }
interface BossSnake {
  portals: BossPortal[]
  tunnels: BossTunnel[]
  trail: BossTrailNode[]
  dist: number
  targetPortal: number
  targetPath: Array<{ x: number; y: number }>
  targetIdx: number
  segs: BossSnakeSeg[]
  prevSegs: BossSnakeSeg[]
  spacing: number
  length: number
  mode: 'idle' | 'telegraph' | 'transit' | 'attack' | 'ring' | 'sweep' | 'nova' | 'recover'
  modeT: number
  attackT: number
  moveT: number
  moveTarget: { x: number; y: number } | null
  vel: { x: number; y: number }
  slint: number
  speed: number
  teleportT: number
  attackIndex: number
  dashCount: number
  dashIndex: number
  dashFrom: BossPortal | null
  dashTo: BossPortal | null
  transitPhase: 'in' | 'void' | 'out'
  transitT: number
  transitDir: { x: number; y: number }
  echoes: BossEcho[]
  sweep: BossSweep | null
  nova: BossNova | null
  rings: BossRing[]
  lasers: BossLaser[]
  novaDone: boolean
}
interface Boss {
  x: number; y: number; r: number; hp: number; maxHp: number; t: number; pattern: number; tele: number; atk: number; dying: boolean; deathT: number; kind: DesignId; portalT: number; portalIndex: number
  snake?: BossSnake
}

const SNAKE_SEGS = 46
const SNAKE_SPEED = 175
const SWALLOW_DUR = 0.75   // how long it takes the portal to consume / release the whole body
const EMERGE_DUR = 0.75
const PORTAL_COLORS = ['#22d3ee', '#f472b6', '#fbbf24', '#4ade80', '#a78bfa']
const rand = (a: number, b: number) => a + Math.random() * (b - a)

export class Game {
  private readonly course: CourseId
  private readonly phases: readonly string[]
  private readonly phaseDurations: readonly number[]
  private readonly bossIndex: number
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private onHud: (h: HudState) => void
  private w = 0
  private h = 0
  private dpr = 1
  private raf = 0
  private last = 0
  private time = 0
  private phaseIdx = 0
  private phaseT = 0
  private phaseStage: 'intro' | 'active' | 'exit' = 'intro'
  private phaseStageT = 0
  private score = 0
  private lives = 5
  private state: HudState['state'] = 'playing'
  private stars: Star[] = []
  private bullets: Bullet[] = []
  private asteroids: Asteroid[] = []
  private drones: Drone[] = []
  private laserBars: LaserBar[] = []
  private laserGates: LaserGate[] = []
  private meteorWaves: MeteorWave[] = []
  private laserGatePattern = 0
  private meteorSpawnT = 0
  private meteorWaveIndex = 0
  private laserSpawnT = 0
  private sentinelsSpawned = 0
  private retiring: Retiring[] = []
  private transT = 0
  private particles: Particle[] = []
  private ship = { x: 0, y: 0, r: 20, inv: 0 }
  private target = { x: 0, y: 0, active: false }
  private fireT = 0
  private spawnT = 0
  private shake = 0
  private boss: Boss | null = null
  private bossFlash = 0
  private shockwaves: Array<{ x: number; y: number; t: number; max: number; color: string; r0: number; r1: number }> = []
  private dyingFlashCount = 0
  private clearing = false
  private clearDelay = 0
  private readonly CLEAR_SCORE_DELAY = 4
  private beam: { cx: number; cy: number; radius: number; speed: number; maxR: number; gap: number; gapAngle: number; width: number } | null = null
  private beam2: { cx: number; cy: number; radius: number; speed: number; maxR: number; gap: number; gapAngle: number; width: number } | null = null
  private beam2Delay = 0
  private bossAsteroidT = 0
  private hudT = 0
  private touchId: number | null = null
  godMode = false
  private onEnd: (clear: boolean) => void
  private powerups: Powerup[] = []
  private pSpread = 0
  private pRapid = 0
  private pShield = 0

  constructor(canvas: HTMLCanvasElement, onHud: (h: HudState) => void, onEnd: (clear: boolean) => void, startAtPhase = 0, course: CourseId = 'nebula') {
    this.canvas = canvas
    this.course = course
    this.phases = COURSE_CONFIG[course].phases
    this.phaseDurations = COURSE_CONFIG[course].durations
    this.bossIndex = COURSE_CONFIG[course].bossIndex
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    this.ctx = ctx
    this.onHud = onHud
    this.onEnd = onEnd
    this.resize()
    this.ship.x = this.w / 2
    this.ship.y = this.h * 0.8
    this.target.x = this.ship.x
    this.target.y = this.ship.y
    this.initStars()
    this.bindInput()
    this.phaseIdx = Math.max(0, Math.min(startAtPhase, this.phases.length - 1))
    this.transT = PHASE_INTRO
    this.ship.inv = 2.5
    if (this.phaseIdx === this.bossIndex) this.spawnBoss()
  }

  private initStars() {
    this.stars = []
    for (let i = 0; i < 90; i++) {
      this.stars.push({ x: Math.random() * this.w, y: Math.random() * this.h, r: rand(0.6, 2), s: rand(20, 120) })
    }
  }

  private bindInput() {
    const c = this.canvas
    const toLocal = (e: PointerEvent) => {
      const rect = c.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    const down = (e: PointerEvent) => {
      if (this.touchId !== null) return
      e.preventDefault()
      this.touchId = e.pointerId
      c.setPointerCapture(e.pointerId)
      const p = toLocal(e)
      this.target.x = p.x
      this.target.y = p.y - 90
      this.target.active = true
      if (this.state === 'paused') this.state = 'playing'
    }
    const move = (e: PointerEvent) => {
      if (e.pointerId !== this.touchId) return
      e.preventDefault()
      const p = toLocal(e)
      this.target.x = p.x
      this.target.y = p.y - 90
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId !== this.touchId) return
      this.touchId = null
      this.target.active = false
    }
    c.addEventListener('pointerdown', down)
    c.addEventListener('pointermove', move)
    c.addEventListener('pointerup', up)
    c.addEventListener('pointercancel', up)
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.w = rect.width
    this.h = rect.height
    this.canvas.width = Math.round(this.w * this.dpr)
    this.canvas.height = Math.round(this.h * this.dpr)
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  /** Returns a detached view of deterministic runtime state for development and course tests. */
  getDebugSnapshot(): GameDebugSnapshot {
    const active = this.phaseStage === 'active'
    const meteorItems = this.asteroids.filter(a => a.kind === 'nebula')
    const boss = this.boss
    const bossSnapshot: GameDebugSnapshot['boss'] = boss
      ? (() => {
          const snake = boss.snake
          const portals = snake?.portals ?? []
          const edgeFor = (x: number, y: number): 'left' | 'right' | 'top' | 'bottom' => {
            const distances = [x, this.w - x, y, this.h - y]
            const edge = distances.indexOf(Math.min(...distances))
            return edge === 0 ? 'left' : edge === 1 ? 'right' : edge === 2 ? 'top' : 'bottom'
          }
          return {
            design: boss.kind,
            hp: boss.hp,
            maxHp: boss.maxHp,
            pattern: boss.pattern,
            state: boss.dying ? 'dying' : snake?.mode ?? (boss.tele > 0 ? 'telegraph' : 'active'),
            position: { x: boss.x, y: boss.y },
            radius: boss.r,
            attacking: snake
              ? snake.mode === 'attack' || snake.mode === 'transit'
              : this.beam !== null || this.beam2 !== null,
            attacks: {
              rings: snake?.rings.map(r => ({
                position: { x: r.cx, y: r.cy },
                remaining: Math.max(0, r.warn + r.fire - r.t),
                state: r.t < r.warn ? 'warning' as const : 'firing' as const,
              })) ?? [],
              lasers: snake?.lasers.map(l => ({
                position: { x: l.x, y: l.y },
                angle: l.angle,
                remaining: Math.max(0, l.warn + l.grow + l.fire - l.t),
                state: l.t < l.warn ? 'warning' as const : l.t < l.warn + l.grow ? 'charging' as const : 'firing' as const,
              })) ?? [],
              sweep: snake?.sweep
                ? { remaining: Math.max(0, snake.sweep.warn + snake.sweep.fire - snake.sweep.t), state: snake.sweep.t < snake.sweep.warn ? 'warning' as const : 'firing' as const }
                : null,
              nova: snake?.nova
                ? { remaining: Math.max(0, snake.nova.warn - snake.nova.t), state: 'charging' as const }
                : null,
            },
            ...(snake ? {
              hidden: snake.segs[0]?.hidden ?? false,
              segmentCount: snake.segs.length,
              visibleSegments: snake.segs.reduce((n, s) => n + (s.hidden ? 0 : 1), 0),
              bodyLength: snake.length,
              targetPortal: snake.targetPortal,
              targetPassages: snake.dashCount,
              remainingPassages: Math.max(0, snake.dashCount - snake.dashIndex),
              targetPath: snake.targetPath.map(p => ({ x: p.x, y: p.y })),
              targetIdx: snake.targetIdx,
              transitPhase: snake.transitPhase,
              transitT: snake.transitT,
              transitDir: { x: snake.transitDir.x, y: snake.transitDir.y },
            } : {}),
            portalCount: portals.length,
            portals: portals.map(portal => ({
              position: { x: portal.x, y: portal.y },
              radius: portal.r,
              edge: edgeFor(portal.x, portal.y),
            })),
          }
        })()
      : null

    return {
      course: this.course,
      state: this.state,
      phase: {
        index: this.phaseIdx,
        name: this.phases[this.phaseIdx],
        bossIndex: this.bossIndex,
        stage: this.phaseStage,
        elapsed: this.phaseT,
        duration: this.phaseDurations[this.phaseIdx],
        stageElapsed: this.phaseStageT,
        transitionRemaining: this.transT,
      },
      canvas: { width: this.w, height: this.h },
      ship: {
        x: this.ship.x,
        y: this.ship.y,
        radius: this.ship.r,
        lives: this.lives,
        invincibleFor: this.ship.inv,
        godMode: this.godMode,
      },
      drones: {
        count: this.drones.length,
        items: this.drones.map(drone => {
          const behavior = drone.kind === 'mob-kamikaze' ? 'kamikaze'
            : drone.orbit ? 'sentinel'
              : drone.kind === 'mob-laser' ? 'laser' : 'scout'
          const visible = (drone.alpha ?? 1) > 0.5
          const sentinel = drone.orbit ? this.sentinelTiming(drone) : null
          const attacking = behavior === 'sentinel' ? (sentinel?.firing ?? false)
            : behavior === 'laser' ? (drone.laserT ?? Infinity) < 0.6 && active
              : behavior === 'kamikaze' ? (drone.warning ?? 0) <= 0 && active
                : active
          return {
            design: drone.kind,
            hp: drone.hp,
            position: { x: drone.x, y: drone.y },
            radius: drone.r,
            behavior,
            armed: active && visible && (behavior !== 'kamikaze' || (drone.warning ?? 0) <= 0),
            attacking,
            ...((drone.alpha !== undefined || drone.enterX !== undefined) ? {
              entry: {
                alpha: drone.alpha ?? 1,
                ...(drone.enterX !== undefined ? { origin: { x: drone.enterX, y: drone.enterY ?? drone.y } } : {}),
              },
            } : {}),
            ...(drone.warning !== undefined ? { warningRemaining: drone.warning } : {}),
            ...(drone.heading !== undefined ? { heading: drone.heading } : {}),
            ...(drone.laserAngle !== undefined ? { laserAngle: drone.laserAngle } : {}),
          }
        }),
      },
      bullets: {
        count: this.bullets.length,
        items: this.bullets.map(bullet => ({
          position: { x: bullet.x, y: bullet.y },
          velocity: { x: bullet.vx, y: bullet.vy },
          radius: bullet.r,
          friendly: bullet.friendly,
        })),
      },
      laserBars: {
        count: this.laserBars.length,
        items: this.laserBars.map(bar => ({
          y: bar.y,
          velocityY: bar.vy,
          gapX: bar.gapX,
          gapWidth: bar.gapW,
          active: active && this.laserOn(bar),
          energy: this.laserEnergy(bar),
          alpha: bar.alpha ?? 1,
        })),
      },
      laserGates: {
        count: this.laserGates.length,
        items: this.laserGates.map(gate => ({
          orientation: gate.orientation,
          position: gate.pos,
          gap: gate.gap,
          gapSize: gate.gapSize,
          warningRemaining: gate.warning,
          activeRemaining: gate.active,
          alpha: gate.alpha,
        })),
      },
      meteors: {
        count: meteorItems.length,
        items: meteorItems.map(meteor => ({
          position: { x: meteor.x, y: meteor.y },
          velocity: { x: meteor.vx, y: meteor.vy },
          radius: meteor.r,
          hp: meteor.hp,
        })),
      },
      telegraphs: {
        count: this.meteorWaves.length,
        items: this.meteorWaves.map(wave => ({ kind: wave.kind, remaining: wave.t, gap: wave.gap, spawned: wave.spawned })),
      },
      boss: bossSnapshot,
    }
  }

  setPaused(p: boolean) {
    if (this.state === 'dead' || this.state === 'clear') return
    this.state = p ? 'paused' : 'playing'
    this.emit()
  }

  setMuted(m: boolean) {
    setMuted(m)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    stopEngine()
    destroyMusic()
  }

  private emit() {
    this.onHud({
      score: this.score,
      lives: this.lives,
      phase: this.phases[this.phaseIdx],
      boss: this.boss ? Math.max(0, this.boss.hp) / this.boss.maxHp : null,
      state: this.state,
      bossDying: this.boss?.dying ?? false,
      godMode: this.godMode,
      powerups: {
        spread: this.pSpread > 0 ? Math.ceil(this.pSpread) : 0,
        rapid: this.pRapid > 0 ? Math.ceil(this.pRapid) : 0,
        shield: this.pShield > 0 ? Math.ceil(this.pShield) : 0,
      },
    })
    setMusicPhase(this.phases[this.phaseIdx], this.state)
  }

  start() {
    unlock()
    startEngine()
    initMusic()
    this.last = performance.now()
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - this.last) / 1000)
      this.last = t
      if (this.state === 'playing') {
        this.update(dt)
      } else if (this.clearing) {
        this.clearDelay -= dt
        this.time += dt
        this.updateStars(dt)
        this.updateParticles(dt)
        this.shake = Math.max(0, this.shake - dt * 30)
        if (this.clearDelay <= 0) {
          this.clearDelay = 0
          this.onEnd(true)
        }
      }
      this.render()
      this.hudT -= dt
      if (this.hudT <= 0) {
        this.hudT = 0.1
        this.emit()
      }
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
    this.emit()
  }

  private update(dt: number) {
    this.time += dt
    this.phaseStageT += dt
    if (this.phaseStage === 'intro') {
      if (this.phaseStageT >= PHASE_INTRO) {
        this.phaseStage = 'active'
        this.phaseStageT = 0
        this.phaseT = 0
      }
    } else if (this.phaseStage === 'active') {
      this.phaseT += dt
      const dur = this.phaseDurations[this.phaseIdx]
      if (this.phaseT >= dur && this.boss === null) {
        this.phaseStage = 'exit'
        this.phaseStageT = 0
        this.retireWorld()
        this.ship.inv = Math.max(this.ship.inv, 2.5)
        playTransition()
      }
    } else if (this.phaseStageT >= PHASE_EXIT && this.retiring.length === 0) {
      this.phaseIdx++
      if (this.phaseIdx >= this.phases.length) {
        this.state = 'clear'
        playLevelComplete()
        this.emit()
        this.onEnd(true)
        return
      }
      this.retireWorld()
      this.sentinelsSpawned = 0
      this.spawnT = 0
      this.laserSpawnT = 0
      this.laserGatePattern = 0
      this.meteorSpawnT = 0
      this.meteorWaveIndex = 0
      this.phaseT = 0
      this.phaseStage = 'intro'
      this.phaseStageT = 0
      this.transT = PHASE_INTRO
      this.ship.inv = Math.max(this.ship.inv, 2.5)
      if (this.phaseIdx === this.bossIndex) this.spawnBoss()
    }
    this.updateStars(dt)
    this.updateShip(dt)
    this.updateBullets(dt)
    if (this.course === 'graveyard' && this.phaseIdx === 0) this.updateAsteroids(dt)
    else if (this.course === 'nebula' && this.phaseIdx === 4) this.updateMeteorSlalom(dt)
    else if (this.asteroids.length > 0) this.updateAsteroidsNoSpawn(dt)
    if ((this.course === 'graveyard' && this.phaseIdx >= 1 && this.phaseIdx <= 2) ||
      (this.course === 'nebula' && (this.phaseIdx === 1 || this.phaseIdx === 2))) this.updateDrones(dt)
    else if (this.drones.length > 0) this.updateDronesNoSpawn(dt)
    if (this.course === 'nebula' && this.phaseIdx === 0) this.updateLaserBars(dt)
    if (this.course === 'nebula' && this.phaseIdx === 3) this.updateLaserGates(dt)
    if (this.boss) this.updateBoss(dt)
    if (this.shockwaves.length > 0) this.updateShockwaves(dt)
    this.updatePowerups(dt)
    this.updateParticles(dt)
    this.updateRetiring(dt)
    if (this.transT > 0) this.transT = Math.max(0, this.transT - dt)
    this.shake = Math.max(0, this.shake - dt * 30)
    this.bossFlash = Math.max(0, this.bossFlash - dt * 4)
    const checkBeam = (bm: { cx: number; cy: number; radius: number; speed: number; maxR: number; gap: number; gapAngle: number; width: number }) => {
      bm.radius += bm.speed * dt
      bm.cx = this.boss?.x ?? bm.cx
      bm.cy = this.boss?.y ?? bm.cy
      const d = dist(this.ship, { x: bm.cx, y: bm.cy })
      const inRing = Math.abs(d - bm.radius) < bm.width / 2 + this.ship.r
      if (inRing) {
        let da = Math.atan2(this.ship.y - bm.cy, this.ship.x - bm.cx) - bm.gapAngle
        da = ((da + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
        const inGap = Math.abs(da) < bm.gap
        if (!inGap && this.ship.inv <= 0 && this.pShield <= 0) {
          this.damageShip()
        }
      }
      return bm.radius >= bm.maxR
    }
    if (this.beam2Delay > 0) this.beam2Delay = Math.max(0, this.beam2Delay - dt)
    if (this.beam) {
      if (checkBeam(this.beam)) this.beam = null
    }
    if (this.beam2) {
      if (checkBeam(this.beam2)) this.beam2 = null
    }
  }

  private updateStars(dt: number) {
    for (const s of this.stars) {
      s.y += s.s * dt * (this.phaseIdx >= this.bossIndex ? 1.6 : 1)
      if (s.y > this.h) { s.y = -4; s.x = Math.random() * this.w }
    }
  }

  private updateShip(dt: number) {
    const s = this.ship
    if (this.target.active) {
      const k = 1 - Math.pow(0.0001, dt)
      s.x += (this.target.x - s.x) * k
      s.y += (this.target.y - s.y) * k
    }
    s.x = Math.max(18, Math.min(this.w - 18, s.x))
    s.y = Math.max(18, Math.min(this.h - 18, s.y))
    s.inv = Math.max(0, s.inv - dt)
    this.pSpread = Math.max(0, this.pSpread - dt)
    this.pRapid = Math.max(0, this.pRapid - dt)
    this.pShield = Math.max(0, this.pShield - dt)
    // auto-fire (suppressed while boss is dying / level is clearing)
    this.fireT -= dt
    if (this.fireT <= 0 && !this.clearing && !(this.boss?.dying ?? false)) {
      const rate = this.pRapid > 0 ? 0.06 : 0.11
      this.fireT = rate
      if (this.pSpread > 0) {
        for (let i = -1; i <= 1; i++) {
          this.bullets.push({ x: s.x, y: s.y - 18, vx: i * 140, vy: -620, r: 4, friendly: true })
        }
      } else {
        this.bullets.push({ x: s.x, y: s.y - 18, vx: 0, vy: -620, r: 4, friendly: true })
      }
      playShoot()
    }
  }

  private updateBullets(dt: number) {
    const next: Bullet[] = []
    for (const b of this.bullets) {
      b.x += b.vx * dt
      b.y += b.vy * dt
      if (b.y < -20 || b.y > this.h + 20 || b.x < -20 || b.x > this.w + 20) continue
      let hit = false
      if (b.friendly) {
        for (const a of this.asteroids) {
          if (dist(b, a) < a.r + b.r) {
            // Cratered asteroids are indestructible — bullets glance off.
            if (a.kind === 'cratered') { this.burst(b.x, b.y, 2, '#94a3b8'); hit = true }
            else { a.hp--; this.burst(b.x, b.y, 3, '#fbbf24'); hit = true }
            break
          }
        }
        if (!hit) for (const d of this.drones) {
          if (dist(b, d) < d.r + b.r) { hit = true; this.burst(b.x, b.y, 6, '#22d3ee'); this.score += 50; d.hp--; break }
        }
        if (!hit && this.boss) {
          if (this.boss.snake) {
            // only the HEAD can be shot — the body is invulnerable
            const head = this.boss.snake.segs[0]
            if (head && !head.hidden && dist(b, head) < head.r + b.r) {
              this.boss.hp -= 3; hit = true
              this.bossFlash = 1
              this.burst(b.x, b.y, 3, '#fb7185')
            }
          } else if (dist(b, this.boss) < this.boss.r + b.r) {
            this.boss.hp -= 3; hit = true
            this.bossFlash = 1
            this.burst(b.x, b.y, 3, '#fb7185')
          }
        }
      } else {
        if (this.pShield > 0) {
          if (dist(b, this.ship) < this.ship.r + b.r + 14) {
            hit = true
            this.burst(b.x, b.y, 4, '#22d3ee')
            playShield()
          }
        } else if (this.ship.inv <= 0 && dist(b, this.ship) < this.ship.r + b.r) {
          hit = true
          this.damageShip()
        }
      }
      if (!hit) next.push(b)
    }
    this.bullets = next
    // cleanup dead enemies
    this.asteroids = this.asteroids.filter(a => {
      if (a.hp <= 0) {
        this.burst(a.x, a.y, 14, '#fbbf24')
        this.score += 100
        this.shake = 6
        playExplosion(0.5)
        this.maybeDropPowerup(a.x, a.y)
        return false
      }
      return true
    })
    this.drones = this.drones.filter(d => {
      if (d.hp <= 0) {
        this.burst(d.x, d.y, 16, '#22d3ee')
        this.score += 150
        this.shake = 5
        playExplosion(0.7)
        this.maybeDropPowerup(d.x, d.y)
        return false
      }
      return true
    })
    if (this.boss && this.boss.hp <= 0 && !this.boss.dying) {
      this.boss.dying = true
      this.boss.deathT = 0
      this.beam = null
      this.bossFlash = 1
      this.score += 2000
      this.shake = 10
      playBossFlash()
    }
  }

  private spawnAsteroid() {
    const r = rand(22, 52)
    const verts: number[] = []
    const n = 8
    for (let i = 0; i < n; i++) verts.push(rand(0.72, 1.12))
    this.asteroids.push({
      x: rand(30, this.w - 30), y: -r * 2,
      vx: rand(-25, 25), vy: rand(60, 120),
      r, hp: Math.round(r / 14), spin: rand(-2, 2), rot: rand(0, 6), verts,
      kind: this.course === 'nebula' ? 'nebula' : (Math.random() < 0.5 ? 'cratered' : 'fractured'),
    })
  }

  private updateAsteroids(dt: number) {
    this.spawnT -= dt
    if (this.spawnT <= 0) { this.spawnT = 0.5; this.spawnAsteroid() }
    const next: Asteroid[] = []
    for (const a of this.asteroids) {
      a.x += a.vx * dt; a.y += a.vy * dt; a.rot += a.spin * dt
      if (a.y > this.h + 60) continue
      if (this.ship.inv <= 0 && dist(a, this.ship) < a.r + this.ship.r) this.damageShip()
      next.push(a)
    }
    this.asteroids = next
  }

  private spawnDrone() {
    const fromLeft = Math.random() < 0.5
    const kind: DesignId = this.course === 'nebula' ? 'mob-laser' : 'mob-scout-drone'
    this.drones.push({
      x: fromLeft ? -24 : this.w + 24,
      y: rand(60, this.h * 0.45),
      vx: (fromLeft ? 1 : -1) * rand(70, 120),
      vy: 0, r: 22, t: rand(0, 6),
      hp: 2,
      kind,
      laserAngle: fromLeft ? 0 : Math.PI,
      laserT: rand(0, 3.8),
      laserHit: false,
      alpha: 0,
    })
  }

  private spawnKamikaze() {
    const candidates = [
      { x: -25, y: rand(70, this.h - 70), heading: 0 },
      { x: this.w + 25, y: rand(70, this.h - 70), heading: Math.PI },
      { x: rand(50, this.w - 50), y: -25, heading: Math.PI / 2 },
    ]
    candidates.sort((a, b) => Math.hypot(b.x - this.ship.x, b.y - this.ship.y) - Math.hypot(a.x - this.ship.x, a.y - this.ship.y))
    const p = candidates[Math.floor(Math.random() * Math.min(2, candidates.length))]
    this.drones.push({
      x: p.x, y: p.y, vx: Math.cos(p.heading) * 115, vy: Math.sin(p.heading) * 115,
      r: 23, t: rand(0, 6), hp: 12, kind: 'mob-kamikaze', alpha: 0.35,
      warning: 1, heading: p.heading,
    })
  }

  private spawnLaserSentinel() {
    const i = this.sentinelsSpawned
    const radii = [85, 140, 112]
    const speeds = [0.45, -0.35, 0.6]
    const spins = [0.6, -0.5, 0.75]
    const cx = this.w / 2, cy = this.h * 0.34
    const r = radii[i % radii.length]
    const phase = (i * Math.PI * 2) / 3 + rand(-0.3, 0.3)
    // start off-screen (above the top edge) and slide down into its orbit
    const enterX = cx + Math.cos(phase) * r
    const enterY = -50
    this.drones.push({
      x: enterX, y: enterY,
      vx: 0, vy: 0, r: 27, t: rand(0, 6),
      hp: 6,
      kind: 'mob-laser',
      laserAngle: rand(0, Math.PI * 2),
      laserT: i * 1.5 + 0.8,
      laserHit: false,
      alpha: 0,
      enterX, enterY,
      spinSpeed: spins[i % spins.length] + rand(-0.2, 0.2),
      sentinelSlot: i,
      orbit: { cx, cy, r, speed: speeds[i % speeds.length], phase },
    })
  }

  private sentinelTiming(d: Drone): { warning: boolean; firing: boolean } {
    if (this.phaseStage !== 'active' || d.sentinelSlot === undefined) return { warning: false, firing: false }
    const slotLength = 1.95
    const total = slotLength * 3
    const local = (this.phaseT - d.sentinelSlot * slotLength + total) % total
    return { warning: local < 0.8, firing: local >= 0.8 && local < 1.6 }
  }

  private beamLength(d: Drone, angle: number): number {
    const dx = Math.sin(angle), dy = -Math.cos(angle)
    let length = Infinity
    if (dx > 0.0001) length = Math.min(length, (this.w - d.x) / dx)
    else if (dx < -0.0001) length = Math.min(length, -d.x / dx)
    if (dy > 0.0001) length = Math.min(length, (this.h - d.y) / dy)
    else if (dy < -0.0001) length = Math.min(length, -d.y / dy)
    return Math.max(0, length)
  }

  private updateSentinelLaser(d: Drone, dt: number) {
    if (d.laserT === undefined || d.laserAngle === undefined || d.spinSpeed === undefined) {
      d.laserT = rand(0, 2.4); d.laserAngle = rand(0, Math.PI * 2); d.spinSpeed = rand(0.7, 1.2) * (Math.random() < 0.5 ? -1 : 1)
      return
    }
    const timing = this.sentinelTiming(d)
    if (!timing.warning && !timing.firing) {
      d.laserAngle += d.spinSpeed * dt
      d.laserHit = false
    } else if (!d.laserHit) {
      d.lockedAngle = d.laserAngle
      d.laserHit = true
    }
    if (d.lockedAngle !== undefined && (timing.warning || timing.firing)) d.laserAngle = d.lockedAngle
    d.laserT = timing.firing ? 0.9 : timing.warning ? 0.4 : 2
    if (timing.firing) {
      const dx = this.ship.x - d.x
      const dy = this.ship.y - d.y
      const forwardX = Math.sin(d.laserAngle)
      const forwardY = -Math.cos(d.laserAngle)
      const projection = dx * forwardX + dy * forwardY
      const cross = Math.abs(dx * forwardY - dy * forwardX)
      const beamLength = this.beamLength(d, d.laserAngle)
      if (projection >= 0 && projection <= beamLength && cross < this.ship.r + 4 && this.ship.inv <= 0 && this.pShield <= 0) this.damageShip()
    }
  }

  private updateLaser(d: Drone, dt: number) {
    if (d.kind !== 'mob-laser') return
    if (d.laserT === undefined || d.laserAngle === undefined) {
      d.laserT = rand(0, 3.6)
      d.laserAngle = d.vx < 0 ? Math.PI : 0
      if (d.spinSpeed === undefined) d.spinSpeed = (Math.random() < 0.5 ? -1 : 1) * rand(0.3, 0.6)
      return
    }
    // slow self-rotation on its own axis — never aims at the ship
    d.laserAngle += (d.spinSpeed ?? 0.4) * dt
    d.laserT = (d.laserT + dt) % 5.0
    if (d.laserT < 0.6 && this.phaseStage === 'active') {
      // firing window — beam shoots straight out in whatever direction it faces
      const dx = this.ship.x - d.x
      const dy = this.ship.y - d.y
      const forwardX = Math.sin(d.laserAngle)
      const forwardY = -Math.cos(d.laserAngle)
      const projection = dx * forwardX + dy * forwardY
      const cross = Math.abs(dx * forwardY - dy * forwardX)
      const beamLength = this.beamLength(d, d.laserAngle)
      if (projection >= 0 && projection <= beamLength && cross < this.ship.r + 4 && this.ship.inv <= 0 && this.pShield <= 0) this.damageShip()
    }
  }

  private laserOn(bar: LaserBar): boolean {
    const t = (this.time + bar.phase) % bar.cycle
    return t < bar.cycle * 0.5
  }

  private laserEnergy(bar: LaserBar): number {
    const onW = bar.cycle * 0.5
    const t = (this.time + bar.phase) % bar.cycle
    if (t < onW) return Math.max(0, Math.min(1, t / 0.1, (onW - t) / 0.15))
    return 0
  }

  private spawnLaserBar() {
    const gapW = rand(110, 150)
    const margin = gapW / 2 + 20
    this.laserBars.push({
      y: -20,
      vy: rand(105, 145),
      gapX: rand(margin, this.w - margin),
      gapW,
      cycle: rand(1.8, 2.6),
      phase: rand(0, 3),
      alpha: 0,
    })
  }

  private updateLaserBars(dt: number) {
    this.laserSpawnT -= dt
    if (this.laserSpawnT <= 0 && this.transT <= 0) { this.laserSpawnT = rand(1.1, 1.5); this.spawnLaserBar() }
    const next: LaserBar[] = []
    for (const bar of this.laserBars) {
      bar.y += bar.vy * dt
      bar.alpha = Math.min(1, (bar.alpha ?? 0) + dt / SPAWN_FADE)
      if (bar.y > this.h + 40) continue
      if (this.phaseStage === 'active' && this.laserOn(bar) && (bar.alpha ?? 1) > 0.5) {
        const inBand = Math.abs(this.ship.y - bar.y) < 6 + this.ship.r
        if (inBand) {
          const inGap = this.ship.x > bar.gapX - bar.gapW / 2 - this.ship.r * 0.4 &&
            this.ship.x < bar.gapX + bar.gapW / 2 + this.ship.r * 0.4
          if (!inGap && this.ship.inv <= 0) this.damageShip()
        }
      }
      next.push(bar)
    }
    this.laserBars = next
  }

  private spawnLaserGate() {
    const horizontal = this.laserGatePattern % 2 === 0
    const lanes = [0.25, 0.72, 0.42, 0.78, 0.3]
    const lane = lanes[this.laserGatePattern % lanes.length]
    this.laserGatePattern++
    this.laserGates.push({
      orientation: horizontal ? 'horizontal' : 'vertical',
      pos: horizontal ? this.h * (this.laserGatePattern % 3 === 0 ? 0.38 : 0.58) : this.w * (this.laserGatePattern % 3 === 0 ? 0.68 : 0.42),
      gap: lane * (horizontal ? this.w : this.h),
      gapSize: Math.max(118, (horizontal ? this.w : this.h) * 0.24),
      warning: 1.2,
      active: 1.65,
      alpha: 0,
    })
  }

  private updateLaserGates(dt: number) {
    this.laserSpawnT -= dt
    if (this.phaseStage === 'active' && this.laserSpawnT <= 0) {
      this.laserSpawnT = 3.35
      this.spawnLaserGate()
    }
    const next: LaserGate[] = []
    for (const gate of this.laserGates) {
      gate.alpha = Math.min(1, gate.alpha + dt * 3)
      if (gate.warning > 0) gate.warning = Math.max(0, gate.warning - dt)
      else gate.active -= dt
      if (this.phaseStage === 'exit') gate.active = Math.min(gate.active, 0)
      if (gate.active <= 0) gate.alpha -= dt * 2.5
      if (gate.alpha <= 0) continue
      if (gate.warning <= 0 && gate.active > 0 && this.phaseStage === 'active') {
        const axis = gate.orientation === 'horizontal' ? this.ship.x : this.ship.y
        const across = gate.orientation === 'horizontal' ? this.ship.y : this.ship.x
        const inBand = Math.abs(across - gate.pos) < this.ship.r + 5
        const inGap = Math.abs(axis - gate.gap) < gate.gapSize / 2 - this.ship.r * 0.35
        if (inBand && !inGap && this.ship.inv <= 0 && this.pShield <= 0) this.damageShip()
      }
      next.push(gate)
    }
    this.laserGates = next
  }

  private queueMeteorWave() {
    const corridors = [0.22, 0.7, 0.42, 0.78, 0.3, 0.58]
    this.meteorWaves.push({
      t: 1.1,
      kind: this.meteorWaveIndex % 2 === 0 ? 'diagonal' : 'horizontal',
      gap: corridors[this.meteorWaveIndex % corridors.length],
      spawned: false,
    })
    this.meteorWaveIndex++
  }

  private releaseMeteorWave(wave: MeteorWave) {
    const r = Math.max(20, Math.min(34, Math.min(this.w, this.h) * 0.045))
    if (wave.kind === 'diagonal') {
      const gapX = wave.gap * this.w
      const gapW = Math.max(125, this.w * 0.24)
      for (let x = r; x < this.w + r; x += r * 1.65) {
        if (Math.abs(x - gapX) < gapW / 2) continue
        this.asteroids.push({ x, y: -r * 2 - Math.abs(x - this.w / 2) * 0.12, vx: this.meteorWaveIndex % 4 < 2 ? 72 : -72, vy: 175, r, hp: 4, spin: rand(-2, 2), rot: rand(0, 6), verts: [], kind: 'nebula', alpha: 1 })
      }
    } else {
      const gapY = wave.gap * this.h
      const gapH = Math.max(125, this.h * 0.22)
      const fromLeft = this.meteorWaveIndex % 4 < 2
      for (let y = r * 2; y < this.h - r; y += r * 1.65) {
        if (Math.abs(y - gapY) < gapH / 2) continue
        this.asteroids.push({ x: fromLeft ? -r * 2 : this.w + r * 2, y, vx: (fromLeft ? 1 : -1) * 205, vy: 20, r, hp: 4, spin: rand(-2, 2), rot: rand(0, 6), verts: [], kind: 'nebula', alpha: 1 })
      }
    }
  }

  private updateMeteorSlalom(dt: number) {
    if (this.phaseStage === 'exit') this.meteorWaves.length = 0
    this.meteorSpawnT -= dt
    if (this.phaseStage === 'active' && this.meteorSpawnT <= 0) {
      const late = this.phaseT > 16
      this.meteorSpawnT = late ? 2.25 : 2.75
      this.queueMeteorWave()
    }
    const waves: MeteorWave[] = []
    for (const wave of this.meteorWaves) {
      wave.t -= dt
      if (!wave.spawned && wave.t <= 0) { wave.spawned = true; this.releaseMeteorWave(wave) }
      if (wave.t > -0.35) waves.push(wave)
    }
    this.meteorWaves = waves
    const next: Asteroid[] = []
    for (const a of this.asteroids) {
      a.x += a.vx * dt; a.y += a.vy * dt; a.rot += a.spin * dt
      if (a.y > this.h + 70 || a.y < -100 || a.x < -100 || a.x > this.w + 100) continue
      if (this.phaseStage === 'active' && dist(a, this.ship) < a.r + this.ship.r) {
        if (this.pShield > 0) playShield()
        else if (this.ship.inv <= 0) this.damageShip()
      }
      next.push(a)
    }
    this.asteroids = next
  }

  private retireWorld() {
    for (const bar of this.laserBars) {
      // guarantee it clears the bottom of the frame in under ~0.9s
      bar.vy = Math.max(bar.vy * 1.6, (this.h + 60 - bar.y) / 0.9)
      this.retiring.push({ type: 'bar', bar, alpha: 1 })
    }
    for (const d of this.drones) {
      if (d.orbit) {
        // fly straight out, radially away from the arena centre with a downward bias
        let ox = d.x - d.orbit.cx, oy = d.y - d.orbit.cy
        const len = Math.hypot(ox, oy) || 1
        ox /= len; oy /= len
        d.exitVX = ox * 240
        d.exitVY = oy * 240 + 140
      } else {
        d.exitVX = d.vx
        d.exitVY = 0
      }
      this.retiring.push({ type: 'drone', drone: d, alpha: 1 })
    }
    this.laserBars.length = 0
    this.drones.length = 0
  }

  private updateRetiring(dt: number) {
    if (this.retiring.length === 0) return
    const next: Retiring[] = []
    for (const r of this.retiring) {
      if (r.type === 'bar' && r.bar) {
        r.bar.y += r.bar.vy * dt
        if (r.bar.y > this.h + 40) continue
      } else if (r.type === 'drone' && r.drone) {
        const d = r.drone
        d.t += dt
        d.x += (d.exitVX ?? d.vx) * dt
        d.y += (d.exitVY ?? 0) * dt
        if (d.x < -60 || d.x > this.w + 60 || d.y > this.h + 60 || d.y < -60) continue
      } else {
        continue
      }
      next.push(r)
    }
    this.retiring = next
  }

  private updateDrones(dt: number) {
    const sentinelPhase = this.course === 'nebula' && this.phaseIdx === 1
    const kamikazePhase = this.course === 'nebula' && this.phaseIdx === 2
    if (sentinelPhase) {
      if (this.phaseStage !== 'exit' && this.sentinelsSpawned < 3) {
        this.spawnT -= dt
        if (this.spawnT <= 0) { this.spawnT = 0.28; this.spawnLaserSentinel(); this.sentinelsSpawned++ }
      }
    } else if (kamikazePhase) {
      this.spawnT -= dt
      const cap = this.phaseT < 12 ? 3 : 5
      if (this.phaseStage !== 'exit' && this.spawnT <= 0 && this.drones.length < cap) {
        this.spawnT = this.phaseT < 12 ? 1.75 : 1.3
        this.spawnKamikaze()
      }
    } else {
      this.spawnT -= dt
      const rate = this.phaseIdx === 2 ? 0.6 : 0.55
      // cap concurrent drones so the row is never fully saturated by beams
      if (this.phaseStage !== 'exit' && this.spawnT <= 0 && this.drones.filter(d => !d.orbit).length < 5) {
        this.spawnT = rate
        this.spawnDrone()
      }
    }
    const next: Drone[] = []
    for (const d of this.drones) {
      d.t += dt
      d.alpha = Math.min(1, (d.alpha ?? 0) + dt / SPAWN_FADE)
      if (d.kind === 'mob-kamikaze') {
        d.warning = Math.max(0, (d.warning ?? 0) - dt)
        if ((d.warning ?? 0) <= 0 && this.phaseStage === 'active') {
          const targetAngle = Math.atan2(this.ship.y - d.y, this.ship.x - d.x)
          let delta = targetAngle - (d.heading ?? targetAngle)
          delta = Math.atan2(Math.sin(delta), Math.cos(delta))
          d.heading = (d.heading ?? targetAngle) + Math.max(-1.45 * dt, Math.min(1.45 * dt, delta))
          const speed = 142
          d.vx = Math.cos(d.heading) * speed
          d.vy = Math.sin(d.heading) * speed
          d.x += d.vx * dt
          d.y += d.vy * dt
        }
      } else if (d.orbit) {
        // persistent sentinel — elliptical orbit around the arena centre
        d.orbit.phase += d.orbit.speed * dt
        const ox = d.orbit.cx + Math.cos(d.orbit.phase) * d.orbit.r
        const oy = d.orbit.cy + Math.sin(d.orbit.phase) * d.orbit.r * 0.62
        if (d.enterX !== undefined && (d.alpha ?? 1) < 1) {
          const k = d.alpha ?? 0
          d.x = d.enterX + (ox - d.enterX) * k
          d.y = (d.enterY ?? -50) + (oy - (d.enterY ?? -50)) * k
        } else {
          const timing = this.sentinelTiming(d)
          if (timing.warning || timing.firing) {
            if (d.lockedX === undefined) { d.lockedX = d.x; d.lockedY = d.y }
            d.x = d.lockedX; d.y = d.lockedY ?? d.y
          } else {
            d.lockedX = undefined; d.lockedY = undefined
            d.x = ox; d.y = oy
          }
        }
      } else {
        d.x += d.vx * dt
        d.y += Math.sin(d.t * 3) * 40 * dt
        if (d.x < -60 || d.x > this.w + 60) continue
      }
      // beams only deal damage once the drone is mostly visible
      if (this.phaseStage === 'active' && (d.alpha ?? 1) > 0.5) {
        if (d.orbit) this.updateSentinelLaser(d, dt)
        else this.updateLaser(d, dt)
      }
      // shoot at ship (scouts only; laser mobs use their beam)
      if (this.phaseStage === 'active' && d.kind !== 'mob-laser' && d.kind !== 'mob-kamikaze' && Math.random() < dt * 1.2) {
        const a = Math.atan2(this.ship.y - d.y, this.ship.x - d.x)
        this.bullets.push({ x: d.x, y: d.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, r: 4, friendly: false })
      }
      if (dist(d, this.ship) < d.r + this.ship.r) {
        if (d.kind === 'mob-kamikaze') {
          this.burst(d.x, d.y, 24, '#ff4b3a')
          this.shake = Math.max(this.shake, 8)
          playExplosion(0.7)
          if (this.pShield > 0) playShield()
          else if (this.ship.inv <= 0) this.damageShip()
          d.hp = 0
        } else if (this.phaseStage === 'active' && this.ship.inv <= 0) {
          this.damageShip(); d.hp = 0
        }
      }
      next.push(d)
    }
    this.drones = next
  }

  private updateAsteroidsNoSpawn(dt: number) {
    const next: Asteroid[] = []
    for (const a of this.asteroids) {
      a.x += a.vx * dt; a.y += a.vy * dt; a.rot += a.spin * dt
      if (a.y > this.h + 60) continue
      next.push(a)
    }
    this.asteroids = next
  }

  private updateDronesNoSpawn(dt: number) {
    const next: Drone[] = []
    for (const d of this.drones) {
      d.t += dt
      d.alpha = Math.min(1, (d.alpha ?? 0) + dt / SPAWN_FADE)
      if (d.orbit) {
        d.orbit.phase += d.orbit.speed * dt
        const ox = d.orbit.cx + Math.cos(d.orbit.phase) * d.orbit.r
        const oy = d.orbit.cy + Math.sin(d.orbit.phase) * d.orbit.r * 0.62
        if (d.enterX !== undefined && (d.alpha ?? 1) < 1) {
          const k = d.alpha ?? 0
          d.x = d.enterX + (ox - d.enterX) * k
          d.y = (d.enterY ?? -50) + (oy - (d.enterY ?? -50)) * k
        } else { d.x = ox; d.y = oy }
      } else {
        d.x += d.vx * dt
        d.y += Math.sin(d.t * 3) * 40 * dt
        if (d.x < -60 || d.x > this.w + 60) continue
      }
      if (this.phaseStage === 'active' && (d.alpha ?? 1) > 0.5) {
        if (d.orbit) this.updateSentinelLaser(d, dt)
        else this.updateLaser(d, dt)
      }
      // still shoot at ship (scouts only; laser mobs use their beam)
      if (this.phaseStage === 'active' && d.kind !== 'mob-laser' && d.kind !== 'mob-kamikaze' && Math.random() < dt * 1.2) {
        const a = Math.atan2(this.ship.y - d.y, this.ship.x - d.x)
        this.bullets.push({ x: d.x, y: d.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, r: 4, friendly: false })
      }
      if (this.phaseStage === 'active' && this.ship.inv <= 0 && dist(d, this.ship) < d.r + this.ship.r) { this.damageShip(); d.hp = 0 }
      next.push(d)
    }
    this.drones = next
  }

  private spawnBoss() {
    const kind: DesignId = this.course === 'nebula' ? 'boss-orochi' : 'boss-nemesis'
    // the serpent is a longer, tankier-style fight, but slightly less hp than the warden
    const maxHp = kind === 'boss-orochi' ? 360 : BOSS_MAX
    this.boss = { x: this.w / 2, y: -140, r: 84, hp: maxHp, maxHp, t: 0, pattern: 0, tele: 0, atk: 0, dying: false, deathT: 0, kind, portalT: 0, portalIndex: 0 }
    if (kind === 'boss-orochi') {
      const b = this.boss
      const length = Math.hypot(this.w, this.h)
      const spacing = length / SNAKE_SEGS
      const trail: BossTrailNode[] = []
      for (let i = 0; i <= SNAKE_SEGS; i++) {
        trail.push({ d: i * spacing, x: this.w / 2, y: -140 - (length - i * spacing) })
      }
      b.snake = {
        portals: [], tunnels: [], trail, dist: length, targetPortal: -1,
        targetPath: [], targetIdx: 0,
        segs: [], prevSegs: [], spacing, length,
        mode: 'idle', modeT: 0.4, moveT: 0,
        moveTarget: null,
        vel: { x: 0, y: 0 }, slint: Math.random() * Math.PI * 2,
        speed: SNAKE_SPEED, attackIndex: 0, dashCount: 3, dashIndex: 0,
        dashFrom: null, dashTo: null, transitPhase: 'in', transitT: -1, transitDir: { x: 0, y: 1 }, echoes: [], sweep: null, nova: null, rings: [], lasers: [], novaDone: false,
        attackT: PHASE_INTRO, teleportT: rand(1.6, 2.4),
      }
    }
    // spawn a few fractured asteroids for powerup opportunities
    for (let i = 0; i < 4; i++) {
      const r = rand(22, 36)
      const verts: number[] = []
      const n = 8
      for (let j = 0; j < n; j++) verts.push(rand(0.72, 1.12))
      this.asteroids.push({
        x: rand(50, this.w - 50), y: rand(-200, -60),
        vx: rand(-20, 20), vy: rand(40, 80),
        r, hp: Math.round(r / 14), spin: rand(-2, 2), rot: rand(0, 6), verts,
        kind: 'fractured',
      })
    }
  }

  private updateBoss(dt: number) {
    const b = this.boss!
    b.t += dt
    if (!b.snake) {
      b.y += (this.h * 0.22 - b.y) * Math.min(1, dt * 2)
      b.x = this.w / 2 + Math.sin(b.t * 0.7) * this.w * 0.24
    }
    // periodically spawn fractured asteroids for powerup drops
    this.bossAsteroidT -= dt
    if (this.bossAsteroidT <= 0) {
      this.bossAsteroidT = rand(3, 5)
      const r = rand(22, 36)
      const verts: number[] = []
      const n = 8
      for (let j = 0; j < n; j++) verts.push(rand(0.72, 1.12))
      this.asteroids.push({
        x: rand(50, this.w - 50), y: -50,
        vx: rand(-20, 20), vy: rand(40, 80),
        r, hp: Math.round(r / 14), spin: rand(-2, 2), rot: rand(0, 6), verts,
        kind: 'fractured',
      })
    }
    if (b.dying) {
      b.deathT += dt
      // staggered core flashes building toward the detonation
      if (b.deathT > 0.5 && b.deathT < 1.5) {
        const flashes = Math.floor(b.deathT / 0.2)
        if (flashes !== this.dyingFlashCount) {
          this.dyingFlashCount = flashes
          if (b.snake && b.snake.segs.length > 0) {
            const seg = b.snake.segs[Math.floor(Math.random() * b.snake.segs.length)]
            this.burst(seg.x, seg.y, 8, '#fecdd3')
          } else {
            this.burst(b.x, b.y, 8, '#fecdd3')
          }
          this.shake = 6
        }
      }
      if (b.deathT >= 1.5) {
        if (b.snake) {
          for (let i = 0; i < b.snake.segs.length; i += 3) {
            const seg = b.snake.segs[i]
            this.burst(seg.x, seg.y, 14, '#fbbf24')
          }
        }
        this.burst(b.x, b.y, 60, '#fbbf24')
        this.burst(b.x, b.y, 40, '#f97316')
        this.burst(b.x, b.y, 30, '#ec4899')
        this.burst(b.x, b.y, 30, '#ffffff')
        this.shake = 24
        playExplosion()
        this.boss = null
        this.beam = null
        this.beam2 = null
        this.bossFlash = 0
        this.dyingFlashCount = 0
        this.clearing = true
        this.state = 'clear'
        this.clearDelay = this.CLEAR_SCORE_DELAY
        playLevelComplete()
        this.emit()
      }
      return
    }
    const frac = b.hp / b.maxHp
    const pattern = frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2
    if (pattern !== b.pattern) {
      b.pattern = pattern
      b.tele = 1.2
      this.beam = null
      this.beam2 = null
      if (b.snake) {
        // phase transition — clear old threats and reconfigure
        b.snake.rings = []
        b.snake.lasers = []
        b.snake.sweep = null
        b.snake.nova = null
        b.snake.mode = 'idle'
        b.snake.modeT = 0
        b.snake.attackT = 2.2
        b.snake.attackIndex = 0
        b.snake.dashCount = pattern + 3
        b.snake.dashIndex = 0
        b.snake.novaDone = false
        b.snake.speed = SNAKE_SPEED * (pattern === 0 ? 1 : pattern === 1 ? 1.35 : 1.75)
      } else {
        // spawn boss drones on phase 2 and 3
        const count = pattern === 1 ? 3 : pattern === 2 ? 3 : 0
        for (let i = 0; i < count; i++) {
          const fromLeft = i % 2 === 0
          this.drones.push({
            x: fromLeft ? -24 : this.w + 24,
            y: 60 + i * 50,
            vx: (fromLeft ? 1 : -1) * rand(100, 160),
            vy: 0, r: 22, t: rand(0, 6),
            hp: 2,
            kind: 'mob-scout-drone' as DesignId,
          })
        }
      }
    }
    if (b.snake) {
      this.updateSnake(b, b.snake, dt)
    } else {
      // Warden (non-snake) — bullet fan + expanding circle beams (original behavior)
      b.tele = Math.max(0, b.tele - dt)
      const rate = pattern === 0 ? 1.1 : pattern === 1 ? 1.8 : 1.7
      b.atk -= dt
      if (b.atk <= 0 && b.tele <= 0) {
        b.atk = rate
        // shooting (all phases)
        const spread = pattern === 0 ? 3 : pattern === 1 ? 3 : 4
        for (let i = 0; i < spread; i++) {
          const base = pattern === 2
            ? Math.atan2(this.ship.y - b.y, this.ship.x - b.x)
            : Math.PI / 2
          const a = base + (i - (spread - 1) / 2) * 0.2
          this.bullets.push({ x: b.x, y: b.y + 30, vx: Math.cos(a) * (pattern === 2 ? 250 : 240), vy: Math.sin(a) * (pattern === 2 ? 250 : 240), r: 5, friendly: false })
        }
        // circle beam (all phases)
        if (!this.beam) {
          const gapSize = pattern === 0 ? 0.18 : pattern === 1 ? 0.14 : 0.12
          this.beam = {
            cx: b.x, cy: b.y, radius: b.r,
            speed: pattern === 0 ? 160 : pattern === 1 ? 180 : 195,
            maxR: Math.max(this.w, this.h) * 0.9,
            gap: gapSize, gapAngle: Math.PI / 2 + (Math.random() * 0.9 - 0.45),
            width: 6
          }
          if (pattern === 2) this.beam2Delay = 1
        }
        // second beam (phase 3 only, fires 1s after first beam)
        if (pattern === 2 && this.beam && !this.beam2 && this.beam2Delay <= 0) {
          this.beam2 = {
            cx: b.x, cy: b.y, radius: b.r,
            speed: 195, maxR: Math.max(this.w, this.h) * 0.9,
            gap: 0.12, gapAngle: Math.PI / 2 + (Math.random() * 0.9 - 0.45),
            width: 6
          }
        }
        if (pattern >= 1) this.burst(b.x, b.y, 6, '#fb7185')
      }
      // body collision with ship
      if (this.pShield > 0) {
        if (dist(b, this.ship) < b.r + this.ship.r + 14) {
          this.burst(this.ship.x, this.ship.y, 6, '#22d3ee')
          playShield()
        }
      } else if (!b.dying && this.ship.inv <= 0) {
        if (dist(b, this.ship) < b.r + this.ship.r) this.damageShip()
      }
    }
  }

  private updateSnake(b: Boss, sn: BossSnake, dt: number) {
    const active = this.phaseStage === 'active'
    sn.modeT += dt
    // ambient drifting during idle/recover
    const arenaL = 30, arenaR = this.w - 30, arenaT = 42, arenaB = this.h * 0.72
    const moving = sn.mode === 'idle' || sn.mode === 'recover' || sn.mode === 'ring' || sn.mode === 'attack'
    if (moving) {
      // free-flight: glide in a direction, bounce off the arena edges/corners
      if (sn.mode === 'attack' && b.pattern === 2 && Math.random() < dt * 6) {
        // unstable phase — erratic jitter
        b.x += rand(-20, 20); b.y += rand(-20, 20)
        sn.dist += 24
        this.pushTrailNode(sn, b.x, b.y)
      } else {
        const sp = sn.speed * (b.pattern === 2 ? 1.3 : b.pattern === 1 ? 1.05 : 0.85)
        // re-aim toward a fresh random point once we reach the current one
        let tgt = sn.moveTarget
        if (!tgt || Math.hypot(tgt.x - b.x, tgt.y - b.y) < 24) {
          tgt = sn.moveTarget = this.pickFlyTarget(b, arenaL, arenaR, arenaT, arenaB)
        }
        const dx = tgt.x - b.x, dy = tgt.y - b.y
        const len = Math.hypot(dx, dy) || 1
        // slither: add a sinusoidal lateral wobble (perpendicular to the
        // heading) so the head undulates and the trail-following body snakes
        // along instead of flying a straight line. Phase accumulates with
        // distance so the wavelength stays fixed in world space.
        sn.slint += sp * dt
        const wob = Math.sin(sn.slint / 130 * Math.PI * 2) * 0.8
        const wx = dx / len - (dy / len) * wob
        const wy = dy / len + (dx / len) * wob
        const wl = Math.hypot(wx, wy) || 1
        sn.vel = { x: wx / wl, y: wy / wl }
        b.x += sn.vel.x * sp * dt
        b.y += sn.vel.y * sp * dt
        sn.dist += sp * dt
        this.pushTrailNode(sn, b.x, b.y)
      }
      // bounce off the arena boundaries
      if (b.x < arenaL) { b.x = arenaL; sn.vel.x = Math.abs(sn.vel.x); sn.moveTarget = null }
      else if (b.x > arenaR) { b.x = arenaR; sn.vel.x = -Math.abs(sn.vel.x); sn.moveTarget = null }
      if (b.y < arenaT) { b.y = arenaT; sn.vel.y = Math.abs(sn.vel.y); sn.moveTarget = null }
      else if (b.y > arenaB) { b.y = arenaB; sn.vel.y = -Math.abs(sn.vel.y); sn.moveTarget = null }
    }
    // ---- frequent cross-screen teleport chain
    if (sn.mode === 'idle' || sn.mode === 'recover') {
      sn.teleportT -= dt
      if (sn.teleportT <= 0 && !sn.nova) {
        sn.mode = 'telegraph'
        sn.modeT = 0
        sn.targetPath = []
        sn.teleportT = 0
      }
    }
    if (sn.mode === 'telegraph') {
      if (sn.modeT >= 0.5 && sn.targetPath.length === 0) {
        const pts = this.buildTeleportPath(b)
        sn.targetPath = pts
        sn.targetIdx = 0
        sn.targetPortal = 0
        this.openPortals(sn, pts, b, b.pattern)
      }
      if (sn.modeT >= 0.7 && sn.targetPath.length > 0) this.beginTransit(sn)
    } else if (sn.mode === 'transit') {
      const entry = sn.targetPath[0]
      const exit = sn.targetPath[1]
      const bodyLen = sn.length
      const penStep = (bodyLen / SWALLOW_DUR) * dt   // drive the head through the portal so the whole body is consumed in SWALLOW_DUR
      if (sn.transitPhase === 'in') {
        if (sn.transitT < 0) {
          // approach: the visible serpent slithers toward the entry portal
          const step = sn.speed * 1.7 * dt
          const dx = entry.x - b.x, dy = entry.y - b.y
          const len = Math.hypot(dx, dy) || 1
          sn.slint += step
          const wob = Math.sin(sn.slint / 130 * Math.PI * 2) * 0.55
          const wx = dx / len - (dy / len) * wob
          const wy = dy / len + (dx / len) * wob
          const wl = Math.hypot(wx, wy) || 1
          sn.transitDir = { x: wx / wl, y: wy / wl }
          if (len <= step + 12) {
            // reached the mouth — begin being swallowed head-first
            b.x = entry.x; b.y = entry.y
            sn.transitT = 0
            this.spawnShockwave(entry.x, entry.y, '#22d3ee')
            this.burst(entry.x, entry.y, 8, '#a78bfa')
          } else {
            b.x += sn.transitDir.x * step; b.y += sn.transitDir.y * step
            sn.dist += step
            this.pushTrailNode(sn, b.x, b.y)
          }
        } else {
          // swallow: the head is driven through the portal; the body follows the
          // trail and is consumed head-first (front segments hidden as they pass in)
          sn.transitT += penStep
          b.x += sn.transitDir.x * penStep
          b.y += sn.transitDir.y * penStep
          sn.dist += penStep
          this.pushTrailNode(sn, b.x, b.y)
          if (sn.transitT >= bodyLen) {
            // fully consumed — a short beat where it simply does not exist
            sn.trail = []
            sn.tunnels = []
            sn.dist = 0
            sn.transitPhase = 'void'
            sn.transitT = 0.12
            this.spawnShockwave(entry.x, entry.y, '#a78bfa')
          }
        }
      } else if (sn.transitPhase === 'void') {
        // not rendered, no collision, untargetable
        sn.transitT -= dt
        if (sn.transitT <= 0) {
          // emerge: the head comes out of the exit portal first, then the body
          b.x = exit.x; b.y = exit.y
          sn.tunnels = []
          sn.trail = []
          sn.dist = 0
          this.pushTrailNode(sn, b.x, b.y)
          sn.transitPhase = 'out'
          sn.transitT = 0
          this.spawnShockwave(exit.x, exit.y, '#22d3ee')
          this.spawnShockwave(exit.x, exit.y, '#a78bfa')
          this.burst(exit.x, exit.y, 10, '#f472b6')
        }
      } else {
        // emerge: the head flies out of the exit toward the open arena while the
        // body is revealed head-first (front segments shown as they stream out
        // over EMERGE_DUR). The tail bunches at the mouth until the boss flies
        // off in free-flight and the body stretches back to full length.
        const acx = this.w / 2, acy = (42 + this.h * 0.72) / 2
        const dxc = acx - b.x, dyc = acy - b.y
        const lc = Math.hypot(dxc, dyc)
        const emStep = lc > 0.5 ? Math.min(lc, 620 * dt) : 0
        if (emStep > 0) {
          b.x += dxc / lc * emStep
          b.y += dyc / lc * emStep
          sn.dist += emStep
          this.pushTrailNode(sn, b.x, b.y)
        }
        sn.transitT += dt
        if (sn.transitT >= EMERGE_DUR) {
          sn.mode = 'attack'
          sn.modeT = 0
          sn.targetPortal = 1
          sn.moveTarget = null
          this.afterTeleport(sn, b)
        }
      }
    } else if (sn.mode === 'attack') {
      sn.attackT -= dt
      if (sn.attackT <= 0) this.endAttack(sn, b)
    }
    // ---- rings
    this.updateRings(sn, dt)
    // ---- body sweep
    this.updateSweep(sn, b, dt, active)
    // ---- nova (final)
    this.updateNova(sn, b, dt, active)
    // ---- lasers
    this.updateLasers(sn, dt, active)
    // ---- echoes
    this.updateEchoes(sn, b, dt)
    this.updatePortals(sn, dt)
    // build body segments
    sn.prevSegs = sn.segs
    const inSwallow = sn.mode === 'transit' && sn.transitPhase === 'in' && sn.transitT >= 0
    const inEmerge = sn.mode === 'transit' && sn.transitPhase === 'out'
    const voided = sn.mode === 'transit' && sn.transitPhase === 'void'
    // how many front body-segments are already consumed (swallow, by distance)
    // or revealed (emerge, by timer) — always head-first
    let count = 0
    if (inSwallow) count = Math.min(SNAKE_SEGS, Math.floor(sn.transitT / sn.spacing))
    else if (inEmerge) count = Math.min(SNAKE_SEGS, Math.floor((sn.transitT / EMERGE_DUR) * SNAKE_SEGS))
    // head is hidden once it is inside the portal (swallowing) or fully gone (void)
    const headHidden = voided || inSwallow
    const segs: BossSnakeSeg[] = [{ x: b.x, y: b.y, r: 26, hidden: headHidden, color: '#ffffff' }]
    for (let i = 1; i <= SNAKE_SEGS; i++) {
      const p = this.resolveSnakePoint(sn, sn.dist - i * sn.spacing)
      const taper = 1 - i / (SNAKE_SEGS + 4)
      const outside = p.x < -36 || p.x > this.w + 36 || p.y < -36 || p.y > this.h + 36
      let hidden = p.hidden || outside
      if (voided) hidden = true
      else if (inSwallow) hidden = hidden || i <= count     // front consumed first, tail still out
      else if (inEmerge) hidden = hidden || i > count       // front revealed first, tail still in
      segs.push({ x: p.x, y: p.y, r: 7 + 15 * taper + Math.sin(b.t * 6 - i * 0.35) * 1.2, hidden, color: p.color })
    }
    sn.segs = segs
    // body-vs-ship collision (swept on the moving segments)
    if (active && sn.prevSegs.length === segs.length) {
      for (let i = 1; i < segs.length; i++) {
        const a = sn.prevSegs[i], z = segs[i]
        if (a.hidden || z.hidden) continue
        const vx = z.x - a.x, vy = z.y - a.y
        const denom = vx * vx + vy * vy || 1
        const u = Math.max(0, Math.min(1, ((this.ship.x - a.x) * vx + (this.ship.y - a.y) * vy) / denom))
        if (Math.hypot(this.ship.x - (a.x + vx * u), this.ship.y - (a.y + vy * u)) < this.ship.r + z.r) {
          if (this.pShield > 0) { this.burst(this.ship.x, this.ship.y, 5, '#22d3ee'); playShield() }
          else if (this.ship.inv <= 0) this.damageShip()
          break
        }
      }
    }
  }

  /** A random point anywhere in the fly arena (corners & sides included). */
  private pickFlyTarget(b: { x: number; y: number }, l: number, r: number, t: number, bt: number): { x: number; y: number } {
    const m = 34
    for (let i = 0; i < 8; i++) {
      const x = rand(l + m, r - m), y = rand(t + m, bt - m)
      if (Math.hypot(x - b.x, y - b.y) < 90) continue
      return { x, y }
    }
    return { x: l + m, y: t + m }
  }

  /** Pick a safe, distant teleport destination, biased to the far side of the arena. */
  private pickTeleportPoint(b: { x: number; y: number }): { x: number; y: number } {
    const l = 34, r = this.w - 34, t = 46, bt = this.h * 0.7
    const biasFar = Math.random() < 0.75 // most of the time, jump across the screen
    for (let i = 0; i < 14; i++) {
      let x: number, y: number
      if (biasFar) {
        const farLeft = b.x > this.w / 2
        x = farLeft ? rand(l, this.w * 0.42) : rand(this.w * 0.58, r)
        y = rand(t, bt)
        // occasionally bias to a corner for a big diagonal warp
        if (Math.random() < 0.4) {
          x = Math.random() < 0.5 ? rand(l, this.w * 0.28) : rand(this.w * 0.72, r)
          y = Math.random() < 0.5 ? rand(t, this.h * 0.22) : rand(this.h * 0.42, bt)
        }
      } else {
        x = rand(l, r); y = rand(t, bt)
      }
      if (Math.hypot(x - b.x, y - b.y) < 160) continue
      if (Math.hypot(x - this.ship.x, y - this.ship.y) < 170) continue
      return { x, y }
    }
    return { x: b.x > this.w / 2 ? l : r, y: t + 20 }
  }

  private buildTeleportPath(b: Boss): Array<{ x: number; y: number }> {
    // [entry, exit] — the exit is where the boss lands and attacks.
    const entry = this.pickTeleportPoint(b)
    const out = this.pickTeleportPoint(entry)
    return [entry, out]
  }

  private openPortals(sn: BossSnake, pts: Array<{ x: number; y: number }>, b: Boss, pattern: number) {
    // life must cover the visible fly-in + the void + a buffer (the slithering
    // approach is ~12% slower than a straight line, hence the 0.88 factor)
    const flight = Math.hypot(pts[0].x - b.x, pts[0].y - b.y) / (sn.speed * 1.7 * 0.88)
    const life = Math.min(3.4, 1.1 + flight + 0.5)
    const decoyCount = pattern === 2 ? 2 : 0
    const portals: BossPortal[] = pts.map((p, i) => ({
      x: p.x, y: p.y, r: 30, color: PORTAL_COLORS[(i + sn.attackIndex) % PORTAL_COLORS.length],
      life, max: life, role: i === pts.length - 1 ? 'out' : 'in', spin: rand(-2, 2), flash: 1,
    }))
    for (let i = 0; i < decoyCount; i++) {
      const e = i === 0 ? 'left' : 'right'
      const dx = e === 'left' ? 40 : this.w - 40
      const dy = rand(120, this.h - 260)
      if (Math.hypot(dx - this.ship.x, dy - this.ship.y) < 150) continue
      portals.push({ x: dx, y: dy, r: 30, color: PORTAL_COLORS[(i + 3) % PORTAL_COLORS.length], life, max: life, role: 'decoy', spin: rand(-3, 3), flash: 1 })
    }
    sn.portals = portals
    this.spawnShockwave(b.x, b.y, '#a78bfa')
  }

  private beginTransit(sn: BossSnake) {
    // the serpent flies the visible body into the entry portal, is swallowed
    // head-first (each part vanishing as it reaches the mouth), blinks out of
    // existence in the void, then re-emerges at the exit portal head-first.
    sn.transitPhase = 'in'
    sn.transitT = -1           // <0 => still approaching the entry portal
    sn.transitDir = { x: 0, y: 1 }
    sn.dashFrom = null
    sn.dashTo = null
    sn.mode = 'transit'
    sn.modeT = 0
  }

  private afterTeleport(sn: BossSnake, b: Boss) {
    const p = b.pattern
    sn.attackIndex++
    if (p === 0) {
      // teach the mechanic: a small forward fan + a single telegraphed ring
      const base = Math.atan2(this.ship.y - b.y, this.ship.x - b.x)
      for (let i = -2; i <= 2; i++) {
        const a = base + i * 0.28
        this.bullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 180, vy: Math.sin(a) * 180, r: 5, friendly: false })
      }
      this.ringAttack(sn, b, 5, 120, 0.4)
    } else if (p === 1) {
      // larger aimed spread + echo volley + a ring
      const base = Math.atan2(this.ship.y - b.y, this.ship.x - b.x)
      for (let i = -3; i <= 3; i++) {
        const a = base + i * 0.22
        this.bullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, r: 5, friendly: false })
      }
      for (const e of sn.echoes) {
        const ea = Math.atan2(this.ship.y - e.y, this.ship.x - e.x)
        for (let i = -1; i <= 1; i++) {
          const a = ea + i * 0.26
          this.bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, r: 4, friendly: false })
        }
      }
      this.ringAttack(sn, b, 7, 150, 0.45)
    } else {
      // unstable: dense spiral + double ring + a homing laser
      for (let i = 0; i < 12; i++) {
        const a = sn.attackIndex * 0.5 + i * (Math.PI * 2 / 12)
        this.bullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 180, vy: Math.sin(a) * 180, r: 5, friendly: false })
      }
      this.ringAttack(sn, b, 8, 165, 0.5)
      const la = Math.atan2(this.ship.y - b.y, this.ship.x - b.x)
      sn.lasers.push({ x: b.x, y: b.y, angle: la, t: 0, warn: 0.7, grow: 0.35, fire: 0.5, width: 6, len: Math.hypot(this.w, this.h), spin: 0 })
    }
    if (p >= 1) this.spawnShockwave(b.x, b.y, '#f472b6')
  }

  private endAttack(sn: BossSnake, b: Boss) {
    // after an attack, either chain another teleport or take a breather
    const chain = b.pattern >= 1 && Math.random() < (b.pattern === 1 ? 0.5 : 0.65)
    if (chain && sn.dashIndex < sn.dashCount) {
      sn.mode = 'telegraph'
      sn.modeT = 0
      sn.targetPath = []
      sn.targetIdx = 0
      sn.dashIndex++
    } else {
      sn.mode = 'recover'
      sn.modeT = 0
      sn.moveT = 0
      sn.dashIndex = 0
      sn.dashCount = b.pattern + 3
      sn.echoes.length = 0
      sn.portals.length = 0
      // brief breather, then straight back to a new teleport
      sn.teleportT = b.pattern === 2 ? rand(0.9, 1.3) : b.pattern === 1 ? rand(1.1, 1.6) : rand(1.4, 2.0)
    }
  }

  private ringAttack(sn: BossSnake, b: Boss, n: number, speed: number, gap: number) {
    const gapAngle = Math.atan2(this.ship.y - b.y, this.ship.x - b.x) + rand(-0.5, 0.5)
    sn.rings.push({ cx: b.x, cy: b.y, t: 0, warn: 0.5, fire: 0.9, n, speed, gap, gapAngle, r0: 40, width: 5, color: '#fb7185', hiColor: '#fecdd3' })
  }

  private updateRings(sn: BossSnake, dt: number) {
    const next: BossRing[] = []
    for (const r of sn.rings) {
      r.t += dt
      const local = r.t - r.warn
      if (local < 0) { next.push(r); continue }
      if (local < 0.05) {
        // release the ring (telegraphed during the warn window)
        for (let i = 0; i < r.n; i++) {
          const a = i * (Math.PI * 2 / r.n)
          if (Math.abs(normA(a - r.gapAngle)) < r.gap) continue
          this.bullets.push({ x: r.cx + Math.cos(a) * r.r0, y: r.cy + Math.sin(a) * r.r0, vx: Math.cos(a) * r.speed, vy: Math.sin(a) * r.speed, r: 5, friendly: false })
        }
        this.burst(r.cx, r.cy, 8, r.color)
        this.spawnShockwave(r.cx, r.cy, r.color)
      }
      if (local < r.fire) { next.push(r); continue }
    }
    sn.rings = next
  }

  private updateSweep(sn: BossSnake, b: Boss, dt: number, active: boolean) {
    if (!sn.sweep) {
      if (active && b.pattern === 2 && (sn.mode === 'attack' || sn.mode === 'recover') && sn.modeT > 1.4 && Math.random() < dt * 0.5) {
        const cw = Math.random() < 0.5
        const r0 = Math.min(this.w, this.h) * 0.22
        const a0 = Math.atan2(this.ship.y - b.y, this.ship.x - b.x) - (cw ? 1.9 : -1.9)
        sn.sweep = { t: 0, warn: 0.6, fire: 0.8, r0, r1: r0 + Math.max(this.w, this.h) * 0.5, a0, a1: a0 + (cw ? 3.8 : -3.8) }
      }
      return
    }
    const s = sn.sweep
    s.t += dt
    if (s.t < s.warn) return
    if (s.t < s.warn + s.fire) {
      const f = (s.t - s.warn) / s.fire
      const ang = s.a0 + (s.a1 - s.a0) * f
      const R = s.r0 + (s.r1 - s.r0) * f
      const ex = b.x + Math.cos(ang) * R
      const ey = b.y + Math.sin(ang) * R
      // hit if ship is near the sweep line segment (head -> tip), within the fan width
      const vx = ex - b.x, vy = ey - b.y
      const denom = vx * vx + vy * vy || 1
      const u = Math.max(0, Math.min(1, ((this.ship.x - b.x) * vx + (this.ship.y - b.y) * vy) / denom))
      const px = b.x + vx * u, py = b.y + vy * u
      const near = Math.hypot(this.ship.x - px, this.ship.y - py)
      if (active && near < this.ship.r + 22) {
        if (this.pShield > 0) { this.burst(this.ship.x, this.ship.y, 5, '#22d3ee'); playShield() }
        else if (this.ship.inv <= 0) this.damageShip()
      }
      return
    }
    sn.sweep = null
  }

  private updateNova(sn: BossSnake, b: Boss, dt: number, active: boolean) {
    if (!sn.nova) {
      if (active && b.pattern === 2 && !sn.novaDone && b.hp / b.maxHp < 0.12 && sn.mode === 'recover') {
        sn.nova = { t: 0, warn: 1.4, spin: 0 }
        sn.mode = 'nova'
      }
      return
    }
    const n = sn.nova
    n.t += dt
    n.spin += dt * (0.6 + (n.t / n.warn) * 4)
    if (n.t < n.warn) return
    // release: radial burst from the head
    sn.novaDone = true
    for (let ring = 0; ring < 3; ring++) {
      const cnt = 16 + ring * 4
      for (let i = 0; i < cnt; i++) {
        const a = i * (Math.PI * 2 / cnt) + ring * 0.2
        const sp = 150 + ring * 55
        this.bullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 5, friendly: false })
      }
    }
    for (let i = 0; i < sn.segs.length; i += 4) {
      const s = sn.segs[i]
      if (s.hidden) continue
      const a = Math.atan2(this.ship.y - s.y, this.ship.x - s.x)
      for (let j = -1; j <= 1; j++) this.bullets.push({ x: s.x, y: s.y, vx: Math.cos(a + j * 0.3) * 160, vy: Math.sin(a + j * 0.3) * 160, r: 5, friendly: false })
    }
    this.spawnShockwave(b.x, b.y, '#ffffff')
    this.spawnShockwave(b.x, b.y, '#f472b6')
    this.shake = 16
    sn.nova = null
    sn.mode = 'recover'
    sn.modeT = 0
    sn.attackT = 3
  }

  private updateLasers(sn: BossSnake, dt: number, active: boolean) {
    const next: BossLaser[] = []
    for (const l of sn.lasers) {
      l.t += dt
      if (l.spin !== 0) l.angle += l.spin * dt
      if (l.t < l.warn) continue
      if (l.t >= l.warn + l.grow) {
        // firing window
        if (active) {
          const dx = this.ship.x - l.x, dy = this.ship.y - l.y
          const fx = Math.sin(l.angle), fy = -Math.cos(l.angle)
          const proj = dx * fx + dy * fy
          const cross = Math.abs(dx * fy - dy * fx)
          if (proj >= 0 && proj <= l.len && cross < this.ship.r + l.width) {
            if (this.pShield > 0) { this.burst(this.ship.x, this.ship.y, 5, '#22d3ee'); playShield() }
            else if (this.ship.inv <= 0) this.damageShip()
          }
        }
      }
      if (l.t < l.warn + l.grow + l.fire) { next.push(l); continue }
    }
    sn.lasers = next
  }

  private updateEchoes(sn: BossSnake, b: Boss, dt: number) {
    const next: BossEcho[] = []
    for (const e of sn.echoes) {
      e.t += dt
      if (b.pattern === 1) {
        e.fireT -= dt
        if (e.fireT <= 0 && e.t < e.max - 0.2) {
          e.fireT = 1.1
          const a = Math.atan2(this.ship.y - e.y, this.ship.x - e.x)
          for (let i = -1; i <= 1; i++) {
            const aa = a + i * 0.24
            this.bullets.push({ x: e.x, y: e.y, vx: Math.cos(aa) * 185, vy: Math.sin(aa) * 185, r: 4, friendly: false })
          }
          this.burst(e.x, e.y, 4, '#c084fc')
        }
      }
      if (e.t < e.max) next.push(e)
    }
    sn.echoes = next
    // leave echoes on the head while it weaves (phase 1+)
    if (b.pattern >= 1 && (sn.mode === 'idle' || sn.mode === 'recover' || sn.mode === 'ring')) {
      if (sn.echoes.length < 2 && Math.random() < dt * 0.8) {
        sn.echoes.push({ x: b.x, y: b.y, t: 0, max: 2.0, fireT: 1.2, scale: 0.9 })
      }
    }
  }

  private updatePortals(sn: BossSnake, dt: number) {
    const next: BossPortal[] = []
    for (const p of sn.portals) {
      p.life -= dt
      p.flash = Math.max(0, p.flash - dt * 3)
      p.spin += dt
      if (p.life > 0) next.push(p)
    }
    sn.portals = next
  }

  private spawnShockwave(x: number, y: number, color: string) {
    this.shockwaves.push({ x, y, t: 0, max: 0.55, color, r0: 12, r1: 90 })
  }

  private updateShockwaves(dt: number) {
    const next: typeof this.shockwaves = []
    for (const s of this.shockwaves) {
      s.t += dt
      if (s.t < s.max) next.push(s)
    }
    this.shockwaves = next
  }

  private pushTrailNode(sn: BossSnake, x: number, y: number) {
    const last = sn.trail[sn.trail.length - 1]
    if (!last || Math.hypot(x - last.x, y - last.y) >= 3) sn.trail.push({ d: sn.dist, x, y })
    const minD = sn.dist - sn.length - 100
    while (sn.trail.length > 2 && sn.trail[0].d < minD) sn.trail.shift()
    while (sn.tunnels.length > 0 && sn.tunnels[0].d1 < minD) sn.tunnels.shift()
  }

  private resolveSnakePoint(sn: BossSnake, D: number): { x: number; y: number; hidden: boolean; color: string } {
    if (D < 0) D = 0
    for (const t of sn.tunnels) {
      if (D >= t.d0 && D <= t.d1) {
        const f = (D - t.d0) / (t.d1 - t.d0)
        return { x: t.ex + (t.qx - t.ex) * f, y: t.ey + (t.qy - t.ey) * f, hidden: true, color: f < 0.5 ? t.inColor : t.outColor }
      }
    }
    const tr = sn.trail
    if (tr.length === 0) return { x: 0, y: 0, hidden: false, color: '' }
    if (D <= tr[0].d) return { x: tr[0].x, y: tr[0].y, hidden: false, color: '' }
    const n = tr.length
    if (D >= tr[n - 1].d) return { x: tr[n - 1].x, y: tr[n - 1].y, hidden: false, color: '' }
    let lo = 0
    let hi = n - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (tr[mid].d <= D) lo = mid
      else hi = mid
    }
    const a = tr[lo]
    const bb = tr[hi]
    const f = (D - a.d) / (bb.d - a.d || 1)
    return { x: a.x + (bb.x - a.x) * f, y: a.y + (bb.y - a.y) * f, hidden: false, color: '' }
  }

  private renderSnake(b: Boss) {
    const ctx = this.ctx
    const sn = b.snake!
    // telegraph path (entry -> exit)
    if (sn.mode === 'telegraph' && sn.targetPath.length >= 2) {
      ctx.save()
      ctx.strokeStyle = '#a78bfa'
      ctx.shadowColor = '#a78bfa'
      ctx.shadowBlur = 10
      ctx.globalAlpha = 0.4 + Math.sin(this.time * 10) * 0.2
      ctx.lineWidth = 3
      ctx.setLineDash([10, 12])
      ctx.beginPath()
      ctx.moveTo(b.x, b.y)
      for (const p of sn.targetPath) ctx.lineTo(p.x, p.y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
    }
    // portals
    for (let i = 0; i < sn.portals.length; i++) {
      const p = sn.portals[i]
      const isExit = p.role === 'out'
      const pulse = isExit ? 1.25 : 1
      ctx.save()
      ctx.strokeStyle = p.color
      ctx.fillStyle = p.color
      ctx.shadowColor = p.color
      ctx.shadowBlur = isExit ? 22 : 14
      ctx.lineWidth = isExit ? 4 : 3
      ctx.globalAlpha = Math.max(0.25, p.life / p.max) * (p.role === 'decoy' ? 0.4 : 0.9)
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r * pulse + Math.sin(this.time * 5 + i) * 2, 0, Math.PI * 2)
      ctx.stroke()
      ctx.shadowBlur = 0
      ctx.lineWidth = 2
      ctx.globalAlpha *= 0.6
      const rot = this.time * (p.spin > 0 ? 2 : -2) + i * 1.3
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.6 * pulse, rot, rot + 2.1); ctx.stroke()
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.6 * pulse, rot + Math.PI, rot + Math.PI + 2.1); ctx.stroke()
      ctx.globalAlpha *= 0.7
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill()
      if (isExit) {
        ctx.globalAlpha = 0.5
        ctx.setLineDash([5, 7])
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * pulse + 14, this.time * 2, this.time * 2 + Math.PI * 2); ctx.stroke()
        ctx.setLineDash([])
      }
      ctx.restore()
    }
    // tunnel strands
    for (const t of sn.tunnels) {
      if (t.d1 < sn.dist - sn.length || t.d0 > sn.dist) continue
      ctx.save()
      const grad = ctx.createLinearGradient(t.ex, t.ey, t.qx, t.qy)
      grad.addColorStop(0, t.inColor)
      grad.addColorStop(1, t.outColor)
      ctx.lineCap = 'round'
      ctx.strokeStyle = grad
      ctx.globalAlpha = 0.22 + Math.sin(this.time * 7) * 0.06
      ctx.lineWidth = 14
      ctx.beginPath(); ctx.moveTo(t.ex, t.ey); ctx.lineTo(t.qx, t.qy); ctx.stroke()
      ctx.globalAlpha = 0.5
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.restore()
    }
    // body
    const segs = sn.segs
    for (let i = segs.length - 1; i >= 0; i--) {
      const s = segs[i]
      if (s.hidden || i === 0) continue
      const before = segs[Math.max(0, i - 1)]
      const after = segs[Math.min(segs.length - 1, i + 1)]
      const angle = Math.atan2(after.y - before.y, after.x - before.x) - Math.PI / 2
      ctx.save()
      ctx.translate(s.x, s.y)
      ctx.rotate(angle)
      drawOrochiSegment(ctx, { time: this.time, energy: 1, thrust: 0, articulation: 1 }, Math.max(0.32, s.r / 24), b.pattern)
      ctx.restore()
    }
    // hidden segments become glowing orbs at the portals they feed
    for (const t of sn.tunnels) {
      if (t.d1 < sn.dist - sn.length || t.d0 > sn.dist) continue
      ctx.save()
      ctx.fillStyle = t.inColor
      ctx.shadowColor = t.inColor
      ctx.shadowBlur = 10
      const k = Math.max(1, Math.floor((t.d1 - Math.max(t.d0, sn.dist - sn.length)) / sn.spacing))
      for (let j = 0; j < k; j++) {
        const D = Math.max(t.d0, sn.dist - sn.length) + j * sn.spacing
        if (D > t.d1) break
        const f = (D - t.d0) / (t.d1 - t.d0)
        const ox = t.ex + (t.qx - t.ex) * f
        const oy = t.ey + (t.qy - t.ey) * f
        ctx.globalAlpha = 0.45
        ctx.beginPath()
        ctx.arc(ox, oy, 5 + 3 * Math.sin(this.time * 8 + j), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
    // head (hidden while transiting)
    const head = segs[0]
    if (head && !head.hidden) {
      const nxt = segs[1]
      const ang = nxt ? Math.atan2(head.y - nxt.y, head.x - nxt.x) : -Math.PI / 2
      ctx.save()
      ctx.translate(head.x, head.y)
      ctx.rotate(ang + Math.PI / 2)
      drawOrochiHead(ctx, { time: this.time, energy: 1, thrust: 0, articulation: 1 }, b.pattern)
      ctx.restore()
    }
    // telegraphed rings
    for (const r of sn.rings) {
      const local = r.t - r.warn
      ctx.save()
      if (local < 0) {
        // warning: expanding thin dashed circle + gap marker
        const f = r.t / r.warn
        ctx.strokeStyle = r.color
        ctx.globalAlpha = 0.5 + Math.sin(this.time * 16) * 0.25
        ctx.lineWidth = 3
        ctx.setLineDash([8, 8])
        ctx.beginPath(); ctx.arc(r.cx, r.cy, 30 + f * 40, 0, Math.PI * 2); ctx.stroke()
        ctx.setLineDash([])
        // mark the safe gap
        ctx.globalAlpha = 0.9
        ctx.fillStyle = '#a3e635'
        ctx.shadowColor = '#a3e635'; ctx.shadowBlur = 12
        const gx = r.cx + Math.cos(r.gapAngle) * (30 + f * 40)
        const gy = r.cy + Math.sin(r.gapAngle) * (30 + f * 40)
        ctx.beginPath(); ctx.arc(gx, gy, 7, 0, Math.PI * 2); ctx.fill()
      } else {
        ctx.strokeStyle = r.hiColor
        ctx.globalAlpha = 0.7 * (1 - local / r.fire)
        ctx.lineWidth = r.width
        ctx.beginPath(); ctx.arc(r.cx, r.cy, r.r0, 0, Math.PI * 2); ctx.stroke()
      }
      ctx.restore()
    }
    // body sweep telegraph
    if (sn.sweep) {
      const s = sn.sweep
      ctx.save()
      if (s.t < s.warn) {
        const f = s.t / s.warn
        ctx.strokeStyle = '#f472b6'
        ctx.globalAlpha = 0.35 + Math.sin(this.time * 14) * 0.2
        ctx.lineWidth = 3
        ctx.setLineDash([8, 10])
        ctx.beginPath(); ctx.arc(b.x, b.y, s.r0 + (s.r1 - s.r0) * f * 0.5, s.a0, s.a0 + (s.a1 - s.a0) * 0.5); ctx.stroke()
        ctx.setLineDash([])
      } else {
        const f = (s.t - s.warn) / s.fire
        const ang = s.a0 + (s.a1 - s.a0) * f
        const R = s.r0 + (s.r1 - s.r0) * f
        const tipX = b.x + Math.cos(ang) * R
        const tipY = b.y + Math.sin(ang) * R
        const grad = ctx.createLinearGradient(b.x, b.y, tipX, tipY)
        grad.addColorStop(0, 'rgba(244,114,182,0.15)')
        grad.addColorStop(1, 'rgba(253,164,175,0.85)')
        ctx.strokeStyle = grad
        ctx.lineCap = 'round'
        ctx.lineWidth = 30
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(tipX, tipY); ctx.stroke()
        ctx.lineWidth = 12
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(tipX, tipY); ctx.stroke()
        ctx.fillStyle = '#fff'
        ctx.shadowColor = '#f472b6'; ctx.shadowBlur = 16
        ctx.beginPath(); ctx.arc(tipX, tipY, 12, 0, Math.PI * 2); ctx.fill()
      }
      ctx.restore()
    }
    // nova telegraph (phase 3 finale)
    if (sn.nova) {
      const n = sn.nova
      const f = n.t / n.warn
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 3; i++) {
        const rr = 30 + i * 26 + f * 60
        ctx.strokeStyle = i === 1 ? '#f472b6' : '#a78bfa'
        ctx.globalAlpha = (0.4 + f * 0.5) * (1 - i * 0.15)
        ctx.lineWidth = 4
        ctx.setLineDash([14, 12])
        ctx.beginPath(); ctx.arc(b.x, b.y, rr, n.spin + i, n.spin + i + Math.PI * 2); ctx.stroke()
      }
      ctx.setLineDash([])
      // converging particles
      ctx.fillStyle = '#fff'
      ctx.globalAlpha = 0.8
      for (let i = 0; i < 16; i++) {
        const a = n.spin * 2 + i * (Math.PI * 2 / 16)
        const rr = 200 * (1 - f) + 30
        ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr, 3, 0, Math.PI * 2); ctx.fill()
      }
      ctx.restore()
    }
    // echoes (phase 1 afterimages)
    for (const e of sn.echoes) {
      const f = e.t / e.max
      ctx.save()
      ctx.globalAlpha = 0.35 * (1 - f)
      ctx.translate(e.x, e.y)
      drawOrochiHead(ctx, { time: this.time, energy: 1, thrust: 0, articulation: 1 }, b.pattern)
      ctx.restore()
    }
    // lasers
    for (const l of sn.lasers) {
      const local = l.t - l.warn
      ctx.save()
      const dx = Math.cos(l.angle), dy = Math.sin(l.angle)
      const ex = l.x + dx * l.len, ey = l.y + dy * l.len
      if (local < 0) {
        ctx.strokeStyle = '#fb7185'
        ctx.globalAlpha = 0.35 + Math.sin(this.time * 16) * 0.2
        ctx.lineWidth = 3
        ctx.setLineDash([10, 12])
        ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(ex, ey); ctx.stroke()
        ctx.setLineDash([])
      } else if (local < l.grow) {
        const g = local / l.grow
        const wx = l.x + dx * l.len * g, wy = l.y + dy * l.len * g
        ctx.strokeStyle = '#fecdd3'
        ctx.globalAlpha = 0.9
        ctx.lineWidth = 2 + 4 * g
        ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(wx, wy); ctx.stroke()
      } else {
        ctx.strokeStyle = '#fecdd3'
        ctx.globalAlpha = 0.9
        ctx.shadowColor = '#fb7185'; ctx.shadowBlur = 18
        ctx.lineWidth = l.width * 2
        ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(ex, ey); ctx.stroke()
        ctx.strokeStyle = '#fff'; ctx.lineWidth = l.width * 0.6
        ctx.stroke()
      }
      ctx.restore()
    }
    // teleport shockwaves
    for (const s of this.shockwaves) {
      const f = s.t / s.max
      const rr = s.r0 + (s.r1 - s.r0) * f
      ctx.save()
      ctx.globalAlpha = 0.6 * (1 - f)
      ctx.strokeStyle = s.color
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(s.x, s.y, rr, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }
    // hit flash
    if (this.bossFlash > 0) {
      ctx.save()
      ctx.globalAlpha = this.bossFlash * 0.5
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 1; i < segs.length; i += 2) {
        const s = segs[i]
        if (s.hidden) continue
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
  }

  private maybeDropPowerup(x: number, y: number) {
    if (Math.random() > 0.16) return
    const kinds: PowerupKind[] = ['spread', 'rapid', 'shield', 'health']
    const kind = kinds[Math.floor(Math.random() * kinds.length)]
    this.powerups.push({ x, y, vy: 80, kind, t: 0 })
  }

  private updatePowerups(dt: number) {
    const next: Powerup[] = []
    for (const p of this.powerups) {
      p.t += dt
      p.y += p.vy * dt
      if (p.y > this.h + 30) continue
      if (dist(p, this.ship) < this.ship.r + 16) {
        this.applyPowerup(p.kind)
        continue
      }
      next.push(p)
    }
    this.powerups = next
  }

  private applyPowerup(kind: PowerupKind) {
    playPowerUp()
    if (kind === 'spread') this.pSpread = 10
    else if (kind === 'rapid') this.pRapid = 10
    else if (kind === 'shield') this.pShield = 8
    else {
      if (this.lives < 5) this.lives++
      this.burst(this.ship.x, this.ship.y, 12, '#4ade80')
    }
    this.burst(this.ship.x, this.ship.y, 10, '#fbbf24')
  }

  private damageShip() {
    const s = this.ship
    if (s.inv > 0) return
    if (this.godMode) return
    this.lives--
    s.inv = 2.2
    this.shake = 12
    this.burst(s.x, s.y, 22, '#ec4899')
    playHit()
    if (this.lives <= 0) {
      this.state = 'dead'
      playGameOver()
      this.emit()
      this.onEnd(false)
    }
  }

  private burst(x: number, y: number, n: number, color: string) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = rand(40, 260)
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.25, 0.7), max: 0.7, r: rand(1.5, 4), color })
    }
  }

  private updateParticles(dt: number) {
    const next: Particle[] = []
    for (const p of this.particles) {
      p.life -= dt
      if (p.life <= 0) continue
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= 0.98
      p.vy *= 0.98
      next.push(p)
    }
    this.particles = next
  }

  private renderRetiring(ctx: CanvasRenderingContext2D) {
    for (const r of this.retiring) {
      const a = r.alpha
      if (a <= 0.01) continue
      if (r.type === 'bar' && r.bar) {
        const bar = r.bar
        const e = this.laserEnergy(bar) * a
        const left = bar.gapX - bar.gapW / 2
        const right = bar.gapX + bar.gapW / 2
        ctx.save()
        ctx.globalAlpha = 0.12 * a
        ctx.strokeStyle = '#ff2d78'
        ctx.lineWidth = 2
        ctx.setLineDash([6, 8])
        ctx.beginPath(); ctx.moveTo(0, bar.y); ctx.lineTo(left, bar.y); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(right, bar.y); ctx.lineTo(this.w, bar.y); ctx.stroke()
        ctx.setLineDash([])
        if (e > 0.02) {
          ctx.globalCompositeOperation = 'lighter'
          ctx.globalAlpha = e
          ctx.shadowColor = '#ff2d78'
          ctx.shadowBlur = 18 * e
          ctx.strokeStyle = '#ff9ac4'
          ctx.lineWidth = 5 * e
          ctx.lineCap = 'round'
          ctx.beginPath(); ctx.moveTo(0, bar.y); ctx.lineTo(left, bar.y); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(right, bar.y); ctx.lineTo(this.w, bar.y); ctx.stroke()
          ctx.shadowBlur = 0
        }
        ctx.restore()
      } else if (r.type === 'drone' && r.drone) {
        const d = r.drone
        const isLaser = d.kind === 'mob-laser'
        const rotation = isLaser && d.laserAngle !== undefined ? d.laserAngle : (d.vx < 0 ? Math.PI / 2 : -Math.PI / 2)
        ctx.save()
        ctx.globalAlpha = a
        drawDesign(ctx, {
          id: d.kind, x: d.x, y: d.y, size: d.r * 2.5,
          time: d.t, rotation,
          energy: isLaser ? 0.55 : 0.4,
          articulation: 0.6,
        })
        ctx.restore()
      }
    }
  }

  private render() {
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.w, this.h)
    const sx = this.shake ? rand(-this.shake, this.shake) : 0
    const sy = this.shake ? rand(-this.shake, this.shake) : 0
    ctx.save()
    ctx.translate(sx, sy)
    // stars
    for (const s of this.stars) {
      ctx.globalAlpha = 0.35 + s.r * 0.25
      ctx.fillStyle = '#e2e8f0'
      ctx.fillRect(s.x, s.y, s.r, s.r)
    }
    ctx.globalAlpha = 1
    // asteroids
    for (const a of this.asteroids) {
      ctx.save()
      ctx.globalAlpha = a.alpha ?? 1
      drawDesign(ctx, {
        id: a.kind === 'nebula' ? 'asteroid-nebula' : a.kind === 'cratered' ? 'asteroid-cratered' : 'asteroid-fractured',
        x: a.x, y: a.y, size: a.r * 2.6,
        time: this.time, rotation: a.rot,
        energy: 0.2, articulation: 0.5,
      })
      ctx.restore()
    }
    // drones
    for (const d of this.drones) {
      const a = d.alpha ?? 1
      if (a <= 0.01) continue
      ctx.save()
      ctx.globalAlpha = a
      const isLaser = d.kind === 'mob-laser'
      const timing = d.orbit ? this.sentinelTiming(d) : { warning: false, firing: Boolean(isLaser && d.laserT !== undefined && d.laserT < 0.6) }
      const firing = timing.firing
      const rotation = isLaser && d.laserAngle !== undefined ? d.laserAngle : (d.vx < 0 ? Math.PI / 2 : -Math.PI / 2)
      drawDesign(ctx, {
        id: d.kind,
        x: d.x, y: d.y, size: d.r * 2.5,
        time: d.t, rotation,
        energy: isLaser ? (timing.warning ? 0.74 : 0.55) : 0.4 + Math.sin(d.t * 5) * 0.2,
        articulation: 0.6,
      })
      if (isLaser && d.laserAngle !== undefined && (timing.warning || firing)) {
        const len = this.beamLength(d, d.laserAngle)
        const dx = Math.sin(d.laserAngle), dy = -Math.cos(d.laserAngle)
        ctx.strokeStyle = firing ? '#ff9ac4' : '#ff2d78'
        ctx.globalAlpha = firing ? 0.95 : 0.45
        ctx.lineWidth = firing ? 6 : 2
        ctx.shadowColor = '#ff2d78'
        ctx.shadowBlur = firing ? 16 : 5
        if (!firing) ctx.setLineDash([7, 9])
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + dx * len, d.y + dy * len); ctx.stroke()
        ctx.setLineDash([])
        ctx.shadowBlur = 0
      }
      if (d.kind === 'mob-kamikaze' && (d.warning ?? 0) > 0) {
        ctx.strokeStyle = '#ff6b5d'
        ctx.globalAlpha = 0.45 + Math.sin(this.time * 12) * 0.2
        ctx.lineWidth = 3
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r + 10 + (d.warning ?? 0) * 8, 0, Math.PI * 2); ctx.stroke()
      }
      ctx.restore()
    }
    // laser labyrinth walls (nebula phase 0)
    for (const bar of this.laserBars) {
      const a = bar.alpha ?? 1
      const e = this.laserEnergy(bar) * a
      const left = bar.gapX - bar.gapW / 2
      const right = bar.gapX + bar.gapW / 2
      ctx.save()
      // dim dashed guide so the maze layout is always readable
      ctx.globalAlpha = 0.12 * a
      ctx.strokeStyle = '#ff2d78'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 8])
      ctx.beginPath(); ctx.moveTo(0, bar.y); ctx.lineTo(left, bar.y); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(right, bar.y); ctx.lineTo(this.w, bar.y); ctx.stroke()
      ctx.setLineDash([])
      // bright glowing laser when powered
      if (e > 0.02) {
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = e
        ctx.shadowColor = '#ff2d78'
        ctx.shadowBlur = 18 * e
        ctx.strokeStyle = '#ff9ac4'
        ctx.lineWidth = 5 * e
        ctx.lineCap = 'round'
        ctx.beginPath(); ctx.moveTo(0, bar.y); ctx.lineTo(left, bar.y); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(right, bar.y); ctx.lineTo(this.w, bar.y); ctx.stroke()
        ctx.shadowBlur = 0
        ctx.fillStyle = '#ffd6e8'
        ctx.beginPath(); ctx.arc(left, bar.y, 4 * e, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(right, bar.y, 4 * e, 0, Math.PI * 2); ctx.fill()
      }
      ctx.restore()
    }
    // authored laser-gate obstacle course (nebula phase 3)
    for (const gate of this.laserGates) {
      const horizontal = gate.orientation === 'horizontal'
      const max = horizontal ? this.w : this.h
      const a0 = gate.gap - gate.gapSize / 2
      const a1 = gate.gap + gate.gapSize / 2
      const firing = gate.warning <= 0 && gate.active > 0
      ctx.save()
      ctx.strokeStyle = firing ? '#a5f3fc' : '#22d3ee'
      ctx.globalAlpha = gate.alpha * (firing ? 0.95 : 0.35 + Math.sin(this.time * 10) * 0.12)
      ctx.lineWidth = firing ? 7 : 2
      ctx.shadowColor = '#22d3ee'
      ctx.shadowBlur = firing ? 18 : 4
      if (!firing) ctx.setLineDash([8, 10])
      ctx.beginPath()
      if (horizontal) { ctx.moveTo(0, gate.pos); ctx.lineTo(a0, gate.pos); ctx.moveTo(a1, gate.pos); ctx.lineTo(max, gate.pos) }
      else { ctx.moveTo(gate.pos, 0); ctx.lineTo(gate.pos, a0); ctx.moveTo(gate.pos, a1); ctx.lineTo(gate.pos, max) }
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
    }
    // incoming meteor wave corridors are visible before any rocks enter the arena
    for (const wave of this.meteorWaves) {
      if (wave.spawned) continue
      ctx.save()
      ctx.strokeStyle = '#c084fc'
      ctx.globalAlpha = 0.18 + Math.sin(this.time * 10) * 0.08
      ctx.lineWidth = Math.max(70, (wave.kind === 'diagonal' ? this.w : this.h) * 0.18)
      ctx.setLineDash([10, 14])
      ctx.beginPath()
      if (wave.kind === 'diagonal') { const x = wave.gap * this.w; ctx.moveTo(x - 90, 0); ctx.lineTo(x + 90, this.h) }
      else { const y = wave.gap * this.h; ctx.moveTo(0, y); ctx.lineTo(this.w, y) }
      ctx.stroke()
      ctx.restore()
    }
    // entities fading out during a phase transition
    this.renderRetiring(ctx)
    // boss
    if (this.boss) {
      const b = this.boss
      if (b.snake) {
        this.renderSnake(b)
      } else {
        drawDesign(ctx, {
          id: b.kind,
          x: b.x, y: b.y, size: b.r * 2.4,
          time: b.t, rotation: 0,
          energy: 0.5 + (this.bossFlash > 0 ? 0.3 : 0),
          articulation: 0.7,
        })
        if (this.bossFlash > 0) {
          ctx.save()
          ctx.globalAlpha = this.bossFlash * 0.8
          ctx.globalCompositeOperation = 'lighter'
          drawDesign(ctx, {
            id: b.kind,
            x: b.x, y: b.y, size: b.r * 2.4,
            time: b.t, rotation: 0,
            energy: 1,
            articulation: 0.7,
          })
          ctx.restore()
        }
      }
      if (b.dying) {
        const dt = b.deathT
        const blink = dt < 0.8 ? (Math.sin(dt * 24) > 0 ? 1 : 0.22) : 1
        const flash = Math.max(0, (dt - 0.25) / 1.25)
        if (flash > 0) {
          ctx.save()
          ctx.globalAlpha = blink
          ctx.beginPath()
          ctx.arc(b.x, b.y, b.r * (0.45 + flash * 0.9), 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.35)'
          ctx.fill()
          ctx.beginPath()
          ctx.rect(b.x - b.r * 0.28, b.y - this.h * 0.5, b.r * 0.56, this.h * 0.5)
          ctx.fillStyle = `rgba(255,255,255,${0.35 + flash * 0.6})`
          ctx.fill()
          ctx.beginPath()
          ctx.arc(b.x, b.y, b.r * (0.32 + flash * 0.4), 0, Math.PI * 2)
          ctx.fillStyle = flash > 0.7 ? '#ffffff' : '#fecdd3'
          ctx.fill()
          ctx.restore()
        }
      }

    }
    // boss beam (expanding ring with gap)
    const drawBeam = (bm: { cx: number; cy: number; radius: number; speed: number; maxR: number; gap: number; gapAngle: number; width: number }, color: string, hiColor: string) => {
      ctx.save()
      ctx.translate(bm.cx, bm.cy)
      const g = bm.gap
      const ga = bm.gapAngle
      const alpha = Math.min(1, (bm.maxR - bm.radius) / 200)
      ctx.globalAlpha = 0.85 * alpha
      ctx.beginPath()
      ctx.arc(0, 0, bm.radius, ga + g, ga - g + Math.PI * 2)
      ctx.strokeStyle = color
      ctx.lineWidth = bm.width
      ctx.lineCap = 'round'
      ctx.stroke()
      ctx.globalAlpha = 0.5 * alpha
      ctx.beginPath()
      ctx.arc(0, 0, bm.radius, ga + g, ga - g + Math.PI * 2)
      ctx.strokeStyle = hiColor
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.restore()
    }
    if (this.boss && this.beam) drawBeam(this.beam, '#fb7185', '#fecdd3')
    if (this.boss && this.beam2) drawBeam(this.beam2, '#a78bfa', '#ddd6fe')
    // bullets
    for (const bl of this.bullets) {
      ctx.beginPath()
      ctx.arc(bl.x, bl.y, bl.r, 0, Math.PI * 2)
      ctx.fillStyle = bl.friendly ? '#22d3ee' : '#fb7185'
      ctx.shadowColor = bl.friendly ? '#22d3ee' : '#fb7185'
      ctx.shadowBlur = 8
      ctx.fill()
      ctx.shadowBlur = 0
    }
    // ship
    if (this.state !== 'dead') {
      const s = this.ship
      const blink = s.inv > 0 && Math.floor(this.time * 12) % 2 === 0
      if (!blink) {
        const dx = this.target.x - s.x
        const dy = this.target.y - s.y
        const dist = Math.hypot(dx, dy)
        const thrust = this.target.active ? Math.min(1, dist / 100) : 0.2
        const energy = 0.3 + thrust * 0.4 + (this.pShield > 0 ? 0.2 : 0)
        drawDesign(ctx, {
          id: 'player-pink',
          x: s.x, y: s.y, size: 60,
          time: this.time, rotation: 0,
          energy, thrust, articulation: 0.6,
        })
      }
    }
    // power-ups
    for (const p of this.powerups) {
      const pulse = 1 + Math.sin(p.t * 8) * 0.15
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.scale(pulse, pulse)
      const colors: Record<PowerupKind, [string, string]> = {
        spread: ['#fbbf24', '#fde68a'],
        rapid: ['#22d3ee', '#a5f3fc'],
        shield: ['#4ade80', '#bbf7d0'],
        health: ['#4ade80', '#fde68a'],
      }
      const [outer, inner] = colors[p.kind]
      ctx.beginPath()
      ctx.arc(0, 0, 14, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      ctx.fill()
      ctx.strokeStyle = outer
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, 0, 8, 0, Math.PI * 2)
      ctx.fillStyle = inner
      ctx.fill()
      // icon
      ctx.fillStyle = '#0f172a'
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const icon = p.kind === 'spread' ? 'S' : p.kind === 'rapid' ? 'R' : p.kind === 'shield' ? 'D' : '+'
      ctx.fillText(icon, 0, 1)
      ctx.restore()
    }
    // shield bubble
    if (this.pShield > 0 && this.state !== 'dead') {
      const s = this.ship
      ctx.beginPath()
      ctx.arc(s.x, s.y, 26, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.6)'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.stroke()
      ctx.setLineDash([])
    }
    // particles
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max)
      ctx.fillStyle = p.color
      ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r)
    }
    ctx.globalAlpha = 1
    ctx.restore()
  }
}

function normA(a: number): number {
  a = a % (Math.PI * 2)
  if (a > Math.PI) a -= Math.PI * 2
  if (a < -Math.PI) a += Math.PI * 2
  return a
}
function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}
