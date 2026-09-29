# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Browser extension (Manifest V3) that injects media controls onto Instagram Reels and video posts. Supports Firefox and Chrome. Content scripts only — no background/popup pages.

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
npm run typecheck        # tsc --noEmit (CI runs lint → typecheck → test → build)
npm run icons            # regenerate icon PNGs from icons/icon.svg via Puppeteer
npm run zip:firefox      # zip Firefox build for AMO submission
npm run zip:chrome       # zip Chrome build
```

## Architecture

Two content scripts are declared in `manifests/base.json`:

1. **`mainWorld.js`** (`static/mainWorld.js`, copied as-is, not bundled) — runs in the page's `"world": "MAIN"` at `document_start`. Swallows `visibilitychange` while the document is hidden so Instagram doesn't pause every reel on tab/window blur. Anything that must intercept Instagram's own calls has to live here — patches made from the isolated world don't reach the page's prototypes.
2. **`content.js`** (`src/index.ts`, bundled as IIFE) + `content.css` — the isolated-world script that does everything else.

**Entry flow:** `index.ts` waits for `preferenceStore.ready` (async storage load), then calls `startInstagramIntegration` (`instagram.ts`). That starts a `MutationObserver` on `document.body`; mutation batches are coalesced via `requestAnimationFrame`, removed videos are cleaned up, and added `<video>` elements that are inside `<main>` or a `[role="dialog"]` and wider than 200px get `buildControls(video, mount)`.

**Module responsibilities:**

- `instagram.ts` — all Instagram DOM knowledge: video detection, mount resolution, `resolveInstagramEventRoot` (walks up to the outermost ancestor with the same rect as the video, because IG stacks pointer-capturing overlay siblings above the video), adjacent-reel lookup and scrolling.
- `controls.ts` — orchestrator. `buildControls` creates DOM, appends the bar to the event root, wires events/autoplay/PiP, applies preferences, starts the tick loop. A `WeakMap` tracks injected videos and their cleanup functions; `cleanupRemovedVideos` tears them down. Takes an optional `PreferenceStore` for testing.
- `dom.ts` — pure DOM construction via the `el()` helper. Returns a `ControlElements` bag (see `types.ts`). Supports an `ownerDocument` option so controls can be built inside the PiP window.
- `sync.ts` — video↔UI state sync. `createSyncHandlers` updates the play icon, seek fill/thumb/time label, and volume icon/fill. `createTickLoop` drives seek updates via `requestAnimationFrame` while playing.
- `events.ts` — `wireEvents` attaches all listeners using an `AbortSignal` for cleanup: visibility (pointer activity on the event root), seek/volume dragging on custom div tracks, speed menu, mute, and the volume-preference re-assertion.
- `controlsVisibility.ts` — state machine (`hidden`/`visible`/`pinned`) for showing the bar. Pins (`controls-hover`, `keyboard-focus`, `menu`, `scrubbing`, `volume-drag`) keep it visible; otherwise it hides after an idle timeout.
- `pointerActivity.ts` — tracks the last pointer position so synthetic/zero-movement `pointermove`s don't count as activity.
- `autoplay.ts` — "autoplay next" toggle button (synced across all injected bars) and the `ended` handler that scrolls to and plays the next reel.
- `controlPreferences.ts` — applies stored volume/speed to a video and its speed menu on injection.
- `preferences.ts` — `preferenceStore`: module-level state (`muted`, `volume`, `speed`, `autoplayNext`, plus in-memory `userInteracted`) behind a getter/setter API. Loads from `ext.storage.local`; `save()` debounces writes (300ms).
- `pip/` — **Chrome-only** Document Picture-in-Picture. `documentPip.ts` opens the PiP window, mirrors the video via `captureStream`, builds a second set of controls inside it, and handles wheel/keyboard navigation between reels. `activeReelTracker.ts` follows IG's `play` events so PiP swaps to whichever reel the user scrolls to.
- `buildFlags.ts` — `ENABLE_DOCUMENT_PIP`, from the `__IRC_ENABLE_DOCUMENT_PIP__` Vite define (true only for the Chrome target).
- `icons.ts` — SVGs imported as `?raw` strings, parsed once per document via a `<template>`, cached and cloned. `setIcon` swaps a button's icon.
- `browser.ts` — one-liner shim: `browser` (Firefox) vs `chrome` (Chrome).

**Build system:** Vite bundles `src/index.ts` → `dist/{target}/content.js` as IIFE. A custom Vite plugin (`extensionPlugin` in `vite.config.ts`) merges `manifests/base.json` + `manifests/{target}.json` into `manifest.json`, copies `static/mainWorld.js`, `content.css` and `icons/`. The `--target=` flag is passed after `--` in npm scripts.

**Styling:** All in `content.css` (not bundled — copied by the plugin). Classes prefixed `irc-`. CSS between `/* chrome-only: document-pip start */` and `/* chrome-only: document-pip end */` is stripped from the Firefox build.

## Testing

Tests live in `src/__tests__/`. Uses Vitest with jsdom environment and global imports. The `browser` module must be mocked in tests — see existing test files for the mock pattern (`vi.mock('../browser', ...)`).

## Key constraints

- **No dynamic HTML from untrusted strings.** The only markup parsing is `icons.ts` parsing bundled SVG files via `<template>`. Build everything else with `el()`/`createElement`.
- **Autoplay policy** — never set `video.muted = false` on injection. Mute state is only restored after user interaction (`preferences.markUserInteracted()` on mute/volume controls). See `controlPreferences.ts`.
- **Instagram resets volume** — `reassertVolumePreference` in `events.ts` re-applies preferred mute/volume on `volumechange` and `play`, gated by `userInteracted` so first-load autoplay isn't broken.
- **Instagram overlays capture pointer events** — bind hover/activity listeners to the element from `resolveInstagramEventRoot`, not `video.parentElement`, or events never arrive.
- **Instagram pauses reels on blur** — handled in `static/mainWorld.js`. It suppresses only hidden-state `visibilitychange`, not `pause` itself, so IG's scroll-to-next-reel pauses still work.
- **Stop propagation from the bar** — `click`/`pointerdown` on the controls must not reach Instagram's handlers (which toggle play/mute).
- **Instagram DOM changes often** — when something breaks, inspect the live page first; keep IG-specific selectors and heuristics in `instagram.ts`.

## Code style

- ESLint strict-type-checked + stylistic-type-checked configs
- Prettier: no semis, single quotes, trailing commas, 100 char width
- All CSS classes use `irc-` prefix to avoid collisions with Instagram's DOM
