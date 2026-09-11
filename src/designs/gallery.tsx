import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { DESIGN_CATALOG, drawDesign } from '../game/art'
import './gallery.css'

type Design = (typeof DESIGN_CATALOG)[number]
type Preview = { canvas: HTMLCanvasElement; width: number; height: number; dpr: number; visible: boolean }

const SECTIONS = [
  { id: 'mobs', title: 'Mobbar', number: '01', subtitle: 'Små hot. Tydliga personligheter.', tag: '3 SILHUETTER' },
  { id: 'bosses', title: 'Bossar', number: '02', subtitle: 'Stora möten börjar med en stark silhuett.', tag: '5 UNIKA DESIGNER' },
  { id: 'asteroids', title: 'Asteroider', number: '03', subtitle: 'Rå sten, djupa kratrar och brutna ytor.', tag: '2 STENFORMER' },
  { id: 'players', title: 'Spelarskepp', number: '04', subtitle: 'Samma skepp. Fyra färger att flyga under.', tag: '4 FÄRGVARIANTER' },
] as const

function DownloadIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></svg>
}

export function DesignGallery() {
  const rootRef = useRef<HTMLDivElement>(null)
  const animationTime = useRef(0)
  const [paused, setPaused] = useState(false)
  const [lightPreview, setLightPreview] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [exportStatus, setExportStatus] = useState('')
  const [exporting, setExporting] = useState<string | null>(null)

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(preference.matches)
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!exportStatus) return
    const timeout = window.setTimeout(() => setExportStatus(''), 5500)
    return () => window.clearTimeout(timeout)
  }, [exportStatus])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const previews = new Map<Design['id'], Preview>()
    let frame = 0
    let lastTimestamp: number | null = null

    function paint(id: Design['id'], preview: Preview) {
      const { canvas, width, height, dpr } = preview
      const ctx = canvas.getContext('2d')
      if (!ctx || width <= 0 || height <= 0) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      drawDesign(ctx, { id, x: width / 2, y: height / 2, size: Math.min(width, height) * 0.83, time: animationTime.current, energy: 1, thrust: 0.65, articulation: 1 })
    }

    function paintAll(visibleOnly = false) {
      previews.forEach((preview, id) => {
        if (!visibleOnly || preview.visible) paint(id, preview)
      })
    }

    function resize() {
      previews.forEach((preview, id) => {
        const bounds = preview.canvas.getBoundingClientRect()
        preview.width = bounds.width
        preview.height = bounds.height
        preview.dpr = Math.min(window.devicePixelRatio || 1, 2)
        preview.canvas.width = Math.round(preview.width * preview.dpr)
        preview.canvas.height = Math.round(preview.height * preview.dpr)
        paint(id, preview)
      })
    }

    function tick(timestamp: number) {
      if (lastTimestamp !== null) animationTime.current += Math.min((timestamp - lastTimestamp) / 1000, 0.1)
      lastTimestamp = timestamp
      paintAll(true)
      frame = requestAnimationFrame(tick)
    }

    function syncPlayback() {
      cancelAnimationFrame(frame)
      lastTimestamp = null
      paintAll()
      if (!paused && !reducedMotion && !document.hidden) frame = requestAnimationFrame(tick)
    }

    for (const design of DESIGN_CATALOG) {
      const canvas = root.querySelector<HTMLCanvasElement>(`canvas[data-art-id="${design.id}"]`)
      if (canvas) previews.set(design.id, { canvas, width: 0, height: 0, dpr: 1, visible: true })
    }
    const observer = new ResizeObserver(resize)
    const visibilityObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = (entry.target as HTMLCanvasElement).dataset.artId as Design['id']
        const preview = previews.get(id)
        if (preview) {
          preview.visible = entry.isIntersecting
          if (preview.visible) paint(id, preview)
        }
      }
    }, { root, rootMargin: '120px' })
    previews.forEach(({ canvas }) => observer.observe(canvas))
    previews.forEach(({ canvas }) => visibilityObserver.observe(canvas))
    resize()
    syncPlayback()
    document.addEventListener('visibilitychange', syncPlayback)
    window.addEventListener('resize', resize)
    return () => {
      observer.disconnect()
      visibilityObserver.disconnect()
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', syncPlayback)
      window.removeEventListener('resize', resize)
    }
  }, [paused, reducedMotion])

  async function download(design: Design) {
    setExporting(design.id)
    setExportStatus('')
    try {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1024
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas unavailable')
      drawDesign(ctx, { id: design.id, x: 512, y: 512, size: 850, time: animationTime.current, energy: 1, thrust: 0.65, articulation: 1 })
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('PNG export failed')), 'image/png'))
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `space-force-${design.id}.png`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setExportStatus(`${design.name} har exporterats som transparent PNG.`)
    } catch {
      setExportStatus('Bilden kunde inte exporteras. Försök igen.')
    } finally {
      setExporting(null)
    }
  }

  const stopped = paused || reducedMotion

  return (
    <div className={`design-gallery${lightPreview ? ' design-gallery--light-preview' : ''}`} ref={rootRef} lang="sv">
      <header className="dg-header">
        <a href="/" className="dg-brand" aria-label="Space Force – tillbaka till spelet">SPACE<span>FORCE</span><span className="dg-brand-mark" aria-hidden="true">///</span></a>
        <a href="/" className="dg-back"><span aria-hidden="true">←</span> Till spelet</a>
      </header>

      <main className="dg-main">
        <div className="dg-intro">
          <p className="dg-eyebrow"><span /> FÄLTGUIDE / DESIGN COLLECTION 01</p>
          <div className="dg-intro-row">
            <h1>Ett universum.<br /><span>Fjorton identiteter.</span></h1>
            <p className="dg-intro-copy">Metall, sten och ren energi. Utforska hela flottan, från snabba drönare till enorma bossar — med levande detaljer och din egen spelarfärg.</p>
          </div>
          <div className="dg-toolbar">
            <nav className="dg-index" aria-label="Designkategorier">
              {SECTIONS.map(section => <a key={section.id} href={`#${section.id}`}><span>{section.number}</span>{section.title}</a>)}
            </nav>
            <div className="dg-controls">
              <button type="button" aria-pressed={stopped} disabled={reducedMotion} onClick={() => setPaused(value => !value)} title={reducedMotion ? 'Rörelse är avstängd enligt din systeminställning' : undefined}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">{stopped ? <path d="m4 2 9 6-9 6z" /> : <path d="M3 2h3v12H3zm7 0h3v12h-3z" />}</svg>
                {reducedMotion ? 'Minskad rörelse' : paused ? 'Spela animationer' : 'Pausa animationer'}
              </button>
              <button type="button" aria-pressed={lightPreview} onClick={() => setLightPreview(value => !value)}><span className="dg-surface-icon" aria-hidden="true" />Ljus bakgrund</button>
            </div>
          </div>
        </div>

        {SECTIONS.map(section => (
          <section key={section.id} id={section.id} data-category={section.id} className={`dg-section dg-section--${section.id}`} aria-labelledby={`heading-${section.id}`}>
            <div className="dg-section-heading">
              <div className="dg-section-title"><span className="dg-section-number">{section.number}</span><div><h2 id={`heading-${section.id}`}>{section.title}</h2><p>{section.subtitle}</p></div></div>
              <span className="dg-section-tag">{section.tag}</span>
            </div>
            <div className="dg-grid">
              {DESIGN_CATALOG.filter(design => design.category === section.id).map((design, index) => (
                <article className="dg-card" key={design.id} data-design-id={design.id} style={{ '--design-accent': design.accent } as CSSProperties}>
                  <div className="dg-art">
                    <span className="dg-card-index" aria-hidden="true">{section.number}.{String(index + 1).padStart(2, '0')}</span>
                    <span className="dg-view-label">TOP-DOWN</span>
                    <canvas data-art-id={design.id} role="img" aria-label={`${design.name}: ${design.description}`}>{design.name}: {design.description}</canvas>
                    <span className="dg-art-cross dg-art-cross--a" aria-hidden="true" /><span className="dg-art-cross dg-art-cross--b" aria-hidden="true" />
                  </div>
                  <div className="dg-card-info"><div><h3><span aria-hidden="true" />{design.name}</h3><p>{design.description}</p></div><button type="button" className="dg-download" disabled={exporting !== null} onClick={() => void download(design)} aria-label={`Ladda ner ${design.name} som transparent PNG`} title="Ladda ner transparent PNG, 1024 × 1024"><DownloadIcon /><span>{exporting === design.id ? 'Sparar' : 'PNG'}</span></button></div>
                </article>
              ))}
            </div>
          </section>
        ))}
        <footer className="dg-footer"><span>SPACE FORCE <span aria-hidden="true">/</span> DESIGN COLLECTION 01</span><p>14 designer · transparent export · redo för rörelse</p><a href="/">Till spelet <span aria-hidden="true">↗</span></a></footer>
      </main>
      <p className="dg-export-status" role="status">{exportStatus}</p>
    </div>
  )
}
