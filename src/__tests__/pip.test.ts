import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindDocumentPictureInPictureButton } from '../pip'
import { supportsVideoStreamMirror, captureVideoStream } from '../pip/videoSource'
import type { PreferenceStore } from '../types'

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

function createMediaStream(): MediaStream {
  return {
    getTracks: () => [],
  } as unknown as MediaStream
}

type MockPictureInPictureWindow = Window & {
  close: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
}

function createPictureInPictureWindow(): MockPictureInPictureWindow {
  let closed = false
  const close = vi.fn(() => {
    closed = true
  })

  return {
    document: document.implementation.createHTMLDocument('pip'),
    get closed() {
      return closed
    },
    close,
    addEventListener: vi.fn(),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  } as unknown as MockPictureInPictureWindow
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('PiP video source', () => {
  it('detects captureStream support', () => {
    const video = document.createElement('video')

    expect(supportsVideoStreamMirror(video)).toBe(false)

    Object.defineProperty(video, 'captureStream', {
      configurable: true,
      value: vi.fn(),
    })

    expect(supportsVideoStreamMirror(video)).toBe(true)
  })

  it('returns null when captureStream throws', () => {
    const video = document.createElement('video')
    Object.defineProperty(video, 'captureStream', {
      configurable: true,
      value: vi.fn(() => {
        throw new Error('nope')
      }),
    })

    expect(captureVideoStream(video)).toBeNull()
  })
})

describe('bindDocumentPictureInPictureButton', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(window, 'documentPictureInPicture')
  })

  it('hides the button when Document PiP is unavailable', () => {
    const video = document.createElement('video')
    const button = document.createElement('button')
    const ac = new AbortController()

    bindDocumentPictureInPictureButton(video, button, createPreferenceStore(), ac.signal)

    expect(button.hidden).toBe(true)
  })

  it('shows the button when Document PiP and stream mirroring are available', () => {
    const video = document.createElement('video')
    const button = document.createElement('button')
    const ac = new AbortController()

    Object.defineProperty(video, 'captureStream', {
      configurable: true,
      value: vi.fn(),
    })
    Object.defineProperty(window, 'documentPictureInPicture', {
      configurable: true,
      value: {
        requestWindow: vi.fn(),
      },
    })

    bindDocumentPictureInPictureButton(video, button, createPreferenceStore(), ac.signal)

    expect(button.hidden).toBe(false)
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(button.classList.contains('irc-control-active')).toBe(false)
  })

  it('marks the active source button while Document PiP is open', async () => {
    const video = document.createElement('video')
    const button = document.createElement('button')
    const ac = new AbortController()

    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    Object.defineProperty(video, 'captureStream', {
      configurable: true,
      value: vi.fn(createMediaStream),
    })
    Object.defineProperty(window, 'documentPictureInPicture', {
      configurable: true,
      value: {
        requestWindow: vi.fn(() => Promise.resolve(createPictureInPictureWindow())),
      },
    })

    bindDocumentPictureInPictureButton(video, button, createPreferenceStore(), ac.signal)

    button.click()
    await flushAsyncWork()

    expect(button.classList.contains('irc-control-active')).toBe(true)
    expect(button.getAttribute('aria-pressed')).toBe('true')

    button.click()
    await flushAsyncWork()

    expect(button.classList.contains('irc-control-active')).toBe(false)
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })

  it('closes the requested PiP window when stream capture fails', async () => {
    const video = document.createElement('video')
    const button = document.createElement('button')
    const ac = new AbortController()
    const pipWindow = createPictureInPictureWindow()

    Object.defineProperty(video, 'captureStream', {
      configurable: true,
      value: vi.fn(() => null),
    })
    Object.defineProperty(window, 'documentPictureInPicture', {
      configurable: true,
      value: {
        requestWindow: vi.fn(() => Promise.resolve(pipWindow)),
      },
    })

    bindDocumentPictureInPictureButton(video, button, createPreferenceStore(), ac.signal)

    button.click()
    await flushAsyncWork()

    expect(pipWindow.close).toHaveBeenCalledTimes(1)
    expect(button.classList.contains('irc-control-active')).toBe(false)
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })
})
