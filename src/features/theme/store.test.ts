// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { THEME_KEY } from './types'

// The store resolves its initial state when the module evaluates, so every
// case below loads a fresh copy after arranging storage and the OS query.
const loadStore = async () => (await import('./store')).useThemeStore

// The store no longer consults matchMedia at all. The stub stays so a
// regression that reintroduces an OS read is *observable* — `osPrefersLight`
// is set to true in one test precisely to prove the answer is ignored.
let osPrefersLight = false

const stubMatchMedia = () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-color-scheme: light)' && osPrefersLight,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

// Same technique as safeStorage.test.ts: a throwing getter on the property,
// never a prototype spy (those were seen to stop applying mid-file).
const realDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
const blockStorage = () => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() { throw new DOMException('access denied', 'SecurityError') },
  })
  expect(() => localStorage).toThrow()
}
const restoreStorage = () => {
  if (realDescriptor) Object.defineProperty(window, 'localStorage', realDescriptor)
}

const meta = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content')

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  osPrefersLight = false
  stubMatchMedia()
  delete document.documentElement.dataset.theme
  document.head.innerHTML = '<meta name="theme-color" content="#000000">'
})

afterEach(() => {
  restoreStorage()
  vi.unstubAllGlobals()
})

describe('initial theme', () => {
  it('uses a stored choice', async () => {
    localStorage.setItem(THEME_KEY, 'light')
    const store = await loadStore()
    expect(store.getState().theme).toBe('light')
  })

  it('defaults to dark with nothing stored', async () => {
    const store = await loadStore()
    expect(store.getState().theme).toBe('dark')
  })

  it('still defaults to dark when the OS asks for light', async () => {
    // The point of the change that removed OS-following: a light system does
    // not get a light site until its owner presses the toggle.
    osPrefersLight = true
    const store = await loadStore()
    expect(store.getState().theme).toBe('dark')
  })

  it('ignores a stored value that is not a theme', async () => {
    localStorage.setItem(THEME_KEY, 'blue')
    const store = await loadStore()
    expect(store.getState().theme).toBe('dark')
  })

  it('defaults to dark when storage is blocked', async () => {
    blockStorage()
    const store = await loadStore()
    expect(store.getState().theme).toBe('dark')
  })

  it('does not touch matchMedia at all', async () => {
    // Guards the removal itself: a reintroduced OS read would throw here
    // rather than silently start following the system again.
    vi.stubGlobal('matchMedia', () => { throw new Error('matchMedia must not be consulted') })
    const store = await loadStore()
    expect(store.getState().theme).toBe('dark')
  })
})

describe('toggleTheme', () => {
  it('flips the theme, stamps the document and persists', async () => {
    const store = await loadStore()
    store.getState().toggleTheme()
    expect(store.getState().theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(meta()).toBe('#ffffff')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
  })

  it('flips back on a second call', async () => {
    const store = await loadStore()
    store.getState().toggleTheme()
    store.getState().toggleTheme()
    expect(store.getState().theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(meta()).toBe('#000000')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
  })

  it('still applies for the session when the write fails', async () => {
    // Unlike the chunk-reload flag, a lost write here has no worse failure
    // mode than "the choice does not outlive the tab" — so it is not gated.
    const store = await loadStore()
    blockStorage()
    expect(() => store.getState().toggleTheme()).not.toThrow()
    expect(store.getState().theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('stamps the document before notifying subscribers', async () => {
    // Canvas subscribers re-read the palette with getComputedStyle inside
    // their listener; if the attribute landed afterwards they would read the
    // old theme's colours.
    const store = await loadStore()
    let seen: string | undefined
    store.subscribe(() => { seen = document.documentElement.dataset.theme })
    store.getState().toggleTheme()
    expect(seen).toBe('light')
  })
})
