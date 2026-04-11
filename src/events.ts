import type { ControlElements, PreferenceStore, SyncHandlers, TickLoop } from './types'
import { formatTime, setSliderPosition } from './sync'
import {
  createControlsVisibilityMachine,
  type ControlsVisibilityMachine,
} from './controlsVisibility'

function setSpeedMenuOpen(
  speedMenu: HTMLDivElement,
  visibility: ControlsVisibilityMachine,
  open: boolean,
): void {
  speedMenu.hidden = !open
  if (open) visibility.pin('menu')
  else visibility.unpin('menu')
}

function bindVisibilityEvents(
  bar: HTMLDivElement,
  speedMenu: HTMLDivElement,
  visibility: ControlsVisibilityMachine,
  sig: AbortSignal,
): void {
  const mount = bar.parentElement
  if (!(mount instanceof HTMLElement)) return

  let keyboardMayFocusControls = false

  const showFromMount = (e: PointerEvent): void => {
    if (e.target instanceof Node && bar.contains(e.target)) return
    visibility.activity()
  }

  const handleMountPointerDown = (e: PointerEvent): void => {
    showFromMount(e)
  }

  document.addEventListener(
    'keydown',
    () => {
      keyboardMayFocusControls = true
    },
    { capture: true, signal: sig },
  )
  document.addEventListener(
    'pointerdown',
    (e) => {
      keyboardMayFocusControls = false
      if (!(e.target instanceof Node && bar.contains(e.target))) {
        setSpeedMenuOpen(speedMenu, visibility, false)
      }
    },
    { capture: true, signal: sig },
  )
  mount.addEventListener('pointerenter', showFromMount, { signal: sig })
  mount.addEventListener('pointermove', showFromMount, { signal: sig })
  mount.addEventListener('pointerdown', handleMountPointerDown, { signal: sig })
  mount.addEventListener(
    'pointerleave',
    () => {
      visibility.leavePlayer()
    },
    { signal: sig },
  )

  bar.addEventListener(
    'pointerenter',
    () => {
      visibility.pin('controls-hover')
    },
    { signal: sig },
  )

  bar.addEventListener(
    'pointerleave',
    () => {
      visibility.unpin('controls-hover')
    },
    { signal: sig },
  )
  bar.addEventListener(
    'focusin',
    () => {
      if (keyboardMayFocusControls) visibility.pin('keyboard-focus')
      else visibility.activity()
    },
    { signal: sig },
  )
  bar.addEventListener(
    'focusout',
    (e) => {
      if (e.relatedTarget instanceof Node && bar.contains(e.relatedTarget)) return
      visibility.unpin('keyboard-focus')
    },
    { signal: sig },
  )
}

function bindBarEvents(
  bar: HTMLDivElement,
  speedMenu: HTMLDivElement,
  visibility: ControlsVisibilityMachine,
  sig: AbortSignal,
): void {
  const closeSpeedMenu = (): void => {
    setSpeedMenuOpen(speedMenu, visibility, false)
  }

  // Stop clicks from reaching Instagram's handlers (which toggle play/mute)
  bar.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      if (!(e.target as HTMLElement).closest('.irc-speed-wrap')) closeSpeedMenu()
    },
    { signal: sig },
  )

  bar.addEventListener(
    'pointerdown',
    (e) => {
      e.stopPropagation()
      visibility.activity()
    },
    { signal: sig },
  )
}

function bindVideoSyncEvents(
  video: HTMLVideoElement,
  sync: SyncHandlers,
  tickLoop: TickLoop,
  preferences: PreferenceStore,
  sig: AbortSignal,
): void {
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
      const snapshot = preferences.getSnapshot()
      if (!snapshot.userInteracted) return
      if (video.muted !== snapshot.muted) video.muted = snapshot.muted
      if (video.volume !== snapshot.volume) video.volume = snapshot.volume
    },
    { signal: sig },
  )
}

function bindPlayButton(
  video: HTMLVideoElement,
  playBtn: HTMLButtonElement,
  sig: AbortSignal,
): void {
  playBtn.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      if (video.paused) void video.play()
      else video.pause()
    },
    { signal: sig },
  )
}

