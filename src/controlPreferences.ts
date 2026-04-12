import type { ControlElements, PreferenceStore } from './types'

export function applyControlPreferences(
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
