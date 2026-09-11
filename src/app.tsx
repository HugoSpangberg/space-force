import { useEffect, useRef, useState } from 'react'
import { Game } from './game/engine.js'
import type { CourseId, HudState } from './game/engine.js'

const DEFAULT_HUD: HudState = { score: 0, lives: 3, phase: 'ASTEROID FIELD', boss: null, state: 'playing',   bossDying: false,
  godMode: false, powerups: { spread: 0, rapid: 0, shield: 0 } }

const ShipArt = () => (
  <svg viewBox="0 0 200 240" aria-hidden>
    <defs>
      <linearGradient id="hull" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f472b6" />
        <stop offset="1" stopColor="#be185d" />
      </linearGradient>
    </defs>
    <path d="M100 8 L150 150 L118 128 L100 150 L82 128 L50 150 Z" fill="url(#hull)" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
    <circle cx="100" cy="70" r="16" fill="#22d3ee" />
    <path d="M78 158 L100 226 L122 158 Z" fill="#fbbf24" opacity=".9" />
  </svg>
)

const Stars = () => (
  <div className="star-field" aria-hidden>
    {Array.from({ length: 40 }).map((_, i) => (
      <i key={i} style={{ left: `${(i * 53) % 100}%`, top: `${(i * 37) % 100}%`, animationDuration: `${6 + (i % 7)}s`, animationDelay: `${-(i % 5)}s` }} />
    ))}
  </div>
)

function TitleScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="title-screen">
      <section className="hero">
        <Stars />
        <div className="orbit-ring orbit-a" />
        <div className="orbit-ring orbit-b" />
        <div className="hero-ship"><ShipArt /></div>
        <div className="hero-copy">
          <div className="overline">CHOOSE YOUR NEXT SECTOR</div>
          <h1>SPACE <em>FORCE</em></h1>
          <p>Fly the original Orbital Graveyard or enter the longer Nebula Rift with laser mobs and a three-phase portal boss. Touch to steer — your guns never stop firing.</p>
          <div className="hero-facts">
            <span><b>60 FPS</b>Canvas engine</span>
            <span><b>1–2 min</b>Per run</span>
            <span><b>5</b>Phases + boss</span>
          </div>
        </div>
      </section>
      <aside className="entry-side">
        <div className="entry-card">
          <div className="wordmark"><div className="logo small"><ShipArt /></div><span>SPACE FORCE</span></div>
          <h2>Launch your ship</h2>
          <p>Hold and drag anywhere on the screen to fly. The ship hovers just above your thumb.</p>
          <div className="entry-actions">
            <button className="primary wide" onClick={onStart}>Start Mission</button>
          </div>
          <div className="entry-note">
            <b>CONTROLS</b> — Touch &amp; drag to move · Auto-fire · Esc to pause
          </div>
        </div>
      </aside>
    </div>
  )
}

function Hud({ hud, onPause, onToggleGodMode }: { hud: HudState; onPause: () => void; onToggleGodMode?: () => void }) {
  return (
    <>
      <div className="hud">
        <div className="hud-left">
          {(hud.powerups.spread > 0 || hud.powerups.rapid > 0 || hud.powerups.shield > 0) && (
            <div className="powerups">
              {hud.powerups.spread > 0 && <span className="pu pu-spread">SPREAD {hud.powerups.spread}</span>}
              {hud.powerups.rapid > 0 && <span className="pu pu-rapid">RAPID {hud.powerups.rapid}</span>}
              {hud.powerups.shield > 0 && <span className="pu pu-shield">SHIELD {hud.powerups.shield}</span>}
            </div>
          )}
        </div>
        <div className="hud-right">
          {onToggleGodMode && (
            <button
              className={`godmode-button hud-button${hud.godMode ? ' active' : ''}`}
              onClick={onToggleGodMode}
              aria-label="Toggle god mode"
            >
              GOD
            </button>
          )}
          <button className="pause-button hud-button" onClick={onPause} aria-label="Pause">
            <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          </button>
        </div>
      </div>
      <div className="hud-bottom">
        <div className="hud-chip"><span>LIVES</span><span className="lives">{[0, 1, 2].map(i => <i key={i} className={i < hud.lives ? '' : 'lost'} />)}</span></div>
        {hud.godMode && <div className="hud-chip godmode"><span>GODMODE</span></div>}
      </div>
    </>
  )
}

