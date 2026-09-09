import { test, expect } from './fixtures/console'
import { pinTheme } from './fixtures/theme'
import { THEME_KEY } from '../src/features/theme/types'

const html = (page: import('@playwright/test').Page) => page.locator('html')
const themeColor = (page: import('@playwright/test').Page) => page.locator('meta[name="theme-color"]')

const body = (page: import('@playwright/test').Page) => page.locator('body')

// Dark is the default for everyone without a saved choice, whatever the OS
// reports — so both blocks below emulate an OS and assert it is ignored.
// Each asserts body's background as well as the attribute: background reads
// var(--body-background) directly (style.css), so it is a direct read of the
// token, and proves the palette actually rendered rather than just the
// attribute landing.
test.describe('with no saved preference', () => {
  test.describe('and a light OS', () => {
    test.use({ colorScheme: 'light' })
    test('still paints dark — the OS is not consulted', async ({ page, consoleErrors }) => {
      await page.goto('/#/about')
      await expect(html(page)).toHaveAttribute('data-theme', 'dark')
      await expect(themeColor(page)).toHaveAttribute('content', '#000000')
      await expect(body(page)).toHaveCSS('background-color', 'rgb(0, 0, 0)')
      expect(consoleErrors).toEqual([])
    })
  })

  test.describe('and a dark OS', () => {
    test.use({ colorScheme: 'dark' })
    test('paints dark', async ({ page, consoleErrors }) => {
      await page.goto('/#/about')
      await expect(html(page)).toHaveAttribute('data-theme', 'dark')
      await expect(themeColor(page)).toHaveAttribute('content', '#000000')
      await expect(body(page)).toHaveCSS('background-color', 'rgb(0, 0, 0)')
      expect(consoleErrors).toEqual([])
    })
  })
})

test.describe('with a saved choice', () => {
  // A light OS here too: the saved choice is the only thing that can move the
  // site off dark, and it does so regardless of what the system reports.
  test.use({ colorScheme: 'light' })
  test('the saved choice is what takes the site light', async ({ page, consoleErrors }) => {
    await pinTheme(page, 'light')
    await page.goto('/#/about')
    await expect(html(page)).toHaveAttribute('data-theme', 'light')
    await expect(body(page)).toHaveCSS('background-color', 'rgb(255, 255, 255)')
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
