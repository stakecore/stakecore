import { useEffect, useRef } from 'react'
import { useThemeStore } from '~/features/theme/store'
import { COASTLINE_RINGS } from './coastlines'
import { project, graticule, dragRotation } from './globeProjection'
import './serverGlobe.scss'

// Spinning globe showing where the Nomad cluster actually runs.
//
// Seven nodes: three server nodes (the control plane, sage green — the
// same colour the constellation next to it uses for the same three
// machines) and four worker nodes (white, smaller) that host the
// workloads. "Worker" rather than Nomad's own "client", which reads
// backwards to anyone who has not used Nomad.
//
// The footprint is lopsided — five of six are European — so a globe that
// hid its far side would sit empty for roughly 40% of every revolution.
// Instead the far side draws faintly: coastlines, graticule and nodes all
// remain visible through the sphere, which reads as translucent and keeps
// something on screen at every angle.
//
// Canvas rather than SVG because an orthographic projection is not an
// affine transform — every point has to be re-projected each frame, and
// rebuilding ~1.4k-point path strings through React 60 times a second
// would be far more expensive than one canvas pass.

const ROTATION_PERIOD_MS = 45_000
const TILT_DEG = 30          // every node sits 45–60°N; tilt brings them to centre
const STATIC_CENTRE_LON = -25 // Atlantic-centred: Quebec and Europe both in view
const RESUME_DELAY_MS = 2_500 // idle time after a drag before auto-spin returns

const MAX_SIZE_PX = 420
const GLOBE_RADIUS_RATIO = 0.42 // leaves room for halos at the limb

// Fallbacks match --globe-server / --globe-worker / --heading-color in
// assets/css/theme.css; the live values are read from CSS at mount and again
// on every theme flip.
//
// The node dots and the structure are deliberately three colours, not two:
// the workers used to paint in pure ink, which is what made them read as
// stark white pinpricks next to the sage servers. They have their own token
// now, and `ink` is left to the sphere, graticule, coastlines and regions.
const FALLBACK_SERVER_COLOR = '#7fb88f'
const FALLBACK_WORKER_COLOR = '#93b7d4'
const FALLBACK_INK_COLOR = '#ffffff'

const GRATICULE_LINES = graticule()

interface Node {
  city: string
  lat: number
  lon: number
  role: 'server' | 'worker'
}

// Node locations, resolved from their region slugs. Nomad calls the
// workload hosts "clients"; they are labelled workers throughout here so
// the page does not lean on Nomad vocabulary to be understood.
export const NODES: readonly Node[] = [
  { city: 'Beauharnois', lat: 45.31, lon: -73.87, role: 'server' },
  { city: 'Helsinki', lat: 60.17, lon: 24.94, role: 'server' },
  { city: 'Nuremberg', lat: 49.45, lon: 11.08, role: 'server' },
  { city: 'Roubaix', lat: 50.69, lon: 3.18, role: 'worker' },
  { city: 'Frankfurt', lat: 50.11, lon: 8.68, role: 'worker' },
  { city: 'Warsaw', lat: 52.23, lon: 21.01, role: 'worker' },
  { city: 'Ljubljana', lat: 46.06, lon: 14.51, role: 'worker' },
]

const serverNodes = NODES.filter(n => n.role === 'server')
const workerNodes = NODES.filter(n => n.role === 'worker')

// Every datacenter region OVHcloud and Hetzner publish, which is the set a
// workload could be scheduled into without changing anything but a job
// specification — the claim the section next to this already makes.
//
// These are THEIR sites, not ours. Seven of them happen to hold a node
// today (those draw over the top as real nodes); the rest are capacity,
// and the legend says so. Nothing here should ever be read as somewhere
// StakeCore runs — if that distinction ever blurs in the copy or the
// styling, delete the layer rather than let the globe overstate the
// footprint.
//
// Sources, both checked August 2026:
//   https://www.ovhcloud.com/en/datacenter/
//   https://www.hetzner.com/unternehmen/rechenzentrum/
interface Region {
  city: string
  lat: number
  lon: number
}

