# Light Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A light color theme chosen by the OS on first visit, a header toggle that overrides it and persists, and a dark theme that comes through pixel-identical apart from the new button.

**Architecture:** One `data-theme` attribute on `<html>`, stamped by a pre-paint inline script and owned afterwards by a small Zustand store. All color lives in a new `theme.css` as a dark `:root` block plus a `:root[data-theme="light"]` override; every remaining literal in stylesheets and TSX is routed through those tokens. Canvas surfaces read the tokens with `getComputedStyle` and re-read on a store subscription.

**Tech Stack:** React 19, Zustand 5, Sass, CSS custom properties + `color-mix()`, WebGL2 (rune canvas), Canvas 2D (globe), recharts 3, Vitest + happy-dom, Playwright + axe.

**Spec:** [docs/superpowers/specs/2026-09-08-light-mode-design.md](../specs/2026-09-08-light-mode-design.md)

## Global Constraints

- **Dark stays pixel-identical.** Every dark token value is today's literal. Where a literal has no exact token, stylesheets use `color-mix(in srgb, var(--heading-color) N%, transparent)` with a token fallback declared first; only TSX props (which can't carry a fallback) take the nearest token, and each such near-match is listed in Task 11 so the screenshot review expects it.
- Storage key is `stakecore:theme`, owned by `src/features/theme/types.ts` as `THEME_KEY`. The only other place it may appear as a literal is the pre-paint script in `index.html`, and Task 3's test pins the two together.
- Never touch `localStorage` in `src/` outside `safeStorage.ts`. The pre-paint script is the one sanctioned exception and lives in `index.html`, not `src/`.
- Illustrations (`src/assets/images/protocols/*/thumbnail.svg`, `news/fasset-visualiser.svg`) and chain symbols are **not** modified.
- Named-color borders on `.notification-block` (`lime`, `orange`, `red`) and the `FireBrick` bar fills stay: borders and fills read on both grounds, and their token neighbours differ in value.
- `pnpm lint` does not typecheck — run `npx tsc -p tsconfig.json --noEmit` before every commit.
- Unit tests are `src/**/*.test.{ts,tsx}` with a `// @vitest-environment happy-dom` directive; RTL auto-cleanup is off, so call `cleanup()` in `afterEach`.
- Do not run `pnpm dev` (see `.claude/skills/verify/SKILL.md`). Browser checks use `pnpm build && pnpm exec vite preview --port 4173`.

## Playwright default color scheme — read before Task 9

Playwright emulates `prefers-color-scheme: light` **by default**. Once the pre-paint script ships (Task 3), every e2e spec that doesn't say otherwise renders the light theme. Task 3 therefore sets `colorScheme: 'dark'` in `playwright.config.ts` `use`, so existing specs keep seeing what they saw; theme-aware specs opt in per test.

---

### Task 0: Capture the dark baseline (before any source change)

The regression check in Task 11 needs screenshots of today's dark render. The working tree is still identical to `develop` apart from the spec, so capture now.

**Files:**
- Create (untracked, never committed): `e2e/darkBaseline.spec.ts`

- [ ] **Step 1: Write the throwaway spec**

```ts
// THROWAWAY — not committed. Captures/compares dark full-page renders.
import { test, expect } from './fixtures/backend'
import { ROUTES } from './fixtures/routes'

// reducedMotion is a context option, not a test option — under test.use it
// must go through contextOptions or Playwright silently ignores it.
test.use({ colorScheme: 'dark', contextOptions: { reducedMotion: 'reduce' }, viewport: { width: 1400, height: 900 } })

for (const { path, heading } of ROUTES) {
  test(`dark baseline ${path}`, async ({ page }) => {
    await page.goto(`/#${path}`)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    await page.waitForLoadState('networkidle')
    // Charts arrive after networkidle: lazy recharts chunk + SWR.
    await page.waitForTimeout(3000)
    await expect(page).toHaveScreenshot(`${path.replace(/\W+/g, '-').replace(/^-/, '') || 'home'}.png`, {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    })
  })
}
```

- [ ] **Step 2: Record the baselines**

Run: `pnpm exec playwright test e2e/darkBaseline.spec.ts --update-snapshots`
Expected: 8 tests pass and `e2e/darkBaseline.spec.ts-snapshots/*.png` exist (8 files). The first backend request per worker can take ~16s (see memory); that is the fixture warming up, not a failure.

- [ ] **Step 3: Keep both untracked**

Run: `git status --short`
Expected: `?? e2e/darkBaseline.spec.ts` and `?? e2e/darkBaseline.spec.ts-snapshots/`. Do **not** `git add` them at any point in this plan.

---

### Task 1: Token layer — `theme.css`

**Files:**
- Create: `src/assets/css/theme.css`
- Create: `src/assets/css/theme.test.ts`
- Modify: `src/assets/css/style.css:1-36` (remove color tokens, update header comment)
- Modify: `src/assets/css/index.scss:11` (import theme.css first)

**Interfaces:**
- Produces: the token names every later task references — `--main-color`, `--heading-color`, `--body-background`, `--border-emphasis`, `--border-strong`, `--border`, `--border-subtle`, `--border-faint`, `--surface-hover`, `--surface-raised`, `--surface-menu`, `--surface-card`, `--text-dim`, `--shadow`, `--danger`, `--danger-surface`, `--danger-border`, `--success`, `--status-bad`, `--status-warn`, `--status-good`, `--diff-positive`, `--diff-negative`, `--brand-lightness-clamp`, `--chain-art-opacity`.

- [ ] **Step 1: Write the failing parity test**

`src/assets/css/theme.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

// theme.css is the only file allowed to know what a theme looks like, and the
// one way it silently breaks is a token added to one palette and not the
// other: the light page then inherits a dark value for that one property.
// This reads the file and checks the two blocks declare the same names.
const css = readFileSync(resolve(__dirname, 'theme.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

const block = (selector: string): string => {
  const start = css.indexOf(`${selector} {`)
  expect(start, `no "${selector} {" block in theme.css`).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('}', start))
}

const tokenNames = (s: string): string[] => [...s.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1] ?? '').sort()

describe('theme.css', () => {
  const dark = tokenNames(block(':root'))
  const light = tokenNames(block(':root[data-theme="light"]'))

  it('declares the same tokens in both palettes', () => {
    expect(light).toEqual(dark)
  })

  it('declares a color-scheme in each palette, so native controls match', () => {
    expect(block(':root')).toMatch(/color-scheme:\s*dark/)
    expect(block(':root[data-theme="light"]')).toMatch(/color-scheme:\s*light/)
  })

  it('keeps every dark value at today\'s literal', () => {
    // The pixel-identical invariant, pinned for the tokens that moved out of
    // style.css. Change one of these and you are redesigning the dark theme.
    const d = block(':root')
    expect(d).toContain('--main-color: #9f9f9f')
    expect(d).toContain('--heading-color: #fff')
    expect(d).toContain('--body-background: #000')
    expect(d).toContain('--surface-menu: #1F1F1F')
    expect(d).toContain('--text-dim: rgba(255, 255, 255, 0.55)')
    expect(d).toContain('--danger: #ff3e55')
    expect(d).toContain('--success: #7fb88f')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test -- src/assets/css/theme.test.ts`
Expected: FAIL — `ENOENT ... theme.css`.

- [ ] **Step 3: Create `src/assets/css/theme.css`**

```css
/*
 * Color tokens. The only file that knows what a theme looks like.
 *
 * Two palettes over one set of names: `:root` is dark, the brand default and
 * what a visitor with JavaScript off gets; `:root[data-theme="light"]` wins
 * when index.html's pre-paint script (or the theme store after it) stamps the
 * attribute. Nothing else in the codebase may branch on data-theme except
 * where a *formula* has to flip, not a value — today only the stack
 * carousel's lightness clamp (stackCarousel.scss).
 *
 * Every dark value here is the literal it replaced. That is the whole
 * contract of the light-mode change: dark is not being redesigned, and
 * theme.test.ts pins the values that moved out of style.css.
 *
 * Light values were chosen for WCAG AA against #fff and are recorded with
 * their ratio; re-measure if you change one. --border-* / --surface-* mirror
 * the dark alphas exactly — tune by eye against the rendered page, not here
 * in the abstract.
 *
 * No `}` inside comments: theme.test.ts slices blocks on the first one.
 */

