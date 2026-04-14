import type { PreferenceStore } from '../types'
import {
  closeDocumentPictureInPictureForSource,
  subscribeDocumentPictureInPictureSource,
  supportsDocumentPictureInPicture,
  toggleDocumentPictureInPicture,
} from './documentPip'

const PIP_ACTIVE_CLASS = 'irc-control-active'

export function bindDocumentPictureInPictureButton(
  video: HTMLVideoElement,
  pipBtn: HTMLButtonElement,
  preferences: PreferenceStore,
  signal: AbortSignal,
): void {
  if (!supportsDocumentPictureInPicture(video)) {
    pipBtn.hidden = true
    pipBtn.classList.remove(PIP_ACTIVE_CLASS)
    pipBtn.setAttribute('aria-pressed', 'false')
    return
  }

  pipBtn.hidden = false
  pipBtn.setAttribute('aria-pressed', 'false')
  const unsubscribe = subscribeDocumentPictureInPictureSource((sourceVideo) => {
    const isActive = sourceVideo === video
    pipBtn.classList.toggle(PIP_ACTIVE_CLASS, isActive)
    pipBtn.setAttribute('aria-pressed', isActive ? 'true' : 'false')
  })

  pipBtn.addEventListener(
    'click',
    (event) => {
      event.stopPropagation()
      event.preventDefault()
      void toggleDocumentPictureInPicture(video, preferences).catch(() => {
        // Opening can be rejected if Chrome withdraws user activation or the video becomes unavailable.
      })
    },
    { signal },
  )

  signal.addEventListener(
    'abort',
    () => {
      unsubscribe()
      closeDocumentPictureInPictureForSource(video)
    },
    { once: true },
  )
}
