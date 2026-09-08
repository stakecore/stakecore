import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

// theme.css is the only file allowed to know what a theme looks like, and the
// one way it silently breaks is a token added to one palette and not the
// other: the light page then inherits a dark value for that one property.
// This reads the file and checks the two blocks declare the same names.
const css = readFileSync(resolve(__dirname, 'theme.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

const block = (selector: string): string => {
  const start = css.indexOf(`${selector} {`)
  expect(start, `no "${selector} {" block in theme.css`).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('}', start))
}

const tokenNames = (s: string): string[] => [...s.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1] ?? '').sort()

describe('theme.css', () => {
  const dark = tokenNames(block(':root'))
  const light = tokenNames(block(':root[data-theme="light"]'))

  it('declares the same tokens in both palettes', () => {
    expect(light).toEqual(dark)
  })

  it('declares a color-scheme in each palette, so native controls match', () => {
    expect(block(':root')).toMatch(/color-scheme:\s*dark/)
    expect(block(':root[data-theme="light"]')).toMatch(/color-scheme:\s*light/)
  })

  it('keeps every dark value at today\'s literal', () => {
    // The pixel-identical invariant, pinned for the tokens that moved out of
    // style.css. Change one of these and you are redesigning the dark theme.
    const d = block(':root')
    expect(d).toContain('--main-color: #9f9f9f')
    expect(d).toContain('--heading-color: #fff')
    expect(d).toContain('--body-background: #000')
    expect(d).toContain('--surface-menu: #1F1F1F')
    expect(d).toContain('--text-dim: rgba(255, 255, 255, 0.55)')
    expect(d).toContain('--danger: #ff3e55')
    expect(d).toContain('--success: #7fb88f')
  })
})