:root {
    color-scheme: dark;

    --main-color: #9f9f9f;        /* body / muted text (7.9:1) */
    --heading-color: #fff;        /* ink: headings, focus ring, chart primary */
    --body-background: #000;

    /* Surface + border system — white-on-black overlays that make up the
       card look. Alphas are what the literals were. */
    --border-emphasis: rgba(255, 255, 255, 0.45);  /* strongest hover/focus border */
    --border-strong: rgba(255, 255, 255, 0.25);    /* emphasized / hover border */
    --border: rgba(255, 255, 255, 0.1);            /* medium hairline / divider */
    --border-subtle: rgba(255, 255, 255, 0.08);    /* card / hairline border */
    --border-faint: rgba(255, 255, 255, 0.06);     /* fainter divider */
    --surface-hover: rgba(255, 255, 255, 0.04);    /* hover fill */
    --surface-raised: rgba(255, 255, 255, 0.02);   /* faint raised fill */
    --surface-menu: #1F1F1F;                       /* header dropdown / drawer / chart tooltip */
    --surface-card: #0F0F0F;                       /* wallet picker card */
    --text-dim: rgba(255, 255, 255, 0.55);         /* dimmed foreground text (6.3:1) */
    --shadow: rgba(0, 0, 0, 0.45);                 /* validator picker drop shadow */

    /* Status colours. */
    --danger: #ff3e55;
    --danger-surface: #1E090C;                     /* unavailability banner band */
    --danger-border: #6C222B;                      /* its top rule */
    --success: #7fb88f;
    --status-bad: #d94357;                         /* meter label, banner icon */
    --status-warn: #e58630;                        /* meter label, delegate warning */
    --status-good: #76B768;                        /* meter label, round-progress fill */
    --diff-positive: #50e3c2;                      /* percent-change pill */
    --diff-negative: #ff3e55;

    /* Formula inputs, not colours. The carousel hover clamps a brand mark's
       oklch lightness to this (a floor on dark, a ceiling on light); the
       chain symbol behind page headers renders at this opacity. */
    --brand-lightness-clamp: 0.78;
    --chain-art-opacity: 0.30;
}

:root[data-theme="light"] {
    color-scheme: light;

    --main-color: #5c5c5c;        /* 6.7:1 */
    --heading-color: #000;
    --body-background: #fff;

    --border-emphasis: rgba(0, 0, 0, 0.45);
    --border-strong: rgba(0, 0, 0, 0.25);
    --border: rgba(0, 0, 0, 0.1);
    --border-subtle: rgba(0, 0, 0, 0.08);
    --border-faint: rgba(0, 0, 0, 0.06);
    --surface-hover: rgba(0, 0, 0, 0.04);
    --surface-raised: rgba(0, 0, 0, 0.02);
    --surface-menu: #f2f2f2;
    --surface-card: #fff;
    --text-dim: rgba(0, 0, 0, 0.6);  /* 5.7:1 */
    --shadow: rgba(0, 0, 0, 0.15);

    --danger: #c8102e;               /* 5.9:1 */
    --danger-surface: #fdecee;
    --danger-border: #f3b4bc;
    --success: #2f7d4a;              /* 5.1:1 */
    --status-bad: #b42839;           /* 6.4:1 */
    --status-warn: #a35a00;          /* 5.2:1 */
    --status-good: #3a7d3c;          /* 5.0:1 */
    --diff-positive: #0f766e;        /* 5.5:1 */
    --diff-negative: #c8102e;        /* 5.9:1 */

    --brand-lightness-clamp: 0.55;
    --chain-art-opacity: 0.30;
}
```

- [ ] **Step 4: Remove the color tokens from `style.css`**

In `src/assets/css/style.css`, replace lines 5 and 14-36 so the block reads:

```css
 *   01. Tokens (CSS custom properties; mirror _tokens.scss — colour lives in theme.css)
```

and

```css
/* ---- 01. Tokens ----
   Colour is NOT here: theme.css owns both palettes and is imported ahead of
   this file by index.scss. This block is the non-colour scale only. */

:root {
    /* Spacing scale (10px grid; mirrors $space-* in _tokens.scss) */
    --space-0: 0;
```

i.e. delete `--main-color` through `--success` (old lines 17-36) and their two comments.

- [ ] **Step 5: Import it first in `index.scss`**

In `src/assets/css/index.scss`, before `@import 'fonts.css';` add:

```scss
// Colour palettes first: everything after this reads var(--…) from them.
@import 'theme.css';
```

- [ ] **Step 6: Run the test and the build**

Run: `pnpm test -- src/assets/css/theme.test.ts && pnpm build`
Expected: 3 tests pass; build succeeds with no Sass warnings about `@import`.

- [ ] **Step 7: Commit**

```bash
git add src/assets/css/theme.css src/assets/css/theme.test.ts src/assets/css/style.css src/assets/css/index.scss
git commit -m "feat(theme): move colour tokens into theme.css with a light palette

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Theme store

**Files:**
- Create: `src/features/theme/types.ts`
- Create: `src/features/theme/store.ts`
- Create: `src/features/theme/store.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `type Theme = 'light' | 'dark'`; `THEMES: readonly Theme[]`; `THEME_KEY = 'stakecore:theme'`; `isTheme(v: unknown): v is Theme`; `THEME_COLORS: Record<Theme, string>` (`dark: '#000000'`, `light: '#ffffff'`). **DOM-free** — the e2e fixtures import it under Node.
  - `store.ts`: `useThemeStore` (Zustand, state `{ theme: Theme; pinned: boolean; toggleTheme(): void }`); `applyThemeToDocument(theme: Theme): void` (writes `documentElement.dataset.theme` and the `theme-color` meta).
- Consumes: `safeLocal` from `~/utils/safeStorage`.

- [ ] **Step 1: Write `types.ts`**

```ts
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
```

- [ ] **Step 2: Write the failing store tests**

`src/features/theme/store.test.ts`:

```ts
// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { THEME_KEY } from './types'

// The store resolves its initial state when the module evaluates, so every
// case below loads a fresh copy after arranging storage and the OS query.
const loadStore = async () => (await import('./store')).useThemeStore

type Listener = (e: { matches: boolean }) => void
let osPrefersLight = false
let mediaListeners: Listener[] = []

const stubMatchMedia = () => {
  mediaListeners = []
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-color-scheme: light)' && osPrefersLight,
    media: query,
    addEventListener: (_: string, cb: Listener) => { mediaListeners.push(cb) },
    removeEventListener: vi.fn(),
  }))
}

const fireOsChange = (light: boolean) => {
  osPrefersLight = light
  for (const cb of mediaListeners) cb({ matches: light })
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
  it('uses a stored choice over the OS preference, and is pinned', async () => {
    localStorage.setItem(THEME_KEY, 'light')
    const store = await loadStore()
    expect(store.getState()).toMatchObject({ theme: 'light', pinned: true })
  })

  it('follows a light OS when nothing is stored, unpinned', async () => {
    osPrefersLight = true
    const store = await loadStore()
    expect(store.getState()).toMatchObject({ theme: 'light', pinned: false })
  })

  it('defaults to dark when the OS has no light preference', async () => {
    const store = await loadStore()
    expect(store.getState()).toMatchObject({ theme: 'dark', pinned: false })
  })

  it('ignores a stored value that is not a theme', async () => {
    localStorage.setItem(THEME_KEY, 'blue')
    osPrefersLight = true
    const store = await loadStore()
    expect(store.getState()).toMatchObject({ theme: 'light', pinned: false })
  })

  it('falls through to the OS preference when storage is blocked', async () => {
    blockStorage()
    osPrefersLight = true
    const store = await loadStore()
    expect(store.getState()).toMatchObject({ theme: 'light', pinned: false })
  })

  it('defaults to dark when matchMedia is unavailable', async () => {
    vi.stubGlobal('matchMedia', undefined)
    const store = await loadStore()
    expect(store.getState().theme).toBe('dark')
  })
})

