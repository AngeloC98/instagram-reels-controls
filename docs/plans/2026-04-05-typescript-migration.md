# TypeScript Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the extension from plain JS to TypeScript with Vite, Vitest, Prettier, ESLint, and GitHub Actions CI.

**Architecture:** Vite bundles `src/index.ts` into a single IIFE `content.js`. Manifests are split into base + browser-specific overrides, merged at build time. Tests run with Vitest + jsdom.

**Tech Stack:** TypeScript 5, Vite 6, Vitest 3, ESLint 9 (flat config), Prettier 3

---

## File Map

### New files

- `package.json` — deps + scripts
- `tsconfig.json` — strict TS config
- `prettier.config.js` — modern style
- `eslint.config.js` — strict-type-checked + prettier
- `vite.config.ts` — IIFE bundle, multi-target build
- `vitest.config.ts` — jsdom environment
- `manifests/base.json` — shared manifest fields
- `manifests/firefox.json` — gecko overrides
- `manifests/chrome.json` — chrome overrides (stub)
- `src/types.ts` — shared interfaces
- `src/icons.ts` — ICON urls + setIcon
- `src/preferences.ts` — storage state + load/save
- `src/dom.ts` — el() + createControlsDOM
- `src/sync.ts` — sync handlers + tick loop + formatTime + gradients
- `src/events.ts` — wireEvents
- `src/controls.ts` — buildControls orchestrator
- `src/index.ts` — observer + init
- `src/browser.ts` — browser compat shim (`ext` object)
- `src/__tests__/format.test.ts` — formatTime tests
- `src/__tests__/dom.test.ts` — el() + createControlsDOM tests
- `src/__tests__/preferences.test.ts` — storage mock tests
- `src/__tests__/sync.test.ts` — sync handler tests
- `.github/workflows/ci.yml` — lint + typecheck + test + build

### Removed files

- `content.js` — replaced by `src/` modules
- `build.sh` — replaced by npm scripts
- Root `manifest.json` — replaced by `manifests/` + build merge

### Unchanged files

- `content.css` — copied to dist at build time
- `icons/` — copied to dist at build time
- `LICENSE`

---

### Task 1: Initialize package.json and install dependencies

**Files:**
- Create: `package.json`

- [ ] **Step 1: Initialize package.json**

```bash
cd "C:\Users\acabr\Documents\Projects\instagram-reels-controls"
npm init -y
```

- [ ] **Step 2: Install dev dependencies**

```bash
npm install -D typescript vite vitest jsdom @vitest/coverage-v8 eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-config-prettier prettier
```

- [ ] **Step 3: Update package.json scripts and metadata**

Replace the generated `package.json` with:

```json
{
  "name": "instagram-reels-controls",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite build --watch",
    "build": "npm run build:firefox && npm run build:chrome",
    "build:firefox": "vite build -- --target=firefox",
    "build:chrome": "vite build -- --target=chrome",
    "zip:firefox": "node scripts/zip.js firefox",
    "zip:chrome": "node scripts/zip.js chrome",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/ && prettier --check src/ content.css",
    "format": "prettier --write src/ content.css"
  }
}
```

Keep the `devDependencies` that npm install added.

- [ ] **Step 4: Add node_modules to .gitignore**

Append to `.gitignore`:

```
node_modules/
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "feat: initialize package.json with dependencies"
```

---

### Task 2: Configure TypeScript, Prettier, and ESLint

**Files:**
- Create: `tsconfig.json`
- Create: `prettier.config.js`
- Create: `eslint.config.js`

- [ ] **Step 1: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Create prettier.config.js**

```js
/** @type {import('prettier').Config} */
export default {
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  arrowParens: 'always',
}
```

- [ ] **Step 3: Create eslint.config.js**

```js
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'
import prettier from 'eslint-config-prettier'

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs['strict-type-checked'].rules,
      ...tseslint.configs['stylistic-type-checked'].rules,
      ...prettier.rules,
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.config.*'],
  },
]
```

- [ ] **Step 4: Verify configs parse correctly**

