# TypeScript Migration & Build Pipeline

## Goal

Migrate the extension from plain JS to TypeScript with strict conventions, add Prettier/ESLint, Vite bundler with multi-browser support, Vitest for testing, and GitHub Actions CI.

## Project Structure

```
instagram-reels-controls/
  src/
    types.ts          — shared interfaces (ControlElements, SyncHandlers, TickLoop)
    icons.ts          — ICON urls + setIcon()
    preferences.ts    — storage load/save, state, savePrefs()
    dom.ts            — el() helper + createControlsDOM()
    sync.ts           — createSyncHandlers() + createTickLoop()
    events.ts         — wireEvents()
    controls.ts       — buildControls() orchestrator
    index.ts          — MutationObserver, findAndInjectReelVideos(), init
    __tests__/
      format.test.ts
      dom.test.ts
      preferences.test.ts
      sync.test.ts
  icons/              — SVG icon files (unchanged from current)
  manifests/
    base.json         — shared manifest fields
    firefox.json      — gecko ID, data_collection_permissions
    chrome.json       — chrome-specific overrides (future)
  content.css         — unchanged, copied to dist at build time
  vite.config.ts
  vitest.config.ts
  tsconfig.json
  prettier.config.js
  eslint.config.js
  package.json
  LICENSE
  .github/
    workflows/
      ci.yml
```

## TypeScript Config

Target ES2022. Strictest possible settings:

- `strict: true`
- `noUncheckedIndexedAccess: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `exactOptionalPropertyTypes: true`
- `noImplicitReturns: true`
- `noFallthroughCasesInSwitch: true`
- `module: "ESNext"`, `moduleResolution: "bundler"`
- `isolatedModules: true`

No `any` allowed. All function signatures explicitly typed.

## Prettier Config

Modern style — no semicolons, single quotes, 2-space indent:

- `semi: false`
- `singleQuote: true`
- `trailingComma: 'all'`
- `printWidth: 100`
- `tabWidth: 2`
- `arrowParens: 'always'`

## ESLint Config

Flat config (`eslint.config.js`) with:

- `@typescript-eslint/strict-type-checked`
- `@typescript-eslint/stylistic-type-checked`
- `eslint-config-prettier` to disable formatting rules

## Vite Build

Vite bundles `src/index.ts` into a single IIFE `content.js` (no module wrapper, since content scripts run in page context).

Build process per target (firefox/chrome):

1. Bundle `src/index.ts` → `content.js`
2. Merge `manifests/base.json` + `manifests/{target}.json` → `manifest.json`
3. Copy `content.css` and `icons/` to dist
4. Zip script reads version from base manifest

Output: `dist/{firefox,chrome}/` containing the ready-to-submit extension.

## NPM Scripts

| Script | Action |
|--------|--------|
| `build` | Build both targets |
| `build:firefox` | Build Firefox target to `dist/firefox/` |
| `build:chrome` | Build Chrome target to `dist/chrome/` |
| `zip:firefox` | Create Firefox submission zip |
| `zip:chrome` | Create Chrome submission zip |
| `dev` | Watch mode, rebuild on change |
| `test` | Run vitest |
| `lint` | ESLint + Prettier check |
| `format` | Prettier write |

## Source Module Breakdown

### types.ts

Shared interfaces:

- `ControlElements` — return type of `createControlsDOM()` (bar, playBtn, seekBar, etc.)
- `SyncHandlers` — return type of `createSyncHandlers()` (scrubbing, updatePlayButton, etc.)
- `TickLoop` — return type of `createTickLoop()` (start, stop)
- `Preferences` — shape of stored preferences (muted, volume, speed)

### icons.ts

- `ICON` object mapping names to `runtime.getURL()` strings
- `setIcon(target, src)` — reuses img element, swaps src

### preferences.ts

- `preferredMuted`, `preferredVolume`, `preferredSpeed`, `userInteracted` state
- `loadPrefs()` — returns a promise, populates state from storage
- `savePrefs()` — debounced write to storage

### dom.ts

- `el(tag, attrs, children)` — generic DOM element builder
- `createControlsDOM()` — builds full controls bar, returns `ControlElements`

### sync.ts

- `createSyncHandlers(video, els)` — video-to-UI state sync, returns `SyncHandlers`
- `createTickLoop(updateSeek)` — rAF animation loop, returns `TickLoop`
- `formatTime(seconds)` — time formatting helper
- `seekGradient(pct)` / `volumeGradient(pct)` — CSS gradient builders

### events.ts

- `wireEvents(video, els, sync, tickLoop, signal)` — all event listener wiring

### controls.ts

- `buildControls(video)` — orchestrates DOM creation, sync, events, preferences, cleanup
- `injected` WeakMap lives here

### index.ts

- `findAndInjectReelVideos()` — scans for video elements
- MutationObserver setup with rAF throttling
- `prefsReady.then(...)` initialization

## Testing Strategy

Vitest with jsdom environment. Tests in `src/__tests__/`.

### What to test

- **Pure functions**: `formatTime`, `seekGradient`, `volumeGradient` — input/output assertions
- **DOM builder**: `el()` — verify element tag, attributes, children; `createControlsDOM()` — verify structure and returned references
- **Preferences**: mock `ext.storage.local`, test load populates state, save debounces, `userInteracted` gate
- **Sync handlers**: mock video element with mutable properties, verify icon src changes and slider value updates

### What not to test

- E2E on Instagram — fragile, requires auth, breaks on DOM changes
- CSS rendering — visual testing not worth the infrastructure
- MutationObserver integration — jsdom support is limited, manual testing is more reliable

## GitHub Actions CI

Single workflow on push and PR:

1. `npm ci`
2. `npm run lint`
3. `npx tsc --noEmit` (typecheck)
4. `npm run test`
5. `npm run build`

No deployment. Validates code quality and buildability.

## Migration Approach

This is a refactor, not a rewrite. Each source module maps directly to an existing section of `content.js`. The logic, behavior, and CSS remain unchanged. The old root-level `content.js`, `build.sh`, and `manifest.json` are removed — `dist/` is the only output.
