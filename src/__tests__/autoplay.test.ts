import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bindAutoplayButton, bindAutoplayNextReel } from '../autoplay'
import type { PreferenceSnapshot, PreferenceStore } from '../types'

function createPreferenceStore(initial: Partial<PreferenceSnapshot> = {}) {
  const state: PreferenceSnapshot = {
    muted: false,
    volume: 1,
    speed: 1,
    autoplayNext: false,
    userInteracted: false,
    ...initial,
  }

  const setAutoplayNext = vi.fn((value: boolean) => {
    state.autoplayNext = value
  })
  const save = vi.fn()
  const store: PreferenceStore = {
    ready: Promise.resolve(),
    getSnapshot: () => ({ ...state }),
    setMuted: vi.fn(),
    setVolume: vi.fn(),
    setSpeed: vi.fn(),
    setAutoplayNext,
    markUserInteracted: vi.fn(),
    save,
  }

  return { store, setAutoplayNext, save }
}

async function flushAsyncWork(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

function setVideoWidth(video: HTMLVideoElement, width: number): void {
  Object.defineProperty(video, 'offsetWidth', {
    configurable: true,
    get: () => width,
  })
}

function createTwoReels(): {
  firstVideo: HTMLVideoElement
  playSecond: ReturnType<typeof vi.fn>
  scrollSecondIntoView: ReturnType<typeof vi.fn>
} {
  const main = document.createElement('main')
  const firstMount = document.createElement('div')
  const secondMount = document.createElement('div')
  const firstVideo = document.createElement('video')
  const secondVideo = document.createElement('video')
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

  return { firstVideo, playSecond, scrollSecondIntoView }
}

describe('autoplay next reel', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('toggles and persists the autoplay preference', () => {
    const button = document.createElement('button')
    const { store, setAutoplayNext, save } = createPreferenceStore()
    const ac = new AbortController()

    document.body.appendChild(button)
    bindAutoplayButton(button, store, ac.signal)
    button.click()

    expect(setAutoplayNext).toHaveBeenCalledWith(true)
    expect(button.classList.contains('irc-control-active')).toBe(true)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('syncs all mounted autoplay buttons when toggled', () => {
    const firstButton = document.createElement('button')
    const secondButton = document.createElement('button')
    const { store } = createPreferenceStore()
    const firstAbort = new AbortController()
    const secondAbort = new AbortController()

    document.body.append(firstButton, secondButton)
    bindAutoplayButton(firstButton, store, firstAbort.signal)
    bindAutoplayButton(secondButton, store, secondAbort.signal)

    firstButton.click()

    expect(firstButton.classList.contains('irc-control-active')).toBe(true)
    expect(secondButton.classList.contains('irc-control-active')).toBe(true)
    expect(secondButton.getAttribute('aria-pressed')).toBe('true')

    firstAbort.abort()
    secondButton.click()

    expect(firstButton.classList.contains('irc-control-active')).toBe(true)
    expect(secondButton.classList.contains('irc-control-active')).toBe(false)
    expect(secondButton.getAttribute('aria-pressed')).toBe('false')
  })

  it('scrolls and plays the next reel when the current reel ends', async () => {
    const { firstVideo, playSecond, scrollSecondIntoView } = createTwoReels()
    const { store } = createPreferenceStore({ autoplayNext: true })
    const ac = new AbortController()

    bindAutoplayNextReel(firstVideo, store, ac.signal)
    firstVideo.dispatchEvent(new Event('ended'))
    await flushAsyncWork()

    expect(scrollSecondIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    expect(playSecond).toHaveBeenCalledTimes(1)
  })

  it('leaves the ended reel alone when autoplay is off', async () => {
    const { firstVideo, playSecond, scrollSecondIntoView } = createTwoReels()
    const { store } = createPreferenceStore({ autoplayNext: false })
    const ac = new AbortController()

    bindAutoplayNextReel(firstVideo, store, ac.signal)
    firstVideo.dispatchEvent(new Event('ended'))
    await flushAsyncWork()

    expect(scrollSecondIntoView).not.toHaveBeenCalled()
    expect(playSecond).not.toHaveBeenCalled()
  })

  it('does not advance to a reel rejected by the caller', async () => {
    const { firstVideo, playSecond, scrollSecondIntoView } = createTwoReels()
    const { store } = createPreferenceStore({ autoplayNext: true })
    const ac = new AbortController()

    bindAutoplayNextReel(firstVideo, store, ac.signal, { canAdvance: () => false })
    firstVideo.dispatchEvent(new Event('ended'))
    await flushAsyncWork()

    expect(scrollSecondIntoView).not.toHaveBeenCalled()
    expect(playSecond).not.toHaveBeenCalled()
  })
})
