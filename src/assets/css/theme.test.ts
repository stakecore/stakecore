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
    expect(d).toContain('--border-emphasis: rgba(255, 255, 255, 0.45)')
    expect(d).toContain('--border-strong: rgba(255, 255, 255, 0.25)')
    // The colon already disambiguates "--border:" from "--border-emphasis:"
    // etc., so toContain on the name alone would be safe — the value is
    // included anyway because that is the actual thing being pinned here.
    expect(d).toContain('--border: rgba(255, 255, 255, 0.1)')
    expect(d).toContain('--border-subtle: rgba(255, 255, 255, 0.08)')
    expect(d).toContain('--border-faint: rgba(255, 255, 255, 0.06)')
    expect(d).toContain('--surface-hover: rgba(255, 255, 255, 0.04)')
    expect(d).toContain('--surface-raised: rgba(255, 255, 255, 0.02)')
    expect(d).toContain('--surface-menu: #1F1F1F')
    expect(d).toContain('--text-dim: rgba(255, 255, 255, 0.55)')
    expect(d).toContain('--danger: #ff3e55')
    expect(d).toContain('--success: #7fb88f')
    // Not a token that moved out of style.css, but pinned for the same
    // reason: the hero tagline was --main-color, and it only became its own
    // token so the LIGHT palette could darken it. Dark must stay put.
    expect(d).toContain('--hero-tagline-color: #9f9f9f')
    // Was the literal fill on all four protocol thumbnail SVGs before they
    // were inlined; pinned so the dark tiles stay exactly as they rendered.
    expect(d).toContain('--thumb-surface: #0a0a0a')
    // Were literals in infraConstellation.tsx's TYPE_COLORS before they became
    // per-palette; pinned so the dark constellation keeps its exact accents.
    expect(d).toContain('--infra-flare: #e0639d')
    expect(d).toContain('--infra-songbird: #6dc1e8')
    expect(d).toContain('--infra-avalanche: #e84142')
    // The globe's server dots were --success; pinned so splitting them off
    // into their own token did not move the dark render.
    expect(d).toContain('--globe-server: #7fb88f')
  })
})
