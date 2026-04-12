import type { PreferenceStore } from './types'
import { applyControlPreferences } from './controlPreferences'
import { createControlsDOM } from './dom'
import { createSyncHandlers, createTickLoop } from './sync'
import { wireEvents } from './events'
import { preferenceStore } from './preferences'
import { bindDocumentPictureInPictureButton } from './pip'

const injected = new WeakMap<HTMLVideoElement, () => void>()

export function buildControls(
  video: HTMLVideoElement,
  mount: HTMLElement,
  preferences: PreferenceStore = preferenceStore,
): void {
  if (injected.has(video)) return

  mount.style.position = 'relative'
  mount.style.overflow = 'hidden'
  mount.classList.add('irc-mount')

  const ac = new AbortController()
  const els = createControlsDOM()
  const sync = createSyncHandlers(video, els)
  const tickLoop = createTickLoop(sync.updateSeek)

  mount.appendChild(els.bar)
  wireEvents(video, els, sync, tickLoop, preferences, ac.signal)
  if (els.pipBtn) bindDocumentPictureInPictureButton(video, els.pipBtn, preferences, ac.signal)
  applyControlPreferences(video, els, preferences)
  sync.updatePlayButton()
  sync.updateSeek()
  sync.updateMute()
  if (!video.paused) tickLoop.start()

  injected.set(video, () => {
    tickLoop.stop()
    ac.abort()
    els.bar.remove()
    mount.classList.remove('irc-mount')
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
