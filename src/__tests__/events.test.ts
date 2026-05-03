import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createControlsDOM } from '../dom'
import { wireEvents } from '../events'
import type { PreferenceSnapshot, PreferenceStore, SyncHandlers, TickLoop } from '../types'

vi.mock('../browser', () => ({
  ext: {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
  },
}))

interface VideoState {
  paused: boolean
  muted: boolean
  volume: number
  currentTime: number
  duration: number
  playbackRate: number
}

function createMockVideo(initial: Partial<VideoState> = {}) {
  const video = document.createElement('video')
  const state: VideoState = {
    paused: true,
    muted: false,
    volume: 1,
    currentTime: 0,
    duration: 100,
    playbackRate: 1,
    ...initial,
  }

  Object.defineProperties(video, {
    paused: {
      configurable: true,
      get: () => state.paused,
      set: (value: boolean) => {
        state.paused = value
      },
    },
    muted: {
      configurable: true,
      get: () => state.muted,
      set: (value: boolean) => {
        state.muted = value
      },
    },
    volume: {
      configurable: true,
      get: () => state.volume,
      set: (value: number) => {
        state.volume = value
      },
    },
    currentTime: {
      configurable: true,
      get: () => state.currentTime,
      set: (value: number) => {
        state.currentTime = value
      },
    },
    duration: {
      configurable: true,
      get: () => state.duration,
      set: (value: number) => {
        state.duration = value
      },
    },
    playbackRate: {
      configurable: true,
      get: () => state.playbackRate,
      set: (value: number) => {
        state.playbackRate = value
      },
    },
  })

  const play = vi.fn(() => {
    state.paused = false
    return Promise.resolve()
  })
  const pause = vi.fn(() => {
    state.paused = true
  })

  Object.defineProperty(video, 'play', { configurable: true, value: play })
  Object.defineProperty(video, 'pause', { configurable: true, value: pause })

  return { video, state, play, pause }
}

function createPreferenceStore(initial: Partial<PreferenceSnapshot> = {}) {
  const state: PreferenceSnapshot = {
    muted: false,
    volume: 1,
    speed: 1,
    autoplayNext: false,
    userInteracted: false,
    ...initial,
  }

  const getSnapshot = vi.fn(() => ({ ...state }))
  const setMuted = vi.fn((value: boolean) => {
    state.muted = value
  })
  const setVolume = vi.fn((value: number) => {
    state.volume = value
  })
  const setSpeed = vi.fn((value: number) => {
    state.speed = value
  })
  const setAutoplayNext = vi.fn((value: boolean) => {
    state.autoplayNext = value
  })
  const markUserInteracted = vi.fn(() => {
    state.userInteracted = true
  })
  const save = vi.fn()

  const store: PreferenceStore = {
    ready: Promise.resolve(),
    getSnapshot,
    setMuted,
    setVolume,
    setSpeed,
    setAutoplayNext,
    markUserInteracted,
    save,
  }

  return {
    store,
    state,
    getSnapshot,
    setMuted,
    setVolume,
    setSpeed,
    setAutoplayNext,
    markUserInteracted,
    save,
  }
}

function createSyncMock() {
  let scrubbing = false
  const updatePlayButton = vi.fn()
  const updateSeek = vi.fn()
  const updateMute = vi.fn()

  const sync: SyncHandlers = {
    get scrubbing() {
      return scrubbing
    },
    set scrubbing(value: boolean) {
      scrubbing = value
    },
    updatePlayButton,
    updateSeek,
    updateMute,
  }

  return { sync, updatePlayButton, updateSeek, updateMute }
}

function createTickLoopMock() {
  const start = vi.fn()
  const stop = vi.fn()
  const tickLoop: TickLoop = { start, stop }
  return { tickLoop, start, stop }
}

function mockTrackGeometry(track: HTMLDivElement): {
  setPointerCapture: ReturnType<typeof vi.fn>
  releasePointerCapture: ReturnType<typeof vi.fn>
} {
  const setPointerCapture = vi.fn()
  const releasePointerCapture = vi.fn()

  Object.defineProperty(track, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 100,
      bottom: 10,
      width: 100,
      height: 10,
      toJSON: () => ({}),
    }),
  })

  Object.defineProperty(track, 'setPointerCapture', {
    configurable: true,
    value: setPointerCapture,
  })

  Object.defineProperty(track, 'releasePointerCapture', {
    configurable: true,
    value: releasePointerCapture,
  })

  return { setPointerCapture, releasePointerCapture }
}

