import type { ControlElements, PreferenceStore } from './types'

type SpeedControls = Pick<ControlElements, 'speedBtn' | 'speedOptions'>

export function applySpeedPreference(
  video: HTMLVideoElement,
  els: SpeedControls,
  speed: number,
): void {
  // Media loads reset playbackRate to defaultPlaybackRate, so set both
  if (video.defaultPlaybackRate !== speed) video.defaultPlaybackRate = speed
  if (video.playbackRate !== speed) video.playbackRate = speed
  els.speedBtn.textContent = `${String(speed)}×`
  els.speedOptions.forEach((o) => {
    o.classList.toggle('irc-speed-active', parseFloat(o.dataset.speed ?? '1') === speed)
  })
}

export function applyControlPreferences(
  video: HTMLVideoElement,
  els: ControlElements,
  preferences: PreferenceStore,
): void {
  const snapshot = preferences.getSnapshot()

  // Mute state applied on play event to avoid breaking autoplay policy
  video.volume = snapshot.volume
  applySpeedPreference(video, els, snapshot.speed)
}
