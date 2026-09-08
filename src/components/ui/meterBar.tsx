import { useMemo } from "react"
import { Formatter } from "~/utils/misc/formatter"
import './meterBar.scss'

const MAX_PERC = 100

const LEDS_PER_PIXEL = 0.035
const MIN_LEDS = 10
const MAX_LEDS = 70

const OPACITY_BEFORE = 0.25
const OPACITY_AFTER = 1

// Each tier carries the flat label colour (a theme token — it is text, and
// needs an AA light value) + the radial gradient used to render the LED
// itself (literal — a fill that reads on either ground).
type StatusPalette = { label: string, gradient: string }

const STATUS_BAD:    StatusPalette = { label: 'var(--status-bad)',  gradient: 'radial-gradient(#d94357 25%, #a82234)' }
const STATUS_MEDIUM: StatusPalette = { label: 'var(--status-warn)', gradient: 'radial-gradient(#a05714 25%, #dd781c)' }
const STATUS_GOOD:   StatusPalette = { label: 'var(--status-good)', gradient: 'radial-gradient(#487e3c 25%, #64ae55)' }
const STATUS_PALETTE = [STATUS_BAD, STATUS_MEDIUM, STATUS_GOOD]

// getColorIdx returns 0..ranges.length, and `ranges` is a 2-tuple against a
// 3-tier palette, so the index is always in bounds today. Widening `ranges`
// without adding a tier would otherwise read `undefined.gradient` mid-render
// and blank the page; falling back to the top tier keeps that a colour bug.
const paletteAt = (idx: number): StatusPalette =>
  STATUS_PALETTE[idx] ?? STATUS_GOOD

type args = {
  name: string
  ranges: [number, number]
  value: number
  text?: string
  height?: number
  reverse?: boolean
}

const MeterBar = ({ name, value, text, ranges, height = 40 }: args) => {
  const leds = Math.min(Math.max(LEDS_PER_PIXEL * window.innerWidth, MIN_LEDS), MAX_LEDS)

  const scaledValue = value * MAX_PERC

  const { data, valueidx } = useMemo(() => {
    let valueidx = 0

    function getRatio(index: number) {
      return Math.floor(MAX_PERC * index / leds)
    }

    function getColorIdx(ratio: number, val: number): number {
      if (ratio < val) return valueidx
      let coloridx: number | null = null
      for (let i = 0; i < ranges.length; i++) {
        const bound = ranges[i]
        if (bound != null && bound >= ratio) {
          coloridx = i
          break
        }
      }
      return coloridx ?? ranges.length
    }

    valueidx = getColorIdx(scaledValue, -1)

    const data: { palette: StatusPalette, opacity: number }[] = []
    for (let i = 0; i < leds; i++) {
      const ratio = getRatio(i)
      const idx = getColorIdx(ratio, scaledValue)
      const opacity = scaledValue < ratio ? OPACITY_BEFORE : OPACITY_AFTER
      data.push({ palette: paletteAt(idx), opacity })
    }

    return { data, valueidx }
  }, [scaledValue, leds, ranges])

  return (
    <div className="meter-bar-container">
      <h3 className='meter-bar-title'>{name}</h3>
      <div className='meter-bar' style={{ height }}>
        {
          data.map((d, i) => {
            return <span className='meter-bar-led'
              key={i} style={{ background: d.palette.gradient, opacity: d.opacity }}></span>
          })
        }
        <span className='meter-bar-desc' style={{ color: paletteAt(valueidx).label }}>
          { text ?? Formatter.percent(scaledValue / MAX_PERC) }
        </span>
      </div>
    </div>
  );
};

export default MeterBar