```bash
npx tsc --noEmit --showConfig
npx prettier --check prettier.config.js
```

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json prettier.config.js eslint.config.js
git commit -m "feat: add TypeScript, Prettier, and ESLint config"
```

---

### Task 3: Create Vite build config and manifest system

**Files:**
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `manifests/base.json`
- Create: `manifests/firefox.json`
- Create: `manifests/chrome.json`
- Create: `scripts/zip.js`

- [ ] **Step 1: Create manifests/base.json**

```json
{
  "manifest_version": 3,
  "name": "Instagram Reels Controls",
  "version": "1.0.0",
  "description": "Adds standard media controls to Instagram Reels.",
  "icons": {
    "16": "icons/icon.svg",
    "48": "icons/icon.svg",
    "128": "icons/icon.svg"
  },
  "permissions": ["storage"],
  "content_scripts": [
    {
      "matches": ["*://www.instagram.com/*"],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["icons/*.svg"],
      "matches": ["*://www.instagram.com/*"]
    }
  ]
}
```

- [ ] **Step 2: Create manifests/firefox.json**

```json
{
  "browser_specific_settings": {
    "gecko": {
      "id": "instagram-reels-controls@angeloc98",
      "data_collection_permissions": {
        "required": ["none"]
      }
    }
  }
}
```

- [ ] **Step 3: Create manifests/chrome.json**

```json
{}
```

- [ ] **Step 4: Create vite.config.ts**

```ts
import { defineConfig } from 'vite'
import { resolve } from 'path'
import { readFileSync, writeFileSync, cpSync, mkdirSync } from 'fs'

function getTarget(): string {
  const args = process.argv
  const idx = args.indexOf('--')
  if (idx !== -1) {
    const targetArg = args[idx + 1]
    if (targetArg?.startsWith('--target=')) {
      return targetArg.split('=')[1] ?? 'firefox'
    }
  }
  return 'firefox'
}

function extensionPlugin(target: string) {
  return {
    name: 'extension-build',
    closeBundle() {
      const outDir = resolve(__dirname, `dist/${target}`)
      mkdirSync(outDir, { recursive: true })

      const base = JSON.parse(readFileSync(resolve(__dirname, 'manifests/base.json'), 'utf-8'))
      const override = JSON.parse(
        readFileSync(resolve(__dirname, `manifests/${target}.json`), 'utf-8'),
      )
      const manifest = { ...base, ...override }
      writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

      cpSync(resolve(__dirname, 'content.css'), resolve(outDir, 'content.css'))
      cpSync(resolve(__dirname, 'icons'), resolve(outDir, 'icons'), { recursive: true })
    },
  }
}

const target = getTarget()

