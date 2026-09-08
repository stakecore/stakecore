import type { Page } from '@playwright/test'
import { THEME_KEY, type Theme } from '../../src/features/theme/types'

export { THEMES, type Theme } from '../../src/features/theme/types'

/**
 * Pins the theme the way a returning visitor's saved choice would: the value
 * is in localStorage before any document script runs, so index.html's
 * pre-paint script stamps data-theme on the first frame. No click, no race —
 * and it exercises the same path a real saved preference takes.
 */
export async function pinTheme(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => { localStorage.setItem(key, value) },
    { key: THEME_KEY, value: theme },
  )
}