function bindSeekEvents(
  video: HTMLVideoElement,
  seekTrack: HTMLDivElement,
  seekFill: HTMLDivElement,
  seekThumb: HTMLDivElement,
  timeLabel: HTMLSpanElement,
  sync: SyncHandlers,
  visibility: ControlsVisibilityMachine,
  sig: AbortSignal,
): void {
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
      visibility.pin('scrubbing')
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

  const endSeekDrag = (e: PointerEvent) => {
    if (sync.scrubbing) {
      sync.scrubbing = false
      seekTrack.releasePointerCapture(e.pointerId)
      if (wasPlaying) void video.play()
      visibility.unpin('scrubbing')
    }
  }

  seekTrack.addEventListener('pointerup', endSeekDrag, { signal: sig })
  seekTrack.addEventListener('pointercancel', endSeekDrag, { signal: sig })
}

function bindSpeedEvents(
  video: HTMLVideoElement,
  speedBtn: HTMLButtonElement,
  speedMenu: HTMLDivElement,
  speedOptions: HTMLDivElement[],
  preferences: PreferenceStore,
  visibility: ControlsVisibilityMachine,
  sig: AbortSignal,
): void {
  speedBtn.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      setSpeedMenuOpen(speedMenu, visibility, speedMenu.hidden !== false)
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
        preferences.setSpeed(speed)
        speedBtn.textContent = opt.textContent
        speedOptions.forEach((option) => {
          option.classList.remove('irc-speed-active')
        })
        opt.classList.add('irc-speed-active')
        setSpeedMenuOpen(speedMenu, visibility, false)
        preferences.save()
      },
      { signal: sig },
    )
  })
}

function bindMuteEvents(
  video: HTMLVideoElement,
  muteBtn: HTMLButtonElement,
  sync: SyncHandlers,
  preferences: PreferenceStore,
  sig: AbortSignal,
): void {
  muteBtn.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      e.preventDefault()

      const snapshot = preferences.getSnapshot()
      preferences.markUserInteracted()

      if (video.muted && snapshot.volume === 0) {
        preferences.setVolume(0.1)
        video.volume = 0.1
      }

      preferences.setMuted(!video.muted)
      video.muted = preferences.getSnapshot().muted
      sync.updateMute()
      preferences.save()
    },
    { signal: sig },
  )
}

function bindVolumeEvents(
  video: HTMLVideoElement,
  volTrack: HTMLDivElement,
  volFill: HTMLDivElement,
  volThumb: HTMLDivElement,
  preferences: PreferenceStore,
  visibility: ControlsVisibilityMachine,
  sig: AbortSignal,
): void {
  function volToPointer(e: PointerEvent): void {
    const rect = volTrack.getBoundingClientRect()
    const vol = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))

    preferences.markUserInteracted()
    preferences.setVolume(vol)
    preferences.setMuted(vol === 0)

    video.volume = vol
    video.muted = preferences.getSnapshot().muted
    setSliderPosition(volFill, volThumb, vol * 100)
  }

  let volDragging = false

  volTrack.addEventListener(
    'pointerdown',
    (e) => {
      e.stopPropagation()
      e.preventDefault()
      volDragging = true
      visibility.pin('volume-drag')
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

  const endVolDrag = (e: PointerEvent) => {
    if (volDragging) {
      volDragging = false
      volTrack.releasePointerCapture(e.pointerId)
      preferences.save()
      visibility.unpin('volume-drag')
    }
  }

  volTrack.addEventListener('pointerup', endVolDrag, { signal: sig })
  volTrack.addEventListener('pointercancel', endVolDrag, { signal: sig })
  volTrack.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
    },
    { signal: sig },
  )
}

export function wireEvents(
  video: HTMLVideoElement,
  els: ControlElements,
  sync: SyncHandlers,
  tickLoop: TickLoop,
  preferences: PreferenceStore,
  sig: AbortSignal,
): void {
  const visibility = createControlsVisibilityMachine(els.bar, sig)

  bindVisibilityEvents(els.bar, els.speedMenu, visibility, sig)
  bindBarEvents(els.bar, els.speedMenu, visibility, sig)
  bindVideoSyncEvents(video, sync, tickLoop, preferences, sig)
  bindPlayButton(video, els.playBtn, sig)
  bindSeekEvents(
    video,
    els.seekTrack,
    els.seekFill,
    els.seekThumb,
    els.timeLabel,
    sync,
    visibility,
    sig,
  )
  bindSpeedEvents(
    video,
    els.speedBtn,
    els.speedMenu,
    els.speedOptions,
    preferences,
    visibility,
    sig,
  )
  bindMuteEvents(video, els.muteBtn, sync, preferences, sig)
  bindVolumeEvents(video, els.volTrack, els.volFill, els.volThumb, preferences, visibility, sig)
}