export default defineConfig({
  build: {
    outDir: `dist/${target}`,
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'InstagramReelsControls',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
  plugins: [extensionPlugin(target)],
})
```

- [ ] **Step 5: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
```

- [ ] **Step 6: Create scripts/zip.js**

```js
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { resolve, relative, join } from 'path'
import { execSync } from 'child_process'

const target = process.argv[2]
if (!target) {
  console.error('Usage: node scripts/zip.js <firefox|chrome>')
  process.exit(1)
}

const base = JSON.parse(readFileSync(resolve('manifests/base.json'), 'utf-8'))
const version = base.version
const distDir = resolve(`dist/${target}`)
const zipName = `instagram-reels-controls-${target}-v${version}.zip`
const zipPath = resolve(`dist/${zipName}`)

execSync(`cd "${distDir}" && zip -r "${zipPath}" .`)
console.log(`Built ${zipName}`)
```

- [ ] **Step 7: Commit**

```bash
git add vite.config.ts vitest.config.ts manifests/ scripts/
git commit -m "feat: add Vite build config, manifest system, and zip script"
```

---

### Task 4: Create src/browser.ts and src/types.ts

**Files:**
- Create: `src/browser.ts`
- Create: `src/types.ts`

- [ ] **Step 1: Create src/browser.ts**

This is the browser compat shim. Declare the global `browser` type since it only exists in Firefox.

```ts
declare const browser: typeof chrome | undefined

export const ext = typeof browser !== 'undefined' ? browser : chrome
```

- [ ] **Step 2: Create src/types.ts**

```ts
export interface ControlElements {
  bar: HTMLDivElement
  playBtn: HTMLButtonElement
  seekBar: HTMLInputElement
  timeLabel: HTMLSpanElement
  speedBtn: HTMLButtonElement
  speedMenu: HTMLDivElement
  speedOptions: HTMLDivElement[]
  muteBtn: HTMLButtonElement
  volumeBar: HTMLInputElement
}

export interface SyncHandlers {
  scrubbing: boolean
  updatePlayButton: () => void
  updateSeek: () => void
  updateMute: () => void
}

export interface TickLoop {
  start: () => void
  stop: () => void
}

export interface Preferences {
  muted: boolean
  volume: number
  speed: number
}
```

- [ ] **Step 3: Commit**

```bash
git add src/browser.ts src/types.ts
git commit -m "feat: add browser compat shim and shared types"
```

---

### Task 5: Create src/icons.ts

**Files:**
- Create: `src/icons.ts`

- [ ] **Step 1: Create src/icons.ts**

```ts
import { ext } from './browser'

export const ICON = {
  play: ext.runtime.getURL('icons/play.svg'),
  pause: ext.runtime.getURL('icons/pause.svg'),
  volHigh: ext.runtime.getURL('icons/vol-high.svg'),
  volLow: ext.runtime.getURL('icons/vol-low.svg'),
  volMute: ext.runtime.getURL('icons/vol-mute.svg'),
} as const

export function setIcon(target: HTMLElement, src: string): void {
  let img = target.querySelector('img')
  if (!img) {
    img = document.createElement('img')
    img.width = 16
    img.height = 16
    target.replaceChildren(img)
  }
  img.src = src
}
```

- [ ] **Step 2: Commit**

```bash
git add src/icons.ts
git commit -m "feat: add icons module"
```

---

### Task 6: Create src/preferences.ts

**Files:**
- Create: `src/preferences.ts`

- [ ] **Step 1: Create src/preferences.ts**

```ts
import { ext } from './browser'
import type { Preferences } from './types'

const storage = ext.storage.local

export let preferredMuted = true
export let preferredVolume = 1
export let preferredSpeed = 1
export let userInteracted = false

export function setMuted(value: boolean): void {
  preferredMuted = value
}

export function setVolume(value: number): void {
  preferredVolume = value
}

export function setSpeed(value: number): void {
  preferredSpeed = value
}

export function setUserInteracted(): void {
  userInteracted = true
}

export const prefsReady: Promise<void> = storage
  .get(['muted', 'volume', 'speed'])
  .then((prefs: Partial<Preferences>) => {
    if (prefs.muted !== undefined) preferredMuted = prefs.muted
    if (prefs.volume !== undefined) preferredVolume = prefs.volume
    if (prefs.speed !== undefined) preferredSpeed = prefs.speed
  })

let saveTimeout: ReturnType<typeof setTimeout> | null = null

export function savePrefs(): void {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    void storage.set({
      muted: preferredMuted,
      volume: preferredVolume,
      speed: preferredSpeed,
    })
  }, 300)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/preferences.ts
git commit -m "feat: add preferences module"
```

---

### Task 7: Create src/sync.ts

**Files:**
- Create: `src/sync.ts`

- [ ] **Step 1: Create src/sync.ts**

```ts
import type { ControlElements, SyncHandlers, TickLoop } from './types'
import { ICON, setIcon } from './icons'

export function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')
  return `${String(m)}:${s}`
}

export function seekGradient(pct: number): string {
  return `linear-gradient(to right, #f9a825 0%, #e91e8c ${String(pct / 2)}%, #833ab4 ${String(pct)}%, rgba(255,255,255,0.3) ${String(pct)}%)`
}

export function volumeGradient(pct: number): string {
  return `linear-gradient(to right, #fff ${String(pct)}%, rgba(255,255,255,0.3) ${String(pct)}%)`
}

export function createSyncHandlers(
  video: HTMLVideoElement,
  els: ControlElements,
): SyncHandlers {
  const { playBtn, seekBar, timeLabel, muteBtn, volumeBar } = els
  let scrubbing = false
  let lastTimeText = ''

  function formatTimeLabel(): string {
    return `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`
  }

  return {
    get scrubbing() {
      return scrubbing
    },
    set scrubbing(v: boolean) {
      scrubbing = v
    },

    updatePlayButton() {
      setIcon(playBtn, video.paused ? ICON.play : ICON.pause)
    },

    updateSeek() {
      if (video.duration && !scrubbing) {
        const pct = (video.currentTime / video.duration) * 100
        seekBar.value = String(pct)
        seekBar.style.background = seekGradient(pct)
        const text = formatTimeLabel()
        if (text !== lastTimeText) {
          timeLabel.textContent = text
          lastTimeText = text
        }
      }
    },

    updateMute() {
      if (video.muted || video.volume === 0) {
        setIcon(muteBtn, ICON.volMute)
      } else if (video.volume < 0.5) {
        setIcon(muteBtn, ICON.volLow)
      } else {
        setIcon(muteBtn, ICON.volHigh)
      }
      const vol = video.muted ? 0 : video.volume
      volumeBar.value = String(vol)
      volumeBar.style.background = volumeGradient(vol * 100)
    },
  }
}

export function createTickLoop(updateSeek: () => void): TickLoop {
  let rafId: number | null = null
  return {
    start() {
      if (!rafId) {
        const tick = (): void => {
          updateSeek()
          rafId = requestAnimationFrame(tick)
        }
        tick()
      }
    },
    stop() {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = null
    },
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/sync.ts
git commit -m "feat: add sync handlers and tick loop"
```

---

### Task 8: Create src/dom.ts

**Files:**
- Create: `src/dom.ts`

- [ ] **Step 1: Create src/dom.ts**

```ts
import type { ControlElements } from './types'

const CONTROLS_CLASS = 'irc-controls'
const SPEED_OPTIONS = ['0.25', '0.5', '0.75', '1', '1.25', '1.5', '2'] as const

type ElAttrs = Record<string, string | boolean>

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: ElAttrs,
  children?: HTMLElement[],
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className' && typeof v === 'string') e.className = v
      else if (k === 'textContent' && typeof v === 'string') e.textContent = v
      else if (k === 'hidden' && typeof v === 'boolean') e.hidden = v
      else if (typeof v === 'string') e.setAttribute(k, v)
    }
  }
  if (children) {
    for (const c of children) e.appendChild(c)
  }
  return e
}