const MissionComplete = ({ course }: { course: CourseId }) => (
  <div className="mission-complete" aria-hidden>
    <span className="mc-scan" />
    <span className="mc-line mc-line-a" />
    <span className="mc-title">
      {Array.from('MISSION').map((ch, i) => (
        <i key={`m${i}`} className="mc-char" style={{ animationDelay: `${i * 70 + 200}ms` }}>{ch}</i>
      ))}
    </span>
    <span className="mc-title mc-title-2">
      {Array.from('COMPLETE').map((ch, i) => (
        <i key={`c${i}`} className="mc-char" style={{ animationDelay: `${i * 70 + 800}ms` }}>{ch}</i>
      ))}
    </span>
    <span className="mc-sub">{course === 'nebula' ? 'SECTOR 02 · SERPENT WARDEN DOWN' : 'SECTOR 01 · ORBITAL WARDEN DOWN'}</span>
  </div>
)

function Overlay({ title, body, score, clear, primary, onPrimary, secondary, onSecondary }: {
  title: string
  body: string
  score?: number
  clear?: boolean
  primary: string
  onPrimary: () => void
  secondary: string
  onSecondary: () => void
}) {
  return (
    <div className="overlay">
      <div className="overlay-card">
        <h2 className={clear ? '' : 'boss-title'}>{title}</h2>
        <p>{body}</p>
        {score !== undefined && (
          <div className="final-score"><small>Final Score</small><b>{score.toLocaleString()}</b></div>
        )}
        <div className="entry-actions">
          <button className="primary wide" onClick={onPrimary}>{primary}</button>
          <button className="secondary wide" onClick={onSecondary}>{secondary}</button>
        </div>
      </div>
    </div>
  )
}

function GameView({ onQuit, startAtPhase, course }: { onQuit: () => void; startAtPhase: number; course: CourseId }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Game | null>(null)
  const [hud, setHud] = useState<HudState>(DEFAULT_HUD)
  const [ended, setEnded] = useState<{ clear: boolean; score: number } | null>(null)
  const endedRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const game = new Game(
      canvas,
      setHud,
      (clear) => {
        if (endedRef.current) return
        endedRef.current = true
        setEnded({ clear, score: clear ? 5000 + Math.floor(Math.random() * 3000) : 0 })
      },
      startAtPhase,
      course,
    )
    gameRef.current = game
    ;(window as any).__game = game
    game.start()
    const onResize = () => game.resize()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') game.setPaused(true)
      if (import.meta.env.DEV && (e.key === 'g' || e.key === 'G')) {
        const g = gameRef.current
        if (g) g.godMode = !g.godMode
      }
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
      game.destroy()
      gameRef.current = null
    }
  }, [course, startAtPhase])

  const pause = () => gameRef.current?.setPaused(true)
  const resume = () => gameRef.current?.setPaused(false)
  const restart = () => window.location.reload()
  const toggleGodMode = () => {
    const g = gameRef.current
    if (g) g.godMode = !g.godMode
  }

  return (
    <div className="game-view">
      <div className="stage">
        <canvas className="game-canvas" ref={canvasRef} />
        <Hud hud={hud} onPause={pause} onToggleGodMode={import.meta.env.DEV ? toggleGodMode : undefined} />
        {hud.state === 'clear' && !ended && <MissionComplete course={course} />}
        {hud.state === 'paused' && !ended && (
          <Overlay
            title="Paused"
            body={`${course === 'nebula' ? 'The Serpent Warden' : 'The Orbital Warden'} is waiting. Resume when you're ready.`}
            primary="Resume"
            onPrimary={resume}
            secondary="Quit to Title"
            onSecondary={onQuit}
          />
        )}
        {ended && (
          <Overlay
            title={ended.clear ? `${course === 'nebula' ? 'Sector 02' : 'Sector 01'} Cleared` : 'Ship Lost'}
            body={ended.clear
              ? course === 'nebula' ? 'The Serpent Warden is down. The nebula is quiet.' : 'The Orbital Warden is down. The graveyard is quiet.'
              : `Your ship was destroyed in the ${course === 'nebula' ? 'nebula' : 'graveyard'}.`}
            score={ended.score}
            clear={ended.clear}
            primary="Fly Again"
            onPrimary={restart}
            secondary="Quit to Title"
            onSecondary={onQuit}
          />
        )}
      </div>
    </div>
  )
}

const COURSE_OPTIONS: { id: CourseId; eyebrow: string; label: string; desc: string }[] = [
  { id: 'graveyard', eyebrow: 'SECTOR 01', label: 'Orbital Graveyard', desc: 'Asteroid field, drone squads, and the Orbital Warden.' },
  { id: 'nebula', eyebrow: 'SECTOR 02', label: 'Nebula Rift', desc: 'A longer course with laser mobs and the portal-running Serpent Warden.' },
]