describe('toggleTheme', () => {
  it('flips the theme, pins it, stamps the document and persists', async () => {
    const store = await loadStore()
    store.getState().toggleTheme()
    expect(store.getState()).toMatchObject({ theme: 'light', pinned: true })
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

describe('following the OS', () => {
  it('tracks OS changes while unpinned', async () => {
    const store = await loadStore()
    fireOsChange(true)
    expect(store.getState().theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    fireOsChange(false)
    expect(store.getState().theme).toBe('dark')
  })

  it('stops tracking once pinned by a click', async () => {
    const store = await loadStore()
    store.getState().toggleTheme()            // dark → light, pinned
    fireOsChange(false)                       // OS says dark
    expect(store.getState().theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
```

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm test -- src/features/theme/store.test.ts`
Expected: FAIL — cannot resolve `./store`.

- [ ] **Step 4: Write `store.ts`**

```ts
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
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test -- src/features/theme/store.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: 12 tests pass; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/theme/types.ts src/features/theme/store.ts src/features/theme/store.test.ts
git commit -m "feat(theme): add the theme store — stored choice, then OS, then dark

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Pre-paint script, root wiring, Playwright default scheme

**Files:**
- Modify: `index.html:8` (script after the `theme-color` meta)
- Create: `src/features/theme/prepaint.test.ts`
- Modify: `src/layout/root.tsx:2-3,146-147`
- Modify: `playwright.config.ts:16-22`

**Interfaces:**
- Consumes: `THEME_KEY`, `THEME_COLORS` from Task 2; `useThemeStore`.

- [ ] **Step 1: Write the failing test that executes the inline script**

`src/features/theme/prepaint.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/features/theme/prepaint.test.ts`
Expected: FAIL — `no inline <script> in index.html mentions stakecore:theme`.

- [ ] **Step 3: Add the script to `index.html`**

Directly after line 8 (`<meta name="theme-color" content="#000000" />`) insert:

```html
  <!-- Theme, before first paint. Reads the saved choice, else the OS
       preference, else dark, and stamps <html data-theme> so theme.css picks
       the palette before the first frame — a module can't do this, it loads
       too late. The storage key and the resolution order are the theme
       store's (src/features/theme); prepaint.test.ts keeps them in step.
       This is the one sanctioned touch of localStorage outside safeStorage.ts,
       and each access is in its own try for the same reasons that file gives. -->
  <script>
    (function () {
      var t
      try { t = localStorage.getItem('stakecore:theme') } catch (e) {}
      if (t !== 'light' && t !== 'dark') {
        try { t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark' } catch (e) { t = 'dark' }
      }
      document.documentElement.dataset.theme = t
      var m = document.querySelector('meta[name="theme-color"]')
      if (m) m.setAttribute('content', t === 'light' ? '#ffffff' : '#000000')
    })()
  </script>
```

- [ ] **Step 4: Run the test**

Run: `pnpm test -- src/features/theme/prepaint.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Wire the third-party chrome in `root.tsx`**

Add the import after line 2:

```ts
import { useThemeStore } from '~/features/theme/store'
```

Inside `RootLayout`, after the `useGlobalStore(...)` call (line 77), add:

```ts
  const theme = useThemeStore(state => state.theme)
```

Replace lines 146-147:

```tsx
          <Toasts theme={theme} position='top-left' />
          <Tooltips id="tooltip" variant={theme} />
```

- [ ] **Step 6: Preserve today's e2e rendering by defaulting Playwright to dark**

In `playwright.config.ts`, inside `use: {` after `ignoreHTTPSErrors: true,` add:

```ts
    // Playwright emulates prefers-color-scheme: light unless told otherwise,
    // and the app now follows that on first visit. Dark here keeps every
    // spec that doesn't care about theme seeing what it saw before; the
    // theme-aware specs (theme.spec.ts, a11y.spec.ts) opt in per test.
    colorScheme: 'dark',
```

- [ ] **Step 7: Typecheck, unit tests, build**

Run: `npx tsc -p tsconfig.json --noEmit && pnpm test && pnpm build`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add index.html src/features/theme/prepaint.test.ts src/layout/root.tsx playwright.config.ts
git commit -m "feat(theme): stamp data-theme before first paint; theme toasts and tooltips

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: The toggle button

**Files:**
- Create: `src/features/theme/toggle.tsx`
- Modify: `src/components/sections/header.tsx:3,87-91,151-158`
- Modify: `src/components/sections/header.scss` (after the `.header-social` block, ~line 106)
- Modify: `src/components/sections/header.test.tsx`

**Interfaces:**
- Produces: `ThemeToggle` default export, props `{ size?: number }` (icon px, default 16). Accessible name is `Switch to light theme` in dark and `Switch to dark theme` in light — `e2e/theme.spec.ts` (Task 9) queries by these exact strings.
- Consumes: `useThemeStore` from Task 2.

- [ ] **Step 1: Write the failing header tests**

Append to `src/components/sections/header.test.tsx` (add `import { useThemeStore } from '~/features/theme/store'` beside the `Header` import):

```tsx
// --- Theme toggle -----------------------------------------------------

describe('Header — theme toggle', () => {
  beforeEach(() => {
    localStorage.clear()
    useThemeStore.setState({ theme: 'dark', pinned: false })
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
    expect(useThemeStore.getState()).toMatchObject({ theme: 'light', pinned: true })
  })

  it('is a real button, not a link', () => {
    renderHeader()
    for (const b of screen.getAllByRole('button', { name: 'Switch to light theme' })) {
      expect(b.tagName).toBe('BUTTON')
      expect(b.getAttribute('type')).toBe('button')
    }
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm test -- src/components/sections/header.test.tsx`
Expected: the three new tests FAIL (no button found); the existing ones still pass.

- [ ] **Step 3: Write `toggle.tsx`**

```tsx
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
```

- [ ] **Step 4: Place it in the header**

In `header.tsx`, add after line 7's `import './header.scss'`:

```ts
import ThemeToggle from '~/features/theme/toggle'
```

Mobile row — after the GitHub `<li>` at line 90, inside `ul.mobile-social`:

```tsx
                                        <li><ThemeToggle size={18} /></li>
```

Desktop cluster — replace lines 156-157 (`</ul>` and `<ChooseWalletButton />`) with:

```tsx
                            </ul>
                            <ThemeToggle />
                            <ChooseWalletButton />
```

- [ ] **Step 5: Style it**

In `header.scss`, after the `.header-social { … }` block (ends ~line 106), add:

```scss
// Theme toggle. The same 32px box as the social icons either side of it, so
// it reads as one more item in the row (both rows: it renders in .mobile-social
// and in .menu-btns, as the social links do). A <button>: the global reset
// drops its border but not the UA background, which is cleared here.
.theme-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: none;
    color: var(--main-color);
    border-radius: t.$radius-sm;
    cursor: pointer;
    transition: color 150ms ease-out, background-color 150ms ease-out;

    &:hover {
        color: var(--heading-color);
        background-color: var(--surface-hover);
    }
}
```

- [ ] **Step 6: Run the header tests, typecheck, lint**

Run: `pnpm test -- src/components/sections/header.test.tsx && npx tsc -p tsconfig.json --noEmit && pnpm lint`
Expected: all header tests pass (3 new + existing); tsc and lint clean.

- [ ] **Step 7: Look at it**

Run: `pnpm build && (pnpm exec vite preview --port 4173 &)` then:

```bash
NODE_PATH=$PWD/node_modules node --input-type=module -e "
import { chromium } from '@playwright/test'
const b = await chromium.launch(); const c = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } })
const p = await c.newPage(); await p.goto('https://localhost:4173/#/about'); await p.waitForLoadState('networkidle')
await p.screenshot({ path: process.env.SCRATCH + '/toggle-dark.png', clip: { x: 900, y: 0, width: 500, height: 100 } })
await p.getByRole('button', { name: 'Switch to light theme' }).click()
await p.screenshot({ path: process.env.SCRATCH + '/toggle-light.png', fullPage: true })
await b.close()"
```

with `SCRATCH` set to the scratchpad directory. Open both PNGs with the Read tool. Expected: dark header shows a sun icon between the GitHub icon and "Connect Wallet"; after the click the page is light (white ground, black headings) and the button shows a moon. Some sections will still look wrong in light — that is Tasks 5-8. Kill the preview afterwards (`pkill -f 'vite preview'`).

- [ ] **Step 8: Commit**

```bash
git add src/features/theme/toggle.tsx src/components/sections/header.tsx src/components/sections/header.scss src/components/sections/header.test.tsx
git commit -m "feat(theme): add the header theme toggle

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Stylesheet literals → tokens

No unit test can see a stylesheet; the gate for this task is `pnpm build`, a light-mode eyeball, and Task 11's dark diff. Do every edit below exactly — each preserves the dark render, either by mapping to a token holding the same literal or via `color-mix` at the literal's own alpha with a token fallback first (for browsers without `color-mix`, ~7%).

**Files:** listed per step.

- [ ] **Step 1: `src/pages/protocols/validatorStatsStrip.scss:47-49,62-64`** — these `rgba` values are fallbacks for `--validator-bar-accent`, which the component always sets inline, so they never render. Map to tokens:

```scss
.validator-capacity-segment.self      { background: var(--validator-bar-accent, var(--heading-color)); }
.validator-capacity-segment.delegated {
    background: var(--validator-bar-accent, var(--text-dim));
    opacity: 0.45;
}
```
and identically for `.validator-capacity-dot.self` / `.delegated`.

- [ ] **Step 2: `src/pages/protocols/validatorPicker.scss:101,136`**

```scss
    box-shadow: 0 12px 32px var(--shadow);
```
```scss
        box-shadow: inset 2px 0 0 var(--validator-picker-accent, var(--text-dim));
```

- [ ] **Step 3: `src/pages/protocols/fspLocalDelegate.scss:161,235`**

```scss
    // Fallback then exact: 30% of the ink, at the literal's own alpha.
    &::placeholder {
        color: var(--text-dim);
        color: color-mix(in srgb, var(--heading-color) 30%, transparent);
        opacity: 0.4;
    }
```
```scss
.fsp-delegate-preview-warn {
    // Was rgba(255,165,0,.9) — a near-match to the warn token in dark, and
    // the token has an AA light value where a mixed orange would not.
    color: var(--status-warn);
}
```

- [ ] **Step 4: `src/features/wallet/picker.scss:21`**

```scss
  background: var(--surface-card);
```

- [ ] **Step 5: `src/pages/about/about.scss:146` and `src/pages/news/news.scss:90`** (same two lines in each)

```scss
    text-decoration-color: var(--border-strong);
    text-decoration-color: color-mix(in srgb, var(--heading-color) 32%, transparent);
```

- [ ] **Step 6: `src/pages/about/infraConstellation.scss:29`**

```scss
    stroke: var(--border);
    stroke: color-mix(in srgb, var(--heading-color) 18%, transparent);
```

- [ ] **Step 7: `src/pages/about/serverGlobe.scss:93`**

```scss
    background: var(--border-strong);
    background: color-mix(in srgb, var(--heading-color) 30%, transparent);
```

- [ ] **Step 8: `src/components/ui/metaPill.scss:32`**

```scss
    color: var(--heading-color);
    color: color-mix(in srgb, var(--heading-color) 90%, transparent);
```

- [ ] **Step 9: `src/pages/protocols/specs.scss:40,69`** — `color: white;` → `color: var(--heading-color);` and **delete** the `color-scheme: dark;` line (it now comes from `:root` in theme.css, and per theme).

- [ ] **Step 10: `src/pages/protocols/protocols.scss:186,188`**

```scss
.notification-block {
    border-left: 4px solid var(--main-color);
    padding: 0.5rem 1rem;
    // Was rgba(0,0,0,.5): black over the black page. The raised surface is
    // the same on dark and reads as a faint panel on light instead of a
    // half-black box.
    background: var(--surface-raised);
}
```
Leave the `lime` / `orange` / `red` border rules as they are (Global Constraints).

- [ ] **Step 11: `src/pages/protocols/unavailabilityBanner.scss:12-13,32`**

```scss
    background: var(--danger-surface);
    border-top: 1px solid var(--danger-border);
```
```scss
    color: var(--status-bad);
```

- [ ] **Step 12: `src/pages/about/stackCarousel.scss:128-138`** — replace the fallback rule and the `@supports` block with:

```scss
.stack-item:hover .stack-item-glyph,
.stack-carousel:focus-within .stack-item:hover .stack-item-glyph {
    color: color-mix(in srgb, var(--stack-brand) 60%, var(--heading-color));
}

// The clamp is a token so the two palettes can disagree about its value; the
// *direction* has to flip too, which a value cannot express — on a light page
// the failure is the mirror image (Nomad's #00CA8E is too bright to read on
// white), so light takes a ceiling where dark takes a floor. This is the one
// place outside theme.css that branches on data-theme.
@supports (color: oklch(from red l c h)) {
    .stack-item:hover .stack-item-glyph,
    .stack-carousel:focus-within .stack-item:hover .stack-item-glyph {
        color: oklch(from var(--stack-brand) max(l, var(--brand-lightness-clamp)) c h);
    }

    :root[data-theme="light"] .stack-item:hover .stack-item-glyph,
    :root[data-theme="light"] .stack-carousel:focus-within .stack-item:hover .stack-item-glyph {
        color: oklch(from var(--stack-brand) min(l, var(--brand-lightness-clamp)) c h);
    }
}
```
Also amend the comment above it (lines 112-127): the sentence "because this page sits on #000" becomes "because on the dark palette this page sits on #000", and drop the final paragraph about the fallback mixing toward white (it now mixes toward the ink token).

- [ ] **Step 13: `src/assets/css/custom.css:47`**

```css
  opacity: var(--chain-art-opacity);
```

- [ ] **Step 14: `src/components/sections/hero.scss:6-9`** — replace the four comment lines with:

```scss
// Colour comes from the theme tokens (--heading-color for ink, --main-color
// for muted, the --border-* alphas for rules); theme.css swaps the palette.
```

- [ ] **Step 15: Build and confirm no literal survived**

Run: `pnpm build && grep -rnE 'rgba\(255, ?255, ?255|rgba\(0, ?0, ?0|#[0-9a-fA-F]{3,6}\b|: ?white\b' src --include=*.scss --include=*.css | grep -v 'theme.css' | grep -vE 'mask-image|-webkit-mask|black'`
Expected: build green; the grep prints **nothing** (the mask gradients' `black` stops and `theme.css` are the only literals left, and both are excluded on purpose).

- [ ] **Step 16: Commit**

```bash
git add src/pages src/features/wallet/picker.scss src/components/ui/metaPill.scss src/assets/css/custom.css src/components/sections/hero.scss
git commit -m "refactor(theme): route every stylesheet colour through the tokens

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: TSX literals → tokens

`var(--…)` resolves inside SVG presentation attributes (`stroke`, `fill`, `color`) — verified in this repo's Chromium: `<path stroke="var(--ink)">` computes to the token's value. So recharts and spinners-react props take the strings directly; no stylesheet needed.

**Files:**
- Modify: `src/components/ui/statsChart.tsx:29-45`
- Modify: `src/components/ui/meterBar.tsx:18-20`
- Modify: `src/components/ui/diff.tsx:3-8`
- Modify: `src/components/ui/epochProgress.tsx:21`
- Modify: `src/components/ui/queryState.tsx:43`
- Modify: `src/pages/protocols/validatorStatsStrip.tsx:23`
- Modify: `src/pages/protocols/fsp-stats.tsx:82`
- Modify: `src/constants.ts:48`
- Create: `src/components/ui/diff.test.tsx`

- [ ] **Step 1: Write the failing diff test** — the one component here whose output is directly assertable:

`src/components/ui/diff.test.tsx`:

```tsx
// @vitest-environment happy-dom

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Diff } from './diff'

afterEach(cleanup)

describe('Diff', () => {
  it('colours a positive change with the positive token, on text and arrow alike', () => {
    render(<Diff diff="1.2" unit="%" />)
    const el = screen.getByText('1.2 %').parentElement!
    expect(el.style.color).toBe('var(--diff-positive)')
    expect(el.querySelector('svg')?.getAttribute('fill')).toBe('var(--diff-positive)')
  })

  it('colours a negative change with the negative token and strips the sign', () => {
    render(<Diff diff="-3" />)
    const el = screen.getByText('3').parentElement!
    expect(el.style.color).toBe('var(--diff-negative)')
  })

  it('applies the pill class when asked', () => {
    render(<Diff diff="-3" pill />)
    const el = screen.getByText('3').parentElement!
    expect(el.className).toBe('diff-pill')
    expect(el.style.color).toBe('var(--diff-negative)')
    // The pill background is a color-mix() of the same token. happy-dom's
    // style parser keeps var() but drops color-mix() values (checked), so
    // that half is verified in the browser in Step 8, not here.
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- src/components/ui/diff.test.tsx`
Expected: FAIL — `style.color` is `rgb(80, 227, 194)` / the literal, not the token.

- [ ] **Step 3: `diff.tsx`** — replace lines 3-8:

```ts
// Percent-change colours. Tokens rather than literals so the light palette
// can supply AA values (#50e3c2 on white is 1.7:1); the pill background is
// the same token at 12%, which is what the old rgba literals were.
const COLOR_POSITIVE = 'var(--diff-positive)'
const COLOR_NEGATIVE = 'var(--diff-negative)'
const BG_POSITIVE = 'color-mix(in srgb, var(--diff-positive) 12%, transparent)'
const BG_NEGATIVE = 'color-mix(in srgb, var(--diff-negative) 12%, transparent)'
```

- [ ] **Step 4: `statsChart.tsx`** — add after line 4:

```ts
// Theme tokens, passed straight through: recharts writes these as SVG
// presentation attributes and inline styles, both of which resolve var().
const INK = 'var(--heading-color)'
const INK_DIM = 'var(--text-dim)'
const GROUND = 'var(--body-background)'
const TOOLTIP = { background: 'var(--surface-menu)', border: '1px solid var(--border)', borderRadius: 8 }
```

then replace lines 29-45:

```tsx
      <XAxis dataKey="x" tick={{ fill: INK_DIM, fontSize: 12 }} tickLine={false} axisLine={false} />
      <YAxis hide domain={['auto', 'auto']} />
      <Tooltip
        contentStyle={TOOLTIP}
        labelStyle={{ color: INK_DIM }}
        itemStyle={{ color: INK }}
        formatter={(v: number) => formatY(v)}
      />
      {keys.map((key, i) => (
        <Line
          key={key}
          type="monotone"
          dataKey={key}
          stroke={i === 0 ? INK : INK_DIM}
          strokeWidth={2}
          dot={{ fill: GROUND, stroke: i === 0 ? INK : INK_DIM, strokeWidth: 2, r: 4 }}
          activeDot={{ r: 6 }}
          name={key}
        />
      ))}
```

- [ ] **Step 5: `meterBar.tsx:18-20`** — labels to tokens, gradients untouched:

```ts
const STATUS_BAD:    StatusPalette = { label: 'var(--status-bad)',  gradient: 'radial-gradient(#d94357 25%, #a82234)' }
const STATUS_MEDIUM: StatusPalette = { label: 'var(--status-warn)', gradient: 'radial-gradient(#a05714 25%, #dd781c)' }
const STATUS_GOOD:   StatusPalette = { label: 'var(--status-good)', gradient: 'radial-gradient(#487e3c 25%, #64ae55)' }
```
Update the comment above: "Each tier carries the flat label colour (a theme token — it is text, and needs an AA light value) + the radial gradient used to render the LED itself (literal — a fill that reads on either ground)."

- [ ] **Step 6: One-liners**

- `epochProgress.tsx:21`: `color = "white"` → `color = 'var(--heading-color)'`; fix the doc comment on line 17 to say `(default: the ink token)`.
- `queryState.tsx:43`: `spinnerColor = 'white'` → `spinnerColor = 'var(--heading-color)'`.
- `validatorStatsStrip.tsx:23`: `accentColor = 'white'` → `accentColor = 'var(--heading-color)'`.
- `fsp-stats.tsx:82`: `color="#76B768"` → `color="var(--status-good)"`.
- `constants.ts:48`: `export const PAGE_COLOR_CODE = 'white'` → `export const PAGE_COLOR_CODE = 'var(--heading-color)'` with the comment `// Spinner ink. Every consumer is a spinners-react <SpinnerCircular color>, which lands on the <svg> as a presentation attribute and resolves var().`

Leave `links.tsx:21` (`var(--bs-success, #198754)`) alone: bootstrap green reads on both grounds and swapping it to `--success` would change the dark render.

- [ ] **Step 7: Tests, typecheck, lint**

Run: `pnpm test && npx tsc -p tsconfig.json --noEmit && pnpm lint`
Expected: diff tests pass; nothing else regressed (`queryState.test.tsx`, `links.test.tsx` untouched by these edits).

- [ ] **Step 8: See the chart in both themes**

Build, start preview as in Task 4 Step 7, then screenshot `https://localhost:4173/#/flare/fsp` scrolled to a chart, once with `localStorage.setItem('stakecore:theme','light')` in `addInitScript` and once with `'dark'`. Note the CORS caveat: without the e2e backend fixture, data routes render ServerError from raw Playwright. Use a throwaway spec importing `test` from `./fixtures/backend` instead (delete it after), waiting on `page.locator('.recharts-surface').first()` then `expect(page).toHaveScreenshot` is *not* needed — `page.screenshot({ path })` suffices. Expected: dark chart white line on black; light chart black line on white, tooltip grey card with dark text. Read both PNGs.

- [ ] **Step 9: Commit**

```bash
git add src/components/ui/statsChart.tsx src/components/ui/meterBar.tsx src/components/ui/diff.tsx src/components/ui/diff.test.tsx src/components/ui/epochProgress.tsx src/components/ui/queryState.tsx src/pages/protocols/validatorStatsStrip.tsx src/pages/protocols/fsp-stats.tsx src/constants.ts
git commit -m "refactor(theme): route chart, meter, diff and spinner colours through tokens

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Hero rune canvas — transparent, ink from the token

Today the WebGL context is `alpha: false` and the shader writes opaque grayscale, so the canvas paints **black** wherever there is no glyph. On the dark page that is invisible; on a light page it is a black band. The fix emits premultiplied `(ink × a, a)` on an `alpha: true` context. In dark this composites to exactly today's pixels (white × a at CSS opacity 0.3 over black, before and after); in light the same glyphs are black over white.

There is no unit test: happy-dom has no WebGL, and `hero.test.tsx` already mocks this component out. The gate is the screenshot in Step 5 and Task 11's dark diff.

**Files:**
- Modify: `src/components/sections/heroRuneCanvas.tsx`

**Interfaces:**
- Consumes: `useThemeStore` (Task 2). Relies on `toggleTheme` stamping `data-theme` *before* `set` (Task 2's "stamps the document before notifying subscribers" test), so `getComputedStyle` inside the listener sees the new palette.

- [ ] **Step 1: Shader — add the ink uniform and emit alpha**

Replace lines 21-24's comment and the shader's colour section. Lines 21-24 become:

```ts
// Fragment shader. The wave is purely f(dist, phase); the rune mask is a
// tiny texture that decides per-cell whether a glyph is full strength or
// dimmed; the glyph atlas is a 10-wide horizontal strip of pre-rendered RAMP
// characters. Output is premultiplied ink × alpha on a transparent canvas —
// the page shows through where there is no glyph, whichever theme it is.
```

Add after line 33 (`uniform sampler2D u_runeMask;`):

```glsl
uniform vec3  u_ink;            // glyph colour — the --heading-color token
```

Replace lines 38-39:

```glsl
const float INSIDE_ALPHA = 1.0;       // full-strength glyphs inside the rune
const float OUTSIDE_ALPHA = 0.42;     // dimmed field outside it
```

Replace lines 75-80:

```glsl
  float glyphAlpha = texture(u_glyphAtlas, atlasUV).a;
  float a = glyphAlpha * (isInside ? INSIDE_ALPHA : OUTSIDE_ALPHA);

  // Premultiplied, to match the context's premultipliedAlpha:true. CSS
  // opacity + the gradient mask still handle compositing into the page.
  fragColor = vec4(u_ink * a, a);
```

- [ ] **Step 2: Context flags**

Line 89 becomes:

```ts
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true })
```

- [ ] **Step 3: Read the ink colour and subscribe to the theme**

Add the import at the top:

```ts
import { useThemeStore } from '~/features/theme/store'
```

Add this helper above `const HeroRuneCanvas`:

```ts
// Any CSS colour → linear-ish 0..1 RGB, via the 2D canvas parser so the token
// may be hex, rgb() or a named colour without a parser of our own.
const parseCssColor = (color: string): [number, number, number] => {
  const off = document.createElement('canvas')
  off.width = 1
  off.height = 1
  const ctx = off.getContext('2d')
  if (!ctx) return [1, 1, 1]
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return [(r ?? 255) / 255, (g ?? 255) / 255, (b ?? 255) / 255]
}
```

After line 157 (`if (uCellSize) gl.uniform1f(uCellSize, cellSizePx)`) add:

```ts
    const uInk = gl.getUniformLocation(program, 'u_ink')
    const applyInk = () => {
      const css = getComputedStyle(canvas).getPropertyValue('--heading-color').trim() || '#fff'
      const [r, g, b] = parseCssColor(css)
      gl.useProgram(program)
      if (uInk) gl.uniform3f(uInk, r, g, b)
    }
    applyInk()
```

After the `stopLoop` definition (line 323) add:

```ts
    // The store stamps data-theme before it notifies, so the computed style
    // read in applyInk is already the incoming palette. When the RAF loop is
    // idle (reduced motion, off-screen, hidden tab) nothing else would
    // repaint, so draw one frame here.
    const unsubscribeTheme = useThemeStore.subscribe((state, prev) => {
      if (destroyed || state.theme === prev.theme) return
      applyInk()
      if (ready && raf === 0) drawFrame()
    })
```

In the cleanup (line 364-375) add `unsubscribeTheme()` as the second line, after `destroyed = true`.

- [ ] **Step 4: Typecheck and unit tests**

Run: `npx tsc -p tsconfig.json --noEmit && pnpm test -- src/components/sections`
Expected: clean; hero tests unaffected (component is mocked there).

- [ ] **Step 5: Look at it in both themes**

Build + preview, then screenshot `https://localhost:4173/#/` at 1400×900 for each theme (pin via `addInitScript` as in Task 6 Step 8; the home hero needs no backend fixture for the canvas). Expected: dark identical to before — faint white ASCII wave with the brighter rune in the middle; light shows the same wave in faint black on white, **no dark rectangle** anywhere behind the hero. Read both PNGs.

- [ ] **Step 6: Commit**

```bash
git add src/components/sections/heroRuneCanvas.tsx
git commit -m "feat(hero): render the rune canvas transparent, inked from the theme token

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Server globe — token strokes, live re-read

The globe already reads `--success` and `--heading-color` at mount. Two changes: the six `rgba(255,255,255,α)` strokes and the `#ffffff` region fill become the ink colour drawn at the same `globalAlpha`, and a store subscription re-reads both tokens and repaints on a flip — without re-running the effect, which would reset the rotation.

**Files:**
- Modify: `src/pages/about/serverGlobe.tsx:33-36,159-168,233-275,280-289,398-408`

- [ ] **Step 1: Add a test that the globe repaints in the new colours on a theme flip**

In `src/pages/about/serverGlobe.test.tsx`, add `import { useThemeStore } from '~/features/theme/store'` and, inside the outer `describe` (or at the end of the file), this case. The fake ctx Proxy ignores property sets, so the assertion is on a *call* it records — `clearRect` runs once per `draw`:

```tsx
  it('repaints when the theme flips, and reads the palette again', () => {
    const readSpy = vi.spyOn(window, 'getComputedStyle')
    render(<ServerGlobe />)
    const drawsBefore = ctxCalls.filter(c => c === 'clearRect').length
    const readsBefore = readSpy.mock.calls.length
    useThemeStore.getState().toggleTheme()
    expect(ctxCalls.filter(c => c === 'clearRect').length).toBe(drawsBefore + 1)
    expect(readSpy.mock.calls.length).toBeGreaterThan(readsBefore)
    useThemeStore.setState({ theme: 'dark', pinned: false })
    readSpy.mockRestore()
  })
```

Run: `pnpm test -- src/pages/about/serverGlobe.test.tsx`
Expected: the new case FAILS (no extra `clearRect`).

- [ ] **Step 2: Fallback comment (lines 33-36)**

```ts
// Fallbacks match --success / --heading-color in assets/css/theme.css; the
// live values are read from CSS at mount and again on every theme flip.
```

- [ ] **Step 3: `drawRegions` takes the ink colour**

Signature (line 159-167): add a final parameter `clientColor: string`. Line 168 becomes `ctx.fillStyle = clientColor`.

- [ ] **Step 4: `draw` — ink + globalAlpha instead of white rgba** (lines 245-275)

```ts
  ctx.clearRect(0, 0, size, size)

  // Every structural stroke is the ink colour at a fixed alpha — the same
  // values the rgba(255,255,255,α) literals carried, so the dark render is
  // unchanged, and on the light palette the ink is black.
  ctx.fillStyle = clientColor
  ctx.strokeStyle = clientColor
  ctx.lineWidth = 1

  // Sphere body — barely-there fill so the disc reads as a solid object
  // against the page rather than as a floating wireframe.
  ctx.globalAlpha = 0.022
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()

  // Far face first, so the near face paints over it.
  ctx.globalAlpha = 0.05
  strokeLines(ctx, GRATICULE_LINES, cx, cy, radius, centreLon, centreLat, false)
  ctx.globalAlpha = 0.12
  strokeLines(ctx, COASTLINE_RINGS, cx, cy, radius, centreLon, centreLat, false)
  ctx.globalAlpha = 1
  drawRegions(ctx, cx, cy, radius, centreLon, centreLat, false, clientColor)
  drawNodes(ctx, cx, cy, radius, centreLon, centreLat, false, serverColor, clientColor)

  ctx.strokeStyle = clientColor
  ctx.globalAlpha = 0.08
  strokeLines(ctx, GRATICULE_LINES, cx, cy, radius, centreLon, centreLat, true)
  ctx.globalAlpha = 0.34
  strokeLines(ctx, COASTLINE_RINGS, cx, cy, radius, centreLon, centreLat, true)

  // Limb, to close the silhouette.
  ctx.globalAlpha = 0.14
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 1

  drawRegions(ctx, cx, cy, radius, centreLon, centreLat, true, clientColor)
  drawNodes(ctx, cx, cy, radius, centreLon, centreLat, true, serverColor, clientColor)
```

(`drawNodes` sets its own `fillStyle`; `strokeStyle` is re-set after it in case a future edit there touches it.)

- [ ] **Step 5: Effect — re-readable colours and the subscription** (lines 286-289 and the cleanup)

Add `import { useThemeStore } from '~/features/theme/store'`. Replace lines 286-289:

```ts
    let serverColor = FALLBACK_SERVER_COLOR
    let clientColor = FALLBACK_CLIENT_COLOR
    const readColors = () => {
      const styles = getComputedStyle(canvas)
      serverColor = styles.getPropertyValue('--success').trim() || FALLBACK_SERVER_COLOR
      clientColor = styles.getPropertyValue('--heading-color').trim() || FALLBACK_CLIENT_COLOR
    }
    readColors()
```

Every `draw(ctx, size, centreLon, centreLat, serverColor, clientColor)` call already reads the `let`s at call time — no change to them. Immediately before `if (!document.hidden) start()` add:

```ts
    // Re-read on a theme flip and repaint once; the running loop (if any)
    // picks the new values up on its next frame anyway. Subscribing here
    // rather than re-running the effect on `theme` keeps centreLon, so the
    // globe does not snap back to the Atlantic when the button is pressed.
    const unsubscribeTheme = useThemeStore.subscribe((state, prev) => {
      if (state.theme === prev.theme) return
      readColors()
      if (size > 0) draw(ctx, size, centreLon, centreLat, serverColor, clientColor)
    })
```

Add `unsubscribeTheme()` as the first line of the cleanup.

- [ ] **Step 6: Tests, typecheck**

Run: `pnpm test -- src/pages/about/serverGlobe.test.tsx && npx tsc -p tsconfig.json --noEmit`
Expected: all globe tests pass, including the new one.

- [ ] **Step 7: Look at `/#/about` in both themes** (build + preview + two screenshots as before). Expected: dark globe unchanged; light globe drawn in black hairlines on white, green server nodes darker (`--success` light), and toggling while the page is open recolours it without the rotation jumping.

- [ ] **Step 8: Commit**

```bash
git add src/pages/about/serverGlobe.tsx src/pages/about/serverGlobe.test.tsx
git commit -m "feat(about): draw the globe from the theme tokens and repaint on a flip

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: End-to-end — theme fixture, doubled a11y matrix, theme spec

**Files:**
- Create: `e2e/fixtures/theme.ts`
- Create: `e2e/theme.spec.ts`
- Modify: `e2e/a11y.spec.ts:7-8,99-143`

**Interfaces:**
- Consumes: `THEME_KEY`, `THEMES`, `Theme` from `src/features/theme/types.ts` (DOM-free, importable under Node — the fixtures already import `src/backendApi/core/OpenAPI` the same way); the toggle's accessible names from Task 4.
- Produces: `pinTheme(page, theme)`.

- [ ] **Step 1: Write the fixture**

`e2e/fixtures/theme.ts`:

```ts
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
```

- [ ] **Step 2: Write the failing theme spec**

`e2e/theme.spec.ts`:

```ts
import { test, expect } from './fixtures/console'
import { pinTheme } from './fixtures/theme'
import { THEME_KEY } from '../src/features/theme/types'

const html = (page: import('@playwright/test').Page) => page.locator('html')
const themeColor = (page: import('@playwright/test').Page) => page.locator('meta[name="theme-color"]')

// playwright.config.ts defaults colorScheme to dark; these two override it
// per block to prove first paint follows whichever the OS reports.
test.describe('with no saved preference', () => {
  test.describe('and a light OS', () => {
    test.use({ colorScheme: 'light' })
    test('first paint follows the OS', async ({ page, consoleErrors }) => {
      await page.goto('/#/about')
      await expect(html(page)).toHaveAttribute('data-theme', 'light')
      await expect(themeColor(page)).toHaveAttribute('content', '#ffffff')
      expect(consoleErrors).toEqual([])
    })
  })

  test.describe('and a dark OS', () => {
    test.use({ colorScheme: 'dark' })
    test('first paint follows the OS', async ({ page }) => {
      await page.goto('/#/about')
      await expect(html(page)).toHaveAttribute('data-theme', 'dark')
      await expect(themeColor(page)).toHaveAttribute('content', '#000000')
    })
  })
})

test.describe('with a saved choice', () => {
  test.use({ colorScheme: 'dark' })
  test('the saved choice wins over the OS', async ({ page }) => {
    await pinTheme(page, 'light')
    await page.goto('/#/about')
    await expect(html(page)).toHaveAttribute('data-theme', 'light')
  })
})

test('the toggle flips the theme, renames itself, and the choice survives a reload', async ({ page, consoleErrors }) => {
  await page.goto('/#/about')
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')

  // Two toggles exist (desktop cluster, mobile row); at this viewport only
  // the desktop one is visible and getByRole ignores hidden elements.
  const banner = page.getByRole('banner')
  await banner.getByRole('button', { name: 'Switch to light theme' }).click()
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
  await expect(themeColor(page)).toHaveAttribute('content', '#ffffff')
  await expect(banner.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible()

  await page.reload()
  await expect(html(page)).toHaveAttribute('data-theme', 'light')
  expect(await page.evaluate(k => localStorage.getItem(k), THEME_KEY)).toBe('light')

  await banner.getByRole('button', { name: 'Switch to dark theme' }).click()
  await expect(html(page)).toHaveAttribute('data-theme', 'dark')
  expect(consoleErrors).toEqual([])
})
```

- [ ] **Step 3: Run it**

Run: `pnpm test:e2e -- e2e/theme.spec.ts`
Expected: all 4 pass (Tasks 3-4 are already in). If any fails, that is a real defect in an earlier task — fix it there, do not weaken the spec. (If a stale preview from a manual check is still on 4173, kill it first: the webServer reuses it and would test an old `dist/`.)

- [ ] **Step 4: Double the a11y matrix**

In `e2e/a11y.spec.ts`, add to the imports:

```ts
import { THEMES, pinTheme } from './fixtures/theme'
```

Replace lines 99-143 (the route loop, the 404 test and the picker test) with the same three wrapped in a theme loop:

```ts
// Both palettes, every page state. color-contrast is a gated wcag2aa rule and
// the light palette is where it can actually fail — a single-theme scan would
// leave the risky half unaudited. Theme is pinned through storage so the
// pre-paint script applies it on the first frame; the attribute assertion
// then proves the scan is looking at the palette it claims to.
for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await pinTheme(page, theme)
    })

    for (const { path, heading } of ROUTES) {
      test(`${path} has no WCAG violations`, async ({ page }, testInfo) => {
        await page.goto(`/#${path}`)
        // Guards against a vacuous pass: if a lazy chunk fails or React throws,
        // the body is effectively empty and every rule is inapplicable, so an
        // unscanned page would still report zero violations. This is not a
        // duplicate of routes.spec.ts's heading assertion — that spec doesn't run
        // when this one is invoked alone via --grep.
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        // Without this the audit targets a loading spinner, not the rendered page.
        await page.waitForLoadState('networkidle')

        expect(await scanForWcagViolations(page, testInfo, `${theme}/${path}`)).toEqual([])
      })
    }

    test('the 404 page has no WCAG violations', async ({ page }, testInfo) => {
      await page.goto(NOT_FOUND_PATH)
      // Same vacuous-pass guard as the route loop above.
      await expect(page.getByText('Page not found')).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await page.waitForLoadState('networkidle')

      expect(await scanForWcagViolations(page, testInfo, `${theme}/404`)).toEqual([])
    })

    // The picker is the densest a11y surface in the app: role="dialog", aria-modal,
    // a hand-rolled focus trap. Scanning the whole page rather than just the dialog
    // is deliberate — the rules worth having here concern the relationship between
    // the modal and the content behind it.
    test('the wallet picker has no WCAG violations', async ({ page }, testInfo) => {
      await injectMockWallet(page)
      await page.goto('/#/')
      await page.waitForLoadState('networkidle')

      // Scoped to the header: CallToAction renders a second "Connect Wallet"
      // button, so the unscoped role query is a strict-mode violation.
      await page.getByRole('banner').getByRole('button', { name: 'Connect Wallet' }).click()

      const dialog = page.getByRole('dialog', { name: 'Connect a wallet' })
      await expect(dialog).toBeVisible({ timeout: PICKER_MOUNT_TIMEOUT })
      // Scan with a provider listed, not the "No browser wallets detected" state.
      await expect(dialog.getByRole('button', { name: MOCK_WALLET_NAME })).toBeVisible()

      expect(await scanForWcagViolations(page, testInfo, `${theme}/wallet-picker`)).toEqual([])
    })
  })
}
```

The skip-link and chart-name tests below stay outside the loop unchanged.

- [ ] **Step 5: Run the a11y suite**

Run: `pnpm test:e2e -- e2e/a11y.spec.ts`
Expected: 22 tests (2 × 10 scans + 2). Any `color-contrast` failure under `light theme` is the point of this task: fix it by adjusting the **light** value in `theme.css` (never a dark one), re-run `theme.test.ts` for parity, and re-run this suite. Record any value you change in the commit message.

- [ ] **Step 6: Full e2e**

Run: `pnpm test:e2e`
Expected: green. `routes.spec.ts`, the marquee specs and `wallet.spec.ts` run under the config's dark default and are unaffected.

- [ ] **Step 7: Commit**

```bash
git add e2e/fixtures/theme.ts e2e/theme.spec.ts e2e/a11y.spec.ts
git commit -m "test(e2e): scan both themes for WCAG violations; cover the toggle end-to-end

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Light-mode contrast over the art

CLAUDE.md records the dark worst case (6.04:1, `.page-header-sup` over the Flare symbol) as *pixel-sampled*, because the chain art, the rune canvas and the carousel mask defeat axe's background resolution. Repeat that measurement in light.

**Files:**
- Create (scratchpad, not committed): `contrast.mjs`
- Possibly modify: `src/assets/css/theme.css` (`--chain-art-opacity` light value only)

- [ ] **Step 1: Write the sampler** in the scratchpad directory as `contrast.mjs`:

```js
// Pixel-samples the background behind text nodes and reports the worst
// contrast against the node's computed colour. Needs vite preview on 4173.
import { chromium } from '@playwright/test'

const BASE = 'https://localhost:4173'
const THEME = process.argv[2] ?? 'light'
const ROUTES = ['/', '/about', '/news', '/contact', '/flare/fsp', '/songbird/fsp', '/flare/validator', '/avalanche/validator']
const SELECTORS = ['.page-header-sup', '.page-header-main', '.hero-wordmark', '.hero p', '.hero-stat', '.stack-item-name', 'main h2', 'main h3', 'main p']

const b = await chromium.launch()
const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 }, reducedMotion: 'reduce' })
const page = await ctx.newPage()
await page.addInitScript(t => localStorage.setItem('stakecore:theme', t), THEME)

const worstBehind = async (el) => {
  const box = await el.boundingBox()
  if (!box || box.width < 1 || box.height < 1) return null
  const fg = await el.evaluate(e => getComputedStyle(e).color)
  await el.evaluate(e => { e.style.visibility = 'hidden' })
  const png = await page.screenshot({ clip: box })
  await el.evaluate(e => { e.style.visibility = '' })
  return page.evaluate(async ([b64, fg]) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + b64
    await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const x = c.getContext('2d'); x.drawImage(img, 0, 0)
    const d = x.getImageData(0, 0, c.width, c.height).data
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
    const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    const m = fg.match(/[\d.]+/g).map(Number)
    const a = m.length > 3 ? m[3] : 1
    let worst = Infinity
    for (let i = 0; i < d.length; i += 4) {
      // Text with alpha composites over the pixel behind it first.
      const fr = a * m[0] + (1 - a) * d[i], fgg = a * m[1] + (1 - a) * d[i + 1], fb = a * m[2] + (1 - a) * d[i + 2]
      const lf = lum(fr, fgg, fb), lb = lum(d[i], d[i + 1], d[i + 2])
      const [hi, lo] = lf > lb ? [lf, lb] : [lb, lf]
      worst = Math.min(worst, (hi + 0.05) / (lo + 0.05))
    }
    return worst
  }, [png.toString('base64'), fg])
}

for (const route of ROUTES) {
  await page.goto(`${BASE}/#${route}`)
  await page.waitForLoadState('networkidle')
  for (const sel of SELECTORS) {
    const els = page.locator(sel)
    const n = Math.min(await els.count(), 4)
    for (let i = 0; i < n; i++) {
      const el = els.nth(i)
      if (!(await el.isVisible())) continue
      const r = await worstBehind(el)
      if (r != null) console.log(r.toFixed(2).padStart(6), route.padEnd(22), sel, i)
    }
  }
}
await b.close()
```

- [ ] **Step 2: Run it for both themes** (preview running, built from the current tree):

Run: `NODE_PATH=$PWD/node_modules node <scratchpad>/contrast.mjs light | sort -n | head -20` and the same with `dark`.
Expected: the dark run's minimum is ≈ 6.04 (the recorded figure — a sanity check that the sampler agrees with the earlier measurement). Note the light minimum and which node it is. Data routes render ServerError here (no CORS fixture), which is fine: the nodes that sit over art are the page headers, and those render regardless.

- [ ] **Step 3: If the light minimum is under 4.5**, lower the light `--chain-art-opacity` in `theme.css` (try `0.22`, then `0.18`) and re-run until every sampled node clears 4.5. Do **not** change any text token to fix this — the text is fine on the ground; it is the art behind it that is the variable. If the failing node is over the rune canvas instead, lower `.hero-rune-canvas`'s opacity via a new `--hero-art-opacity` token (add to both palettes; `theme.test.ts` will insist).

- [ ] **Step 4: Record both numbers** — they go into CLAUDE.md in Task 12. Commit only if `theme.css` changed:

```bash
git add src/assets/css/theme.css
git commit -m "fix(theme): lower the chain art's light-mode opacity to keep header contrast at AA

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: Dark regression — diff against the Task 0 baseline

**Files:**
- Uses (untracked): `e2e/darkBaseline.spec.ts` and its snapshots from Task 0.

- [ ] **Step 1: Compare**

Make sure no stale preview is running (`pkill -f 'vite preview'`), then:

Run: `pnpm exec playwright test e2e/darkBaseline.spec.ts`
Expected: most routes **fail** by a small margin — that is what you want to look at. For each failure Playwright writes `test-results/<name>/*-diff.png` (changed pixels in red, alongside `-expected.png` and `-actual.png`).

- [ ] **Step 2: Inspect every diff image with the Read tool.** Red is permitted **only** in:

- the header, where the toggle button now sits (a 32 px square left of "Connect Wallet");
- live data — hero statistics, activity cards, chart points, meter readouts, epoch countdowns — where the numbers changed between the two runs;
- these three deliberate near-matches, each too small to read as a change but listed so you know what you are looking at: the recharts tooltip card (`#1a1a1a` → `#1F1F1F`, only visible if a tooltip is open — it will not be), the secondary chart series and axis ticks (`rgba(255,255,255,.5)` → `.55`), and the FSP delegate preview warning text (`rgba(255,165,0,.9)` → `#e58630`, only visible mid-delegation — it will not be).

Anything else — a banner colour, a border, a card surface, the rune wave, the globe, the constellation lines, an underline — is a regression in Task 5-8. Fix it there (the offending mapping is one of the steps in those tasks), rebuild, re-run this step. A test that passes outright (under the 2% ratio) still gets its `-actual.png` read once against the baseline; the threshold is a convenience, not the check.

- [ ] **Step 3: Confirm nothing from this task is staged**

Run: `git status --short`
Expected: `e2e/darkBaseline.spec.ts` and `e2e/darkBaseline.spec.ts-snapshots/` remain `??`. Delete both once satisfied: `rm -r e2e/darkBaseline.spec.ts e2e/darkBaseline.spec.ts-snapshots`.

---

### Task 12: Documentation and the stale comments

**Files:**
- Modify: `CLAUDE.md` (Styling section)
- Modify: `src/assets/css/style.css:1-12` (section header, if not already done in Task 1)

- [ ] **Step 1: Fix the incorrect claim and add a Theming subsection to CLAUDE.md**

In the Styling paragraph, change "Design tokens (breakpoints, weights, font-size scale, radii, z-index scale, colors) live in `src/assets/css/_tokens.scss`" to "Design tokens (breakpoints, weights, font-size scale, radii) live in `src/assets/css/_tokens.scss`; **colour lives in `src/assets/css/theme.css`** — see Theming below".

Insert a new `### Theming` subsection directly after the Styling section's final paragraph (the fonts one) with this content, substituting the two measured numbers from Task 10:

```markdown
### Theming

Two palettes, one set of token names, selected by `data-theme` on `<html>`.
`src/assets/css/theme.css` is the only file that knows what a theme looks
like: `:root` is dark (the brand default and what JavaScript-off gets),
`:root[data-theme="light"]` overrides it. `theme.test.ts` asserts the two
blocks declare the same names and pins the dark values that moved out of
`style.css`. Nothing else may branch on `data-theme` except where a
*formula* has to flip rather than a value — today only the stack carousel's
oklch lightness clamp (a floor on dark, a ceiling on light).

- **Resolution order is stored choice → `prefers-color-scheme` → dark**, and
  it is implemented twice on purpose: once in the inline pre-paint script in
  `index.html` (it has to run before any module loads, or the first frame is
  the wrong palette) and once in `src/features/theme/store.ts`.
  `prepaint.test.ts` executes the script out of the HTML against happy-dom to
  keep the two in step. The script is the one sanctioned touch of
  `localStorage` outside `safeStorage.ts`.
- **The store writes the document, synchronously, before it notifies.** The
  rune canvas and the globe re-read the palette with `getComputedStyle`
  inside a store subscription; a React effect would stamp the attribute one
  commit too late and they would repaint in the outgoing theme's colours.
  There is a test for that ordering.
- **The toggle is two-state with no way back to "follow the OS".** The first
  click pins a choice (`pinned`), and a later OS change is ignored. Its
  accessible name is the action ("Switch to light theme"), not the state, and
  it carries no `aria-pressed`.
- **Dark is pixel-identical to before the change.** Every dark token is the
  literal it replaced. Where a stylesheet needed an alpha no token carries,
  it uses `color-mix(in srgb, var(--heading-color) N%, transparent)` with a
  token fallback declared first. Don't "tidy" those into the nearest token.
- **`var(--…)` works inside SVG presentation attributes** (`stroke`, `fill`,
  `color`) — verified in Chromium — which is why recharts and spinners-react
  take token strings straight in their props and there is no chart
  stylesheet.
- **Playwright emulates a light OS by default**, so `playwright.config.ts`
  sets `colorScheme: 'dark'` and theme-aware specs opt in. `a11y.spec.ts`
  scans every page state under both palettes (pinned through storage with
  `e2e/fixtures/theme.ts`, so the pre-paint script applies it on the first
  frame) and asserts `data-theme` before each scan.
- **Contrast over the art, re-measured.** Dark worst case 6.04:1
  (`.page-header-sup` over the Flare symbol); light worst case **N.NN:1**
  (`<node>` over `<art>`) at `--chain-art-opacity: <value>`. Re-run the
  sampler if either palette's art gets brighter.
- Left as they are, deliberately: the five dark-canvas illustrations
  (protocol thumbnails, the news visualiser) and the chain symbols — dark
  cards on a light page, revisit after living with it; `.notification-block`'s
  named-colour borders and the `FireBrick` bar fills, which read on both
  grounds and whose token neighbours differ in value.
```

Also update the Accessibility bullet on contrast ("Contrast has been measured, not assumed") to add: "The light palette has its own figure — see Theming."

- [ ] **Step 2: Sweep for stale references**

Run: `grep -rn "style.css" src/pages/about/serverGlobe.tsx src/assets/css/_tokens.scss; grep -rn "later phase" src`
Expected: nothing (Task 8 Step 2 fixed the globe comment; Task 5 Step 14 fixed hero.scss). Fix any survivor.

- [ ] **Step 3: Final gates**

Run: `pnpm lint && npx tsc -p tsconfig.json --noEmit && pnpm test && pnpm build && pnpm test:e2e`
Expected: all green. Unit count should be 455 + (3 theme.css + 12 store + 6 prepaint + 3 header + 3 diff + 1 globe) = 483 or thereabouts.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md src
git commit -m "docs: describe the theme system, and correct where colour tokens live

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-review against the spec

| Spec section | Task |
|---|---|
| §1 token layer: `theme.css`, dark `:root` + light block, `color-scheme`, eight new tokens, light values, invariant, mask stops and scrim stay literal | Task 1 (plus `--danger-surface`/`--danger-border`, chosen over `color-mix` for the banner so the dark band is exact) |
| §2 pre-paint script, store (`theme`, `pinned`, `toggleTheme`, `THEME_KEY`), applying to document + meta, toasts/tooltips props | Tasks 2-3 — with one deliberate deviation: the *store* stamps the document synchronously instead of a `root.tsx` effect, because canvas subscribers read `getComputedStyle` inside the store listener (Task 2 tests it) |
| §3 toggle: `RiSunLine`/`RiMoonLine`, action label, no `aria-pressed`, desktop + mobile placement, header test | Task 4 |
| §4 stylesheet mapping table | Task 5 — `color-mix`-with-fallback replaces "nearest token" for 0.18/0.3/0.32/0.9 so dark is exact; `.notification-block` borders and `links.tsx` kept per Global Constraints |
| §4 rune canvas `alpha:true`, `u_ink`, premultiplied, store subscription | Task 7 |
| §4 globe `globalAlpha`, re-read on flip | Task 8 (subscription, not effect deps, so rotation is preserved) |
| §4 recharts, diff, meter, epoch, spinner, strip, constants | Task 6 — props take `var()` directly; the spec's stylesheet fallback is unnecessary and its condition was tested |
| §5 a11y both themes with attachment label, theme.spec.ts (OS-follow, flip, reload, meta) | Task 9 |
| §5 contrast sampling in light, art-opacity token | Task 10 |
| §5 dark screenshot regression | Tasks 0 + 11 |
| §5 unit tests: store resolution, blocked storage, pinned ignores OS; header | Tasks 2, 4 |
| §5 docs: CLAUDE.md Theming, `_tokens.scss` claim, "later phase" comments | Task 12 (comments in 5 and 8) |

Placeholder scan: the only intentional blanks are the three measured values in Task 12's CLAUDE.md text, filled from Task 10's output. Names used across tasks — `useThemeStore`, `applyThemeToDocument`, `THEME_KEY`, `THEMES`, `isTheme`, `THEME_COLORS`, `pinTheme`, `ThemeToggle`, the two button labels, the token names — are consistent with their defining task.

