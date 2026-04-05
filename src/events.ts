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
import { setSliderPosition, formatTime } from './sync'

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
    seekTrack,
    seekFill,
    seekThumb,
    timeLabel,
    speedBtn,
    speedMenu,
    speedOptions,
    muteBtn,
    volTrack,
    volFill,
    volThumb,
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

  function seekToPointer(e: PointerEvent): void {
    const rect = seekTrack.getBoundingClientRect()
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    if (video.duration) {
      video.currentTime = (pct / 100) * video.duration
      setSliderPosition(seekFill, seekThumb, pct)
      timeLabel.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`
    }
  }

  seekTrack.addEventListener(
    'pointerdown',
    (e) => {
      e.stopPropagation()
      e.preventDefault()
      sync.scrubbing = true
      wasPlaying = !video.paused
      if (wasPlaying) video.pause()
      seekToPointer(e)
      seekTrack.setPointerCapture(e.pointerId)
    },
    { signal: sig },
  )
  seekTrack.addEventListener(
    'pointermove',
    (e) => {
      if (sync.scrubbing) seekToPointer(e)
    },
    { signal: sig },
  )
  seekTrack.addEventListener(
    'pointerup',
    (e) => {
      if (sync.scrubbing) {
        sync.scrubbing = false
        seekTrack.releasePointerCapture(e.pointerId)
        if (wasPlaying) void video.play()
      }
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

  function volToPointer(e: PointerEvent): void {
    const rect = volTrack.getBoundingClientRect()
    const vol = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setUserInteracted()
    setVolume(vol)
    setMuted(vol === 0)
    video.volume = vol
    video.muted = preferredMuted
    setSliderPosition(volFill, volThumb, vol * 100)
  }

  let volDragging = false
  volTrack.addEventListener(
    'pointerdown',
    (e) => {
      e.stopPropagation()
      e.preventDefault()
      volDragging = true
      volToPointer(e)
      volTrack.setPointerCapture(e.pointerId)
    },
    { signal: sig },
  )
  volTrack.addEventListener(
    'pointermove',
    (e) => {
      if (volDragging) volToPointer(e)
    },
    { signal: sig },
  )
  volTrack.addEventListener(
    'pointerup',
    (e) => {
      if (volDragging) {
        volDragging = false
        volTrack.releasePointerCapture(e.pointerId)
        savePrefs()
      }
    },
    { signal: sig },
  )
  volTrack.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
    },
    { signal: sig },
  )
}
