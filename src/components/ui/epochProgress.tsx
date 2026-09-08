import { useEffect, useState } from "react"
import { Formatter } from "~/utils/misc/formatter"
import MetaPill from "./metaPill"
import './epochProgress.scss'

type MetadataItem = { label: string; value: string | number }

export type EpochPeriod = {
  startMs: number
  endMs: number
  metadata: MetadataItem[]
}

type Props = {
  /** Compute the current period boundaries and metadata from a timestamp */
  period: (now: number) => EpochPeriod
  /** Optional accent color for the fill (default: the ink token) */
  color?: string
}

const EpochProgress = ({ period, color = 'var(--heading-color)' }: Props) => {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const { startMs, endMs, metadata } = period(now)
  const total = endMs - startMs
  const elapsed = Math.min(Math.max(now - startMs, 0), total)
  const progress = total > 0 ? (elapsed / total) * 100 : 0
  const remaining = Math.max(endMs - now, 0)

  return (
    <div className="epoch-progress">
      {metadata.length > 0 && (
        <div className="epoch-progress-meta">
          {metadata.map((m) => (
            <MetaPill key={m.label} label={m.label} value={m.value} />
          ))}
        </div>
      )}

      <div className="epoch-progress-bar">
        <div
          className="epoch-progress-fill"
          style={{ width: `${progress}%`, background: color }}
        />
      </div>

      <div className="epoch-progress-footer">
        <span>{progress.toFixed(1)}%</span>
        <span>{Formatter.duration(remaining)} remaining</span>
      </div>
    </div>
  )
}

export default EpochProgress
