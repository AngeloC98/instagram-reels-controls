import { ext } from './browser'
import type { PreferenceSnapshot, PreferenceStore, Preferences } from './types'

const storage = ext.storage.local

const state: PreferenceSnapshot = {
  muted: true,
  volume: 1,
  speed: 1,
  autoplayNext: false,
  userInteracted: false,
}

const ready: Promise<void> = storage
  .get(['muted', 'volume', 'speed', 'autoplayNext'])
  .then((prefs: Partial<Preferences>) => {
    if (prefs.muted !== undefined) state.muted = prefs.muted
    if (prefs.volume !== undefined) state.volume = prefs.volume
    if (prefs.speed !== undefined) state.speed = prefs.speed
    if (prefs.autoplayNext !== undefined) state.autoplayNext = prefs.autoplayNext
  })

let saveTimeout: ReturnType<typeof setTimeout> | null = null

export const preferenceStore: PreferenceStore = {
  ready,
  getSnapshot() {
    return { ...state }
  },
  setMuted(value: boolean) {
    state.muted = value
  },
  setVolume(value: number) {
    state.volume = value
  },
  setSpeed(value: number) {
    state.speed = value
  },
  setAutoplayNext(value: boolean) {
    state.autoplayNext = value
  },
  markUserInteracted() {
    state.userInteracted = true
  },
  save() {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
      void storage.set({
        muted: state.muted,
        volume: state.volume,
        speed: state.speed,
        autoplayNext: state.autoplayNext,
      })
    }, 300)
  },
}

export const prefsReady = preferenceStore.ready
