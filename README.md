# Instagram Reels Controls

A browser extension that adds standard media controls to Instagram Reels and videos.

## Features

- Full media controls: play/pause, seek, volume, time display
- Playback speed picker (0.25x - 2x)
- Volume and speed preferences persist across sessions
- Works on Reels and regular video posts

## Install

### Firefox

Install from [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/instagram-reels-controls/).

### Chrome

Install from the [Chrome Web Store](https://chrome.google.com/webstore/detail/fbojkcimdhmbafddcipholkgjfoanani).

### Manual install

You can also build from source and load the extension manually:

```bash
npm install
npm run build           # builds both targets
```

- **Firefox:** `about:debugging` > Load Temporary Add-on > select `dist/firefox/manifest.json`
- **Chrome:** `chrome://extensions` > Developer mode > Load unpacked > select `dist/chrome/`

## Development

```bash
npm install
npm run dev           # watch mode
npm run build         # build both targets
npm run test          # run tests
npm run lint          # eslint + prettier check
npm run format        # prettier fix
npm run icons         # regenerate icon PNGs from SVG
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
