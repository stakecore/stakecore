import { test, expect } from './fixtures/console'
import { pinTheme } from './fixtures/theme'
import { THEME_KEY } from '../src/features/theme/types'

const html = (page: import('@playwright/test').Page) => page.locator('html')
const themeColor = (page: import('@playwright/test').Page) => page.locator('meta[name="theme-color"]')

const body = (page: import('@playwright/test').Page) => page.locator('body')

// playwright.config.ts defaults colorScheme to dark; these two override it
// per block to prove first paint follows whichever the OS reports.
test.describe('with no saved preference', () => {
  test.describe('and a light OS', () => {
    test.use({ colorScheme: 'light' })
    test('first paint follows the OS', async ({ page, consoleErrors }) => {
      await page.goto('/#/about')
      await expect(html(page)).toHaveAttribute('data-theme', 'light')
      await expect(themeColor(page)).toHaveAttribute('content', '#ffffff')
      // body's background reads var(--body-background) directly
      // (style.css), so this is a direct read of the token that flipped —
      // proof the light palette actually rendered, not just the attribute.
      await expect(body(page)).toHaveCSS('background-color', 'rgb(255, 255, 255)')
      expect(consoleErrors).toEqual([])
    })
  })

  test.describe('and a dark OS', () => {
    test.use({ colorScheme: 'dark' })
    test('first paint follows the OS', async ({ page, consoleErrors }) => {
      await page.goto('/#/about')
      await expect(html(page)).toHaveAttribute('data-theme', 'dark')
      await expect(themeColor(page)).toHaveAttribute('content', '#000000')
      await expect(body(page)).toHaveCSS('background-color', 'rgb(0, 0, 0)')
      expect(consoleErrors).toEqual([])
    })
  })
})

test.describe('with a saved choice', () => {
  test.use({ colorScheme: 'dark' })
  test('the saved choice wins over the OS', async ({ page, consoleErrors }) => {
    await pinTheme(page, 'light')
    await page.goto('/#/about')
    await expect(html(page)).toHaveAttribute('data-theme', 'light')
    expect(consoleErrors).toEqual([])
  })
})

test('the toggle flips the theme, renames itself, and the choice survives a reload', async ({ page, consoleErrors }) => {
  await page.goto('/#/about')
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  await expect(body(page)).toHaveCSS('background-color', 'rgb(0, 0, 0)')

  // Two toggles exist (desktop cluster, mobile row); at this viewport only
  // the desktop one is visible and getByRole ignores hidden elements.
  const banner = page.getByRole('banner')
  await banner.getByRole('button', { name: 'Switch to light theme' }).click()
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
  await expect(themeColor(page)).toHaveAttribute('content', '#ffffff')
  await expect(body(page)).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(banner.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible()

  await page.reload()
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
  await expect(body(page)).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  expect(await page.evaluate(k => localStorage.getItem(k), THEME_KEY)).toBe('light')

  await banner.getByRole('button', { name: 'Switch to dark theme' }).click()
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  expect(consoleErrors).toEqual([])
})