function dispatchPointerEvent(
  target: HTMLElement,
  type: string,
  clientX: number,
  pointerId = 1,
  init: { clientY?: number; movementX?: number; movementY?: number } = {},
): void {
  const event = new Event(type, { bubbles: true, cancelable: true })

  Object.defineProperty(event, 'clientX', {
    configurable: true,
    value: clientX,
  })

  Object.defineProperty(event, 'clientY', {
    configurable: true,
    value: init.clientY ?? 0,
  })

  Object.defineProperty(event, 'pointerId', {
    configurable: true,
    value: pointerId,
  })

  const movementX = init.movementX ?? (type === 'pointermove' ? 1 : undefined)
  const movementY = init.movementY ?? (type === 'pointermove' ? 0 : undefined)

  if (movementX !== undefined) {
    Object.defineProperty(event, 'movementX', {
      configurable: true,
      value: movementX,
    })
  }

  if (movementY !== undefined) {
    Object.defineProperty(event, 'movementY', {
      configurable: true,
      value: movementY,
    })
  }

  target.dispatchEvent(event)
}

describe('wireEvents', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('applies and persists a selected playback speed', () => {
    const { video } = createMockVideo()
    const { store, setSpeed, save } = createPreferenceStore()
    const { sync } = createSyncMock()
    const { tickLoop } = createTickLoopMock()
    const els = createControlsDOM()
    const ac = new AbortController()

    document.body.appendChild(els.bar)
    wireEvents(video, els, sync, tickLoop, store, ac.signal)

    const option = els.speedOptions.find((speedOption) => speedOption.dataset.speed === '1.5')
    option?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(video.playbackRate).toBe(1.5)
    expect(setSpeed).toHaveBeenCalledWith(1.5)
    expect(els.speedBtn.textContent).toBe(`1.5\u00D7`)
    expect(option?.classList.contains('irc-speed-active')).toBe(true)
    expect(
      els.speedOptions
        .find((speedOption) => speedOption.dataset.speed === '1')
        ?.classList.contains('irc-speed-active'),
    ).toBe(false)
    expect(els.speedMenu.hidden).toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('reacts to pointer motion on Instagram overlay siblings outside the bar mount', () => {
    const reelRoot = document.createElement('div')
    const innerMount = document.createElement('div')
    const igOverlay = document.createElement('div')
    const { video } = createMockVideo()
    const { store } = createPreferenceStore()
    const { sync } = createSyncMock()
    const { tickLoop } = createTickLoopMock()
    const els = createControlsDOM()
    const ac = new AbortController()

    innerMount.append(video, els.bar)
    reelRoot.append(innerMount, igOverlay)
    document.body.appendChild(reelRoot)

    wireEvents(video, els, sync, tickLoop, store, ac.signal, { eventRoot: reelRoot })

    dispatchPointerEvent(igOverlay, 'pointermove', 50)

    expect(els.bar.classList.contains('irc-controls-visible')).toBe(true)
  })

  it('hides expanded controls after the pointer is idle over the video', () => {
    vi.useFakeTimers()
    const mount = document.createElement('div')
    const { video } = createMockVideo()
    const { store } = createPreferenceStore()
    const { sync } = createSyncMock()
    const { tickLoop } = createTickLoopMock()
    const els = createControlsDOM()
    const ac = new AbortController()

    mount.append(video, els.bar)
    wireEvents(video, els, sync, tickLoop, store, ac.signal)

    dispatchPointerEvent(mount, 'pointermove', 50)

    expect(els.bar.classList.contains('irc-controls-visible')).toBe(true)

    vi.advanceTimersByTime(1799)

    expect(els.bar.classList.contains('irc-controls-visible')).toBe(true)

    vi.advanceTimersByTime(1)

    expect(els.bar.classList.contains('irc-controls-visible')).toBe(false)
  })

  it('keeps controls hidden when scroll moves a reel under a stationary pointer', () => {
    vi.useFakeTimers()
    const mount = document.createElement('div')
    const { video } = createMockVideo()
    const { store } = createPreferenceStore()
    const { sync } = createSyncMock()
    const { tickLoop } = createTickLoopMock()
    const els = createControlsDOM()
    const ac = new AbortController()

    mount.append(video, els.bar)
    wireEvents(video, els, sync, tickLoop, store, ac.signal)

    dispatchPointerEvent(mount, 'pointermove', 50, 1, { movementX: 4, movementY: 0 })
    vi.advanceTimersByTime(1800)

    expect(els.bar.classList.contains('irc-controls-visible')).toBe(false)

    dispatchPointerEvent(mount, 'pointerenter', 50, 1, { movementX: 0, movementY: 0 })
    dispatchPointerEvent(mount, 'pointermove', 50, 1, { movementX: 0, movementY: 0 })

    expect(els.bar.classList.contains('irc-controls-visible')).toBe(false)

    dispatchPointerEvent(mount, 'pointermove', 52, 1, { movementX: 2, movementY: 0 })

    expect(els.bar.classList.contains('irc-controls-visible')).toBe(true)
  })

  it('hides expanded controls quickly after the pointer leaves the video area', () => {
    vi.useFakeTimers()
    const mount = document.createElement('div')
    const { video } = createMockVideo()
    const { store } = createPreferenceStore()
    const { sync } = createSyncMock()
    const { tickLoop } = createTickLoopMock()
    const els = createControlsDOM()
    const ac = new AbortController()

    mount.append(video, els.bar)
    wireEvents(video, els, sync, tickLoop, store, ac.signal)

    dispatchPointerEvent(mount, 'pointermove', 50)
    dispatchPointerEvent(mount, 'pointerleave', 50)

    expect(els.bar.classList.contains('irc-controls-visible')).toBe(true)

    vi.advanceTimersByTime(199)

    expect(els.bar.classList.contains('irc-controls-visible')).toBe(true)

    vi.advanceTimersByTime(1)

    expect(els.bar.classList.contains('irc-controls-visible')).toBe(false)
  })

  it('keeps expanded controls visible while the speed menu is open', () => {
    vi.useFakeTimers()
    const mount = document.createElement('div')
    const { video } = createMockVideo()
    const { store } = createPreferenceStore()
    const { sync } = createSyncMock()
    const { tickLoop } = createTickLoopMock()
    const els = createControlsDOM()
    const ac = new AbortController()

    mount.append(video, els.bar)
    wireEvents(video, els, sync, tickLoop, store, ac.signal)

    dispatchPointerEvent(mount, 'pointermove', 50)
    els.speedBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    vi.advanceTimersByTime(1800)

    expect(els.speedMenu.hidden).toBe(false)
    expect(els.bar.classList.contains('irc-controls-visible')).toBe(true)

    els.speedBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    vi.advanceTimersByTime(1800)

    expect(els.speedMenu.hidden).toBe(true)
    expect(els.bar.classList.contains('irc-controls-visible')).toBe(false)
  })

  it('uses the quick hide delay after a pin releases outside the video area', () => {
    vi.useFakeTimers()
    const mount = document.createElement('div')
    const { video } = createMockVideo()
    const { store } = createPreferenceStore()
    const { sync } = createSyncMock()
    const { tickLoop } = createTickLoopMock()
    const els = createControlsDOM()
    const ac = new AbortController()

    mount.append(video, els.bar)
    document.body.appendChild(mount)
    wireEvents(video, els, sync, tickLoop, store, ac.signal)

    dispatchPointerEvent(mount, 'pointermove', 50)
    els.speedBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    dispatchPointerEvent(mount, 'pointerleave', 50)

    vi.advanceTimersByTime(1800)

    expect(els.speedMenu.hidden).toBe(false)
    expect(els.bar.classList.contains('irc-controls-visible')).toBe(true)

    dispatchPointerEvent(document.body, 'pointerdown', 50)
    vi.advanceTimersByTime(199)

    expect(els.bar.classList.contains('irc-controls-visible')).toBe(true)

    vi.advanceTimersByTime(1)

    expect(els.speedMenu.hidden).toBe(true)
    expect(els.bar.classList.contains('irc-controls-visible')).toBe(false)
  })

  it('closes the speed menu and releases its pin when clicking outside controls', () => {
    vi.useFakeTimers()
    const mount = document.createElement('div')
    const { video } = createMockVideo()
    const { store } = createPreferenceStore()
    const { sync } = createSyncMock()
    const { tickLoop } = createTickLoopMock()
    const els = createControlsDOM()
    const ac = new AbortController()

    mount.append(video, els.bar)
    document.body.appendChild(mount)
    wireEvents(video, els, sync, tickLoop, store, ac.signal)

    dispatchPointerEvent(mount, 'pointermove', 50)
    els.speedBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(els.speedMenu.hidden).toBe(false)

    dispatchPointerEvent(document.body, 'pointerdown', 50)

    expect(els.speedMenu.hidden).toBe(true)
    expect(els.bar.classList.contains('irc-controls-visible')).toBe(true)

    vi.advanceTimersByTime(1800)

    expect(els.bar.classList.contains('irc-controls-visible')).toBe(false)
  })

  it('does not treat mouse focus on a control button as a permanent pin', () => {
    vi.useFakeTimers()
    const mount = document.createElement('div')
    const { video } = createMockVideo()
    const { store } = createPreferenceStore()
    const { sync } = createSyncMock()
    const { tickLoop } = createTickLoopMock()
    const els = createControlsDOM()
    const ac = new AbortController()

    mount.append(video, els.bar)
    document.body.appendChild(mount)
    wireEvents(video, els, sync, tickLoop, store, ac.signal)

    dispatchPointerEvent(mount, 'pointermove', 50)
    dispatchPointerEvent(els.playBtn, 'pointerdown', 50)
    els.playBtn.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))

    vi.advanceTimersByTime(1800)

    expect(els.bar.classList.contains('irc-controls-visible')).toBe(false)
  })

  it('keeps expanded controls visible while keyboard focus is inside controls', () => {
    vi.useFakeTimers()
    const mount = document.createElement('div')
    const { video } = createMockVideo()
    const { store } = createPreferenceStore()
    const { sync } = createSyncMock()
    const { tickLoop } = createTickLoopMock()
    const els = createControlsDOM()
    const ac = new AbortController()

    mount.append(video, els.bar)
    document.body.appendChild(mount)
    wireEvents(video, els, sync, tickLoop, store, ac.signal)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    els.playBtn.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))

    expect(els.bar.classList.contains('irc-controls-visible')).toBe(true)

    vi.advanceTimersByTime(1800)

    expect(els.bar.classList.contains('irc-controls-visible')).toBe(true)

    els.playBtn.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }),
    )
    vi.advanceTimersByTime(1800)

    expect(els.bar.classList.contains('irc-controls-visible')).toBe(false)
  })

  it('keeps expanded controls visible while scrubbing', () => {
    vi.useFakeTimers()
    const mount = document.createElement('div')
    const { video } = createMockVideo({ duration: 200 })
    const { store } = createPreferenceStore()
    const { sync } = createSyncMock()
    const { tickLoop } = createTickLoopMock()
    const els = createControlsDOM()
    const ac = new AbortController()
    mockTrackGeometry(els.seekTrack)

    mount.append(video, els.bar)
    wireEvents(video, els, sync, tickLoop, store, ac.signal)

    dispatchPointerEvent(mount, 'pointermove', 50)
    dispatchPointerEvent(els.seekTrack, 'pointerdown', 50)
    vi.advanceTimersByTime(1800)

    expect(els.bar.classList.contains('irc-controls-visible')).toBe(true)

    dispatchPointerEvent(els.seekTrack, 'pointerup', 50)
    vi.advanceTimersByTime(1800)

    expect(els.bar.classList.contains('irc-controls-visible')).toBe(false)
  })

  it('restores a minimal volume when unmuting from zero', () => {
    const { video } = createMockVideo({ muted: true, volume: 0 })
    const { store, setMuted, setVolume, markUserInteracted, save } = createPreferenceStore({
      muted: true,
      volume: 0,
    })
    const { sync, updateMute } = createSyncMock()
    const { tickLoop } = createTickLoopMock()
    const els = createControlsDOM()
    const ac = new AbortController()

    wireEvents(video, els, sync, tickLoop, store, ac.signal)
    els.muteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(markUserInteracted).toHaveBeenCalledTimes(1)
    expect(setVolume).toHaveBeenCalledWith(0.1)
    expect(setMuted).toHaveBeenCalledWith(false)
    expect(video.volume).toBe(0.1)
    expect(video.muted).toBe(false)
    expect(updateMute).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('updates volume state while dragging and saves on release', () => {
    const { video } = createMockVideo()
    const { store, setMuted, setVolume, markUserInteracted, save } = createPreferenceStore()
    const { sync } = createSyncMock()
    const { tickLoop } = createTickLoopMock()
    const els = createControlsDOM()
    const ac = new AbortController()
    const { setPointerCapture, releasePointerCapture } = mockTrackGeometry(els.volTrack)

    wireEvents(video, els, sync, tickLoop, store, ac.signal)

    dispatchPointerEvent(els.volTrack, 'pointerdown', 25)
    dispatchPointerEvent(els.volTrack, 'pointermove', 0)
    dispatchPointerEvent(els.volTrack, 'pointerup', 0)

    expect(markUserInteracted).toHaveBeenCalled()
    expect(setVolume).toHaveBeenLastCalledWith(0)
    expect(setMuted).toHaveBeenLastCalledWith(true)
    expect(video.volume).toBe(0)
    expect(video.muted).toBe(true)
    expect(els.volFill.style.width).toBe('0%')
    expect(els.volThumb.style.left).toBe('0%')
    expect(setPointerCapture).toHaveBeenCalledWith(1)
    expect(releasePointerCapture).toHaveBeenCalledWith(1)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('pauses while seeking and resumes when the drag ends', () => {
    const { video, play, pause } = createMockVideo({ paused: false, duration: 200 })
    const { store } = createPreferenceStore()
    const { sync } = createSyncMock()
    const { tickLoop } = createTickLoopMock()
    const els = createControlsDOM()
    const ac = new AbortController()
    const { setPointerCapture, releasePointerCapture } = mockTrackGeometry(els.seekTrack)

    wireEvents(video, els, sync, tickLoop, store, ac.signal)

    dispatchPointerEvent(els.seekTrack, 'pointerdown', 50)

    expect(sync.scrubbing).toBe(true)
    expect(pause).toHaveBeenCalledTimes(1)
    expect(video.currentTime).toBe(100)
    expect(els.seekFill.style.width).toBe('50%')
    expect(els.seekThumb.style.left).toBe('50%')
    expect(els.timeLabel.textContent).toBe('1:40 / 3:20')
    expect(setPointerCapture).toHaveBeenCalledWith(1)

    dispatchPointerEvent(els.seekTrack, 'pointerup', 50)

    expect(sync.scrubbing).toBe(false)
    expect(releasePointerCapture).toHaveBeenCalledWith(1)
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('reapplies stored volume preferences after user interaction', () => {
    const { video } = createMockVideo({ muted: true, volume: 1 })
    const { store } = createPreferenceStore({
      muted: false,
      volume: 0.4,
      userInteracted: true,
    })
    const { sync, updateMute } = createSyncMock()
    const { tickLoop } = createTickLoopMock()
    const els = createControlsDOM()
    const ac = new AbortController()

    wireEvents(video, els, sync, tickLoop, store, ac.signal)
    video.dispatchEvent(new Event('volumechange'))

    expect(updateMute).toHaveBeenCalledTimes(1)
    expect(video.muted).toBe(false)
    expect(video.volume).toBe(0.4)
  })

  it('reasserts mute preference on play for reels Instagram silenced before user interacted', () => {
    const { video } = createMockVideo({ muted: true, volume: 1 })
    const { store } = createPreferenceStore({
      muted: false,
      volume: 0.4,
      userInteracted: true,
    })
    const { sync } = createSyncMock()
    const { tickLoop } = createTickLoopMock()
    const els = createControlsDOM()
    const ac = new AbortController()

    wireEvents(video, els, sync, tickLoop, store, ac.signal)
    video.dispatchEvent(new Event('play'))

    expect(video.muted).toBe(false)
    expect(video.volume).toBe(0.4)
  })

  it('does not force mute state on play before the user has interacted', () => {
    const { video } = createMockVideo({ muted: true, volume: 1 })
    const { store } = createPreferenceStore({
      muted: false,
      volume: 0.4,
      userInteracted: false,
    })
    const { sync } = createSyncMock()
    const { tickLoop } = createTickLoopMock()
    const els = createControlsDOM()
    const ac = new AbortController()

    wireEvents(video, els, sync, tickLoop, store, ac.signal)
    video.dispatchEvent(new Event('play'))

    expect(video.muted).toBe(true)
    expect(video.volume).toBe(1)
  })
})
