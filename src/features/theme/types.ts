// Shared by the store, the toggle, and the e2e fixtures — which import this
// under Node, so nothing in here may touch the DOM.

export type Theme = 'light' | 'dark'

export const THEMES: readonly Theme[] = ['dark', 'light']

// The one storage key. index.html's pre-paint script repeats it as a literal
// because it runs before any module can load; prepaint.test.ts pins the two.
export const THEME_KEY = 'stakecore:theme'

export const isTheme = (v: unknown): v is Theme => v === 'light' || v === 'dark'

// <meta name="theme-color"> per theme — the browser chrome around the page.
export const THEME_COLORS: Record<Theme, string> = { dark: '#000000', light: '#ffffff' }
