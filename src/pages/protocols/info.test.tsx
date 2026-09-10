// @vitest-environment happy-dom

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import InfoComponent from './info'
import type { ISummary } from './types'

// The summary card is a label above a value. Two of its four rows are bounded
// ranges, laid out as an aligned Min/Max stack — bound name in a narrow left
// column, figure beside it, one bound per row. Two earlier forms are worth
// knowing about, because each fixed the one before it: "25.0 to 93.0" left the
// reader to infer the numbers were a min and a max, and the single flex line
// that replaced it ("Min 25.0 Max 93.0 FLR") wrapped at the real column width.
//
// The delegation range carries no unit at all: the Asset row two rows above it
// names the token, so repeating it was the clutter. Lockup keeps one, because
// nothing else on the card says "days" — and it appears once, on the Max row,
// at the end of the range rather than on each bound.

const summaryOf = (o: Partial<ISummary> = {}): ISummary => ({
  asset: 'FLR',
  apy: '7.00%',
  delegation: { min: '25.0', max: '93.0' },
  lockup: { min: '14', max: '149', unit: 'days' },
  ...o,
})

const renderInfo = (o: Partial<ISummary> = {}) =>
  render(<InfoComponent summary={summaryOf(o)} specs={[]} />)

// Each row is a .single-info holding <p>label</p> + <h3>value</h3>. Throws
// rather than asserting non-null, so a change to that structure fails here
// with a readable message instead of a null dereference three lines later.
const valueUnder = (label: string): HTMLElement => {
  const value = screen.getByText(label).closest('.single-info')?.querySelector('h3')
  if (value == null) throw new Error(`no <h3> value rendered under "${label}"`)
  return value
}

const textOf = (el: Element): string => el.textContent?.replace(/\s+/g, ' ').trim() ?? ''

afterEach(cleanup)

describe('summary card ranges', () => {
  it('names both bounds and states no unit the card already implies', () => {
    renderInfo()

    // Normalised, because the labels and figures are separate elements. The
    // absent "FLR" is the assertion: the Asset row supplies it.
    expect(textOf(valueUnder('Delegation'))).toBe('Min 25.0 Max 93.0')
  })

  it('carries a unit the card does not imply once, at the end of the range', () => {
    renderInfo()

    expect(textOf(valueUnder('Lockup'))).toBe('Min 14 Max 149 days')
  })

  it('marks up the bound names so they can be de-emphasised', () => {
    renderInfo()

    const bounds = valueUnder('Delegation').querySelectorAll('.single-info-bound')
    expect([...bounds].map(b => b.textContent)).toEqual(['Min', 'Max'])
  })

  it('gives each figure its own element, so the stacked rows can align', () => {
    renderInfo()

    // The bound names sit in one grid column and the figures in the next. A
    // bare text node would be placed as an anonymous grid item — laid out, but
    // unstyleable, so the figures could not take the tabular alignment that
    // makes 25.0 and 93.0 line up digit-for-digit.
    const figures = valueUnder('Delegation').querySelectorAll('.single-info-figure')
    expect([...figures].map(f => textOf(f))).toEqual(['25.0', '93.0'])
  })

  it('keeps the unit with the figure it trails, not in the bound column', () => {
    renderInfo()

    const figures = valueUnder('Lockup').querySelectorAll('.single-info-figure')
    expect([...figures].map(f => textOf(f))).toEqual(['14', '149 days'])
  })

  it('keeps each bound grouped with its figure', () => {
    renderInfo()

    // The group no longer forms a box of its own — the grid row does the
    // wrap protection its flex box used to. It stays because it is what ties
    // a bound name to its figure for anything reading the tree.
    const groups = valueUnder('Delegation').querySelectorAll('.single-info-bound-group')
    expect([...groups].map(g => textOf(g))).toEqual(['Min 25.0', 'Max 93.0'])
  })

  it('renders a plain-string value untouched, with no bound scaffolding', () => {
    // What the FSP routes send: they have no bounds at all.
    renderInfo({ delegation: 'No Limit', lockup: 'No Limit' })

    const value = valueUnder('Delegation')
    expect(value.textContent).toBe('No Limit')
    expect(value.querySelectorAll('.single-info-bound')).toHaveLength(0)
  })

  it('renders the Unavailable fallback as plain text too', () => {
    renderInfo({ delegation: 'Unavailable' })

    expect(valueUnder('Delegation').textContent).toBe('Unavailable')
  })

  it('leaves the unbounded rows alone', () => {
    renderInfo()

    expect(valueUnder('Asset').textContent).toBe('FLR')
    expect(valueUnder('APY').textContent).toBe('7.00%')
  })
})
