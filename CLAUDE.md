# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StakeCore is a React SPA for a crypto staking infrastructure provider operating on Flare, Songbird, and Avalanche networks. Deployed to GitHub Pages at stakecore.org.

## Commands

- **Dev server**: `pnpm dev`
- **Build**: `pnpm build`
- **Lint**: `pnpm lint` (Biome) / `pnpm lint:fix` (applies safe fixes)
- **Test**: `pnpm test` (one-shot) / `pnpm test:watch` (watch mode)
- **Regenerate API client**: `pnpm openapi-gen && pnpm openapi-fix`
- **Deploy**: `pnpm build-all && pnpm run deploy` (GitHub Pages; `deploy` is a reserved pnpm command, so use `pnpm run`)

## Package Manager (pnpm via Corepack)

The version is pinned in `package.json#packageManager` (`pnpm@10.34.1`). There is **no global pnpm install** anywhere in this project — Corepack (built into Node ≥ 16.10) reads `packageManager` and delegates `pnpm <cmd>` to that exact version. Switch projects, the version switches with you. The lockfile is `pnpm-lock.yaml` and CI runs `pnpm install --frozen-lockfile`.

Setup is in two places:

- **Devcontainer** ([.devcontainer/post-create.sh](.devcontainer/post-create.sh)): the container is built from [docker-compose.yaml](.devcontainer/docker-compose.yaml) (`base:ubuntu24.04` plus the `devcontainers/features/node` feature, pinned to Node 22 in [devcontainer.json](.devcontainer/devcontainer.json) and hash-locked in `devcontainer-lock.json`). The node feature installs a global pnpm that shadows Corepack's shim, so `postCreateCommand` → `post-create.sh` runs `npm rm -g pnpm` then `corepack enable --install-directory "$(npm config get prefix)/bin" pnpm` — the shim lands in a writable, on-PATH bin (the `vscode` user can't write to `/usr/local/bin`, where Corepack defaults). `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` is set in `containerEnv` so the `pnpm install` at the end of that script doesn't hang on an interactive download prompt.
- **CI** ([.github/workflows/deploy-site.yml](.github/workflows/deploy-site.yml)): `corepack enable` runs **before** `actions/setup-node@v4` — otherwise `cache: pnpm` in setup-node fails because `pnpm` doesn't resolve yet. `node-version` is kept at 22 to match the devcontainer.

Symptoms that point at a Corepack misconfig:

- `pnpm --version` reports a version that isn't `10.34.1` → a global pnpm is shadowing the shim. Remove it (`npm rm -g pnpm`) and re-enable Corepack.
- `pnpm install` hangs with no output on first run → the download prompt is waiting on stdin. Set `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`.
- CI fails on `cache: pnpm` before any install step → `corepack enable` is missing or runs after `setup-node`.
- `pnpm install` fails on a **fresh rebuild** with `EACCES … mkdir '/home/vscode/.cache/node/corepack/v1'` → `~/.cache` is root-owned. Docker creates the parent directories of a volume mount itself, as root, and the base image ships no `/home/vscode/.cache`, so mounting `playwright-browsers` at `.cache/ms-playwright` leaves both that directory and `.cache` owned by root. `post-create.sh` chowns them before corepack runs; if you add another volume under `$HOME`, chown it there too. Corepack is only the first casualty — `playwright install` writes to the same volume.

## Ports

The devcontainer **publishes** its ports in [docker-compose.yaml](.devcontainer/docker-compose.yaml) rather than relying on the editor's port forwarding. Forwarding only exists while VS Code is attached and only reaches the host's own loopback; publishing means a plain host browser works, and so does a phone on the same LAN — the only honest way to check a mobile layout.

| Port (in container) | What | Host port | Reachable from host |
| --- | --- | --- | --- |
| 5173 | `pnpm dev` | `$DEV_SERVER_PORT` | published |
| 4173 | `vite preview` (the Playwright target) | `$PREVIEW_PORT` | published |
| 53770–53779 | ad-hoc tooling that picks its own port | same | published |
| anything else | — | — | editor forwarding only, via the Ports panel |

**If you also run `pnpm dev` on the host, the two sides collide and the host loses.** Publishing binds the host port for as long as the container is up, whether or not anything inside is listening — so a host-side `pnpm dev` fails with `Port 5173 is already in use`, and `ss -ltnp` shows a listener with a blank Process column (the holder is root-owned `docker-proxy`, not a stray server of yours). The fix is to shift the *host* side in `.devcontainer/.env` and rebuild; the in-container numbers never change, so nothing else has to move:

```
DEV_SERVER_PORT=15173
PREVIEW_PORT=14173
```

That is the current local setting. The compose defaults stay at `5173`/`4173` for anyone who works only inside the container, since the straight-through mapping is what you want then.

Three things hold this together, and breaking any one of them makes a running server look unreachable:

- **Vite binds all interfaces.** `server`/`preview` in [vite.config.js](vite.config.js) set `host: true`. Vite's default is loopback, which inside a container is the *container's* loopback — the published mapping would then reach an interface with nothing listening and refuse the connection. They also set `strictPort`, because the mapping is for those exact numbers: Vite's default hunt for the next free port would leave the server on an unpublished 5174 while reporting success.
- **Host-side numbers come from `.devcontainer/.env`** (`DEV_SERVER_PORT`, `PREVIEW_PORT`, `TOOL_PORTS`), seeded by `initialize.sh` with the same `ensure_var` mechanism as `WORKSPACE_NAME`. They are overridable for two reasons: a host port already in use makes `docker compose up` fail, and that failure takes the whole devcontainer with it rather than just the one service; and running the dev server on the host as well as in the container needs the two to stop fighting over the same number (see above). `TOOL_PORTS` is applied to *both* sides of the mapping, so it must stay a range or a single number — a published range has to be the same size on each side.
- **Published ports are deliberately absent from `forwardPorts`** in [devcontainer.json](.devcontainer/devcontainer.json). Listing them would make VS Code try to bind the same host port a second time, fail, and silently land on a neighbouring one. `otherPortsAttributes` is set to `notify` so ports *outside* the published blocks — where forwarding is the only way in — announce themselves instead of being forwarded silently.

