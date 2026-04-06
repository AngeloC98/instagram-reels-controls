import { describe, expect, it, vi } from 'vitest'
import { buildControls } from '../controls'
import type { PreferenceStore } from '../types'

vi.mock('../browser', () => ({
  ext: {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
  },
}))

function createPreferenceStore(): PreferenceStore {
  return {
    ready: Promise.resolve(),
    getSnapshot: () => ({
      muted: false,
      volume: 1,
      speed: 1,
      userInteracted: false,
    }),
    setMuted: vi.fn(),
    setVolume: vi.fn(),
    setSpeed: vi.fn(),
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

describe('buildControls', () => {
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
})
