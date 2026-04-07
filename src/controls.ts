import type { ControlElements, PreferenceStore } from './types'
import { createControlsDOM } from './dom'
import { createSyncHandlers, createTickLoop } from './sync'
import { wireEvents } from './events'
import { preferenceStore } from './preferences'

const injected = new WeakMap<HTMLVideoElement, () => void>()

function applyPreferences(
  video: HTMLVideoElement,
  els: ControlElements,
  preferences: PreferenceStore,
): void {
  const snapshot = preferences.getSnapshot()

  // Mute state applied on play event to avoid breaking autoplay policy
  video.volume = snapshot.volume
  video.playbackRate = snapshot.speed
  els.speedBtn.textContent = `${String(snapshot.speed)}\u00D7`
  els.speedOptions.forEach((o) => {
    o.classList.toggle('irc-speed-active', parseFloat(o.dataset.speed ?? '1') === snapshot.speed)
  })
}

export function buildControls(
  video: HTMLVideoElement,
  mount: HTMLElement,
  preferences: PreferenceStore = preferenceStore,
): void {
  if (injected.has(video)) return

  mount.style.position = 'relative'
  mount.style.overflow = 'hidden'

  const ac = new AbortController()
  const els = createControlsDOM()
  const sync = createSyncHandlers(video, els)
  const tickLoop = createTickLoop(sync.updateSeek)

  mount.appendChild(els.bar)
  wireEvents(video, els, sync, tickLoop, preferences, ac.signal)
  applyPreferences(video, els, preferences)
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
