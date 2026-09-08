import { RiMoonLine, RiSunLine } from '@remixicon/react'
import { useThemeStore } from './store'


// Two-state theme switch. The icon shows the theme you would *get* (sun in
// dark, moon in light) and the accessible name says the same in words. No
// aria-pressed: pressed state + a flipping icon + a flipping label is three
// signals for one bit, and the action-label alone is the clearest of them
// for a screen reader.
const ThemeToggle = ({ size = 16 }: { size?: number }) => {
  const theme = useThemeStore(state => state.theme)
  const toggleTheme = useThemeStore(state => state.toggleTheme)
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <button type="button" className="theme-toggle" aria-label={label} title={label} onClick={toggleTheme}>
      {theme === 'dark' ? <RiSunLine size={size} /> : <RiMoonLine size={size} />}
    </button>
  )
}

export default ThemeToggle
