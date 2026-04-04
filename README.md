# Instagram Reels Controls

A browser extension that adds standard media controls to Instagram Reels and videos.

## Features

- Play/pause, seek bar, and time display
- Volume slider with expand-on-hover
- Playback speed picker (0.25x - 2x)
- Preferences persist across sessions (volume, speed, mute state)
- Frosted glass UI that stays out of Instagram's native overlay
- Works on Reels and regular video posts

## Install

### Firefox

Install from [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/instagram-reels-controls/) (pending review).

Or load temporarily via `about:debugging` > Load Temporary Add-on > select `dist/firefox/manifest.json`.

### Chrome (planned)

Build with `npm run build:chrome` and load from `dist/chrome/` via `chrome://extensions` > Load unpacked.

## Development

```bash
npm install
npm run dev           # watch mode
npm run build         # build both targets
npm run test          # run tests
npm run lint          # eslint + prettier check
npm run format        # prettier fix
```

### Project structure

```
src/
  browser.ts       - browser compat shim (Firefox/Chrome)
  types.ts         - shared TypeScript interfaces
  icons.ts         - icon URLs + setIcon helper
  preferences.ts   - storage load/save + state
  dom.ts           - DOM builder + controls creation
  sync.ts          - video-to-UI state sync + tick loop
  events.ts        - event listener wiring
  controls.ts      - orchestrator (buildControls)
  index.ts         - entry point (MutationObserver + init)
manifests/
  base.json        - shared manifest fields
  firefox.json     - Firefox-specific overrides
  chrome.json      - Chrome-specific overrides
```

### Build output

Vite bundles `src/index.ts` into a single IIFE `content.js`. Manifests are merged per target. Output goes to `dist/{firefox,chrome}/`.

## Tech stack

TypeScript, Vite, Vitest, ESLint (strict-type-checked), Prettier

## License

MIT
