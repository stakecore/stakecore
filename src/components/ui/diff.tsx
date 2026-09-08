import './diff.scss'

// Percent-change colours. Tokens rather than literals so the light palette
// can supply AA values (#50e3c2 on white is 1.7:1); the pill background is
// the same token at 12%, which is what the old rgba literals were.
const COLOR_POSITIVE = 'var(--diff-positive)'
const COLOR_NEGATIVE = 'var(--diff-negative)'
const BG_POSITIVE = 'color-mix(in srgb, var(--diff-positive) 12%, transparent)'
const BG_NEGATIVE = 'color-mix(in srgb, var(--diff-negative) 12%, transparent)'

export const Diff = ({ diff, unit = "", pill = false }) => {
  const neg = typeof diff === 'string' && diff.startsWith('-')
  const value = neg ? diff.slice(1) : diff
  const color = neg ? COLOR_NEGATIVE : COLOR_POSITIVE

  const pillStyle = pill ? { backgroundColor: neg ? BG_NEGATIVE : BG_POSITIVE } : undefined

  return (
    <span className={pill ? 'diff-pill' : undefined} style={{ color, ...pillStyle }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
        <path d={neg ? "M4 8L12 18L20 8Z" : "M4 16L12 6L20 16Z"} />
      </svg>
      <span className="diff-text">{value} {unit}</span>
    </span>
  )
}
