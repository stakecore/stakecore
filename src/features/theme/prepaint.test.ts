// @vitest-environment happy-dom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { THEME_KEY } from './types'

// The pre-paint script in index.html is the one piece of theme logic that
// cannot import from src/ — it has to run before any module loads. So this
// test lifts it out of the HTML and runs it against happy-dom's globals, to
// prove it resolves the way the store does and reads the store's key.
const html = readFileSync(resolve(__dirname, '../../../index.html'), 'utf8')

const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1] ?? '')
const prepaint = inlineScripts.find(s => s.includes(THEME_KEY))

const runPrepaint = () => {
  expect(prepaint, `no inline <script> in index.html mentions ${THEME_KEY}`).toBeDefined()
  // Runs against the test's window/document/localStorage globals.
  new Function(prepaint ?? '')()
}

const stubMatchMedia = (light: boolean) => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: light && query === '(prefers-color-scheme: light)' }))
}

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
  document.head.innerHTML = '<meta name="theme-color" content="#000000">'
  stubMatchMedia(false)
})

afterEach(() => vi.unstubAllGlobals())

describe('index.html pre-paint script', () => {
  it('sits before the module script, so it runs before first paint', () => {
    expect(html.indexOf(prepaint ?? '')).toBeLessThan(html.indexOf('<script type="module"'))
  })

  it('uses a stored choice', () => {
    localStorage.setItem(THEME_KEY, 'light')
    runPrepaint()
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#ffffff')
  })

  it('follows a light OS when nothing is stored', () => {
    stubMatchMedia(true)
    runPrepaint()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('defaults to dark', () => {
    runPrepaint()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#000000')
  })

  it('ignores junk in storage', () => {
    localStorage.setItem(THEME_KEY, 'blue')
    runPrepaint()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('survives blocked storage and a missing matchMedia', () => {
    const real = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('access denied', 'SecurityError') },
    })
    vi.stubGlobal('matchMedia', undefined)
    try {
      expect(() => runPrepaint()).not.toThrow()
      expect(document.documentElement.dataset.theme).toBe('dark')
    } finally {
      if (real) Object.defineProperty(window, 'localStorage', real)
    }
  })
})