const PROVIDER_REGIONS: readonly Region[] = [
  // OVHcloud
  { city: 'Sydney', lat: -33.87, lon: 151.21 },
  { city: 'Beauharnois', lat: 45.31, lon: -73.87 },
  { city: 'Toronto', lat: 43.65, lon: -79.38 },
  { city: 'Gravelines', lat: 50.99, lon: 2.13 },
  { city: 'Paris', lat: 48.86, lon: 2.35 },
  { city: 'Roubaix', lat: 50.69, lon: 3.18 },
  { city: 'Strasbourg', lat: 48.58, lon: 7.75 },
  { city: 'Frankfurt', lat: 50.11, lon: 8.68 },
  { city: 'Mumbai', lat: 19.08, lon: 72.88 },
  { city: 'Milan', lat: 45.46, lon: 9.19 },
  { city: 'Warsaw', lat: 52.23, lon: 21.01 },
  { city: 'Singapore', lat: 1.35, lon: 103.82 },
  { city: 'London', lat: 51.51, lon: -0.13 },
  { city: 'Hillsboro', lat: 45.52, lon: -122.99 },
  { city: 'Vint Hill', lat: 38.72, lon: -77.72 },
  // Hetzner (Hillsboro and Singapore are already listed above)
  { city: 'Nuremberg', lat: 49.45, lon: 11.08 },
  { city: 'Falkenstein', lat: 50.48, lon: 12.37 },
  { city: 'Helsinki', lat: 60.17, lon: 24.94 },
  { city: 'Ashburn', lat: 39.04, lon: -77.49 },
]

const ARIA_LABEL =
  'Globe showing StakeCore node locations. Server nodes in ' +
  serverNodes.map(n => n.city).join(', ') +
  '. Worker nodes in ' +
  workerNodes.map(n => n.city).join(', ') +
  `. Also marked are ${PROVIDER_REGIONS.length} OVHcloud and Hetzner ` +
  'datacenter regions the cluster can be scheduled into.'

/**
 * Stroke a set of flat [lon, lat, ...] polylines, keeping only the points
 * on the requested face of the sphere.
 *
 * A line is broken wherever it crosses the limb: the pen lifts and a new
 * subpath starts on the far side, so nothing is drawn straight across the
 * disc. The crossing point is not interpolated — at this size a segment is
 * around a pixel, so the seam is not visible.
 */
function strokeLines(
  ctx: CanvasRenderingContext2D,
  lines: readonly (readonly number[])[],
  cx: number,
  cy: number,
  radius: number,
  centreLon: number,
  centreLat: number,
  nearFace: boolean,
) {
  ctx.beginPath()
  for (const line of lines) {
    let penDown = false
    for (let i = 0; i < line.length; i += 2) {
      const lon = line[i]
      const lat = line[i + 1]
      // Coordinates are stored flat as [lon, lat, lon, lat, …]; a trailing
      // odd element would otherwise project NaN and break the whole path.
      if (lon == null || lat == null) break
      const p = project(lon, lat, centreLon, centreLat, radius)
      if (p.visible !== nearFace) {
        penDown = false
        continue
      }
      if (penDown) ctx.lineTo(cx + p.x, cy + p.y)
      else { ctx.moveTo(cx + p.x, cy + p.y); penDown = true }
    }
  }
  ctx.stroke()
}

