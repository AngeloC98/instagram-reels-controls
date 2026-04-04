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
  els.speedBtn.textContent = `${String(preferredSpeed)}\u00D7`
  els.speedOptions.forEach((o) => {
    o.classList.toggle('irc-speed-active', parseFloat(o.dataset.speed ?? '1') === preferredSpeed)
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