The ad-hoc block is ten ports and not a wide range because Docker starts a userland proxy process per published port. The `host: true` rule applies to whatever you run there too: a tool that defaults to binding loopback needs its own equivalent flag (`--host 0.0.0.0`) or the published port reaches nothing. Changing any of this needs a **container rebuild** (*Dev Containers: Rebuild Container*); `forwardPorts`-style settings alone would only need a window reload.

## Tech Stack

React 19, TypeScript, Vite 7, React Router 8 (hash router), SWR for data fetching, Zustand for state, Bootstrap 5 + custom CSS/SCSS, ethers.js 6, EIP-6963 wallet discovery.

## Architecture

- `src/route/router.tsx` — Hash router config. Routes: `/`, `/about`, `/contact`, `/flare/fsp`, `/flare/validator`, `/songbird/fsp`, `/avalanche/validator`
- `src/layout/root.tsx` — Root layout wrapping all pages (header, footer, wallet UI, toasts)
- `src/pages/` — Route-level page components. Pages with sub-components live as folders (e.g. `pages/about/`); single-file routes (`home.tsx`, `contact.tsx`, `notFound.tsx`) stay flat. `pages/protocols/` holds the four protocol routes plus shared pieces used by all of them (`info.tsx`, `title.tsx`, `tooltip.tsx`, `fsp-stats.tsx`, `fspLocalDelegate.{tsx,scss}`, `unavailabilityBanner.{tsx,scss}`, `protocols.scss`, `types.ts`, `utils.ts`). Both page shells (`validator/page.tsx`, `fsp/page.tsx`) wrap their loading/error/empty/loaded ladder in `.protocol-body`, which reserves `60vh`. That keeps the call-to-action and footer below the fold while data loads instead of letting them get shoved out of the viewport when it arrives — worth 0.62 and 0.30 CLS on the validator and FSP routes respectively. Keep new state branches inside that wrapper.
- `src/components/sections/` — Page sections used across multiple routes (hero, portfolio, header, footer, callToAction, proposal, etc.).
- `src/components/ui/` — Reusable UI primitives (links, diff pill, server-error panel, meter bar, epoch progress, etc.).
- `src/pages/protocols/types.ts` — Shared protocol-page interfaces (ISpecs, ISummary).

### API Layer

- Backend at `https://backend.stakecore.org`
- `src/backendApi/` is **auto-generated** from OpenAPI — do not edit manually. Use `pnpm openapi-gen` to regenerate.
- Services: `FspService`, `FlareValidatorService`, `AvalancheValidatorService`, `LandingPageService`
- Data fetching uses SWR with refresh intervals defined in `src/constants.ts` (`REFRESH_QUERY_FAST_MS` = 10s, `REFRESH_QUERY_SLOW_MS` = 30s)
- **Never branch on `isLoading` before you have checked for loaded data and for
  an error.** SWR 2.x reports `isLoading` for *any* in-flight request with no
  loaded data — which is the state every retry after a failure is in, not just
  the first load. All five state ladders in this app got that order wrong, and
  it showed up as the "Connection failed" panel being torn down and rebuilt on
  each retry: the panel is replaced by a spinner for however long the fetch
  takes to fail, then rebuilt. Traced in the browser against a backend failing
  after 2.5s, the hero's panel vanished for the full 2.5s of every retry. The
  rule is **most-settled-first**: data you have, then an error you have, then a
  request still in flight. Two consequences worth keeping — the page changes
  only when a fetch *succeeds*, and a failed background refresh no longer
  blanks a fully-rendered page. `queryState.tsx` carries the trace and the
  reasoning; `validator/page.tsx`, `hero.tsx`, `callToAction.tsx` and
  `fsp/delegateLocal.tsx` each hold the same rule, the last two as a `firstLoad`
  guard because their ladders use `data == null` as the failure signal.

### State Management

All wallet + chain-session state lives under `src/features/wallet/`:

