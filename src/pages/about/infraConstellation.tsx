import { useEffect, useRef, useState } from 'react'
import './infraConstellation.scss'

// Abstract Nomad-cluster visualisation, grouped by chain.
//
// Three server nodes at centre — each dedicated to one chain. Twelve
// workloads orbit around them in a jittered ring, four per chain:
//
//   • Flare workloads      (pink)   → top server
//   • Songbird workloads   (amber)  → bottom-left server
//   • Avalanche workloads  (red)    → bottom-right server
//
// EXACTLY ONE workload per chain is "active" at any moment — bright,
// with a live info-flow line back to that chain's server. The three
// remaining instances of each chain are hot spares: dim, no line,
// waiting for the active one to fail. So at any given moment the
// viewer sees 3 bright dots connected to the cluster (one per chain)
// and 9 dim dots ringing the orbit as redundancy.
//
// Every ~3s a random active workload "fails": it fades out and a
// spare of the SAME CHAIN fades in. The single chain-coloured line
// stays anchored to the same server — only the workload end of the
// line moves to the new dot. The story is: failure of any single
// workload is invisible to consumers, because a redundant peer
// immediately takes over.

const VIEW = 600
const C = VIEW / 2
const ORBIT_R = 210

// Chain → workload colour: Flare pink, Songbird sky blue, Avalanche red.
// Tokens rather than literals because these are not the networks' brand hexes
// — they are lightened variants picked to read on black, and on white the
// Songbird blue fell to 2.01:1. theme.css carries a darkened light value for
// each; dark keeps exactly what was here. These land in an inline `style`,
// where var() is universally supported (unlike an SVG presentation attribute
// — see statsChart.scss for where that distinction bit).
const TYPE_COLORS = [
  'var(--infra-flare)',      // 0 — Flare (pink)
  'var(--infra-songbird)',   // 1 — Songbird (light blue)
  'var(--infra-avalanche)',  // 2 — Avalanche (red)
]
const N_TYPES = TYPE_COLORS.length
const INSTANCES_PER_TYPE = 4
const ACTIVE_PER_TYPE = 1
const N_WORKLOADS = N_TYPES * INSTANCES_PER_TYPE  // 12

// Server cluster — equilateral triangle. Each vertex is dedicated to
// one chain (index aligns with TYPE_COLORS):
//   SERVERS[0] (top)         → Flare
//   SERVERS[1] (bottom-left) → Songbird
//   SERVERS[2] (bottom-right) → Avalanche
const SERVERS = [
  { x: C,      y: C - 50 },
  { x: C - 43, y: C + 25 },
  { x: C + 43, y: C + 25 },
]

// Deterministic pseudo-random in [-max, max] — stable layout across renders.
function pseudo(seed: number, max: number) {
  const t = Math.sin(seed * 12.9898) * 43758.5453
  return ((t - Math.floor(t)) * 2 - 1) * max
}

// Workload positions — jittered around the orbit. Types interleave (i % 3)
// so the three chains stay spread evenly around the ring rather than
// clumping into three arcs.
const WORKLOADS = Array.from({ length: N_WORKLOADS }, (_, i) => {
  const type = i % N_TYPES
  const baseAngle = (i / N_WORKLOADS) * Math.PI * 2 - Math.PI / 2
  const angle = baseAngle + pseudo(i + 1, 0.16)
  const radius = ORBIT_R + pseudo(i + 17, 24)
  return {
    x: C + Math.cos(angle) * radius,
    y: C + Math.sin(angle) * radius,
    type,
  }
})

// Initial active set — first ACTIVE_PER_TYPE instances of each type.
function initialActive(): boolean[] {
  const counts = new Array(N_TYPES).fill(0)
  return WORKLOADS.map(w => {
    if (counts[w.type] < ACTIVE_PER_TYPE) {
      counts[w.type]++
      return true
    }
    return false
  })
}

