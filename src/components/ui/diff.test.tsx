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
    expect(el.querySelector('svg')?.getAttribute('fill')).toBe('var(--diff-positive)')
  })

  it('colours a negative change with the negative token and strips the sign', () => {
    render(<Diff diff="-3" />)
    const el = screen.getByText('3').parentElement!
    expect(el.style.color).toBe('var(--diff-negative)')
  })

  it('applies the pill class when asked', () => {
    render(<Diff diff="-3" pill />)
    const el = screen.getByText('3').parentElement!
    expect(el.className).toBe('diff-pill')
    expect(el.style.color).toBe('var(--diff-negative)')
    // The pill background is a color-mix() of the same token. happy-dom's
    // style parser keeps var() but drops color-mix() values (checked), so
    // that half is verified in the browser in Step 8, not here.
  })
})
