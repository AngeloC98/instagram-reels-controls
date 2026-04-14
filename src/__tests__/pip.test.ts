import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bindDocumentPictureInPictureButton } from '../pip'
import { closeDocumentPictureInPictureForSource } from '../pip/documentPip'
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

function mockElementAnimate(config: { defer?: boolean } = {}): {
  calls: { element: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions }[]
  finishAll: () => void
  restore: () => void
} {
  const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate')
  const calls: { element: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions }[] = []
  const finishes: (() => void)[] = []

  Object.defineProperty(HTMLElement.prototype, 'animate', {
    configurable: true,
    value: vi.fn(function (
      this: Element,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      animationOptions?: number | KeyframeAnimationOptions,
    ) {
      calls.push({
        element: this,
        keyframes: keyframes as Keyframe[],
        options: animationOptions as KeyframeAnimationOptions,
      })

      const finished = config.defer
        ? new Promise<Animation>((resolve) => {
            finishes.push(() => {
              resolve({} as Animation)
            })
          })
        : Promise.resolve({} as Animation)

      return { finished } as unknown as Animation
    }),
  })

  return {
    calls,
    finishAll: () => {
      finishes.splice(0).forEach((finish) => {
        finish()
      })
    },
    restore: () => {
      if (originalDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'animate', originalDescriptor)
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'animate')
      }
    },
  }
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
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
}

function createTwoReelPipFixture(): {
  firstVideo: HTMLVideoElement
  secondVideo: HTMLVideoElement
  pipWindow: MockPictureInPictureWindow
  open: () => Promise<void>
  wheelNext: () => Promise<void>
  cleanup: () => void
} {
  const firstMount = document.createElement('div')
  const secondMount = document.createElement('div')
  const firstVideo = document.createElement('video')
  const secondVideo = document.createElement('video')
  const main = document.createElement('main')
  const button = document.createElement('button')
  const ac = new AbortController()
  const pipWindow = createPictureInPictureWindow()
  const videosWithTop: [HTMLVideoElement, number][] = [
    [firstVideo, 100],
    [secondVideo, 500],
  ]

  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)

  videosWithTop.forEach(([video, top]) => {
    Object.defineProperty(video, 'offsetWidth', {
      configurable: true,
      value: 360,
    })
    Object.defineProperty(video, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top }),
    })
    Object.defineProperty(video, 'captureStream', {
      configurable: true,
      value: vi.fn(createMediaStream),
    })
  })
  Object.defineProperty(secondMount, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
  Object.defineProperty(window, 'documentPictureInPicture', {
    configurable: true,
    value: {
      requestWindow: vi.fn(() => Promise.resolve(pipWindow)),
    },
  })

  firstMount.appendChild(firstVideo)
  secondMount.appendChild(secondVideo)
  main.append(firstMount, secondMount)
  document.body.appendChild(main)

  return {
    firstVideo,
    secondVideo,
    pipWindow,
    open: async () => {
      bindDocumentPictureInPictureButton(firstVideo, button, createPreferenceStore(), ac.signal)
      button.click()
      await flushAsyncWork()
    },
    wheelNext: async () => {
      const wheelEvent = new Event('wheel', { bubbles: true, cancelable: true })
      Object.defineProperty(wheelEvent, 'deltaY', {
        configurable: true,
        value: 120,
      })
      pipWindow.document.dispatchEvent(wheelEvent)
      await flushAsyncWork()
    },
    cleanup: () => {
      closeDocumentPictureInPictureForSource(secondVideo)
      closeDocumentPictureInPictureForSource(firstVideo)
      ac.abort()
    },
  }
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
    document.body.innerHTML = ''
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

  it('keeps PiP controls expanded when wheel navigation changes reels', async () => {
    const { pipWindow, open, wheelNext, cleanup } = createTwoReelPipFixture()
    const animationMock = mockElementAnimate()

    try {
      await open()

      const controlsBeforeNavigation = pipWindow.document.querySelector('.irc-controls')
      controlsBeforeNavigation?.classList.add('irc-controls-visible')

      await wheelNext()

      expect(
        pipWindow.document
          .querySelector('.irc-controls')
          ?.classList.contains('irc-controls-visible'),
      ).toBe(true)
      expect(pipWindow.document.querySelector('.irc-controls')).toBe(controlsBeforeNavigation)
      expect(pipWindow.document.querySelectorAll('.irc-pip-video')).toHaveLength(1)
      expect(animationMock.calls.map((call) => call.keyframes)).toEqual([
        [{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }],
        [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }],
      ])
      expect(animationMock.calls.map((call) => call.options.duration)).toEqual([420, 420])
    } finally {
      cleanup()
      animationMock.restore()
    }
  })

  it('keeps source refreshes on the incoming PiP video during reel animation', async () => {
    const { secondVideo, pipWindow, open, wheelNext, cleanup } = createTwoReelPipFixture()
    const animationMock = mockElementAnimate({ defer: true })

    try {
      await open()
      await wheelNext()

      expect(animationMock.calls).toHaveLength(2)
      const [outgoingAnimation, incomingAnimation] = animationMock.calls
      if (!outgoingAnimation || !incomingAnimation) throw new Error('expected reel animations')

      const outgoingMirrorVideo = outgoingAnimation.element as HTMLVideoElement
      const incomingMirrorVideo = incomingAnimation.element as HTMLVideoElement
      const outgoingStream = outgoingMirrorVideo.srcObject

      secondVideo.dispatchEvent(new Event('loadeddata'))
      await flushAsyncWork()

      expect(outgoingMirrorVideo.srcObject).toBe(outgoingStream)
      expect(incomingMirrorVideo.srcObject).not.toBeNull()

      animationMock.finishAll()
      await flushAsyncWork()

      expect(pipWindow.document.querySelector('.irc-pip-video')).toBe(incomingMirrorVideo)
      expect(pipWindow.document.querySelectorAll('.irc-pip-video')).toHaveLength(1)
    } finally {
      animationMock.finishAll()
      await flushAsyncWork()
      cleanup()
      animationMock.restore()
    }
  })
})
