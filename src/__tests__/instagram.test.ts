import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  avoidNativeOverlayOverlap,
  findInstagramVideos,
  findAdjacentInstagramReel,
  isInstagramVideoCandidate,
  resolveInstagramEventRoot,
  resolveInstagramMount,
  scrollToAdjacentInstagramReel,
  startInstagramIntegration,
} from '../instagram'

let rafCallbacks: FrameRequestCallback[] = []

function stubAnimationFrame(): void {
  rafCallbacks = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    rafCallbacks.push(callback)
    return rafCallbacks.length
  })
}

async function flushMutationFrame(): Promise<void> {
  await Promise.resolve()

  const callbacks = rafCallbacks
  rafCallbacks = []
  callbacks.forEach((callback) => {
    callback(performance.now())
  })
}

function setVideoWidth(video: HTMLVideoElement, width: number): void {
  Object.defineProperty(video, 'offsetWidth', {
    configurable: true,
    get: () => width,
  })
}

function appendToMain(...nodes: Node[]): HTMLElement {
  const main = document.createElement('main')
  main.append(...nodes)
  document.body.appendChild(main)

  return main
}

function mockRect(element: Element, rect: Partial<DOMRect>): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
      ...rect,
    }),
  })
}

describe('instagram adapter', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    history.replaceState({}, '', '/reels/test')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('filters video candidates by width', () => {
    const smallVideo = document.createElement('video')
    const largeVideo = document.createElement('video')

    setVideoWidth(smallVideo, 120)
    setVideoWidth(largeVideo, 360)
    appendToMain(smallVideo, largeVideo)

    expect(isInstagramVideoCandidate(smallVideo)).toBe(false)
    expect(isInstagramVideoCandidate(largeVideo)).toBe(true)
  })

  it('ignores videos outside the main Instagram surface', () => {
    const popupVideo = document.createElement('video')

    setVideoWidth(popupVideo, 360)
    document.body.appendChild(popupVideo)

    expect(isInstagramVideoCandidate(popupVideo)).toBe(false)
  })

  it('finds only eligible instagram videos', () => {
    const smallWrapper = document.createElement('div')
    const largeWrapper = document.createElement('div')
    const smallVideo = document.createElement('video')
    const largeVideo = document.createElement('video')

    setVideoWidth(smallVideo, 120)
    setVideoWidth(largeVideo, 360)

    smallWrapper.appendChild(smallVideo)
    largeWrapper.appendChild(largeVideo)
    appendToMain(smallWrapper, largeWrapper)

    expect(findInstagramVideos()).toEqual([largeVideo])
  })

  it('resolves the parent element as the mount target', () => {
    const mount = document.createElement('div')
    const video = document.createElement('video')

    mount.appendChild(video)

    expect(resolveInstagramMount(video)).toBe(mount)
    expect(mount.style.position).toBe('')
    expect(mount.style.overflow).toBe('')
  })

  it('walks up to the highest ancestor that wraps the video bounds for event delegation', () => {
    const reelRoot = document.createElement('div')
    const wrapper = document.createElement('div')
    const innerMount = document.createElement('div')
    const video = document.createElement('video')

    innerMount.appendChild(video)
    wrapper.appendChild(innerMount)
    reelRoot.appendChild(wrapper)
    document.body.appendChild(reelRoot)

    const videoRect = {
      x: 10,
      y: 20,
      top: 20,
      left: 10,
      right: 470,
      bottom: 836,
      width: 460,
      height: 816,
      toJSON: () => ({}),
    }
    const sameRect = (rect: typeof videoRect) => () => ({ ...rect })
    Object.defineProperty(video, 'getBoundingClientRect', {
      configurable: true,
      value: sameRect(videoRect),
    })
    Object.defineProperty(innerMount, 'getBoundingClientRect', {
      configurable: true,
      value: sameRect(videoRect),
    })
    Object.defineProperty(wrapper, 'getBoundingClientRect', {
      configurable: true,
      value: sameRect(videoRect),
    })
    Object.defineProperty(reelRoot, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ ...videoRect, width: 600, right: 610 }),
    })

    expect(resolveInstagramEventRoot(video)).toBe(wrapper)
  })

  it('falls back to the direct parent when the video has no rendered bounds', () => {
    const innerMount = document.createElement('div')
    const video = document.createElement('video')
    innerMount.appendChild(video)
    document.body.appendChild(innerMount)

    Object.defineProperty(video, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      }),
    })

    expect(resolveInstagramEventRoot(video)).toBe(innerMount)
  })

  it('raises the native overlay only while controls are expanded', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(performance.now())
      return 1
    })
    const root = document.createElement('div')
    const video = document.createElement('video')
    const overlay = document.createElement('div')
    const author = document.createElement('a')
    const controls = document.createElement('div')
    const ac = new AbortController()

    overlay.appendChild(author)
    root.append(video, overlay, controls)
    document.body.appendChild(root)
    mockRect(video, { right: 400, bottom: 600, width: 400, height: 600 })
    mockRect(overlay, { top: 500, left: 20, right: 280, bottom: 550, width: 260, height: 50 })
    mockRect(author, { top: 510, left: 30, right: 140, bottom: 540, width: 110, height: 30 })
    mockRect(controls, { top: 540, left: 0, right: 400, bottom: 600, width: 400, height: 60 })

    avoidNativeOverlayOverlap(video, root, controls, ac.signal)
    controls.classList.add('irc-controls-visible')
    await Promise.resolve()

    expect(overlay.style.getPropertyValue('--irc-native-overlay-lift')).toBe('12px')
    expect(overlay.classList.contains('irc-native-overlay-lift')).toBe(true)

    controls.classList.remove('irc-controls-visible')
    await Promise.resolve()
    expect(overlay.style.getPropertyValue('--irc-native-overlay-lift')).toBe('0px')
  })

  it('leaves viewer and side-panel metadata outside the video untouched', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(performance.now())
      return 1
    })
    const root = document.createElement('div')
    const video = document.createElement('video')
    const metadata = document.createElement('div')
    const author = document.createElement('a')
    const controls = document.createElement('div')
    const ac = new AbortController()

    metadata.appendChild(author)
    root.append(video, metadata, controls)
    document.body.appendChild(root)
    mockRect(video, { right: 400, bottom: 600, width: 400, height: 600 })
    mockRect(metadata, { top: 500, left: 420, right: 620, bottom: 550, width: 200, height: 50 })
    mockRect(author, { top: 510, left: 430, right: 540, bottom: 540, width: 110, height: 30 })
    mockRect(controls, { top: 540, left: 0, right: 400, bottom: 600, width: 400, height: 60 })

    avoidNativeOverlayOverlap(video, root, controls, ac.signal)
    controls.classList.add('irc-controls-visible')
    await Promise.resolve()

    expect(metadata.classList.contains('irc-native-overlay-lift')).toBe(false)
  })

  it('raises information without moving its full-width gradient container', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(performance.now())
      return 1
    })
    const root = document.createElement('div')
    const video = document.createElement('video')
    const gradient = document.createElement('div')
    const metadata = document.createElement('div')
    const author = document.createElement('a')
    const controls = document.createElement('div')
    const ac = new AbortController()

    metadata.appendChild(author)
    gradient.appendChild(metadata)
    root.append(video, gradient, controls)
    document.body.appendChild(root)
    mockRect(video, { right: 400, bottom: 600, width: 400, height: 600 })
    mockRect(gradient, { top: 440, right: 400, bottom: 600, width: 400, height: 160 })
    mockRect(metadata, { top: 500, left: 20, right: 280, bottom: 550, width: 260, height: 50 })
    mockRect(author, { top: 510, left: 30, right: 140, bottom: 540, width: 110, height: 30 })
    mockRect(controls, { top: 540, left: 0, right: 400, bottom: 600, width: 400, height: 60 })

    avoidNativeOverlayOverlap(video, root, controls, ac.signal)
    controls.classList.add('irc-controls-visible')
    await Promise.resolve()

    expect(metadata.classList.contains('irc-native-overlay-lift')).toBe(true)
    expect(gradient.classList.contains('irc-native-overlay-lift')).toBe(false)
  })

  it('raises a non-interactive information container without moving its mask', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(performance.now())
      return 1
    })
    const root = document.createElement('div')
    const video = document.createElement('video')
    const gradient = document.createElement('div')
    const metadata = document.createElement('div')
    const controls = document.createElement('div')
    const ac = new AbortController()

    metadata.textContent = 'creator and caption'
    gradient.appendChild(metadata)
    root.append(video, gradient, controls)
    document.body.appendChild(root)
    mockRect(video, { right: 400, bottom: 600, width: 400, height: 600 })
    mockRect(gradient, { top: 440, right: 400, bottom: 600, width: 400, height: 160 })
    mockRect(metadata, { top: 500, left: 20, right: 340, bottom: 550, width: 320, height: 50 })
    mockRect(controls, { top: 540, left: 0, right: 400, bottom: 600, width: 400, height: 60 })

    avoidNativeOverlayOverlap(video, root, controls, ac.signal)
    controls.classList.add('irc-controls-visible')
    await Promise.resolve()

    expect(metadata.style.getPropertyValue('--irc-native-overlay-lift')).toBe('22px')
    expect(gradient.classList.contains('irc-native-overlay-lift')).toBe(false)
  })

  it('raises the clipping information parent with all of its contents', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(performance.now())
      return 1
    })
    const root = document.createElement('div')
    const video = document.createElement('video')
    const mask = document.createElement('div')
    const clippingParent = document.createElement('div')
    const metadata = document.createElement('div')
    const controls = document.createElement('div')
    const ac = new AbortController()

    clippingParent.style.overflow = 'hidden'
    metadata.textContent = 'creator, audio and caption'
    clippingParent.appendChild(metadata)
    mask.appendChild(clippingParent)
    root.append(video, mask, controls)
    document.body.appendChild(root)
    mockRect(video, { right: 400, bottom: 600, width: 400, height: 600 })
    mockRect(mask, { top: 340, right: 400, bottom: 600, width: 400, height: 260 })
    mockRect(clippingParent, {
      top: 460,
      right: 400,
      bottom: 560,
      width: 400,
      height: 100,
    })
    mockRect(metadata, { top: 490, left: 30, right: 350, bottom: 540, width: 320, height: 50 })
    mockRect(controls, { top: 540, left: 0, right: 400, bottom: 600, width: 400, height: 60 })

    avoidNativeOverlayOverlap(video, root, controls, ac.signal)
    controls.classList.add('irc-controls-visible')
    await Promise.resolve()

    expect(clippingParent.style.getPropertyValue('--irc-native-overlay-lift')).toBe('12px')
    expect(metadata.classList.contains('irc-native-overlay-lift')).toBe(false)
    expect(mask.classList.contains('irc-native-overlay-lift')).toBe(false)
  })

  it('finds information rendered beside the video root', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(performance.now())
      return 1
    })
    const surface = document.createElement('div')
    const root = document.createElement('div')
    const video = document.createElement('video')
    const metadata = document.createElement('button')
    const author = document.createElement('a')
    const controls = document.createElement('div')
    const ac = new AbortController()

    metadata.appendChild(author)
    root.append(video, controls)
    surface.append(root, metadata)
    document.body.appendChild(surface)
    mockRect(video, { right: 400, bottom: 600, width: 400, height: 600 })
    mockRect(root, { right: 400, bottom: 600, width: 400, height: 600 })
    mockRect(surface, { right: 400, bottom: 600, width: 400, height: 600 })
    mockRect(metadata, { top: 500, left: 20, right: 280, bottom: 550, width: 260, height: 50 })
    mockRect(author, { top: 510, left: 30, right: 140, bottom: 540, width: 110, height: 30 })
    mockRect(controls, { top: 540, left: 0, right: 400, bottom: 600, width: 400, height: 60 })

    avoidNativeOverlayOverlap(video, root, controls, ac.signal)
    controls.classList.add('irc-controls-visible')
    await Promise.resolve()

    expect(metadata.style.getPropertyValue('--irc-native-overlay-lift')).toBe('12px')
  })

  it('does not move Feed post information', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(performance.now())
      return 1
    })
    history.replaceState({}, '', '/p/example/')
    const article = document.createElement('article')
    const root = document.createElement('div')
    const video = document.createElement('video')
    const metadata = document.createElement('button')
    const controls = document.createElement('div')
    const ac = new AbortController()

    root.append(video, metadata, controls)
    article.appendChild(root)
    document.body.appendChild(article)
    mockRect(video, { right: 400, bottom: 600, width: 400, height: 600 })
    mockRect(metadata, { top: 500, left: 20, right: 280, bottom: 550, width: 260, height: 50 })
    mockRect(controls, { top: 540, left: 0, right: 400, bottom: 600, width: 400, height: 60 })

    avoidNativeOverlayOverlap(video, root, controls, ac.signal)
    controls.classList.add('irc-controls-visible')
    await Promise.resolve()

    expect(metadata.classList.contains('irc-native-overlay-lift')).toBe(false)
  })

  it('finds adjacent reels by vertical order', () => {
    const firstMount = document.createElement('div')
    const secondMount = document.createElement('div')
    const firstVideo = document.createElement('video')
    const secondVideo = document.createElement('video')

    setVideoWidth(firstVideo, 360)
    setVideoWidth(secondVideo, 360)
    firstMount.appendChild(firstVideo)
    secondMount.appendChild(secondVideo)
    appendToMain(firstMount, secondMount)

    Object.defineProperty(firstVideo, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 200 }),
    })
    Object.defineProperty(secondVideo, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 600 }),
    })

    expect(findAdjacentInstagramReel(firstVideo, 'next')).toBe(secondVideo)
    expect(findAdjacentInstagramReel(secondVideo, 'previous')).toBe(firstVideo)
    expect(findAdjacentInstagramReel(firstVideo, 'previous')).toBeNull()
  })

  it('scrolls the adjacent reel mount into view', () => {
    const firstMount = document.createElement('div')
    const secondMount = document.createElement('div')
    const firstVideo = document.createElement('video')
    const secondVideo = document.createElement('video')
    const scrollIntoView = vi.fn()

    setVideoWidth(firstVideo, 360)
    setVideoWidth(secondVideo, 360)
    firstMount.appendChild(firstVideo)
    secondMount.appendChild(secondVideo)
    appendToMain(firstMount, secondMount)
    Object.defineProperty(secondMount, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    Object.defineProperty(firstVideo, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 100 }),
    })
    Object.defineProperty(secondVideo, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 500 }),
    })

    expect(scrollToAdjacentInstagramReel(firstVideo, 'next')).toBe(secondVideo)
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
  })

  it('scans added subtrees instead of the whole document after startup', async () => {
    stubAnimationFrame()
    const main = appendToMain()
    const video = document.createElement('video')
    const wrapper = document.createElement('div')
    const foundVideos: HTMLVideoElement[] = []
    const documentQuery = vi.spyOn(document, 'querySelectorAll')

    setVideoWidth(video, 360)

    const observer = startInstagramIntegration({
      onVideoFound(video) {
        foundVideos.push(video)
      },
      onVideosRemoved: vi.fn(),
    })

    documentQuery.mockClear()
    wrapper.appendChild(video)
    main.appendChild(wrapper)

    await flushMutationFrame()

    expect(foundVideos).toEqual([video])
    expect(documentQuery).not.toHaveBeenCalled()

    observer.disconnect()
    documentQuery.mockRestore()
  })

  it('keeps mutation batches that arrive before the next animation frame', async () => {
    stubAnimationFrame()
    const main = appendToMain()
    const firstVideo = document.createElement('video')
    const secondVideo = document.createElement('video')
    const firstWrapper = document.createElement('div')
    const secondWrapper = document.createElement('div')
    const foundVideos: HTMLVideoElement[] = []
    const removedMutationCount: number[] = []

    setVideoWidth(firstVideo, 360)
    setVideoWidth(secondVideo, 360)

    const observer = startInstagramIntegration({
      onVideoFound(video) {
        foundVideos.push(video)
      },
      onVideosRemoved(mutations) {
        removedMutationCount.push(mutations.length)
      },
    })

    firstWrapper.appendChild(firstVideo)
    main.appendChild(firstWrapper)
    await Promise.resolve()

    secondWrapper.appendChild(secondVideo)
    main.appendChild(secondWrapper)

    await flushMutationFrame()

    expect(foundVideos).toEqual([firstVideo, secondVideo])
    expect(removedMutationCount).toEqual([2])

    observer.disconnect()
  })
})
