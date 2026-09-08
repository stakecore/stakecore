# Light mode, and a toggle to reach it

Date: 2026-09-08

## Goal

Give the site a light color theme, chosen by the visitor's OS on first visit
and overridable with a header button whose choice persists. The dark theme
must come through the change pixel-identical, apart from the new button.

Two comments in the codebase have been waiting for this:
`src/components/sections/hero.scss:6-9` ("The full light theme flip is a later
phase") and `src/assets/css/style.css:213-219`. This is that phase.

## Decisions already made

| Question | Decision |
|---|---|
| Default with no saved preference | Follow `prefers-color-scheme`; no JS → dark |
| Toggle shape | Two-state (light ↔ dark). The first click pins an explicit choice; there is no control that returns to "follow the OS" — clearing site data is the only way back |
| The five dark-canvas illustrations (four protocol thumbnails, the news FAsset visualiser) and the three chain symbols | Left as they are. Dark illustration cards on a light page is an intentional look; revisit after seeing it |
| Mechanism | `data-theme` attribute on `<html>` plus one token-override block. Not `light-dark()` (2024 feature, no graceful fallback) and not swapped stylesheets |

## What exists today

- `style.css:16-36` already holds a 14-token color palette on `:root`:
  `--main-color`, `--heading-color`, `--body-background`, five border alphas
  (`--border-emphasis/-strong/(none)/-subtle/-faint`), `--surface-hover`,
  `--surface-raised`, `--surface-menu`, `--text-dim`, `--danger`,
  `--success`. 26 of 36 stylesheets use only these.
- `_tokens.scss` holds **no** colors, despite CLAUDE.md saying it does.
- Ten stylesheets still carry white-alpha or named literals tuned for a black
  page. TS/TSX carries more: the recharts chart, the meter LEDs, the diff pill,
  the epoch bar, the spinner, two canvases.
- No theme plumbing: no `prefers-color-scheme`, no `data-theme`, nothing in
  `localStorage`. `safeLocal` exists with zero callers; the one storage key in
  the app is `stakecore:chunk-reload-attempted`, which sets the naming
  convention.
- The hero rune canvas is WebGL2 with `alpha: false`, so it paints an opaque
  black rectangle wherever there is no glyph. On a light page that is a black
  band, not a background.
- react-toastify is mounted with `theme='dark'`; react-tooltip with no
  `variant` (library default: dark); recharts colors are all literal.
- The stack carousel's hover color is `oklch(from var(--stack-brand)
  max(l, 0.78) c h)` — a lightness *floor*, tuned for black.

## Design

### 1. Token layer

New file `src/assets/css/theme.css`, first `@import` in `index.scss`. It owns
color and nothing else. The 14 color tokens move out of `style.css`'s `:root`
into it (spacing, radii, fonts stay in `style.css`), as a dark `:root` block
and a `:root[data-theme="light"]` block that redefines the same names. Each
block also sets `color-scheme` (`dark` / `light`) so scrollbars and native
controls match.

Eight tokens are added because the survey found literals with nothing to map to:

| Token | Dark (today's literal) | Light | Replaces |
|---|---|---|---|
| `--surface-card` | `#0F0F0F` | `#fff` | wallet modal card (`picker.scss:21`) |
| `--shadow` | `rgba(0,0,0,.45)` | `rgba(0,0,0,.15)` | validator picker drop shadow (`validatorPicker.scss:101`) |
| `--status-bad` | `#d94357` | darkened to ≥ 4.5:1 on `#fff` | `meterBar.tsx:18` label, `unavailabilityBanner.scss:32` |
| `--status-warn` | `#e58630` | darkened to ≥ 4.5:1 | `meterBar.tsx:19` label, `fspLocalDelegate.scss:235` (orange), `protocols.scss:192` |
| `--status-good` | `#76B768` | darkened to ≥ 4.5:1 | `meterBar.tsx:20` label, `fsp-stats.tsx:82` |
| `--diff-positive` / `--diff-negative` | `#50e3c2` / `#ff3e55` | darkened to ≥ 4.5:1 | `diff.tsx:5-6`; the 12%-alpha pill backgrounds derive from them via `color-mix` |
| `--brand-lightness-clamp` | `0.78` | `0.55` | the `oklch` clamp in `stackCarousel.scss:136` |