export function createControlsDOM(): ControlElements {
  const playBtn = el('button', { className: 'irc-btn irc-playpause', title: 'Play/Pause' })
  const muteBtn = el('button', { className: 'irc-btn irc-mute', title: 'Mute/Unmute' })
  const volumeBar = el('input', {
    className: 'irc-volume',
    type: 'range',
    min: '0',
    max: '1',
    step: '0.02',
    value: '1',
    title: 'Volume',
  })
  const timeLabel = el('span', { className: 'irc-time', textContent: '0:00 / 0:00' })
  const speedBtn = el('button', {
    className: 'irc-speed-btn',
    title: 'Playback speed',
    textContent: '1\u00D7',
  })

  const speedOptions = SPEED_OPTIONS.map((v) =>
    el('div', {
      className: `irc-speed-option${v === '1' ? ' irc-speed-active' : ''}`,
      'data-speed': v,
      textContent: `${v}\u00D7`,
    }),
  )

  const speedMenu = el('div', { className: 'irc-speed-menu', hidden: true }, [
    el('div', { className: 'irc-speed-title', textContent: 'Playback speed' }),
    ...speedOptions,
  ])

  const seekBar = el('input', {
    className: 'irc-seek',
    type: 'range',
    min: '0',
    max: '100',
    value: '0',
    step: '0.1',
  })

  const bar = el('div', { className: CONTROLS_CLASS }, [
    el('div', { className: 'irc-row irc-bottom' }, [
      playBtn,
      el('div', { className: 'irc-vol-group' }, [muteBtn, volumeBar]),
      timeLabel,
      el('div', { className: 'irc-speed-wrap' }, [speedBtn, speedMenu]),
    ]),
    el('div', { className: 'irc-row irc-top' }, [seekBar]),
  ])

  return {
    bar: bar as HTMLDivElement,
    playBtn,
    seekBar: seekBar as HTMLInputElement,
    timeLabel: timeLabel as HTMLSpanElement,
    speedBtn,
    speedMenu: speedMenu as HTMLDivElement,
    speedOptions: speedOptions as HTMLDivElement[],
    muteBtn,
    volumeBar: volumeBar as HTMLInputElement,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/dom.ts
git commit -m "feat: add DOM builder and controls creation"
```

---

### Task 9: Create src/events.ts

**Files:**
- Create: `src/events.ts`

- [ ] **Step 1: Create src/events.ts**

```ts
import type { ControlElements, SyncHandlers, TickLoop } from './types'
import { seekGradient, formatTime } from './sync'
import {
  preferredMuted,
  preferredVolume,
  preferredSpeed,
  userInteracted,
  setMuted,
  setVolume,
  setSpeed,
  setUserInteracted,
  savePrefs,
} from './preferences'

export function wireEvents(
  video: HTMLVideoElement,
  els: ControlElements,
  sync: SyncHandlers,
  tickLoop: TickLoop,
  sig: AbortSignal,
): void {
  const { bar, playBtn, seekBar, timeLabel, speedBtn, speedMenu, speedOptions, muteBtn, volumeBar } =
    els

  // Stop clicks from reaching Instagram's handlers (which toggle play/mute)
  bar.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      if (!(e.target as HTMLElement).closest('.irc-speed-wrap')) speedMenu.hidden = true
    },
    { signal: sig },
  )
  bar.addEventListener('pointerdown', (e) => e.stopPropagation(), { signal: sig })
  bar.addEventListener(
    'pointerup',
    (e) => {
      if ((e.target as HTMLElement).matches('input[type="range"]')) {
        setTimeout(() => (e.target as HTMLElement).blur(), 0)
      }
    },
    { signal: sig },
  )

  video.addEventListener('play', sync.updatePlayButton, { signal: sig })
  video.addEventListener('pause', sync.updatePlayButton, { signal: sig })
  video.addEventListener('durationchange', sync.updateSeek, { signal: sig })
  video.addEventListener('volumechange', sync.updateMute, { signal: sig })

  video.addEventListener('play', () => tickLoop.start(), { signal: sig })
  video.addEventListener('pause', () => tickLoop.stop(), { signal: sig })

  // Override Instagram's volume resets, but only after user has interacted with our controls
  video.addEventListener(
    'volumechange',
    () => {
      if (!userInteracted) return
      if (video.muted !== preferredMuted) video.muted = preferredMuted
      if (video.volume !== preferredVolume) video.volume = preferredVolume
    },
    { signal: sig },
  )

  playBtn.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      if (video.paused) void video.play()
      else video.pause()
    },
    { signal: sig },
  )

  let wasPlaying = false
  seekBar.addEventListener(
    'pointerdown',
    () => {
      sync.scrubbing = true
      wasPlaying = !video.paused
      if (wasPlaying) video.pause()
    },
    { signal: sig },
  )
  seekBar.addEventListener(
    'input',
    (e) => {
      e.stopPropagation()
      if (video.duration) {
        video.currentTime = (Number(seekBar.value) / 100) * video.duration
        seekBar.style.background = seekGradient(Number(seekBar.value))
        timeLabel.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`
      }
    },
    { signal: sig },
  )
  document.addEventListener(
    'pointerup',
    () => {
      if (sync.scrubbing) {
        sync.scrubbing = false
        if (wasPlaying) void video.play()
      }
    },
    { signal: sig },
  )
  seekBar.addEventListener('click', (e) => e.stopPropagation(), { signal: sig })

  speedBtn.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      speedMenu.hidden = !speedMenu.hidden
    },
    { signal: sig },
  )

  speedOptions.forEach((opt) => {
    opt.addEventListener(
      'click',
      (e) => {
        e.stopPropagation()
        const speed = parseFloat(opt.dataset.speed ?? '1')
        video.playbackRate = speed
        setSpeed(speed)
        speedBtn.textContent = opt.textContent
        speedOptions.forEach((o) => o.classList.remove('irc-speed-active'))
        opt.classList.add('irc-speed-active')
        speedMenu.hidden = true
        savePrefs()
      },
      { signal: sig },
    )
  })

  muteBtn.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      setUserInteracted()
      setMuted(!video.muted)
      video.muted = preferredMuted
      savePrefs()
    },
    { signal: sig },
  )

  volumeBar.addEventListener(
    'input',
    (e) => {
      e.stopPropagation()
      setUserInteracted()
      const vol = parseFloat(volumeBar.value)
      setVolume(vol)
      setMuted(vol === 0)
      video.volume = vol
      video.muted = preferredMuted
      savePrefs()
    },
    { signal: sig },
  )
  volumeBar.addEventListener('click', (e) => e.stopPropagation(), { signal: sig })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/events.ts
git commit -m "feat: add event wiring module"
```

---

### Task 10: Create src/controls.ts and src/index.ts

**Files:**
- Create: `src/controls.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Create src/controls.ts**

```ts
import type { ControlElements } from './types'
import { createControlsDOM } from './dom'
import { createSyncHandlers, createTickLoop } from './sync'
import { wireEvents } from './events'
import { preferredVolume, preferredSpeed } from './preferences'

const injected = new WeakMap<HTMLVideoElement, () => void>()

function applyPreferences(video: HTMLVideoElement, els: ControlElements): void {
  // Mute state applied on play event to avoid breaking autoplay policy
  video.volume = preferredVolume
  video.playbackRate = preferredSpeed
  speedBtn.textContent = `${String(preferredSpeed)}\u00D7`
  els.speedOptions.forEach((o) => {
    o.classList.toggle(
      'irc-speed-active',
      parseFloat(o.dataset.speed ?? '1') === preferredSpeed,
    )
  })
}

export function buildControls(video: HTMLVideoElement): void {
  if (injected.has(video)) return

  const wrapper = video.parentElement
  if (!wrapper) return
  wrapper.style.position = 'relative'
  wrapper.style.overflow = 'hidden'

  const ac = new AbortController()
  const els = createControlsDOM()
  const sync = createSyncHandlers(video, els)
  const tickLoop = createTickLoop(sync.updateSeek)

  wrapper.appendChild(els.bar)
  wireEvents(video, els, sync, tickLoop, ac.signal)
  applyPreferences(video, els)
  sync.updatePlayButton()
  sync.updateSeek()
  sync.updateMute()
  if (!video.paused) tickLoop.start()

  injected.set(video, () => {
    tickLoop.stop()
    ac.abort()
    els.bar.remove()
  })
}

export function cleanupRemovedVideos(mutations: MutationRecord[]): void {
  for (const mutation of mutations) {
    for (const node of mutation.removedNodes) {
      if (node.nodeType !== 1) continue
      const element = node as Element
      const videos =
        element.tagName === 'VIDEO'
          ? [element as HTMLVideoElement]
          : [...element.querySelectorAll('video')]
      for (const video of videos) {
        const cleanup = injected.get(video)
        if (cleanup) {
          cleanup()
          injected.delete(video)
        }
      }
    }
  }
}
```

- [ ] **Step 2: Fix the applyPreferences function**

The `applyPreferences` function references `speedBtn` directly — it should use `els.speedBtn`. Replace the function:

```ts
function applyPreferences(video: HTMLVideoElement, els: ControlElements): void {
  // Mute state applied on play event to avoid breaking autoplay policy
  video.volume = preferredVolume
  video.playbackRate = preferredSpeed
  els.speedBtn.textContent = `${String(preferredSpeed)}\u00D7`
  els.speedOptions.forEach((o) => {
    o.classList.toggle(
      'irc-speed-active',
      parseFloat(o.dataset.speed ?? '1') === preferredSpeed,
    )
  })
}
```

- [ ] **Step 3: Create src/index.ts**

```ts
import { prefsReady } from './preferences'
import { buildControls, cleanupRemovedVideos } from './controls'

document.addEventListener('click', () => {
  document.querySelectorAll<HTMLDivElement>('.irc-speed-menu').forEach((m) => {
    m.hidden = true
  })
})

function findAndInjectReelVideos(): void {
  document.querySelectorAll('video').forEach((video) => {
    if (video.offsetWidth > 200) buildControls(video)
  })
}

let mutationPending = false
const observer = new MutationObserver((mutations) => {
  if (!mutationPending) {
    mutationPending = true
    requestAnimationFrame(() => {
      cleanupRemovedVideos(mutations)
      findAndInjectReelVideos()
      mutationPending = false
    })
  }
})

void prefsReady.then(() => {
  const root = document.body || document.documentElement
  observer.observe(root, { childList: true, subtree: true })
  findAndInjectReelVideos()
})
```

- [ ] **Step 4: Commit**

```bash
git add src/controls.ts src/index.ts
git commit -m "feat: add controls orchestrator and entry point"
```

---

### Task 11: Write tests

**Files:**
- Create: `src/__tests__/format.test.ts`
- Create: `src/__tests__/dom.test.ts`
- Create: `src/__tests__/preferences.test.ts`
- Create: `src/__tests__/sync.test.ts`

- [ ] **Step 1: Create src/__tests__/format.test.ts**

```ts
import { describe, it, expect } from 'vitest'
import { formatTime, seekGradient, volumeGradient } from '../sync'

describe('formatTime', () => {
  it('formats 0 seconds', () => {
    expect(formatTime(0)).toBe('0:00')
  })

  it('formats seconds under a minute', () => {
    expect(formatTime(35)).toBe('0:35')
  })

  it('formats minutes and seconds', () => {
    expect(formatTime(125)).toBe('2:05')
  })

  it('pads single-digit seconds', () => {
    expect(formatTime(61)).toBe('1:01')
  })

  it('handles NaN', () => {
    expect(formatTime(NaN)).toBe('0:00')
  })

  it('floors fractional seconds', () => {
    expect(formatTime(59.9)).toBe('0:59')
  })
})

describe('seekGradient', () => {
  it('returns a CSS gradient string', () => {
    const result = seekGradient(50)
    expect(result).toContain('linear-gradient')
    expect(result).toContain('50%')
  })

  it('handles 0%', () => {
    const result = seekGradient(0)
    expect(result).toContain('0%')
  })
})

describe('volumeGradient', () => {
  it('returns a CSS gradient string', () => {
    const result = volumeGradient(75)
    expect(result).toContain('linear-gradient')
    expect(result).toContain('75%')
  })
})
```

- [ ] **Step 2: Create src/__tests__/dom.test.ts**

```ts
import { describe, it, expect } from 'vitest'
import { el, createControlsDOM } from '../dom'

describe('el', () => {
  it('creates an element with the given tag', () => {
    const div = el('div')
    expect(div.tagName).toBe('DIV')
  })

  it('sets className', () => {
    const div = el('div', { className: 'test-class' })
    expect(div.className).toBe('test-class')
  })

  it('sets textContent', () => {
    const span = el('span', { textContent: 'hello' })
    expect(span.textContent).toBe('hello')
  })

  it('sets hidden', () => {
    const div = el('div', { hidden: true })
    expect(div.hidden).toBe(true)
  })

  it('sets arbitrary attributes', () => {
    const input = el('input', { type: 'range', min: '0', max: '100' })
    expect(input.getAttribute('type')).toBe('range')
    expect(input.getAttribute('min')).toBe('0')
    expect(input.getAttribute('max')).toBe('100')
  })

  it('appends children', () => {
    const child1 = el('span')
    const child2 = el('span')
    const parent = el('div', undefined, [child1, child2])
    expect(parent.children.length).toBe(2)
    expect(parent.children[0]).toBe(child1)
  })
})

describe('createControlsDOM', () => {
  it('returns all required elements', () => {
    const els = createControlsDOM()
    expect(els.bar).toBeInstanceOf(HTMLDivElement)
    expect(els.playBtn).toBeInstanceOf(HTMLButtonElement)
    expect(els.seekBar).toBeInstanceOf(HTMLInputElement)
    expect(els.timeLabel).toBeInstanceOf(HTMLSpanElement)
    expect(els.speedBtn).toBeInstanceOf(HTMLButtonElement)
    expect(els.speedMenu).toBeInstanceOf(HTMLDivElement)
    expect(els.speedOptions).toHaveLength(7)
    expect(els.muteBtn).toBeInstanceOf(HTMLButtonElement)
    expect(els.volumeBar).toBeInstanceOf(HTMLInputElement)
  })

  it('creates speed options with correct data attributes', () => {
    const els = createControlsDOM()
    const speeds = els.speedOptions.map((o) => o.dataset.speed)
    expect(speeds).toEqual(['0.25', '0.5', '0.75', '1', '1.25', '1.5', '2'])
  })

  it('marks 1x as active by default', () => {
    const els = createControlsDOM()
    const active = els.speedOptions.filter((o) => o.classList.contains('irc-speed-active'))
    expect(active).toHaveLength(1)
    expect(active[0]?.dataset.speed).toBe('1')
  })
})
```

- [ ] **Step 3: Create src/__tests__/preferences.test.ts**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockStorage = {
  get: vi.fn().mockResolvedValue({}),
  set: vi.fn().mockResolvedValue(undefined),
}

vi.mock('../browser', () => ({
  ext: {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    storage: { local: mockStorage },
  },
}))

describe('preferences', () => {
  beforeEach(() => {
    vi.resetModules()
    mockStorage.get.mockResolvedValue({})
    mockStorage.set.mockClear()
  })

  it('loads preferences from storage', async () => {
    mockStorage.get.mockResolvedValue({ muted: false, volume: 0.5, speed: 1.5 })
    const prefs = await import('../preferences')
    await prefs.prefsReady

    expect(prefs.preferredMuted).toBe(false)
    expect(prefs.preferredVolume).toBe(0.5)
    expect(prefs.preferredSpeed).toBe(1.5)
  })

  it('uses defaults when storage is empty', async () => {
    const prefs = await import('../preferences')
    await prefs.prefsReady

    expect(prefs.preferredMuted).toBe(true)
    expect(prefs.preferredVolume).toBe(1)
    expect(prefs.preferredSpeed).toBe(1)
  })

  it('debounces saves', async () => {
    vi.useFakeTimers()
    const prefs = await import('../preferences')

    prefs.savePrefs()
    prefs.savePrefs()
    prefs.savePrefs()

    expect(mockStorage.set).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)

    expect(mockStorage.set).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
```

- [ ] **Step 4: Create src/__tests__/sync.test.ts**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../browser', () => ({
  ext: {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
  },
}))

