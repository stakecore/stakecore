import { create } from 'zustand'
import { safeLocal } from '~/utils/safeStorage'
import { THEME_COLORS, THEME_KEY, isTheme, type Theme } from './types'


// Theme state. Mirrors the pre-paint script in index.html: a stored choice
// wins, and otherwise it is dark. `prefers-color-scheme` is deliberately NOT
// consulted — dark is the brand's default and a light-OS visitor still gets
// it until they press the toggle. That is what removed the `pinned` flag this
// store used to carry: it existed only to stop following the OS once a choice
// had been made, and there is no longer anything to stop.
//
// The script has already stamped data-theme by the time this module
// evaluates; resolving again here (rather than reading the attribute back)
// keeps the store correct in tests and in any document that lacks the script.
export interface ThemeState {
  theme: Theme
  toggleTheme: () => void
}

const resolveInitialTheme = (): Pick<ThemeState, 'theme'> => {
  const stored = safeLocal.get(THEME_KEY)
  return { theme: isTheme(stored) ? stored : 'dark' }
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
    set({ theme })
  },
}))
