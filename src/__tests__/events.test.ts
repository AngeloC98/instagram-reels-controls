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

  it('seeks the active video by five seconds with A/D and arrow keys', () => {
    const { video, state } = createMockVideo({ currentTime: 50, duration: 100 })
    const els = createControlsDOM()
    const { store } = createPreferenceStore()
    const { sync } = createSyncMock()
    const { tickLoop } = createTickLoopMock()
    const root = document.createElement('div')
    const ac = new AbortController()

    root.append(video, els.bar)
    document.body.appendChild(root)
    wireEvents(video, els, sync, tickLoop, store, ac.signal, { eventRoot: root })
    root.dispatchEvent(new Event('pointerenter'))

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(state.currentTime).toBe(55)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    expect(state.currentTime).toBe(50)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }))
    expect(state.currentTime).toBe(55)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(state.currentTime).toBe(50)
  })

  it('does not handle seek shortcuts while typing', () => {
    const { video, state } = createMockVideo({ currentTime: 50, duration: 100 })
    const els = createControlsDOM()
    const { store } = createPreferenceStore()
    const { sync } = createSyncMock()
    const { tickLoop } = createTickLoopMock()
    const root = document.createElement('div')
    const input = document.createElement('input')
    const ac = new AbortController()

    root.append(video, els.bar)
    document.body.append(root, input)
    wireEvents(video, els, sync, tickLoop, store, ac.signal, { eventRoot: root })
    root.dispatchEvent(new Event('pointerenter'))

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(state.currentTime).toBe(50)
  })

  it('handles seek shortcuts before Viewer bubble handlers can consume them', () => {
    const { video, state } = createMockVideo({ currentTime: 50, duration: 100 })
    const els = createControlsDOM()
    const { store } = createPreferenceStore()
    const { sync } = createSyncMock()
    const { tickLoop } = createTickLoopMock()
    const root = document.createElement('div')
    const ac = new AbortController()

    root.append(video, els.bar)
    document.body.appendChild(root)
    wireEvents(video, els, sync, tickLoop, store, ac.signal, { eventRoot: root })
    root.dispatchEvent(new Event('pointerenter'))
    root.addEventListener('keydown', (event) => {
      event.stopPropagation()
    })

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(state.currentTime).toBe(55)
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

    // 当 snapshot.volume 为 0 时，使用默认恢复音量 0.5
    expect(markUserInteracted).toHaveBeenCalledTimes(1)
    expect(setVolume).toHaveBeenCalledWith(0.5)
    expect(setMuted).toHaveBeenCalledWith(false)
    expect(video.volume).toBe(0.5)
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
    vi.useFakeTimers()
    const { video } = createMockVideo({ muted: true, volume: 1, paused: false })
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

    // play 事件后不立即取消静音（延迟 300ms 避免浏览器 autoplay 阻止）
    expect(video.muted).toBe(true)

    // 300ms 后尝试取消静音
    vi.advanceTimersByTime(350)
    expect(video.muted).toBe(false)

    vi.useRealTimers()
  })

  it('reasserts mute preference on play for reels Instagram silenced before user interacted', () => {
    vi.useFakeTimers()
    const { video } = createMockVideo({ muted: true, volume: 1, paused: false })
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

    // play 后延迟 300ms 才取消静音
    expect(video.muted).toBe(true)
    vi.advanceTimersByTime(350)
    expect(video.muted).toBe(false)

    vi.useRealTimers()
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

  /**
   * 架构变更（2025-08）：隐藏 IG 原生音量控件，完全由插件控制音量
   * 旧测试：用户通过原生控件调节音量 → 同步到插件偏好
   * 新测试：IG 代码试图把 video 音量改回它的默认值 → 插件强制改回插件偏好
   */
  it('forces plugin volume preference when IG code tries to override', () => {
    // currentTime > 0.5 表示不是新视频（新视频不强制非静音，避免浏览器 autoplay 阻止）
    const { video } = createMockVideo({ muted: false, volume: 0.5, currentTime: 2 })
    const { store, setVolume, setMuted, markUserInteracted, save } = createPreferenceStore({
      muted: false,
      volume: 0.5,
      userInteracted: true,
    })
    const { sync } = createSyncMock()
    const { tickLoop } = createTickLoopMock()
    const els = createControlsDOM()
    const ac = new AbortController()

    wireEvents(video, els, sync, tickLoop, store, ac.signal)

    // 模拟 IG 的 React 代码把视频改回静音+音量0（自动播放策略）
    // 先绕过 guard：guard 只在插件修改时才+计数，这里模拟外部代码直接改属性
    // 所以直接触发 volumechange，不需要 guard 递增
    video.muted = true
    video.volume = 0
    video.dispatchEvent(new Event('volumechange'))

    // ✅ 关键断言：preferences.setVolume/setMuted **绝不能被调用**
    // （外部代码改 video 属性绝不能反向覆盖插件偏好）
    expect(setVolume).not.toHaveBeenCalledWith(0)
    expect(setMuted).not.toHaveBeenCalledWith(true)
    expect(markUserInteracted).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()

    // ✅ 关键断言：video 属性必须被插件强制改回 0.5 + 非静音
    expect(video.muted).toBe(false)
    expect(video.volume).toBeCloseTo(0.5, 2)
  })
})