- `store.ts` — Zustand store for wallet provider + connected address + chain selection + picker visibility
- `picker.tsx` — The EIP-6963 wallet-picker modal (portaled into `#eip6963`)
- `discover.ts` + `discoverStore.ts` — EIP-6963 provider discovery exposed via `useSyncExternalStore`
- `eip1193.ts` — EIP-1193 RPC helpers (account/chain queries, network switching, personal sign)
- `hook.ts` — `onInternalChainSwitch` (call when the route's target chain changes)

### Deferred Work

`src/utils/useAfterIdle.ts` returns false on the first render and true once the browser is idle (with a 2s timeout escape hatch). Two things use it, both to keep work off the first commit:

- [root.tsx](src/layout/root.tsx) lazy-mounts the toast container, the tooltip singleton, and the wallet picker. None are visible until the user acts, but importing them eagerly cost ~79 kB of the eager bundle. `toast()` call sites import `react-toastify` directly and are all inside lazy route chunks, so they don't drag it back onto the critical path.
- [recentActivity.tsx](src/components/ui/recentActivity.tsx) renders `INITIAL_CARDS` activity cards first and fills in the remaining ~40 at idle. Pass `enabled` (`useAfterIdle(itemCount > 0)`) when deferring work that needs data first — an ungated callback fires during the initial empty render and lifts the deferral before there's anything to defer.

### Constants & Config

- `src/constants.ts` — Chain configs, contract addresses/ABIs, explorer URL builders, token configs, epoch configs, color codes
- `src/enums.ts` — Chain enum, StatusCode, Status type
- `src/vite-env.d.ts` — Global TypeScript definitions for EIP-6963, EIP-1193, app state

### Styling

Global stylesheets are aggregated through `src/assets/css/index.scss`, which `main.tsx` imports alongside `bootstrap-reboot.min.css`, `grid.scss`, and the react-tooltip bundle. The aggregator pulls in `theme.css`, `fonts.css`, `spacing.css`, `style.css`, `responsive.css`, and `custom.css` in cascade order, and also inlines the `.error-*` rules used by `ServerError` and the 404 page (originally in `error.scss`, inlined to silence Sass `@import` deprecation warnings). Component-specific SCSS is co-located with each component (e.g. `header.scss`, `hero.scss`, `proposal.scss`, `meterBar.scss`, `epochProgress.scss`, `diff.scss`, `unavailabilityBanner.scss`). Design tokens (breakpoints, weights, font-size scale, radii) live in `src/assets/css/_tokens.scss` and are consumed via `@use '...tokens' as t;`; **colour lives in `src/assets/css/theme.css`** — see Theming below.

Display type is different from body type and does not live in the `$text-*`
scale. A title's size is a **ramp** across breakpoints, and a Sass variable
holds one number — which is why `$text-xl` / `$text-2xl` / `$text-hero` sat at
one usage each while fourteen distinct raw pixel sizes accumulated across
component and global stylesheets (three of the fourteen — 24, 30, 58 — are the
bare `h1`–`h6` element rules in `style.css`, not component files). Four mixins
in `_tokens.scss` carry the whole ramp instead:
`display-page` (36/56/72), `display-section` (28/40), `display-hero` (32/48/60,
the home wordmark only) and `display-stat` (34/50/60, hero figures — kept
separate from `display-hero` so a title change cannot silently resize every
statistic beside it).

Titles themselves go through [pageHeader.tsx](src/components/ui/pageHeader.tsx),
which is the only place the suptitle-plus-title block exists. Its `variant`
prop binds five things: display ramp, heading level (`page`→`h1`,
`section`→`h2`), `max-width`, `line-height` and body size. Of those, only
heading level and body size were already perfectly correlated across the seven
hand-built copies it replaced — display ramp, `max-width` and `line-height`
each had a dissenter, and are normalised to the variant's majority value on
purpose. That normalisation is where this change's visual deltas come from.
They are not separately settable on purpose — binding the level to the variant
is what keeps `heading-order` correct by construction:
[routes.ts](e2e/fixtures/routes.ts) supplies the expected heading name for each
route, and [routes.spec.ts](e2e/routes.spec.ts) plus
[a11y.spec.ts](e2e/a11y.spec.ts) each assert it at `level: 1` on all eight
routes. **Do not size a title in a page stylesheet.** The one live exception is
[callToAction.scss](src/components/sections/callToAction.scss)'s `h2`, a card
heading inside `.call-to-action-part` that does not go through `PageHeader`:
`PageHeader`'s 720px `max-width` and 32px bottom margin would fight the card,
breaking the deliberate size match with `proposal.tsx`'s "Earn Yield" heading
that the file's own comment protects. If a new title does not fit `page` or
`section`, add a variant to the component rather than a `font-size` to the
page — a per-page size is exactly how the previous drift started, and
`news.scss` ended up carrying two comments asserting it matched the others
exactly.

Layout uses a 12-column grid, but **not** Bootstrap's — `src/assets/css/grid.scss` reimplements the containers, rows, columns, and the five utility classes the app actually uses (`d-flex`, `align-items-center`, `justify-content-center`, `mx-auto`, `mb-0`). Semantics match Bootstrap 5 exactly, including the `--bs-gutter-x` / `--bs-gutter-y` custom properties that `responsive.css` overrides. `bootstrap-grid.min.css` was 51.8 kB of render-blocking CSS for ~13 class usages. Only `bootstrap-reboot.min.css` remains third-party. If you reach for a Bootstrap class that isn't in `grid.scss`, add it there rather than pulling the framework back in.

Fonts are **self-hosted** in `public/fonts/` (latin subsets; Inter and Roboto Mono are variable). `src/assets/css/fonts.css` holds the `@font-face` rules and `index.html` preloads Inter + Major Mono Display. They were on fonts.googleapis.com, which was render-blocking on a cold third-party origin and sat in front of the font files themselves. Two details are load-bearing: the metric-matched `'Inter Fallback'` face (second in every sans stack) keeps text from re-wrapping when the real Inter arrives, and Major Mono Display uses `font-display: optional` so a late arrival can't shift the header. Font URLs are literal and unhashed — that's why the files live in `public/`, not `src/assets/`.

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
- **Dark is perceptually identical to before the change.** Every dark token
  is the literal it replaced. Where a stylesheet needed an alpha no token
  carries, it uses `color-mix(in srgb, var(--heading-color) N%, transparent)`
  with a token fallback declared first. Don't "tidy" those into the nearest
  token. Verified with a one-off full-page screenshot pass over all eight
  routes at 2% tolerance against a pre-change build; the spec was deleted
  afterwards, so that pass is not a standing gate — the pinned literals in
  `theme.test.ts` are what CI actually checks going forward.
  One set of dark values did move, deliberately: `.notification-block`'s
  `.note` / `.warning` / `.danger` borders were the named colours `lime` /
  `orange` / `red` and are now `--status-good` / `--status-warn` / `--danger`,
  so on dark the warning rail shifts `#ffa500` → `#e58630`. The named colours
  could not stay: `orange` measures 1.98:1 on white and `lime` 1.37:1, and the
  warning callout renders on both validator routes.
- **`var(--…)` resolving inside SVG presentation attributes** (`stroke`,
  `fill`, `color`) was verified in Chromium, but only Chromium is installed
  here, so nothing depends on it where the failure mode is invisible content.
  `statsChart.scss` targets recharts' own class names
  (`.recharts-line-curve`, `.recharts-cartesian-axis-tick-value`) for the
  curve stroke and axis tick fill, instead of passing those through `<Line>`
  / `<XAxis>` props, and `diff.tsx`'s arrow icon takes `fill="currentColor"`
  rather than the token directly. The chart's **dots** stay on `<Line>`'s
  `stroke`/`dot` props on purpose — recharts portals `Dots` into a sibling
  zIndex layer outside the line's own `<g>` (`statsChart.scss`'s header
  comment has the detail), so no `.recharts-line …` selector can reach them;
  a CSS rule there would silently match nothing. Where the value lands in an
  inline style or a custom property instead — spinners-react's `color` prop,
  the chart tooltip's `contentStyle` / `labelStyle` / `itemStyle` — `var()`
  is universally safe and stays a prop.
- **Playwright emulates a light OS by default**, so `playwright.config.ts`
  sets `colorScheme: 'dark'` and theme-aware specs opt in. `a11y.spec.ts`
  scans every page state under both palettes (pinned through storage with
  `e2e/fixtures/theme.ts`, so the pre-paint script applies it on the first
  frame) and asserts `data-theme` before each route scan.
