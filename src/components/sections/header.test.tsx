// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

// --- Module-level mocks -----------------------------------------------
// The header imports the wallet picker trigger from the store + the
// Formatter for address truncation. We don't care about either here;
// the tests exercise the nav + drawer + submenu a11y machinery only.

vi.mock('~/features/wallet/store', () => {
  const fakeStore = {
    walletProvider: null,
    walletAddress: null,
    setWalletChoiceVisible: vi.fn(),
  }
  return {
    useGlobalStore: Object.assign(
      // The header reads slices via `useGlobalStore(state => state.x)` —
      // when called as a hook, return the corresponding field from our
      // fake store.
      (selector: (s: typeof fakeStore) => unknown) => selector(fakeStore),
      { getState: () => fakeStore, setState: (s: typeof fakeStore) => Object.assign(fakeStore, s) },
    ),
  }
})

import Header from './header'
import { useThemeStore } from '~/features/theme/store'

// Wrap renders with MemoryRouter — the SUT calls useLocation + NavLink
// and crashes without a routing context.
const renderHeader = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Header />
    </MemoryRouter>,
  )

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// --- Hamburger / mobile drawer -----------------------------------------

describe('Header — hamburger toggle', () => {
  it('exposes aria-label="Open menu" + aria-expanded=false when collapsed', () => {
    renderHeader()
    const btn = screen.getByLabelText('Open menu')
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(btn.getAttribute('aria-controls')).toBe('primary-nav')
  })

  it('flips aria-label to "Close menu" and aria-expanded=true after click; the drawer gains .show', async () => {
    const user = userEvent.setup()
    renderHeader()
    const btn = screen.getByLabelText('Open menu')
    await user.click(btn)
    // After open: aria-label flipped (re-query via the new label).
    const closeBtn = screen.getByLabelText('Close menu')
    expect(closeBtn.getAttribute('aria-expanded')).toBe('true')
    // .navbar-collapse picks up the .show class on open.
    expect(document.getElementById('primary-nav')!.classList.contains('show')).toBe(true)
  })

  it('toggles back to closed on a second click', async () => {
    const user = userEvent.setup()
    renderHeader()
    const btn = screen.getByLabelText('Open menu')
    await user.click(btn)
    await user.click(screen.getByLabelText('Close menu'))
    expect(screen.getByLabelText('Open menu').getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById('primary-nav')!.classList.contains('show')).toBe(false)
  })
})

// --- Protocols submenu ------------------------------------------------

describe('Header — protocols submenu', () => {
  it('renders the Protocols toggle with the documented a11y attributes (closed state)', () => {
    renderHeader()
    const toggle = screen.getByText('protocols').closest('button')!
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    // aria-controls points at the <ul id="submenu-N">
    expect(toggle.getAttribute('aria-controls')).toMatch(/^submenu-/)
  })

  it('opens the submenu on click (aria-expanded → true, .open class on the parent li)', async () => {
    const user = userEvent.setup()
    renderHeader()
    const toggle = screen.getByText('protocols').closest('button')!
    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.closest('li')!.classList.contains('open')).toBe(true)
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    renderHeader()
    const toggle = screen.getByText('protocols').closest('button')!
    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    await user.keyboard('{Escape}')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })

  it('closes on a click that lands outside .has-submenu', async () => {
    const user = userEvent.setup()
    renderHeader()
    const toggle = screen.getByText('protocols').closest('button')!
    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    // Click on the document body, well clear of the submenu.
    fireEvent.click(document.body)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })

  it('marks the toggle as .active when the current route matches one of the submenu children', () => {
    renderHeader('/flare/validator')
    const toggle = screen.getByText('protocols').closest('button')!
    expect(toggle.classList.contains('active')).toBe(true)
  })

  it('does NOT mark the toggle as .active on routes outside the protocols set', () => {
    renderHeader('/about')
    const toggle = screen.getByText('protocols').closest('button')!
    expect(toggle.classList.contains('active')).toBe(false)
  })
})

// --- Disclosure, not a menu -------------------------------------------

describe('Header — protocols submenu is a disclosure', () => {
  it('does not claim aria-haspopup, which would promise a role="menu" popup', () => {
    renderHeader()
    const toggle = screen.getByText('protocols').closest('button')!

    // The controlled element is a plain <ul> of links, not a menu widget:
    // aria-haspopup="true" is shorthand for "menu", so it advertised keyboard
    // semantics (arrow navigation, type-ahead) that nothing implements. It
    // also made axe unable to resolve aria-controls, filing an
    // aria-valid-attr-value "incomplete" on every route in the site.
    expect(toggle.getAttribute('aria-haspopup')).toBeNull()
  })

  it('still exposes the disclosure state it does implement', () => {
    renderHeader()
    const toggle = screen.getByText('protocols').closest('button')!

    // aria-expanded + aria-controls are the whole disclosure contract, and
    // they stay — this is a narrowing of the claim, not a removal of it.
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    const controls = toggle.getAttribute('aria-controls')!
    expect(document.getElementById(controls)).toBeTruthy()
  })
})

// --- Theme toggle -----------------------------------------------------

describe('Header — theme toggle', () => {
  beforeEach(() => {
    localStorage.clear()
    useThemeStore.setState({ theme: 'dark' })
    document.documentElement.dataset.theme = 'dark'
  })

  it('renders one toggle in the desktop cluster and one in the mobile row, named for the action', () => {
    renderHeader()
    // The label is the *action*, not the state: "Switch to light theme" tells
    // a screen-reader user what the button does without needing aria-pressed
    // plus an icon plus a label all flipping for one bit.
    expect(screen.getAllByRole('button', { name: 'Switch to light theme' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Switch to dark theme' })).toBeNull()
  })

  it('flips the theme, both labels and the document attribute on click', async () => {
    const user = userEvent.setup()
    renderHeader()
    await user.click(screen.getAllByRole('button', { name: 'Switch to light theme' })[0]!)
    expect(screen.getAllByRole('button', { name: 'Switch to dark theme' })).toHaveLength(2)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(useThemeStore.getState().theme).toBe('light')
  })

  it('is a real button, not a link', () => {
    renderHeader()
    for (const b of screen.getAllByRole('button', { name: 'Switch to light theme' })) {
      expect(b.tagName).toBe('BUTTON')
      expect(b.getAttribute('type')).toBe('button')
    }
  })
})
