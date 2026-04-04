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