const PHASE_OPTIONS: Record<CourseId, { idx: number; label: string; desc: string }[]> = {
  graveyard: [
    { idx: 0, label: 'Full Graveyard Course', desc: 'All phases from the asteroid field' },
    { idx: 1, label: 'Drone Squad', desc: 'Phase 2 — drones + shooting' },
    { idx: 2, label: 'Interceptor Surge', desc: 'Phase 3 — dense drone formations' },
    { idx: 3, label: 'Orbital Warden', desc: 'Boss fight — all three phases' },
  ],
  nebula: [
    { idx: 0, label: 'LASER LABYRINTH', desc: 'Phase 1 — start the full Nebula course' },
    { idx: 1, label: 'PRISM LATTICE', desc: 'Phase 2 — coordinated laser sentinels' },
    { idx: 2, label: 'KAMIKAZE PURSUIT', desc: 'Phase 3 — kite the armored pursuit drones' },
    { idx: 3, label: 'LASER GATES', desc: 'Phase 4 — navigate shifting laser passages' },
    { idx: 4, label: 'METEOR SLALOM', desc: 'Phase 5 — weave through warned meteor waves' },
    { idx: 5, label: 'SERPENT RIFT', desc: 'Boss fight — survive the portal serpent' },
  ],
}

function CourseSelect({ onSelect, onBack }: { onSelect: (course: CourseId) => void; onBack: () => void }) {
  return (
    <div className="title-screen selection-screen">
      <section className="hero compact-hero">
        <Stars />
        <div className="orbit-ring orbit-a" />
        <div className="hero-copy">
          <div className="overline">MISSION CONTROL</div>
          <h1>Choose a <em>Course</em></h1>
          <p>Pick a sector, then choose whether to fly the full course or jump to a phase.</p>
        </div>
      </section>
      <aside className="entry-side">
        <div className="entry-card">
          <div className="wordmark"><span>SPACE FORCE</span></div>
          <h2>Select a course</h2>
          <div className="course-list">
            {COURSE_OPTIONS.map(course => (
              <button key={course.id} className="course-btn" onClick={() => onSelect(course.id)}>
                <small>{course.eyebrow}</small>
                <b>{course.label}</b>
                <span>{course.desc}</span>
              </button>
            ))}
          </div>
          <div className="entry-actions">
            <button className="secondary wide" onClick={onBack}>Back</button>
          </div>
        </div>
      </aside>
    </div>
  )
}

function PhaseSelect({ course, onSelect, onBack }: { course: CourseId; onSelect: (idx: number) => void; onBack: () => void }) {
  return (
    <div className="title-screen selection-screen">
      <section className="hero compact-hero">
        <Stars />
        <div className="orbit-ring orbit-a" />
        <div className="hero-copy">
          <div className="overline">{course === 'nebula' ? 'SECTOR 02 — NEBULA RIFT' : 'SECTOR 01 — ORBITAL GRAVEYARD'}</div>
          <h1>Phase <em>Selector</em></h1>
          <p>Jump directly into any phase to test its behavior.</p>
        </div>
      </section>
      <aside className="entry-side">
        <div className="entry-card">
          <div className="wordmark"><span>SPACE FORCE</span></div>
          <h2>Select a phase</h2>
          <div className="phase-list">
            {PHASE_OPTIONS[course].map(p => (
              <button key={p.idx} className="phase-btn" onClick={() => onSelect(p.idx)}>
                <b>{p.label}</b>
                <small>{p.desc}</small>
              </button>
            ))}
          </div>
          <div className="entry-actions">
            <button className="secondary wide" onClick={onBack}>Back</button>
          </div>
        </div>
      </aside>
    </div>
  )
}

export function App() {
  const [screen, setScreen] = useState<'title' | 'course' | 'select' | 'game'>('title')
  const [course, setCourse] = useState<CourseId>('nebula')
  const [startAtPhase, setStartAtPhase] = useState(0)

  return (
    <div className="app">
      {screen === 'title'
        ? <TitleScreen onStart={() => setScreen('course')} />
        : screen === 'course'
          ? <CourseSelect onSelect={(selected) => { setCourse(selected); setScreen('select') }} onBack={() => setScreen('title')} />
          : screen === 'select'
            ? <PhaseSelect course={course} onSelect={(idx) => { setStartAtPhase(idx); setScreen('game') }} onBack={() => setScreen('course')} />
            : <GameView onQuit={() => setScreen('title')} startAtPhase={startAtPhase} course={course} />}
    </div>
  )
}
