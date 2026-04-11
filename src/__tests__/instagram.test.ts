import { beforeEach, describe, expect, it } from 'vitest'
import { findInstagramVideos, isInstagramVideoCandidate, resolveInstagramMount } from '../instagram'

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

describe('instagram adapter', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
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
})
