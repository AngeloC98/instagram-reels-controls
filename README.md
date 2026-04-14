# Instagram Reels Controls

A browser extension that adds media controls to Instagram Reels and video posts.

## Features

- Play/pause, seek, volume, and time display for Instagram videos
- Playback speed picker from 0.25x to 2x
- Persists volume, speed, and autoplay preferences across sessions
- Optional autoplay that advances to the next reel
- Chrome Document Picture-in-Picture support with reel navigation
- Scroll-aware controls that stay out of the way while browsing

## Install

### Firefox

Install from [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/instagram-reels-controls/).

### Chrome

Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/instagram-reels-controls/fbojkcimdhmbafddcipholkgjfoanani).

### Manual Install

You can build from source and load the extension manually:

```bash
npm ci
npm run build
```

- Firefox: open `about:debugging`, choose Load Temporary Add-on, then select `dist/firefox/manifest.json`.
- Chrome: open `chrome://extensions`, enable Developer mode, choose Load unpacked, then select `dist/chrome/`.

## Development

```bash
npm ci
npm run dev           # watch build, defaults to Firefox
npm run build         # build both targets
npm run test          # run Vitest tests
npm run lint          # ESLint + Prettier check
npm run typecheck     # TypeScript typecheck
npm run format        # Prettier auto-fix
npm run icons         # regenerate icon PNGs
```

### Release Build

```bash
npm run build
npm run zip:firefox
npm run zip:chrome
```

Release zips are written to `dist/` and include the version from `manifests/base.json`.

## Project Structure

```text
src/
  index.ts              - content-script entry point
  browser.ts            - Firefox/Chrome extension API shim
  buildFlags.ts         - per-target feature flags
  instagram.ts          - Instagram video discovery and reel navigation
  controls.ts           - control injection and teardown orchestration
  dom.ts                - control DOM construction
  events.ts             - control event wiring
  sync.ts               - video-to-control UI synchronization
  preferences.ts        - storage-backed preference state
  autoplay.ts           - autoplay-next-reel behavior
  controlPreferences.ts - applies saved preferences to videos and controls
  controlsVisibility.ts - show/hide state machine for controls
  pointerActivity.ts    - pointer movement tracking for visibility
  types.ts              - shared TypeScript interfaces
  icons.ts              - SVG icon loading helpers
  pip/                  - Chrome Document Picture-in-Picture support
manifests/
  base.json             - shared Manifest V3 fields
  firefox.json          - Firefox-specific manifest fields
  chrome.json           - Chrome-specific manifest fields
scripts/
  generate-icons.ts     - icon PNG generation via Puppeteer
  zip.ts                - release zip builder
```

## Build Output

Vite bundles `src/index.ts` into a single IIFE `content.js`. A custom Vite plugin merges the shared and target-specific manifests, copies `content.css`, and copies `icons/` into `dist/{firefox,chrome}/`.

## Tech Stack

TypeScript with strict checking, Vite, Vitest with jsdom, ESLint, Prettier, and Puppeteer for icon generation.

## License

MIT