Light values for the existing tokens, as a starting point to be tuned by eye
during verification:

| Token | Light |
|---|---|
| `--body-background` | `#fff` |
| `--heading-color` | `#000` |
| `--main-color` | `#5c5c5c` (≈ 6.8:1 on white; today's `#9f9f9f` is ≈ 8:1 on black) |
| `--border-*`, `--surface-hover`, `--surface-raised` | `rgba(0,0,0,α)` at the same alphas as the dark values |
| `--surface-menu` | `#f2f2f2` |
| `--text-dim` | `rgba(0,0,0,.6)` (≈ 5.7:1) |
| `--danger` | `#c8102e` |
| `--success` | `#2f7d4a` |

**Invariant: every dark value is today's literal.** The dark theme is not
being redesigned; a rendered dark page before and after this change differs
only by the toggle button.

Things that stay as literals on purpose, because they express alpha rather
than color: the `black` "keep" stops in the mask gradients (`hero.scss:43-44`,
`recentActivity.scss:18-19`, `stackCarousel.scss:21-22`) and the `#overlay`
scrim in `custom.css:11` — a dark scrim over a light page is correct. The
meter LED *gradients* (`meterBar.tsx:18-20`) also stay: they are fills, not
text, and read fine on both grounds.

### 2. State, persistence, and the pre-paint script

**`index.html`** gains an inline `<script>` in `<head>`, before the stylesheet
link, roughly:

```js
(function () {
  var t
  try { t = localStorage.getItem('stakecore:theme') } catch (e) {}
  if (t !== 'light' && t !== 'dark') {
    try { t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark' } catch (e) { t = 'dark' }
  }
  document.documentElement.dataset.theme = t
})()
```

This is the one place that touches `localStorage` outside
`src/utils/safeStorage.ts`, deliberately: it has to run before any module
loads or the first paint would be the wrong theme. Both accesses are in their
own `try` so blocked storage falls through to the OS preference and a missing
`matchMedia` falls through to dark. There is no CSP in `index.html`, so an
inline script is permitted. No JS → no attribute → the dark `:root` block.

**`src/features/theme/store.ts`** — Zustand, same shape as
`src/features/wallet/store.ts` (plain `create<T>()`, value + `set<Field>`
adjacent, no middleware):

- `theme: 'light' | 'dark'`. Initial value: `document.documentElement.dataset.theme`
  if it is one of the two, else the same storage → `matchMedia` → `'dark'`
  resolution the script performs (covers tests and the no-script case).
- `pinned: boolean` — `true` when storage held an explicit value at startup.
  While `false`, a `matchMedia('(prefers-color-scheme: light)')` `change`
  listener updates `theme` so an unpinned visitor keeps following the OS.
  After the first `toggleTheme()` the listener's updates are ignored.
- `toggleTheme()` — flips `theme`, sets `pinned`, writes
  `safeLocal.set(THEME_KEY, theme)`. The boolean return is *not* branched on:
  unlike `RELOAD_FLAG`, a failed write here degrades to "the choice lasts this
  session", which needs no different behaviour.
- `export const THEME_KEY = 'stakecore:theme'` — the module owns the key;
  the e2e fixtures import the name rather than repeating the string.

**Applying it** — one effect in `src/layout/root.tsx`, beside the existing
document-title effect, subscribes to `theme` and writes:
`document.documentElement.dataset.theme`, the `content` of
`<meta name="theme-color">` (`#000000` / `#ffffff`), and nothing else. The
two third-party props already in `root.tsx` become `<Toasts theme={theme}>`
and `<Tooltips variant={theme}>`.

### 3. The toggle button

**`src/features/theme/toggle.tsx`** — a `<button type="button">` showing
`RiSunLine` in dark mode and `RiMoonLine` in light (from `@remixicon/react`,
already the header's icon package). Its accessible name is the action, not the
state: `aria-label` and `title` are `"Switch to light theme"` in dark mode and
`"Switch to dark theme"` in light. No `aria-pressed` — pressed state, a
flipping icon and a flipping label would be three signals for one bit.

Rendered twice, as the social icon rows already are:

- Desktop: inside `.menu-btns` (`header.tsx:151-158`), between
  `ul.header-social` and `<ChooseWalletButton />`. Sized as a 32×32 box with a
  16px icon, sharing `.header-social li a`'s rules, so the `gap: 16px` flex
  row absorbs it without a layout change.
- Mobile: a fourth `<li>` in `ul.mobile-social` (`header.tsx:87-91`), the
  icon row beside the burger, at that row's 18px icon size.

### 4. Converting the remaining literals

**Stylesheets** — mechanical; each literal maps to the nearest existing token
or one of the new ones:

| File | Literal(s) | Becomes |
|---|---|---|
| `validatorStatsStrip.scss:47,49,62,64` | `rgba(255,255,255,.75)` / `.35` | `--heading-color` at `opacity`, or `--text-dim` / `--border-strong` — whichever preserves the dark render |
| `validatorPicker.scss:101,136` | `rgba(0,0,0,.45)`, `rgba(255,255,255,.6)` | `--shadow`, `--text-dim` |
| `fspLocalDelegate.scss:161,235` | `rgba(255,255,255,.3)`, `rgba(255,165,0,.9)` | `--border-strong`, `--status-warn` |
| `picker.scss:21` | `#0F0F0F` | `--surface-card` |
| `about.scss:146`, `news.scss:90` | `rgba(255,255,255,.32)` | `--border-strong` (0.25) or a new alpha — check the dark render |
| `infraConstellation.scss:29` | `rgba(255,255,255,.18)` | `--border` |
| `serverGlobe.scss:93` | `rgba(255,255,255,.3)` | `--border-strong` |
| `metaPill.scss:32` | `rgba(255,255,255,.9)` | `--heading-color` |
| `specs.scss:40` | `white` | `--heading-color` |
| `specs.scss:69` | `color-scheme: dark` | delete; inherited from `:root` now |
| `protocols.scss:186,188,192,193` | `#999`, `rgba(0,0,0,.5)`, `orange`, `red` | `--main-color`, `--shadow`, `--status-warn`, `--danger` |
| `unavailabilityBanner.scss:12,13,32` | `#1E090C`, `#6C222B`, `#d94357` | surface and border derived as `color-mix(in srgb, var(--danger) N%, var(--body-background))` with N chosen to reproduce today's values; text `--status-bad` |
| `stackCarousel.scss:130,136` | `#fff` mix, `max(l, 0.78)` | mix toward `--body-background`'s opposite, i.e. `--heading-color`; the clamp becomes `max(l, var(--brand-lightness-clamp))` in dark and `min(l, var(--brand-lightness-clamp))` under `[data-theme="light"]` |

Where a literal's alpha has no exact token (0.32, 0.18, 0.3, 0.75), the rule
is: pick the nearest token **only if the dark render is visually unchanged**;
otherwise add the exact alpha as a token. The invariant wins over tidiness.

**JS surfaces:**

- **Hero rune canvas** (`heroRuneCanvas.tsx`): context becomes
  `{ alpha: true, premultipliedAlpha: true }`; the shader takes a `vec3 u_ink`
  uniform and emits `vec4(u_ink * a, a)` with `a = glyphAlpha * intensity`,
  where `intensity` is the existing `INSIDE_COLOR` / `OUTSIDE_COLOR` (1.0 /
  0.42) — those constants now scale alpha rather than gray. In dark mode
  `u_ink` is white and the composite is what ships today; in light mode it is
  black ink over the light page. The component subscribes to the theme store
  and re-reads `--heading-color` via `getComputedStyle` on change. Also clear
  to transparent, not black.
- **Server globe** (`serverGlobe.tsx`): already reads `--success` and
  `--heading-color` at mount (`:287-289`). Add `theme` to the effect's deps so
  it re-runs on flip. Its six `rgba(255,255,255,α)` strokes (`:249-269`) and
  the `#ffffff` region fill (`:168`) become `--heading-color` drawn with
  `globalAlpha` set to the same α values.
- **recharts** (`statsChart.tsx`): `contentStyle` / `labelStyle` / `itemStyle`
  take `var(--surface-menu)`, `var(--border)`, `var(--text-dim)`,
  `var(--heading-color)` directly — they are inline styles, which resolve
  custom properties. Series `stroke`, dot `fill`/`stroke` and tick `fill` move
  to a new `statsChart.scss` targeting recharts' own class names
  (`.recharts-line-curve`, `.recharts-line-dot`,
  `.recharts-cartesian-axis-tick-value`): a stylesheet rule beats a
  presentation attribute in every browser, which sidesteps the question of
  whether `var()` resolves inside one. Primary series → `--heading-color`,
  secondary → `--text-dim`, dot fill → `--body-background`.
- `diff.tsx` → `var(--diff-positive)` / `var(--diff-negative)`; pill
  backgrounds `color-mix(in srgb, var(--diff-…) 12%, transparent)`.
- `meterBar.tsx` labels → `var(--status-bad/-warn/-good)`; gradients unchanged.
- `fsp-stats.tsx:82` `#76B768` → `var(--status-good)`;
  `epochProgress.tsx:21` default `'white'` → `var(--heading-color)`.
- `validatorStatsStrip.tsx:23` default `'white'` → `var(--heading-color)`.
- `queryState.tsx:43` spinner `'white'` → `var(--heading-color)` (confirm
  `spinners-react` passes `color` through to an inline style; if it sets an
  attribute, read the token with `getComputedStyle` instead).
- `constants.ts:48` `PAGE_COLOR_CODE = 'white'` → `'var(--heading-color)'`
  (audit its consumers first; if any is a canvas or attribute, treat as above).
- `links.tsx:21` `var(--bs-success, #198754)` → `var(--success)`.
- `infraConstellation.tsx` `TYPE_COLORS` and the stack brand hexes stay:
  saturated hues that read on both grounds.

### 5. Verification and CI

- **`e2e/a11y.spec.ts`** runs the route loop, the 404 scan and the picker scan
  under **both** themes — 20 scans, not 10. `color-contrast` is a gated
  `wcag2aa` rule and light mode is where it can actually fail; scanning only
  dark would leave the risky half unscanned. Theme is selected per test by
  seeding `localStorage[THEME_KEY]` through `addInitScript` before navigation
  so the pre-paint script picks it up — no click, no race. The theme name is
  folded into `scanForWcagViolations`'s `label` so report attachments stay
  distinct. Expect the suite to roughly double in wall-clock; the
  cold-connection penalty noted in memory applies once per worker, not per
  scan.
- **New `e2e/theme.spec.ts`**: (a) with empty storage and
  `page.emulateMedia({ colorScheme: 'light' })`, `html[data-theme]` is `light`
  on first paint; (b) clicking the toggle flips the attribute and the button's
  `aria-label`; (c) a reload keeps the clicked choice; (d) the
  `<meta name="theme-color">` content follows.
- **Contrast over the art**: repeat CLAUDE.md's pixel-sampling measurement in
  light mode for the same nodes (`.page-header-sup` etc. over the chain
  symbols at `opacity: 0.30`, over the rune canvas, over the carousel mask).
  Record the light worst case next to the dark 6.04:1. If anything dips under
  4.5:1, lower the art's light-mode opacity via a token — do not touch the
  text color.
- **Dark regression**: full-page screenshots of all eight routes in dark mode
  before and after, diffed. The only permitted difference is the toggle
  button. This is the check that the literal → token conversion preserved
  every dark value.
- **Unit tests**: theme store (storage beats OS beats dark; toggle persists;
  toggle still applies when `set` returns `false`, using the
  `Object.defineProperty` throwing-getter technique CLAUDE.md prescribes; OS
  `change` events ignored once pinned); header (button present, label flips,
  `dataset.theme` follows).
- **Existing gates**: `pnpm test`, `pnpm lint`, `npx tsc -p tsconfig.json
  --noEmit`, `pnpm test:e2e`.
- **Docs**: CLAUDE.md gains a Theming subsection under Styling (where color
  lives, the invariant, the pre-paint script exception to the Web Storage
  rule, the doubled a11y matrix) and its claim that colors live in
  `_tokens.scss` is corrected. The two "later phase" comments in `hero.scss`
  and `style.css` are rewritten.

## Out of scope

- Light variants of the five dark-canvas illustrations and the chain symbols.
- A third "system" toggle state.
- A tabular alternative to the charts (pre-existing a11y gap, unrelated).
- Any dark-theme color change.