- **Contrast over the art, re-measured.** The dark figure recorded above
  (6.04:1, `.page-header-sup` over the Flare symbol) still holds — re-sampling
  `.page-header-sup` over the chain symbols gave 7.93:1 dark and 6.63:1 light,
  so the chain art was never the binding constraint. The rune canvas is, and
  it is the one place where readable text and visible art pull against each
  other: every step darker in `--hero-art-opacity` eats the contrast of every
  piece of text sitting on the canvas. Three light values are therefore tuned
  as a **set** — `--hero-art-opacity: 0.42`, `--hero-tagline-color: #262626`,
  and `--main-color: #575757` (the statistics) — measuring **4.99:1** for the
  tagline, **4.78:1** for the statistics and 14.59:1 for the wordmark, worst
  of three animation frames. Dark keeps `0.3` and `#9f9f9f`, i.e. exactly what
  `--main-color` gave it. Changing one light value alone breaks the set:
  re-sample all three and every text element in the hero.
  Two traps if you re-run the sampler. Measure the **loaded** hero, not the
  `ServerError` state — the statistics are the text that is normally there,
  and they sit over a different part of the field. And the sampler takes the
  worst pixel in an element's *bounding box*, so it reports the activity
  marquee's links at ~1:1 whenever a token logo drifts inside their box; that
  is the box, not the text's background. `0.45` was measured too and reached
  4.56:1 — passing, but too thin a margin on art whose worst pixel moves every
  frame.
- **A pre-existing dark-mode gap the sampling exposed.** The same hero tagline
  over the same canvas measures **3.24:1 in dark**, and always has —
  `--main-color` (`#9f9f9f`) over the canvas's bright inside glyphs. It was
  never caught because axe cannot resolve a canvas background and headless
  Chromium here has no WebGL2, so the canvas renders nothing under test. It is
  untouched by this branch (dark values are pinned) and wants its own fix:
  either a darker rune inside-glyph alpha or a brighter tagline.
- **Screenshot and contrast checks of the hero need a real GPU path.** Plain
  headless Chromium in this devcontainer has no WebGL2, so the rune canvas
  renders nothing and a screenshot gate over it passes identically for a
  working and a broken change. Run those under `xvfb-run -a` with
  `headless: false` (SwiftShader), and assert
  `document.createElement('canvas').getContext('webgl2')` is truthy before
  trusting the result.
- **The four protocol thumbnails are inline SVG components**, not `.svg`
  files: [protocolThumbnails.tsx](src/components/ui/protocolThumbnails.tsx)
  with its own stylesheet. As `<img src>` their colours were beyond CSS's
  reach, which is the whole reason a drawing has to be inlined to be themed —
  a second set of light `.svg` files would have been the same geometry to keep
  in step twice. Their ground is `--thumb-surface` (dark `#0a0a0a`, the
  literal the files carried) and every line is
  `color-mix(in srgb, var(--heading-color) N%, transparent)` at the alpha the
  file used, so dark is unchanged and light is the same drawing inverted.
  Inlining also revealed there are only **two** drawings: both FSP tiles share
  a ring and 24 ticks, both validator tiles a star and 10 nodes — only the
  brand mark differs. Brand marks keep their own hex.
- Left as they are, deliberately: the news FAsset visualiser (a much larger
  drawing — still a dark card on a light page) and the chain symbols; the
  `FireBrick` bar fills, which read on both grounds and whose token
  neighbours differ in value.

### Agent readability

