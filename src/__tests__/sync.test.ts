import { describe, it, expect, vi } from 'vitest'
import { createSyncHandlers, createTickLoop } from '../sync'
import type { ControlElements } from '../types'

vi.mock('../browser', () => ({
  ext: {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
  },
}))

function mockVideo(overrides: Partial<HTMLVideoElement> = {}): HTMLVideoElement {
  return {
    paused: true,
    muted: false,
    volume: 1,
    currentTime: 0,
    duration: 100,
    playbackRate: 1,
    ...overrides,
  } as HTMLVideoElement
}

function mockEls(): ControlElements {
  const makeBtn = (): HTMLButtonElement => document.createElement('button')
  return {
    bar: document.createElement('div'),
    playBtn: makeBtn(),
    seekTrack: document.createElement('div'),
    seekFill: document.createElement('div'),
    seekThumb: document.createElement('div'),
    timeLabel: document.createElement('span'),
    autoplayBtn: makeBtn(),
    speedBtn: makeBtn(),
    speedMenu: document.createElement('div'),
    speedOptions: [],
    muteBtn: makeBtn(),
    volTrack: document.createElement('div'),
    volFill: document.createElement('div'),
    volThumb: document.createElement('div'),
  }
}

describe('createSyncHandlers', () => {
  it('updatePlayButton sets play icon when paused', () => {
    const video = mockVideo({ paused: true })
    const els = mockEls()
    const handlers = createSyncHandlers(video, els)
    handlers.updatePlayButton()
    const icon = els.playBtn.querySelector('svg')
    expect(icon?.classList.contains('lucide-play')).toBe(true)
  })

  it('updatePlayButton sets pause icon when playing', () => {
    const video = mockVideo({ paused: false })
    const els = mockEls()
    const handlers = createSyncHandlers(video, els)
    handlers.updatePlayButton()
    const icon = els.playBtn.querySelector('svg')
    expect(icon?.classList.contains('lucide-pause')).toBe(true)
  })

  it('updateMute sets vol-mute icon when muted', () => {
    const video = mockVideo({ muted: true, volume: 1 })
    const els = mockEls()
    const handlers = createSyncHandlers(video, els)
    handlers.updateMute()
    const icon = els.muteBtn.querySelector('svg')
    expect(icon?.classList.contains('lucide-volume-x')).toBe(true)
  })

  it('updateSeek sets seek fill width correctly', () => {
    const video = mockVideo({ currentTime: 50, duration: 100, paused: false })
    const els = mockEls()
    const handlers = createSyncHandlers(video, els)
    handlers.updateSeek()
    expect(els.seekFill.style.width).toBe('50%')
  })

  it('updateSeek sets seek thumb position correctly', () => {
    const video = mockVideo({ currentTime: 50, duration: 100, paused: false })
    const els = mockEls()
    const handlers = createSyncHandlers(video, els)
    handlers.updateSeek()
    expect(els.seekThumb.style.left).toBe('50%')
  })

  it('updateSeek skips when scrubbing is true', () => {
    const video = mockVideo({ currentTime: 50, duration: 100 })
    const els = mockEls()
    const handlers = createSyncHandlers(video, els)
    handlers.scrubbing = true
    handlers.updateSeek()
    expect(els.seekFill.style.width).toBe('')
  })
})

describe('createTickLoop', () => {
  it('treats a zero animation frame id as an active loop', () => {
    const updateSeek = vi.fn()
    const animationFrameHost: Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'> = {
      requestAnimationFrame: vi.fn(() => 0),
      cancelAnimationFrame: vi.fn(),
    }
    const tickLoop = createTickLoop(updateSeek, animationFrameHost)

    tickLoop.start()
    tickLoop.start()
    tickLoop.stop()

    expect(updateSeek).toHaveBeenCalledTimes(1)
    expect(animationFrameHost.requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(animationFrameHost.cancelAnimationFrame).toHaveBeenCalledWith(0)
  })
})
