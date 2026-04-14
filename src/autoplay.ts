import type { PreferenceStore } from './types'
import { findAdjacentInstagramReel, scrollInstagramReelIntoView } from './instagram'

const AUTOPLAY_ACTIVE_CLASS = 'irc-control-active'
const autoplayButtons = new Set<HTMLButtonElement>()

interface AutoplayAdvanceOptions {
  canAdvance?: (targetVideo: HTMLVideoElement) => boolean
  onAdvance?: (targetVideo: HTMLVideoElement) => Promise<boolean | undefined> | boolean | undefined
  shouldHandle?: () => boolean
}

function setAutoplayButtonState(button: HTMLButtonElement, enabled: boolean): void {
  button.classList.toggle(AUTOPLAY_ACTIVE_CLASS, enabled)
  button.setAttribute('aria-pressed', enabled ? 'true' : 'false')
  button.setAttribute('aria-label', 'Autoplay')
  button.title = 'Autoplay'
}

function syncAutoplayButtons(enabled: boolean): void {
  autoplayButtons.forEach((button) => {
    if (!button.isConnected) {
      autoplayButtons.delete(button)
      return
    }

    setAutoplayButtonState(button, enabled)
  })
}

export function bindAutoplayButton(
  button: HTMLButtonElement,
  preferences: PreferenceStore,
  signal: AbortSignal,
): void {
  autoplayButtons.add(button)
  setAutoplayButtonState(button, preferences.getSnapshot().autoplayNext)

  button.addEventListener(
    'click',
    (event) => {
      event.stopPropagation()
      event.preventDefault()

      const enabled = !preferences.getSnapshot().autoplayNext
      preferences.setAutoplayNext(enabled)
      syncAutoplayButtons(enabled)
      preferences.save()
    },
    { signal },
  )

  signal.addEventListener(
    'abort',
    () => {
      autoplayButtons.delete(button)
    },
    { once: true },
  )
}

export function findAutoplayNextReel(
  video: HTMLVideoElement,
  options: Pick<AutoplayAdvanceOptions, 'canAdvance'> = {},
): HTMLVideoElement | null {
  const targetVideo = findAdjacentInstagramReel(video, 'next')
  if (!targetVideo) return null
  if (options.canAdvance && !options.canAdvance(targetVideo)) return null

  return targetVideo
}

export async function advanceToNextReel(
  video: HTMLVideoElement,
  options: AutoplayAdvanceOptions = {},
): Promise<boolean> {
  const targetVideo = findAutoplayNextReel(video, options)
  if (!targetVideo) return false

  try {
    if ((await options.onAdvance?.(targetVideo)) === false) return false
  } catch {
    return false
  }

  scrollInstagramReelIntoView(targetVideo)

  try {
    await targetVideo.play()
  } catch {
    // Autoplay can be blocked; still advance the visible reel and let the controls reflect reality.
  }

  return true
}

export function bindAutoplayNextReel(
  video: HTMLVideoElement,
  preferences: PreferenceStore,
  signal: AbortSignal,
  options: AutoplayAdvanceOptions = {},
): void {
  let advancing = false

  video.addEventListener(
    'ended',
    () => {
      if (
        !preferences.getSnapshot().autoplayNext ||
        advancing ||
        options.shouldHandle?.() === false
      )
        return

      advancing = true
      void advanceToNextReel(video, options).finally(() => {
        advancing = false
      })
    },
    { signal },
  )
}