The site ships a static, JS-free surface for LLM agents and crawlers, built to
[Vercel's Agent Readability Spec](https://vercel.com/kb/guide/agent-readability-spec).
Everything lives in `public/` (Vite copies `publicDir` verbatim into `dist/`),
so it is additive — no route, component, or store is involved.

`robots.txt`, `llms.txt`, `sitemap.xml`, `sitemap.md`, `AGENTS.md`,
`glossary.md`, plus one markdown mirror per route: `index.md`, `about.md`,
`contact.md`, `flare/fsp.md`, `flare/validator.md`, `songbird/fsp.md`,
`avalanche/validator.md`.

**The mirrors are the content, not a convenience copy.** The app is a hash
router, so a fragment never reaches the server: all seven routes return the
same `index.html`, and an agent that doesn't execute JavaScript sees an empty
`<div id="root">` on every one of them. That is also why `sitemap.xml` lists
the mirrors rather than the routes — seven `<loc>` entries pointing at one
document would be worthless — and why the JSON-LD in [index.html](index.html)
is inline and static rather than injected at runtime.

Four things to know before changing any of it:

- **`<lastmod>` in `sitemap.xml` and `dateModified` in each mirror's
  frontmatter are hand-maintained.** Edit a mirror's copy without touching its
  date and the file quietly starts lying about freshness — the one failure mode
  here that no test can catch. A build-time generator stamping them from git
  would fix it; that was deliberately deferred, not overlooked.
- **Mirrors carry no live figures.** Delegation totals, APYs, and epoch
  statistics refresh every 10–30s ([constants.ts](src/constants.ts)), so the
  mirrors describe the protocol and link to the page and the API instead. Don't
  paste numbers in; they'd be stale within the minute and unfalsifiable.
- **`/openapi.json` is emitted by a plugin in [vite.config.js](vite.config.js)**,
  not copied into `public/`. A copy is a second source of truth that
  `pnpm openapi-gen` doesn't update, so it would silently drift from the schema
  the generated client is built from.
- **`e2e/agentReadability.spec.ts` must reject the SPA shell explicitly.**
  `vite preview` falls back to `index.html` for any path it can't resolve, so a
  200 alone proves nothing — a missing file returns the shell rather than the
  404 GitHub Pages would give. The `not.toContain('<div id="root">')`
  assertion is what makes those tests real.
- **The charset shim is patched onto two APIs, and the spec asserts both
  protocols.** `text/plain` and `text/markdown` carry no in-band encoding
  declaration, so a response without `; charset=utf-8` leaves browsers falling
  back to windows-1252 and every em dash rendering as mojibake. Pages sends the
  parameter for both extensions (verified against a Pages-hosted `.md`); Vite's
  static middleware drops it, so `utf8TextTypes` in
  [vite.config.js](vite.config.js) restores it locally. It has to patch
  `writeHead` *and* `setHeader`: sirv writes the type through `writeHead`,
  which is the only path on HTTP/2, while over HTTP/1.1 something downstream
  re-sets it via `setHeader` afterwards and would strip the charset back off.
  Patching only `setHeader` left Playwright's `request` fixture (h1) green
  while browsers, which negotiate h2, still showed mojibake — which is why the
  spec now asserts over both protocols and reaches for `node:http2` to do it.

**Two spec checks are unachievable on GitHub Pages** and are knowingly unmet:
`Accept: text/markdown` content negotiation, and the `Link:` canonical header
on markdown responses. Both need server-side logic; Pages serves static bytes
with fixed headers. The page-level HTML checks that read rendered content
(heading count, text-to-HTML ratio) also pass only for `/`, and can't be fixed
without prerendering routes to real paths — i.e. leaving the hash router. Don't
file these as bugs; they're the known cost of the current hosting.

### Accessibility

The target is **WCAG 2.1 AA**, gated in CI by `e2e/a11y.spec.ts` (see Testing
below). axe covers perhaps a third of the criteria, so the decisions it cannot
check are recorded here — each one is load-bearing, and several look like
arbitrary style choices until you know what they are for.

- **Document titles live in route `handle.title`** ([router.tsx](src/route/router.tsx)),
  applied by an effect in [root.tsx](src/layout/root.tsx). A hash fragment
  never reaches the server, so without this every route ships index.html's
  `<title>StakeCore</title>` and a screen-reader user gets no signal that
  navigation happened at all (2.4.2 Page Titled, level A). They are asserted
  per route in [routes.ts](e2e/fixtures/routes.ts) on the same navigation as
  the heading, so a title naming a page the router didn't render fails.
- **The skip link is a `<button>`, not `<a href="#main">`.** In a hash router
  that href is a navigation to the `/main` route, not a fragment jump. It moves
  focus onto `<main tabIndex={-1}>` — focus, not scroll: a scroll leaves the
  next Tab back in the header, which is the thing being skipped. It is
  positioned off-screen with a `transform`, never `display:none` or
  `visibility:hidden`, both of which would remove it from the tab order it
  exists to be in.
- **`NotFound` uses an `<h1>`; `ServerError` and `RouteError` keep their
  `<div>`.** The 404 is a whole route, so "Page not found" is its title and
  1.3.1 wants that in the markup. The other two render *inside* a route that
  already owns an `h1`. `.error-label` out-specifies the bare `h1` rules in
  `style.css`, so the promotion changes nothing visually.
- **The protocols nav toggle carries no `aria-haspopup`.** It is shorthand for
  "menu", and the thing it controls is a plain `<ul>` of links with no arrow
  navigation. Claiming it also left axe unable to resolve `aria-controls`,
  filing an `aria-valid-attr-value` *incomplete* on every route in the site.
  `aria-expanded` + `aria-controls` is the whole disclosure contract.
- **Spec tooltips are `<button>`s** ([tooltip.tsx](src/pages/protocols/tooltip.tsx)),
  and their accessible name is the tooltip text itself. As a `<div>` the text
  lived only in `data-tooltip-content` and was pointer-only (2.1.1) with no
  text alternative for the icon (1.1.1). react-tooltip opens on focus as well
  as hover, so making the trigger focusable fixes the visual tooltip too.
- **Charts name themselves from their series keys**
  ([statsChart.tsx](src/components/ui/statsChart.tsx)). recharts' accessibility
  layer already makes the surface focusable and arrow-key navigable — the
  tooltip follows the keyboard, so the values are genuinely reachable without a
  pointer — but it ships no name, so focus landed on an interactive region that
  announced nothing (4.1.2). The `<h3>` above each chart is not
  programmatically associated with it. There is still no *tabular* alternative
  to the data; that is a known gap, not an oversight.
- **`aria-label` needs a role to attach to.** The activity marquee is a
  `<section>` for exactly this reason: ARIA forbids a naming attribute on an
  element with no role, so `aria-label` on the bare `<div>` it used to be named
  nothing at all (axe: `aria-prohibited-attr`) and AT dropped it.
- **2.2.2 (Pause, Stop, Hide) is met unevenly, on purpose.** The hero activity
  feed contains links, so keyboard focus pauses it. The About stack carousels
  contain no focusable children, so their only mechanism is
  `prefers-reduced-motion`. That was weighed against adding a visible pause
  toggle and deliberately kept — see the long comment in
  [useMarquee.ts](src/utils/useMarquee.ts) for the reasoning and the condition
  that should reopen it.
- **Contrast has been measured, not assumed.** axe reports `color-contrast` as
  *incomplete* on most routes because the chain background art, the hero rune
  canvas and the carousel mask defeat its background resolution. Sampling the
  rendered pixels put the worst case **over the chain art** at **6.04:1**
  (`.page-header-sup` over the Flare symbol), comfortably past the 4.5:1 AA
  threshold. The rune canvas was not genuinely rendered by that pass, and has
  a known dark-mode gap — see Theming. Don't treat those incompletes as
  unknowns; do re-measure if the background art gets brighter than
  `opacity: 0.30`. The light palette has its own figure — see Theming.
- **Two things pass only on a technicality, so tread carefully.** Hash links in
  the activity feed are 17px tall and clear 2.5.8 (WCAG 2.2) solely through the
  spacing exception, with 26px between centres against a 24px requirement —
  tightening `.activity-row` spacing breaks it. And the home page's tab order
  runs ~100 marquee links deep; the skip link bypasses the header, not those.

### Testing

Vitest + happy-dom + `@testing-library/react` / `user-event`. 455 tests across 45 files at last count, all co-located next to source as `*.test.ts(x)`. Test files declare their environment per-file via a top-of-file `// @vitest-environment happy-dom` directive (no global config). There is no global setup file, so RTL's auto-cleanup does not run — a test that renders more than once must call `afterEach(cleanup)` itself, or later queries will match elements left behind by earlier renders.

Common patterns: `vi.mock('~/features/wallet/store', ...)` to provide a fake Zustand store, `vi.mock('~/features/wallet/eip1193', ...)` for the RPC helpers, Proxy-mocked `Contract` instances for ethers calls, `MemoryRouter` wrapping for components that use `useLocation` / `NavLink`. `fireEvent.click` instead of `userEvent.click` when targeting react-router `<Link>` (userEvent's synthetic chain doesn't reach the onClick prop reliably through Link's `preventDefault`).

#### End-to-end (Playwright)

Playwright 1.62.1, Chromium only, specs in `e2e/`. `pnpm test:e2e` (or
`pnpm test:e2e:ui`). Coverage is deliberately thin: every route renders with
its real heading, its own document title and no error panel, a wallet connect
against a mocked EIP-6963 provider, an axe-core accessibility scan of all eight
page states plus the open wallet picker, the two structural a11y facts axe
cannot see (the skip link reaching `<main>`, and every chart carrying an
accessible name), the agent-readable static surface
(`e2e/agentReadability.spec.ts` — see below), and the two marquees
(`e2e/stackCarousel.spec.ts`, `e2e/activityMarquee.spec.ts`), and the
containment and retry behaviour of a failed section chunk
(`e2e/chunkResilience.spec.ts` — see Lazy chunk failures). The marquee specs
are here rather than in unit tests because what they assert is layout: whether
a swipe can reach the activity feed's first card is a fact about scroll
geometry, and happy-dom lays nothing out, so the same assertion there would
pass against a row that is broken. Same trap as component-level axe below.

Accessibility scans (`e2e/a11y.spec.ts`) gate on WCAG 2a/2aa/21a/21aa only.
`best-practice` rules are scanned and logged but never fail a test — gating on
them would let a routine axe bump redden CI — and axe's `incomplete` results are
logged and attached to the Playwright report rather than gated. Component-level
axe under happy-dom was measured and rejected: it cannot evaluate `color-contrast`
(no style computation, so the check lands in `incomplete` and a green run proves
nothing) and cannot see cross-component `heading-order`. The *contents* of the
YouTube embed on the protocol routes are excluded from every scan
(`.exclude(['.video-container iframe', 'body'])`), since that markup isn't this
project's to fix — a scope decision, not rule suppression. The `<iframe>`
element itself stays in the scanned document, so rules that target the frame
element in our own markup (e.g. `frame-title`) stay fully active. The exclude
selector's second segment must be `body`, not `html`: axe's own containment
check treats an `html` exclude as tied with the default document-wide
`include` boundary and resolves ties in favour of "in context", making it a
silent no-op — `body` is a strict descendant of that boundary, so it excludes
as intended.

- **Vitest and Playwright split by include glob.** Vitest's default include
  (`**/*.{test,spec}.*`) would swallow `e2e/*.spec.ts`, so `vite.config.js`
  pins `test.include` to `src/**/*.test.{ts,tsx}`. Unit tests stay co-located
  next to source; e2e specs are the only thing under `e2e/`. Name a new unit
  test `*.test.ts(x)` inside `src/`, or it will not run.
- **The app under test is `vite preview`, not `pnpm dev`** — configured as
  Playwright's `webServer`, which runs `pnpm build` first. The devcontainer
  bind-mounts the project, so host and container share one
  `node_modules/.vite` dep cache and each `vite dev` invalidates the other
  side's pre-bundled deps. Preview also exercises the artifact that ships.
- Preview is **HTTPS** with a self-signed cert; contexts need
  `ignoreHTTPSErrors: true` (set globally in `playwright.config.ts`). Routes
  are hash routes — navigate `/#/flare/fsp`.
- **Tests hit the live backend**, so they assert structure only, never exact
  values. `e2e/fixtures/console.ts` fails a test on any unallowlisted console
  error; `e2e/fixtures/wallet.ts` installs a fake EIP-6963 provider via
  `addInitScript`.
- **The backend allows only the production origin.** It answers every request
  with a fixed `Access-Control-Allow-Origin: https://stakecore.org` — the same
  value whatever `Origin` is sent, or none. Preview serves from
  `https://localhost:4173`, so unaided, every SWR call is blocked, every data
  route renders ServerError, and the console fills with CORS errors.
  `e2e/fixtures/backend.ts` refetches each backend request via `route.fetch()`
  (outside the page, where CORS does not apply) and refulfills it with just
  that header patched, so the specs still hit the real backend and still fail
  on an outage or a schema change. Every spec asserting rendered data imports
  `test` from there rather than from `console.ts` or `@playwright/test`. Do not
  instead allowlist the CORS text in `console.ts`: the console errors are the
  quieter half, and the routes would still be rendering the error panel. The
  real alternative is server-side — allowlist the preview origin and delete the
  fixture.
- **The YouTube player is stubbed; the backend is not.**
  `e2e/fixtures/embeds.ts` fulfils every youtube-nocookie.com request locally,
  because `waitForLoadState('networkidle')` otherwise settles only once that
  player — and the gstatic fonts it pulls from inside the frame — has finished.
  That handed the four video routes' settle time to a third-party CDN, and a
  slow one blew the 30s test budget: the suite reddened on a protocol route, at
  that call, and went green on a rerun. Measured by holding *only* the player's
  requests for 25s: `/flare/fsp` never settled, while `/about` (no video, same
  delay, same backend) settled in 517ms. Stubbing it took the full suite from a
  12.7–40s spread with intermittent failures to 12.5–12.8s across five runs.
  No coverage is lost — nothing asserts anything about the player, the a11y
  scans already exclude the frame's contents, and the `<iframe>` element stays
  in our document so `frame-title` still applies. The stub body is a *complete*
  document (lang, title, body) because axe injects into every frame and the
  scans' `exclude` scopes out the frame's `<body>`, not its `<html>`.
  `routes.spec.ts` guards the fixture by asserting no `/s/player/` or gstatic
  request ever escapes.
- **Prefer a web assertion to `networkidle` in new specs.** `networkidle` waits
  for *everything* to fall silent, so it inherits the slowest thing on the
  page — which is how a third-party CDN came to set the pass/fail line above,
  and it still leaves the remaining calls exposed to a slow backend. Where a
  spec can name the fact it is waiting for, that assertion is both the wait and
  the check: the chart test waits on `.recharts-surface` being visible, which a
  chart only becomes once its data has arrived and the lazy recharts chunk has
  run. The calls that remain in `routes.spec.ts` and the `a11y.spec.ts` route
  loop each have a documented reason (let SWR settle so a ServerError would
  have appeared; audit the rendered page rather than a spinner) and no cheap
  replacement — `spinners-react` renders an unclassed `<svg>`, so "no spinner
  on screen" would need a marker added to the app.
- CI runs them in `.github/workflows/e2e.yml`, separate from the deploy
  workflow so a backend outage cannot block a Pages publish.

## Conventions

- Import alias: `~/` resolves to `src/` (configured in tsconfig.json and vite.config.js)
- `src/utils/misc/formatter.ts` — Shared number / currency / date / address formatting (use `Formatter.usd()` for dollar amounts so signs and the `<` sub-precision marker land outside the `$`). The `length` argument on `number` / `usd` / `percent` is an **exact** digit count, not a maximum: results are zero-padded to it (`2` → `2.00`, `2000` → `2.00k`, `0` → `0.00` at the length-3 default) so figures in a column share one decimal precision. Only two things escape it — an integer part that already fills `length` renders whole, and the `<0.01` sub-precision rail is a marker rather than a number. `percent` spends its budget after the ×100 shift, so `percent(0.5)` is `50.0%` and `percent(1)` is `100%`. That padding rule is why **counts go through `Formatter.count()`, never `number()`** — a cardinal quantity has no sub-unit, so `number(2)` rendering `2.00` under a "Delegators" label describes a fraction of a delegator that cannot exist. `count` pads nothing and compacts nothing (`1234` → `1,234`, not `1.23k`): the exact answer exists and is short enough to show. Reach for `number` when the thing is *measured* (token amounts, USD, rates) and `count` when it is *counted*. Every formatter is **total**: NaN, ±Infinity, undefined/null, an unparseable string, or an invalid date renders as `Formatter.NO_VALUE` (`—`) instead of throwing or inventing a value. That matters because these run during render on values derived from backend JSON. Two distinct failure modes were folded into one rule here:

  - `number` / `usd` / `percent` / `date` / `dateHuman` used to **throw** — `BigInt()` and `Date#toISOString()` both do on bad input, and a throw during render unmounts the whole route.
  - `days` / `duration` / `relativeDate` used to **lie**, which is worse in one specific way: the output looked like data. `duration(NaN)` rendered the literal `"NaNs"`, and `relativeDate(NaN)` fell through every unit to report `"0 seconds ago"` — an absent timestamp displayed as "just now".

  All of them return the marker **bare**, with no `$` / `%` / `' days'` affix, so it never reads as a real quantity. Genuine zeros are unaffected (`usd(0)` is `$0.00`, `duration(0)` is `0s`) — there are tests pinning that, since a falsy check here would silently swallow them.
- Explorer URLs follow pattern: `chain{Evm|PChain}{AddressUrl|TransactionUrl}(hash)` in constants
- Three chains supported: Flare (chain._0), Songbird (chain._1), Avalanche (chain._2)
- Two protocols: FSP (protocol._0), Validator (protocol._1)
- Package manager: pnpm (see the dedicated section above); run scripts with `pnpm <script>` except the reserved `deploy` name, which needs `pnpm run deploy`

### Type strictness

`tsconfig.json` runs `strict: false` but `strictNullChecks: true`. The split is deliberate: `strictNullChecks` is what catches the null-deref class that white-screens a route, while full `strict` would also enable `noImplicitAny` and light up every untyped callback param (the router's `lazyRoute`, several component props) without catching runtime crashes. Two consequences worth knowing:

- `noUncheckedIndexedAccess` is only load-bearing *because* `strictNullChecks` is on. Without it the `| undefined` that flag adds stays assignable to everything and the setting is a silent no-op. Don't turn `strictNullChecks` off without also dropping that one, or the config will claim a guarantee it isn't providing.
- Array/record indexing therefore yields `T | undefined`. Prefer a real guard (`const x = arr[i]; if (x == null) return`) or `?? fallback` over `!`. Where an invariant genuinely holds but isn't expressible — `SERVERS[w.type]` in `infraConstellation.tsx`, `paletteAt` in `meterBar.tsx` — the codebase uses a total accessor with a fallback rather than an assertion, so drift becomes a wrong colour instead of a blank page.

`pnpm lint` does not typecheck. Run `npx tsc -p tsconfig.json --noEmit` before pushing.

### Linting (Biome)

Biome replaced ESLint. It is configured **lint-only** — `formatter` and `assist` are both off, because turning the formatter on would rewrite all 183 source files in one commit and Prettier is already the editor formatter (`.devcontainer/devcontainer.json` sets it per-language). Config is [biome.jsonc](biome.jsonc).

Two things about that file are load-bearing:

- **It must stay `.jsonc`.** Biome parses `biome.json` as strict JSON, and a `//` comment there does not fail loudly — it emits a `reporter/parse` diagnostic, silently falls back to the *default* config, and starts linting `node_modules` (160 files checked becomes 804). A green run would prove nothing. If you ever see the checked-file count jump, that's the cause.
- **`src/backendApi/` is excluded.** It's generated from OpenAPI and never hand-edited, so findings there are noise nobody is allowed to fix — it alone accounted for 25 of the 35 `noExplicitAny` hits.

The old ESLint config declared `files: ['**/*.{js,jsx}']`, which never matched a single `.ts`/`.tsx` file. `eslint .` linted exactly three files (`eslint.config.js`, `vite.config.js`, `scripts/gen-coastlines.mjs`), so the `pnpm lint` gate in CI was effectively a no-op and the `react` / `react-hooks` / `react-refresh` plugins never ran on a component. Biome lints TS/TSX natively, so the swap turned linting on for `src/` for the first time.

That left a backlog. Rather than disable those rules or hand-fix ~158 findings in the migration commit, the 13 currently-failing `recommended` rules are demoted to **`warn`** in a documented ratchet block. `biome lint` exits non-zero only on *errors*, so CI stays green while every finding is still printed on each run. **To ratchet: fix a rule's backlog, then delete its line from `biome.jsonc`** — it reverts to its `recommended` default of `error` and starts gating. Start with `useExhaustiveDependencies` (11), the one most likely to be hiding real stale-closure bugs.

Two rules need care rather than a bulk `--write`:

- **`noDoubleEquals`** (20) is not safe to auto-fix. Some hits are the `== null` guard idiom endorsed above; others are `bigint == 0`, where `===` is `false` and switching would silently change behaviour.
- **`noNonNullAssertion`** (36) overlaps with the `!`-avoidance guidance above, but rewriting assertions into guards is a behavioural change, not a lint fix.

`pnpm lint:fix` applies only Biome's **safe** fixes. Never run it with `--unsafe` across the repo.

### Chain config (`src/config/chains.ts`)

`CHAIN_CONFIG` is declared with **`satisfies Record<Chain, ChainConfig>`**, not a `: Record<Chain, ChainConfig>` annotation. Keep it that way. An annotation widens every entry to `ChainConfig`, where `epoch`, `video`, `wrappedSymbol` and the explorer builders are all optional — which is why `constants.ts` used to assert ~20 of them with `!` on module-scope lines that run at import, inside the eager bundle. A rename or deletion in `chains.ts` was invisible to the compiler and surfaced as `Cannot read properties of undefined` during module evaluation: a blank page on **every** route, thrown before React mounts and before any error boundary exists. `satisfies` still checks each entry is a valid `ChainConfig` (and that no `Chain` is missing) while preserving the literal shape, so per-chain field presence is compile-checked and the `!`s are gone.

Protocol availability is carried by two exported types rather than re-asserted at each use:

- `ValidatorChain = Chain.FLARE | Chain.AVALANCHE` — Songbird runs no validator, so it has no P-chain or validator explorer. Used by `createValidatorDataAccess`.
- `FspChain = Chain.FLARE | Chain.SONGBIRD` — Avalanche runs no FSP, so it has no `wrappedSymbol` and no EVM explorer. Used by `FspPageConfig` / `FspDelegateConfig`.

Passing the wrong chain to either shell is now a compile error instead of a pair of `undefined` URL builders reaching a click handler. If you add a chain or move a protocol, expect errors at the call sites — that is the mechanism working, not something to `!` past.

### Web Storage

Never touch `sessionStorage` / `localStorage` directly — go through `safeSession` / `safeLocal` in [safeStorage.ts](src/utils/safeStorage.ts). Storage doesn't merely fail, it **throws**: Chrome with cookies fully blocked raises `SecurityError` on *property access* to `sessionStorage`, before any method runs. The helper fetches the storage object through a thunk inside each `try` so the property access is covered too, and resolves it per call rather than at module scope — caching it at import would move the failure into module evaluation, which is the blank-page-before-React case.

`set()` returns a **boolean**, and callers recording a decision they must later read back have to branch on it. `routeLazy` is the cautionary example: its `RELOAD_FLAG` is the only thing stopping a permanently broken chunk from reloading forever, so it reloads only `if (get(...) !== '1' && set(...))`. Swallowing the write failure and reloading anyway would produce an infinite reload loop — strictly worse than the crash being fixed.

Testing blocked storage: replace the property with a throwing getter via `Object.defineProperty(window, 'sessionStorage', { get() { throw ... } })`, and restore the saved descriptor afterwards. Do **not** use `vi.spyOn(Storage.prototype, …)` — those spies were observed to silently stop applying once another test in the same file had already touched storage, which turns the storage tests green against code that is still broken. Both storage test suites assert the block is live before asserting anything else, for exactly that reason.

### Lazy chunk failures

`routeLazy` covers a failed **route** chunk. Everything else lazily imported —
a chart, a section, the deferred chrome — goes through `lazyRetry`
([lazyRetry.tsx](src/components/ui/lazyRetry.tsx)), which is a drop-in
replacement for `React.lazy` and still needs a `<Suspense>` above it, as every
call site already has.

The reason is that `<Suspense>` handles a chunk that is *pending* and does
nothing for one that *rejects*: that propagates as a render error, and the only
boundaries in this app are the per-route `errorElement`s. So a 503 on the 6 kB
fsp-stats chunk took the entire `/flare/fsp` route with it — no `<h1>`, no
provider data (already fetched and fine), no delegate widget, under "A new
version may have been deployed", which was not true. The same shape existed on
the validator chart and, worse, on `root.tsx`'s toasts / tooltips / wallet
picker: those mount inside `RootLayout`, so their only boundary was the *root*
`errorElement`, which replaces `RootLayout` itself — a failed react-toastify
chunk blanked the whole site on every route.

Three things about it are load-bearing:

- **The retry re-imports a cache-busted URL, because a plain retry does not
  re-fetch at all.** The module map records a failed fetch against its URL and
  replays that failure for every later import of it. Measured in Chromium
  against this build: three imports of a chunk whose first fetch 503'd produced
  exactly **one** request. `retryImport` therefore recovers the URL from the
  engine's own error message and appends `?__retry=n`. Safari names no URL
  ("Importing a module script failed."), so there it degrades to containment
  with no retry — which is still the half that matters.
- **The `lazy()` is created once per call site, never in component state.** A
  lazy that suspends on first render never commits, so React discards the
  subtree and rebuilds it when the promise settles, re-running any `useState`
  initializer inside. A lazy minted there is a different object each time, so
  the rejection is never replayed as a catchable throw and the chunk is
  re-requested forever — 3,786 requests in 30s, with no error UI, when this was
  first written that way. `e2e/chunkResilience.spec.ts` asserts the exact
  request count for that reason; loosening it to `toBeGreaterThan` would let
  the storm back in.
- **`silent: true` is for chunks with no visible surface until the user acts.**
  The three in `root.tsx` use it; a notice about a toast container nobody has
  triggered is noise. Anything the user can see gets the notice and its Retry.

A route chunk keeps using `routeLazy` instead: when the thing that failed *is*
the page, there is no subtree left to contain the failure to.

### Route error boundaries

`src/route/routeError.tsx` is the render boundary for every route, wired as `errorElement` on each **child** route in `router.tsx` plus the root as a backstop. Child placement is the point: an `errorElement` on the root route replaces `<RootLayout />` itself, so a single bad component would take the header, footer and wallet UI down with it. On a child, the crash is contained to the `<Outlet />`.

It also tells a failed dynamic import (a deploy replaced the hashed chunk — reloading genuinely fixes it) apart from an ordinary render throw, and only shows the "a new version may have been deployed" copy for the former. The previous `ChunkLoadError` component doubled as both and blamed a deployment for every error it caught. Its markup reuses the `.error-*` classes shared with `ServerError` / the 404 page, plus a `.route-error` hook that `e2e/routes.spec.ts` asserts is absent on every content route.
