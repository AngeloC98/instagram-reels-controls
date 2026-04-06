import { beforeEach, describe, expect, it } from 'vitest'
import { findInstagramVideos, isInstagramVideoCandidate, prepareInstagramMount } from '../instagram'

function setVideoWidth(video: HTMLVideoElement, width: number): void {
  Object.defineProperty(video, 'offsetWidth', {
    configurable: true,
    get: () => width,
  })
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

    expect(isInstagramVideoCandidate(smallVideo)).toBe(false)
    expect(isInstagramVideoCandidate(largeVideo)).toBe(true)
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
    document.body.append(smallWrapper, largeWrapper)

    expect(findInstagramVideos()).toEqual([largeVideo])
  })

  it('prepares the parent element as the mount target', () => {
    const mount = document.createElement('div')
    const video = document.createElement('video')

    mount.appendChild(video)

    expect(prepareInstagramMount(video)).toBe(mount)
    expect(mount.style.position).toBe('')
    expect(mount.style.overflow).toBe('')
  })
})
