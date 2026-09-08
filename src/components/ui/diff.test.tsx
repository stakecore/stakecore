// @vitest-environment happy-dom

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Diff } from './diff'

afterEach(cleanup)

describe('Diff', () => {
  it('colours a positive change with the positive token, on text and arrow alike', () => {
    render(<Diff diff="1.2" unit="%" />)
    const el = screen.getByText('1.2 %').parentElement!
    expect(el.style.color).toBe('var(--diff-positive)')
    // currentColor, not the token directly: the svg is a presentation
    // attribute, and currentColor there resolves against the span's own
    // `color` (set above) without depending on var() inside the attribute.
    expect(el.querySelector('svg')?.getAttribute('fill')).toBe('currentColor')
  })

  it('colours a negative change with the negative token and strips the sign', () => {
    render(<Diff diff="-3" />)
    const el = screen.getByText('3').parentElement!
    expect(el.style.color).toBe('var(--diff-negative)')
  })

  it('applies the pill class and the sign modifier when asked', () => {
    render(<Diff diff="-3" pill />)
    const el = screen.getByText('3').parentElement!
    expect(el.classList.contains('diff-pill')).toBe(true)
    expect(el.classList.contains('negative')).toBe(true)
    expect(el.classList.contains('positive')).toBe(false)
    expect(el.style.color).toBe('var(--diff-negative)')
    // The pill background is a color-mix() of the same token, applied via
    // .diff-pill.negative in diff.scss rather than an inline style. happy-dom
    // does not apply external stylesheet rules, so the computed background
    // isn't assertable here — verified visually in the browser instead.
  })

  it('applies the positive modifier for a positive pill', () => {
    render(<Diff diff="3" pill />)
    const el = screen.getByText('3').parentElement!
    expect(el.classList.contains('diff-pill')).toBe(true)
    expect(el.classList.contains('positive')).toBe(true)
    expect(el.classList.contains('negative')).toBe(false)
  })
})