const InfraConstellation = () => {
  // State lives in a ref so the setInterval callback can read fresh
  // values without restarting on every state change. A counter useState
  // forces re-renders.
  const stateRef = useRef({
    active: initialActive(),
  })
  const [, setTick] = useState(0)
  const rerender = () => setTick(t => t + 1)

  useEffect(() => {
    const tick = () => {
      const { active } = stateRef.current

      // Pick a random ACTIVE workload to fail.
      const activeIdxs: number[] = []
      for (let i = 0; i < N_WORKLOADS; i++) if (active[i]) activeIdxs.push(i)
      if (activeIdxs.length === 0) return
      const failingIdx = activeIdxs[Math.floor(Math.random() * activeIdxs.length)]
      const failing = failingIdx == null ? undefined : WORKLOADS[failingIdx]
      if (failingIdx == null || failing == null) return
      const failingType = failing.type

      // Find a hot spare of the same type. The server is implicit —
      // every workload of a given type connects to that type's
      // dedicated server, so there's no server reassignment to do.
      const spareIdxs: number[] = []
      for (let i = 0; i < N_WORKLOADS; i++) {
        if (!active[i] && WORKLOADS[i]?.type === failingType) spareIdxs.push(i)
      }
      if (spareIdxs.length === 0) return
      const replacementIdx = spareIdxs[Math.floor(Math.random() * spareIdxs.length)]
      if (replacementIdx == null) return

      // Atomic swap. CSS transitions on opacity handle the cross-fade:
      // the failing dot fades from 0.95 → 0.2 (active → spare),
      // the replacement dot fades from 0.2 → 0.95 (spare → active),
      // both at the same time over 400ms. No gap, no "waiting for the
      // spare to come online" feel — the spare was already warm.
      const newActive = [...active]
      newActive[failingIdx] = false
      newActive[replacementIdx] = true
      stateRef.current = { active: newActive }
      rerender()
    }

    // Pause the timer while the tab is backgrounded — no point churning
    // ~39 SVG nodes every 3s for an animation nobody can see.
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => { if (timer == null) timer = setInterval(tick, 3000) }
    const stop = () => { if (timer != null) { clearInterval(timer); timer = null } }
    const onVisibility = () => { document.hidden ? stop() : start() }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const { active } = stateRef.current

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      className="infra-constellation"
      role="img"
      aria-label="Cluster topology — three Nomad server nodes, one per chain, each orchestrating a set of redundant workloads"
    >
      {/* All 12 connection lines render unconditionally; opacity is
          class-controlled so React doesn't have to mount/unmount line
          nodes during failovers. Each line's server endpoint is fixed
          by the workload's type. */}
      {WORKLOADS.map((w, i) => {
        // w.type is i % N_TYPES and SERVERS has N_TYPES entries, so this
        // always resolves; skipping the line beats a thrown render if the
        // two ever drift apart.
        const s = SERVERS[w.type]
        if (s == null) return null
        const cls = `infra-line${active[i] ? ' active' : ''}`
        return (
          <line
            key={`line-${i}`}
            x1={s.x} y1={s.y}
            x2={w.x} y2={w.y}
            className={cls}
          />
        )
      })}

      {/* Workload halos — tinted by chain, only fully visible when active. */}
      {WORKLOADS.map((w, i) => {
        const cls = `infra-workload-halo${active[i] ? ' active' : ''}`
        return (
          <circle
            key={`halo-${i}`}
            cx={w.x} cy={w.y} r={14}
            className={cls}
            style={{ fill: TYPE_COLORS[w.type] }}
          />
        )
      })}

      {/* Workload dots — coloured by chain, dim when inactive (hot spare),
          bright when actively serving traffic. */}
      {WORKLOADS.map((w, i) => {
        const cls = `infra-workload${active[i] ? ' active' : ''}`
        return (
          <circle
            key={`w-${i}`}
            cx={w.x} cy={w.y} r={4.5}
            className={cls}
            style={{ fill: TYPE_COLORS[w.type] }}
          />
        )
      })}

      {/* Server cluster — stationary, white. */}
      <g className="infra-servers">
        {SERVERS.map((s, i) => (
          <circle key={`s-halo-${i}`} cx={s.x} cy={s.y} r={16} className="infra-server-halo" />
        ))}
        {SERVERS.map((s, i) => (
          <circle key={`s-${i}`} cx={s.x} cy={s.y} r={6.5} className="infra-server" />
        ))}
      </g>
    </svg>
  )
}

export default InfraConstellation
