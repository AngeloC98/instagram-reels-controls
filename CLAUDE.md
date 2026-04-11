# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Browser extension (Manifest V3) that injects media controls onto Instagram Reels and video posts. Supports Firefox and Chrome. Content script only — no background/popup pages.

## Commands

```bash
npm run dev              # watch-build (defaults to Firefox)
npm run build            # build both Firefox + Chrome
npm run build:firefox    # build Firefox only
npm run build:chrome     # build Chrome only
npm test                 # run tests (vitest)
npm run test:watch       # tests in watch mode
npm run lint             # eslint + prettier check
npm run format           # prettier auto-fix
npx tsc --noEmit         # typecheck (CI runs this separately)
npm run icons            # regenerate icon PNGs from icons/icon.svg via Puppeteer
npm run zip:firefox      # zip Firefox build for AMO submission
npm run zip:chrome       # zip Chrome build
```

## Architecture

The extension is a single content script (`src/index.ts` → bundled as IIFE `content.js`). No background script, no popup.

**Entry flow:** `index.ts` waits for `prefsReady` (async storage load), then starts a `MutationObserver` on `document.body`. On each mutation batch (debounced via `requestAnimationFrame`), it finds `<video>` elements wider than 200px and calls `buildControls`.

**Module responsibilities:**

- `controls.ts` — orchestrator. `buildControls` creates DOM, wires events, applies preferences, starts tick loop. Uses a `WeakMap` to track injected videos and their cleanup functions. `cleanupRemovedVideos` tears down controls when videos are removed from DOM.
- `dom.ts` — pure DOM construction via the `el()` helper. Returns a `ControlElements` bag. No side effects.
- `sync.ts` — video↔UI state sync. `createSyncHandlers` returns functions to update play button icon, seek bar position/gradient, and volume icon/bar. `createTickLoop` drives seek updates via `requestAnimationFrame` while playing.
- `events.ts` — `wireEvents` attaches all event listeners using an `AbortSignal` for cleanup. Handles scrubbing, speed menu, volume overrides (fights Instagram's volume resets after user interaction).
- `preferences.ts` — module-level mutable state for volume/muted/speed. Loads from `ext.storage.local` on init, debounce-saves on change (300ms).
- `browser.ts` — one-liner shim: `browser` (Firefox) vs `chrome` (Chrome).
- `icons.ts` — resolves SVG icon URLs via `runtime.getURL` and provides `setIcon` helper.

**Build system:** Vite bundles `src/index.ts` → `dist/{target}/content.js` as IIFE. A custom Vite plugin (`extensionPlugin` in `vite.config.ts`) merges `manifests/base.json` + `manifests/{target}.json` into the output `manifest.json`, and copies `content.css` + `icons/`. The `--target=` flag is passed after `--` in npm scripts.

**Styling:** All in `content.css` (not bundled by Vite — copied as-is). Classes prefixed `irc-`.

## Testing

Tests live in `src/__tests__/`. Uses Vitest with jsdom environment and global imports. The `browser` module must be mocked in tests — see existing test files for the mock pattern (`vi.mock('../browser', ...)`).

## Key constraints

- **Instagram CSP blocks DOMParser/innerHTML** — all SVGs are bundled as files and loaded via `<img>` tags. Never use innerHTML or DOMParser in the content script.
- **Autoplay policy** — don't set `video.muted = false` on injection. Mute state is only restored after user interaction via the `userInteracted` flag. See `applyPreferences` comment.
- **Instagram resets volume on play** — the `volumechange` listener in `events.ts` re-asserts preferred values, gated by `userInteracted` to avoid breaking autoplay on first load.
- **Range input focus traps** — focused range inputs keep `pointer-events: all` even when parent has `pointer-events: none`. The `pointerup` handler on the bar blurs inputs to prevent controls from staying visible.

## Code style

- ESLint strict-type-checked + stylistic-type-checked configs
- Prettier: no semis, single quotes, trailing commas, 100 char width
- All CSS classes use `irc-` prefix to avoid collisions with Instagram's DOM
