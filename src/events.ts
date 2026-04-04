import type { ControlElements, SyncHandlers, TickLoop } from './types'
import {
  preferredMuted,
  preferredVolume,
  userInteracted,
  setMuted,
  setVolume,
  setSpeed,
  setUserInteracted,
  savePrefs,
} from './preferences'
import { seekGradient, formatTime } from './sync'

export function wireEvents(
  video: HTMLVideoElement,
  els: ControlElements,
  sync: SyncHandlers,
  tickLoop: TickLoop,
  sig: AbortSignal,
): void {
  const {
    bar,
    playBtn,
    seekBar,
    timeLabel,
    speedBtn,
    speedMenu,
    speedOptions,
    muteBtn,
    volumeBar,
  } = els

  // Stop clicks from reaching Instagram's handlers (which toggle play/mute)
  bar.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      if (!(e.target as HTMLElement).closest('.irc-speed-wrap')) speedMenu.hidden = true
    },
    { signal: sig },
  )
  bar.addEventListener(
    'pointerdown',
    (e) => {
      e.stopPropagation()
    },
    { signal: sig },
  )
  bar.addEventListener(
    'pointerup',
    (e) => {
      if ((e.target as HTMLElement).matches('input[type="range"]'))
        setTimeout(() => {
          ;(e.target as HTMLElement).blur()
        }, 0)
    },
    { signal: sig },
  )

  video.addEventListener('play', sync.updatePlayButton, { signal: sig })
  video.addEventListener('pause', sync.updatePlayButton, { signal: sig })
  video.addEventListener('durationchange', sync.updateSeek, { signal: sig })
  video.addEventListener('volumechange', sync.updateMute, { signal: sig })

  video.addEventListener(
    'play',
    () => {
      tickLoop.start()
    },
    { signal: sig },
  )
  video.addEventListener(
    'pause',
    () => {
      tickLoop.stop()
    },
    { signal: sig },
  )

  // Override Instagram's volume resets, but only after user has interacted
  video.addEventListener(
    'volumechange',
    () => {
      if (!userInteracted) return
      if (video.muted !== preferredMuted) video.muted = preferredMuted
      if (video.volume !== preferredVolume) video.volume = preferredVolume
    },
    { signal: sig },
  )

  playBtn.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      if (video.paused) void video.play()
      else video.pause()
    },
    { signal: sig },
  )

  let wasPlaying = false
  seekBar.addEventListener(
    'pointerdown',
    () => {
      sync.scrubbing = true
      wasPlaying = !video.paused
      if (wasPlaying) video.pause()
    },
    { signal: sig },
  )
  seekBar.addEventListener(
    'input',
    (e) => {
      e.stopPropagation()
      if (video.duration) {
        video.currentTime = (Number(seekBar.value) / 100) * video.duration
        seekBar.style.background = seekGradient(Number(seekBar.value))
        timeLabel.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`
      }
    },
    { signal: sig },
  )
  document.addEventListener(
    'pointerup',
    () => {
      if (sync.scrubbing) {
        sync.scrubbing = false
        if (wasPlaying) void video.play()
      }
    },
    { signal: sig },
  )
  seekBar.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
    },
    { signal: sig },
  )

  speedBtn.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      speedMenu.hidden = !speedMenu.hidden
    },
    { signal: sig },
  )

  speedOptions.forEach((opt) => {
    opt.addEventListener(
      'click',
      (e) => {
        e.stopPropagation()
        const speed = parseFloat(opt.dataset.speed ?? '1')
        video.playbackRate = speed
        setSpeed(speed)
        speedBtn.textContent = opt.textContent
        speedOptions.forEach((o) => {
          o.classList.remove('irc-speed-active')
        })
        opt.classList.add('irc-speed-active')
        speedMenu.hidden = true
        savePrefs()
      },
      { signal: sig },
    )
  })

  muteBtn.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      setUserInteracted()
      setMuted(!video.muted)
      video.muted = preferredMuted
      savePrefs()
    },
    { signal: sig },
  )

  volumeBar.addEventListener(
    'input',
    (e) => {
      e.stopPropagation()
      setUserInteracted()
      const vol = parseFloat(volumeBar.value)
      setVolume(vol)
      setMuted(vol === 0)
      video.volume = vol
      video.muted = preferredMuted
      savePrefs()
    },
    { signal: sig },
  )
  volumeBar.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
    },
    { signal: sig },
  )
}
