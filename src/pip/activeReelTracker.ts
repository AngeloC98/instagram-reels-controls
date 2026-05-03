import { isInstagramVideoCandidate } from '../instagram'

const ACTIVE_REEL_DEBOUNCE_MS = 120

export interface ActiveReelTrackerOptions {
  getCurrentSource: () => HTMLVideoElement | null
  isBusy: () => boolean
  onActiveReelChange: (video: HTMLVideoElement) => void
}

/**
 * Watches the page for the reel that Instagram is currently playing.
 *
 * Instagram drives reel playback via its own IntersectionObserver: as a reel
 * scrolls into view it is `play()`ed, and the previous reel is `pause()`d.
 * That `play` event is the most reliable "this reel is now active" signal we
 * have — Instagram does not expose any DOM marker (no `aria-current`, no
 * stable class, no `data-*`).
 *
 * Listens at the document in the capture phase because media events do not
 * bubble. Coalesces bursts (fast scroll across several reels) so we only
 * notify for the reel the user actually settles on.
 *
 * Ignored while the document is hidden: Instagram and the browser shuffle
 * playback state during minimize/restore, and reacting to those transient
 * `play` events would swap the PiP source to a video that isn't actually
 * the user's current reel.
 */
export function trackActiveInstagramReel(
  signal: AbortSignal,
  { getCurrentSource, isBusy, onActiveReelChange }: ActiveReelTrackerOptions,
): void {
  let pending: HTMLVideoElement | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const clearTimer = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const reset = (): void => {
    pending = null
    clearTimer()
  }

  const flush = (): void => {
    timer = null
    if (document.hidden) {
      // The tab went hidden after we queued. Drop the swap rather than
      // firing it against potentially stale visibility-change state.
      pending = null
      return
    }
    if (isBusy()) {
      // A swap is mid-animation; retry once it clears so we don't drop the
      // pending update.
      timer = setTimeout(flush, ACTIVE_REEL_DEBOUNCE_MS)
      return
    }

    const target = pending
    pending = null
    if (!target || !target.isConnected || target.paused) return
    if (target === getCurrentSource()) return

    onActiveReelChange(target)
  }

  const handlePlay = (event: Event): void => {
    if (document.hidden) return

    const target = event.target
    if (!(target instanceof HTMLVideoElement)) return
    // Identity check before the DOM-walking candidate filter — current-source
    // re-plays are by far the most common case and need no further work.
    if (target === getCurrentSource()) return
    if (!isInstagramVideoCandidate(target)) return

    pending = target
    clearTimer()
    timer = setTimeout(flush, ACTIVE_REEL_DEBOUNCE_MS)
  }

  const handleVisibilityChange = (): void => {
    if (document.hidden) reset()
  }

  document.addEventListener('play', handlePlay, { capture: true, signal })
  document.addEventListener('visibilitychange', handleVisibilityChange, { signal })
  signal.addEventListener('abort', clearTimer, { once: true })
}