import { createSyncHandlers } from '../sync'
import { createControlsDOM } from '../dom'

function mockVideo(overrides: Partial<HTMLVideoElement> = {}): HTMLVideoElement {
  return {
    paused: true,
    muted: false,
    volume: 1,
    currentTime: 0,
    duration: 100,
    playbackRate: 1,
    ...overrides,
  } as HTMLVideoElement
}

describe('createSyncHandlers', () => {
  let els: ReturnType<typeof createControlsDOM>

  beforeEach(() => {
    els = createControlsDOM()
  })

  it('updates play button icon based on video state', () => {
    const video = mockVideo({ paused: true })
    const sync = createSyncHandlers(video, els)
    sync.updatePlayButton()

    const img = els.playBtn.querySelector('img')
    expect(img?.src).toContain('play.svg')
  })

  it('updates pause icon when playing', () => {
    const video = mockVideo({ paused: false })
    const sync = createSyncHandlers(video, els)
    sync.updatePlayButton()

    const img = els.playBtn.querySelector('img')
    expect(img?.src).toContain('pause.svg')
  })

  it('updates mute icon when muted', () => {
    const video = mockVideo({ muted: true, volume: 1 })
    const sync = createSyncHandlers(video, els)
    sync.updateMute()

    const img = els.muteBtn.querySelector('img')
    expect(img?.src).toContain('vol-mute.svg')
  })

  it('updates seek bar value', () => {
    const video = mockVideo({ currentTime: 50, duration: 100 })
    const sync = createSyncHandlers(video, els)
    sync.updateSeek()

    expect(Number(els.seekBar.value)).toBeCloseTo(50)
  })

  it('skips seek update when scrubbing', () => {
    const video = mockVideo({ currentTime: 50, duration: 100 })
    const sync = createSyncHandlers(video, els)
    sync.scrubbing = true
    els.seekBar.value = '0'
    sync.updateSeek()

    expect(els.seekBar.value).toBe('0')
  })
})
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/__tests__/
git commit -m "feat: add unit tests for format, dom, preferences, sync"
```

---

### Task 12: Build verification and cleanup

**Files:**
- Remove: `content.js`
- Remove: `build.sh`
- Remove: root `manifest.json`

- [ ] **Step 1: Build and verify**

```bash
npm run build:firefox
```

Expected: `dist/firefox/` contains `content.js`, `content.css`, `manifest.json`, `icons/`.

- [ ] **Step 2: Verify the built manifest merges correctly**

```bash
cat dist/firefox/manifest.json
```

Expected: Contains both base fields and gecko-specific settings.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: No errors. Fix any issues.

- [ ] **Step 4: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: No errors. Fix any issues.

- [ ] **Step 5: Remove old files**

```bash
rm content.js build.sh manifest.json
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove old JS files, verify build pipeline"
```

---

### Task 13: Add GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create .github/workflows/ci.yml**

```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Lint
        run: npm run lint

      - name: Typecheck
        run: npx tsc --noEmit

      - name: Test
        run: npm run test

      - name: Build
        run: npm run build
```

- [ ] **Step 2: Commit**

```bash
git add .github/
git commit -m "feat: add GitHub Actions CI workflow"
```

---

### Task 14: Final integration test

- [ ] **Step 1: Run full pipeline locally**

```bash
npm run lint && npx tsc --noEmit && npm run test && npm run build
```

Expected: All steps pass.

- [ ] **Step 2: Test Firefox build in browser**

Load `dist/firefox/` as a temporary extension in Firefox (`about:debugging`). Navigate to Instagram Reels. Verify:
- Controls appear on hover
- Play/pause works
- Volume slider expands on hover
- Speed picker opens and selects
- Seek bar is smooth
- Preferences persist across page reloads

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: typescript migration complete"
```