// Provider capacity: deliberately the quietest marker on the sphere. Smaller
// and dimmer than either node class, so it reads as texture behind the
// cluster rather than as more nodes. The near/far split matches everything
// else.
function drawRegions(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  centreLon: number,
  centreLat: number,
  nearFace: boolean,
  ink: string,
) {
  ctx.fillStyle = ink
  for (const region of PROVIDER_REGIONS) {
    const p = project(region.lon, region.lat, centreLon, centreLat, radius)
    if (p.visible !== nearFace) continue
    const x = cx + p.x
    const y = cy + p.y

    // A halo, as the nodes have, but a fraction of the strength. Without it
    // a 2px dot at this alpha disappears against the coastlines, which was
    // the first attempt: the Asian and Australian regions were invisible on
    // the very half of the rotation they exist to fill.
    ctx.globalAlpha = nearFace ? 0.07 : 0.03
    ctx.beginPath()
    ctx.arc(x, y, nearFace ? 6 : 4.5, 0, Math.PI * 2)
    ctx.fill()

    ctx.globalAlpha = nearFace ? 0.5 : 0.18
    ctx.beginPath()
    ctx.arc(x, y, nearFace ? 2.2 : 1.7, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawNodes(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  centreLon: number,
  centreLat: number,
  nearFace: boolean,
  serverColor: string,
  workerColor: string,
) {
  for (const node of NODES) {
    const p = project(node.lon, node.lat, centreLon, centreLat, radius)
    if (p.visible !== nearFace) continue

    const x = cx + p.x
    const y = cy + p.y
    const isServer = node.role === 'server'
    const color = isServer ? serverColor : workerColor

    // Far-side nodes are drawn dimmer and slightly smaller so they read as
    // sitting behind the sphere — but not so dim they vanish. For roughly a
    // third of each revolution every node is past the limb, and if the far
    // face were much fainter than this the globe would simply look empty.
    const dotRadius = (isServer ? 4 : 3) * (nearFace ? 1 : 0.85)

    ctx.globalAlpha = nearFace ? 0.16 : 0.07
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, (isServer ? 11 : 9) * (nearFace ? 1 : 0.75), 0, Math.PI * 2)
    ctx.fill()

    ctx.globalAlpha = nearFace ? 1 : 0.5
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, dotRadius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function draw(
  ctx: CanvasRenderingContext2D,
  size: number,
  centreLon: number,
  centreLat: number,
  serverColor: string,
  workerColor: string,
  ink: string,
) {
  const cx = size / 2
  const cy = size / 2
  const radius = size * GLOBE_RADIUS_RATIO

  ctx.clearRect(0, 0, size, size)

  // Every structural stroke is the ink colour at a fixed alpha — the same
  // values the rgba(255,255,255,α) literals carried, so the dark render is
  // unchanged, and on the light palette the ink is black.
  ctx.fillStyle = ink
  ctx.strokeStyle = ink
  ctx.lineWidth = 1

  // Sphere body — barely-there fill so the disc reads as a solid object
  // against the page rather than as a floating wireframe.
  ctx.globalAlpha = 0.022
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()

  // Far face first, so the near face paints over it.
  ctx.globalAlpha = 0.05
  strokeLines(ctx, GRATICULE_LINES, cx, cy, radius, centreLon, centreLat, false)
  ctx.globalAlpha = 0.12
  strokeLines(ctx, COASTLINE_RINGS, cx, cy, radius, centreLon, centreLat, false)
  ctx.globalAlpha = 1
  drawRegions(ctx, cx, cy, radius, centreLon, centreLat, false, ink)
  drawNodes(ctx, cx, cy, radius, centreLon, centreLat, false, serverColor, workerColor)

  // Neither drawRegions nor drawNodes touches strokeStyle today, so this
  // re-set is currently redundant with the one above — it guards against a
  // future edit to either function changing strokeStyle (e.g. to draw node
  // outlines in serverColor) and silently bleeding into the strokes below.
  ctx.strokeStyle = ink
  ctx.globalAlpha = 0.08
  strokeLines(ctx, GRATICULE_LINES, cx, cy, radius, centreLon, centreLat, true)
  ctx.globalAlpha = 0.34
  strokeLines(ctx, COASTLINE_RINGS, cx, cy, radius, centreLon, centreLat, true)

  // Limb, to close the silhouette.
  ctx.globalAlpha = 0.14
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 1

  drawRegions(ctx, cx, cy, radius, centreLon, centreLat, true, ink)
  drawNodes(ctx, cx, cy, radius, centreLon, centreLat, true, serverColor, workerColor)
}

const ServerGlobe = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas == null) return
    const ctx = canvas.getContext('2d')
    if (ctx == null) return

    let serverColor = FALLBACK_SERVER_COLOR
    let workerColor = FALLBACK_WORKER_COLOR
    let ink = FALLBACK_INK_COLOR
    const readColors = () => {
      const styles = getComputedStyle(canvas)
      serverColor = styles.getPropertyValue('--globe-server').trim() || FALLBACK_SERVER_COLOR
      workerColor = styles.getPropertyValue('--globe-worker').trim() || FALLBACK_WORKER_COLOR
      ink = styles.getPropertyValue('--heading-color').trim() || FALLBACK_INK_COLOR
    }
    readColors()

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    // CSS pixels; the backing store is this times devicePixelRatio.
    let size = 0
    let centreLon = STATIC_CENTRE_LON
    let centreLat = TILT_DEG

    const resize = () => {
      const width = canvas.parentElement?.clientWidth ?? 0
      const next = Math.max(0, Math.min(width, MAX_SIZE_PX))
      if (next === size) return
      size = next
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(size * dpr)
      canvas.height = Math.round(size * dpr)
      canvas.style.width = `${size}px`
      canvas.style.height = `${size}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw(ctx, size, centreLon, centreLat, serverColor, workerColor, ink)
    }

    resize()

    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && canvas.parentElement != null) {
      observer = new ResizeObserver(resize)
      observer.observe(canvas.parentElement)
    }

    let frame: number | null = null
    let lastTime: number | null = null

    const tick = (now: number) => {
      // Advance by elapsed time rather than a fixed step per frame, so the
      // rotation rate is the same on a 60Hz and a 144Hz display, and so
      // resuming after a pause continues rather than jumping.
      if (lastTime != null) {
        centreLon = (centreLon + ((now - lastTime) / ROTATION_PERIOD_MS) * 360) % 360
      }
      lastTime = now
      if (size > 0) draw(ctx, size, centreLon, centreLat, serverColor, workerColor, ink)
      frame = requestAnimationFrame(tick)
    }

    // Auto-spin never runs for reduced-motion users — their globe only
    // moves under their own pointer. The guard lives here so every resume
    // path (post-drag timer, tab becoming visible) inherits it.
    const start = () => {
      if (reduceMotion || dragPointer != null || frame != null) return
      lastTime = null
      frame = requestAnimationFrame(tick)
    }
    const stop = () => {
      if (frame != null) { cancelAnimationFrame(frame); frame = null }
    }
    const onVisibility = () => { document.hidden ? stop() : start() }

    // Drag to rotate. While a drag is live the rAF loop is stopped and
    // pointermove drives redraws directly; auto-spin returns (longitude
    // only — the tilt stays where the user left it) after a short idle.
    let dragPointer: number | null = null
    let lastX = 0
    let lastY = 0
    let resumeTimer: ReturnType<typeof setTimeout> | null = null

    const onPointerDown = (e: PointerEvent) => {
      if (dragPointer != null || size === 0) return
      dragPointer = e.pointerId
      lastX = e.clientX
      lastY = e.clientY
      if (resumeTimer != null) { clearTimeout(resumeTimer); resumeTimer = null }
      stop()
      canvas.classList.add('is-dragging')
      // happy-dom (tests) has no pointer capture; browsers need it so the
      // drag survives the pointer leaving the canvas.
      if (typeof canvas.setPointerCapture === 'function') canvas.setPointerCapture(e.pointerId)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== dragPointer) return
      const next = dragRotation(
        centreLon, centreLat,
        e.clientX - lastX, e.clientY - lastY,
        size * GLOBE_RADIUS_RATIO,
      )
      lastX = e.clientX
      lastY = e.clientY
      centreLon = next.lon
      centreLat = next.lat
      draw(ctx, size, centreLon, centreLat, serverColor, workerColor, ink)
    }

    const onPointerEnd = (e: PointerEvent) => {
      if (e.pointerId !== dragPointer) return
      dragPointer = null
      canvas.classList.remove('is-dragging')
      if (!reduceMotion) resumeTimer = setTimeout(start, RESUME_DELAY_MS)
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerEnd)
    canvas.addEventListener('pointercancel', onPointerEnd)

    // Re-read on a theme flip and repaint once; the running loop (if any)
    // picks the new values up on its next frame anyway. Subscribing here
    // rather than re-running the effect on `theme` keeps centreLon, so the
    // globe does not snap back to the Atlantic when the button is pressed.
    const unsubscribeTheme = useThemeStore.subscribe((state, prev) => {
      if (state.theme === prev.theme) return
      readColors()
      if (size > 0) draw(ctx, size, centreLon, centreLat, serverColor, workerColor, ink)
    })

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      unsubscribeTheme()
      stop()
      if (resumeTimer != null) clearTimeout(resumeTimer)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerEnd)
      canvas.removeEventListener('pointercancel', onPointerEnd)
      observer?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <div className="server-globe">
      <div className="server-globe-canvas-wrap">
        <canvas ref={canvasRef} role="img" aria-label={ARIA_LABEL} />
      </div>
      <dl className="server-globe-legend">
        <div className="server-globe-legend-row">
          <dt className="server-globe-legend-term server-globe-legend-term--server">Server nodes</dt>
          <dd className="server-globe-legend-cities">{serverNodes.map(n => n.city).join(' · ')}</dd>
        </div>
        <div className="server-globe-legend-row">
          <dt className="server-globe-legend-term server-globe-legend-term--worker">Worker nodes</dt>
          <dd className="server-globe-legend-cities">{workerNodes.map(n => n.city).join(' · ')}</dd>
        </div>
        {/* Worded as capacity, not presence. "Can run" rather than "runs" is
            the entire difference between this row and the two above it. */}
        <div className="server-globe-legend-row">
          <dt className="server-globe-legend-term server-globe-legend-term--region">Can run</dt>
          <dd className="server-globe-legend-cities">
            {PROVIDER_REGIONS.length} OVHcloud &amp; Hetzner regions
          </dd>
        </div>
      </dl>
    </div>
  )
}

export default ServerGlobe
