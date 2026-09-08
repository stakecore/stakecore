import { create } from 'zustand'
import { safeLocal } from '~/utils/safeStorage'
import { THEME_COLORS, THEME_KEY, isTheme, type Theme } from './types'


// Theme state. Mirrors the pre-paint script in index.html: a stored choice
// wins, then the OS preference, then dark. The script has already stamped
// data-theme by the time this module evaluates; resolving again here (rather
// than reading the attribute back) keeps the store correct in tests and in
// any document that lacks the script, and it is the same three reads.
export interface ThemeState {
  theme: Theme
  // True once the visitor has clicked the toggle (or arrived with a saved
  // choice). Until then the OS preference is live and a change to it is
  // followed; after, it is ignored — two-state, no way back, by design.
  pinned: boolean
  toggleTheme: () => void
}

const LIGHT_QUERY = '(prefers-color-scheme: light)'

const osTheme = (): Theme => {
  try {
    return window.matchMedia(LIGHT_QUERY).matches ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

const resolveInitialTheme = (): Pick<ThemeState, 'theme' | 'pinned'> => {
  const stored = safeLocal.get(THEME_KEY)
  if (isTheme(stored)) return { theme: stored, pinned: true }
  return { theme: osTheme(), pinned: false }
}

// The store owns the document side of a theme change, and does it
// synchronously before `set` — not in a React effect. Canvas subscribers
// (hero rune, server globe) re-read the palette with getComputedStyle from
// inside their store listener, which fires during `set`; an effect would
// stamp the attribute one commit too late and they would read the outgoing
// theme's colours.
export const applyThemeToDocument = (theme: Theme): void => {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  ...resolveInitialTheme(),
  toggleTheme: () => {
    const theme: Theme = get().theme === 'dark' ? 'light' : 'dark'
    applyThemeToDocument(theme)
    // Return value deliberately unchecked: a failed write means the choice
    // lasts the session, which needs no different behaviour.
    safeLocal.set(THEME_KEY, theme)
    set({ theme, pinned: true })
  },
}))

// Follow the OS until the visitor pins a choice. Wrapped because matchMedia
// is absent in some embedded browsers; this is module scope, and a throw here
// is a blank page before React mounts.
try {
  window.matchMedia(LIGHT_QUERY).addEventListener('change', (e) => {
    if (useThemeStore.getState().pinned) return
    const theme: Theme = e.matches ? 'light' : 'dark'
    applyThemeToDocument(theme)
    useThemeStore.setState({ theme })
  })
} catch {
  // No matchMedia: the initial resolution already fell back to dark.
}
