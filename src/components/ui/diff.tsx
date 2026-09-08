import './diff.scss'

// Percent-change colours. Tokens rather than literals so the light palette
// can supply AA values (#50e3c2 on white is 1.7:1). The pill background is
// the same token at 12%, via color-mix() — but that lives in diff.scss as
// .diff-pill.positive/.negative, not here: an inline style can't carry the
// two-declaration fallback (a plain-token line before the color-mix line)
// that every stylesheet site in this branch uses, since only the last of two
// identical inline style properties would ever apply.
const COLOR_POSITIVE = 'var(--diff-positive)'
const COLOR_NEGATIVE = 'var(--diff-negative)'

export const Diff = ({ diff, unit = "", pill = false }) => {
  const neg = typeof diff === 'string' && diff.startsWith('-')
  const value = neg ? diff.slice(1) : diff
  const color = neg ? COLOR_NEGATIVE : COLOR_POSITIVE

  const pillClass = pill ? `diff-pill ${neg ? 'negative' : 'positive'}` : undefined

  return (
    <span className={pillClass} style={{ color }}>
      {/* currentColor rather than the token directly: the span above already
          sets color to the token via style={{ color }}, and currentColor in
          a presentation attribute is universally supported — no dependency
          on var() resolving inside an SVG attribute. */}
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d={neg ? "M4 8L12 18L20 8Z" : "M4 16L12 6L20 16Z"} />
      </svg>
      <span className="diff-text">{value} {unit}</span>
    </span>
  )
}
