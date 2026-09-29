import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PreferenceSnapshot, PreferenceStore } from '../types'

const pipMock = vi.hoisted(() => ({
  bindDocumentPictureInPictureButton: vi.fn(),
  isDocumentPictureInPictureSource: vi.fn<(video: HTMLVideoElement) => boolean>(() => false),
}))

vi.mock('../browser', () => ({
  ext: {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
  },
}))

vi.mock('../pip', () => pipMock)

import { buildControls, cleanupRemovedVideos } from '../controls'

function createPreferenceStore(initial: Partial<PreferenceSnapshot> = {}): PreferenceStore {
  const state: PreferenceSnapshot = {
    muted: false,
    volume: 1,
    speed: 1,
    autoplayNext: false,
    userInteracted: false,
    ...initial,
  }

  return {
    ready: Promise.resolve(),
    getSnapshot: () => ({ ...state }),
    setMuted: vi.fn(),
    setVolume: vi.fn(),
    setSpeed: vi.fn(),
    setAutoplayNext: vi.fn((value: boolean) => {
      state.autoplayNext = value
    }),
    markUserInteracted: vi.fn(),
    save: vi.fn(),
  }
}

function createVideo(): HTMLVideoElement {
  const video = document.createElement('video')

  Object.defineProperties(video, {
    paused: {
      configurable: true,
      get: () => true,
    },
    muted: {
      configurable: true,
      get: () => false,
      set: vi.fn(),
    },
    volume: {
      configurable: true,
      get: () => 1,
      set: vi.fn(),
    },
    currentTime: {
      configurable: true,
      get: () => 0,
      set: vi.fn(),
    },
    duration: {
      configurable: true,
      get: () => 100,
    },
    playbackRate: {
      configurable: true,
      get: () => 1,
      set: vi.fn(),
    },
  })

  return video
}

function setVideoWidth(video: HTMLVideoElement, width: number): void {
  Object.defineProperty(video, 'offsetWidth', {
    configurable: true,
    get: () => width,
  })
}

function createTwoReels(): {
  firstMount: HTMLElement
  firstVideo: HTMLVideoElement
  playSecond: ReturnType<typeof vi.fn>
  scrollSecondIntoView: ReturnType<typeof vi.fn>
} {
  const main = document.createElement('main')
  const firstMount = document.createElement('div')
  const secondMount = document.createElement('div')
  const firstVideo = createVideo()
  const secondVideo = createVideo()
  const playSecond = vi.fn(() => Promise.resolve())
  const scrollSecondIntoView = vi.fn()

  setVideoWidth(firstVideo, 360)
  setVideoWidth(secondVideo, 360)
  Object.defineProperty(firstVideo, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 100 }),
  })
  Object.defineProperty(secondVideo, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 500 }),
  })
  Object.defineProperty(secondVideo, 'play', {
    configurable: true,
    value: playSecond,
  })
  Object.defineProperty(secondMount, 'scrollIntoView', {
    configurable: true,
    value: scrollSecondIntoView,
  })

  firstMount.appendChild(firstVideo)
  secondMount.appendChild(secondVideo)
  main.append(firstMount, secondMount)
  document.body.appendChild(main)

  return { firstMount, firstVideo, playSecond, scrollSecondIntoView }
}

async function flushAsyncWork(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

describe('buildControls', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    pipMock.bindDocumentPictureInPictureButton.mockClear()
    pipMock.isDocumentPictureInPictureSource.mockReset()
    pipMock.isDocumentPictureInPictureSource.mockReturnValue(false)
  })

  it('only prepares the mount on the first injection', () => {
    const mount = document.createElement('div')
    const video = createVideo()
    const preferences = createPreferenceStore()

    mount.appendChild(video)

    buildControls(video, mount, preferences)

    expect(mount.style.position).toBe('relative')
    expect(mount.style.overflow).toBe('hidden')
    expect(mount.querySelectorAll('.irc-controls')).toHaveLength(1)

    mount.style.position = 'sticky'
    mount.style.overflow = 'visible'

    buildControls(video, mount, preferences)

    expect(mount.style.position).toBe('sticky')
    expect(mount.style.overflow).toBe('visible')
    expect(mount.querySelectorAll('.irc-controls')).toHaveLength(1)
  })

  it('marks the event root so native volume UI in overlay siblings is hidden', () => {
    const reelRoot = document.createElement('div')
    const wrapper = document.createElement('div')
    const mount = document.createElement('div')
    const video = createVideo()
    const rect = {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 400,
      bottom: 700,
      width: 400,
      height: 700,
      toJSON: () => ({}),
    }
    for (const el of [video, mount, wrapper]) {
      Object.defineProperty(el, 'getBoundingClientRect', { configurable: true, value: () => rect })
    }
    Object.defineProperty(reelRoot, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ ...rect, width: 600, right: 600 }),
    })

    mount.appendChild(video)
    wrapper.appendChild(mount)
    reelRoot.appendChild(wrapper)
    document.body.appendChild(reelRoot)

    buildControls(video, mount, createPreferenceStore())

    expect(wrapper.classList.contains('irc-event-root')).toBe(true)
    expect(mount.classList.contains('irc-event-root')).toBe(false)

    wrapper.remove()
    cleanupRemovedVideos([{ removedNodes: [wrapper] } as unknown as MutationRecord])

    expect(wrapper.classList.contains('irc-event-root')).toBe(false)
    expect(wrapper.querySelector('.irc-controls')).toBeNull()
  })

  it('lets Document PiP own autoplay for its active source', async () => {
    const { firstMount, firstVideo, playSecond, scrollSecondIntoView } = createTwoReels()
    const preferences = createPreferenceStore({ autoplayNext: true })

    pipMock.isDocumentPictureInPictureSource.mockImplementation((video) => video === firstVideo)

    buildControls(firstVideo, firstMount, preferences)
    firstVideo.dispatchEvent(new Event('ended'))
    await flushAsyncWork()

    expect(scrollSecondIntoView).not.toHaveBeenCalled()
    expect(playSecond).not.toHaveBeenCalled()
  })
})
