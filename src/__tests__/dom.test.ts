import { describe, it, expect, vi } from 'vitest'
import { el, createControlsDOM } from '../dom'
import { PICTURE_IN_PICTURE_ICON } from '../pip/icon'

vi.mock('../browser', () => ({
  ext: {
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } },
  },
}))

describe('el', () => {
  it('creates element with correct tag', () => {
    const div = el('div')
    expect(div.tagName.toLowerCase()).toBe('div')
  })

  it('sets className', () => {
    const btn = el('button', { className: 'my-class' })
    expect(btn.className).toBe('my-class')
  })

  it('sets textContent', () => {
    const span = el('span', { textContent: 'hello' })
    expect(span.textContent).toBe('hello')
  })

  it('sets hidden', () => {
    const div = el('div', { hidden: true })
    expect(div.hidden).toBe(true)
  })

  it('sets arbitrary attributes', () => {
    const input = el('input', { type: 'range', min: '0', max: '100' })
    expect(input.getAttribute('type')).toBe('range')
    expect(input.getAttribute('min')).toBe('0')
    expect(input.getAttribute('max')).toBe('100')
  })

  it('appends children', () => {
    const child1 = el('span')
    const child2 = el('span')
    const parent = el('div', {}, [child1, child2])
    expect(parent.children.length).toBe(2)
    expect(parent.children[0]).toBe(child1)
    expect(parent.children[1]).toBe(child2)
  })
})

describe('createControlsDOM', () => {
  it('returns all required elements', () => {
    const dom = createControlsDOM()
    expect(dom.bar).toBeDefined()
    expect(dom.playBtn).toBeDefined()
    expect(dom.seekTrack).toBeDefined()
    expect(dom.seekFill).toBeDefined()
    expect(dom.seekThumb).toBeDefined()
    expect(dom.timeLabel).toBeDefined()
    expect(dom.pipBtn).toBeDefined()
    expect(dom.speedBtn).toBeDefined()
    expect(dom.speedMenu).toBeDefined()
    expect(dom.speedOptions).toBeDefined()
    expect(dom.muteBtn).toBeDefined()
    expect(dom.volTrack).toBeDefined()
    expect(dom.volFill).toBeDefined()
    expect(dom.volThumb).toBeDefined()
  })

  it('speedOptions has length 7', () => {
    const dom = createControlsDOM()
    expect(dom.speedOptions).toHaveLength(7)
  })

  it('speedOptions have correct data-speed attributes', () => {
    const dom = createControlsDOM()
    const speeds = dom.speedOptions.map((o) => o.getAttribute('data-speed'))
    expect(speeds).toEqual(['0.25', '0.5', '0.75', '1', '1.25', '1.5', '2'])
  })

  it('marks 1x as active by default', () => {
    const dom = createControlsDOM()
    const activeOption = dom.speedOptions.find((o) => o.classList.contains('irc-speed-active'))
    expect(activeOption).toBeDefined()
    expect(activeOption?.getAttribute('data-speed')).toBe('1')
  })

  it('keeps the speed menu outside the blurred upper bar', () => {
    const dom = createControlsDOM()
    const upperBar = dom.bar.querySelector('.irc-upper')

    expect(dom.bar.contains(dom.speedMenu)).toBe(true)
    expect(upperBar?.contains(dom.speedMenu)).toBe(false)
  })

  it('uses shared control primitives for row controls', () => {
    const dom = createControlsDOM()

    expect(dom.playBtn.classList.contains('irc-control-button')).toBe(true)
    expect(dom.playBtn.classList.contains('irc-compact-control')).toBe(true)
    expect(dom.playBtn.classList.contains('irc-icon-control')).toBe(true)
    expect(dom.muteBtn.classList.contains('irc-control-button')).toBe(true)
    expect(dom.muteBtn.classList.contains('irc-compact-control')).toBe(true)
    expect(dom.muteBtn.classList.contains('irc-icon-control')).toBe(true)
    expect(dom.pipBtn?.classList.contains('irc-control-button')).toBe(true)
    expect(dom.pipBtn?.classList.contains('irc-compact-control')).toBe(true)
    expect(dom.pipBtn?.classList.contains('irc-icon-control')).toBe(true)
    expect(dom.speedBtn.classList.contains('irc-control-button')).toBe(true)
    expect(dom.speedBtn.classList.contains('irc-compact-control')).toBe(true)
    expect(dom.timeLabel.classList.contains('irc-control-label')).toBe(true)
  })

  it('starts the page PiP button hidden', () => {
    const dom = createControlsDOM({ pictureInPictureIcon: PICTURE_IN_PICTURE_ICON })
    expect(dom.pipBtn?.hidden).toBe(true)
    expect(
      dom.pipBtn?.querySelector('svg')?.classList.contains('lucide-picture-in-picture-2'),
    ).toBe(true)
  })

  it('can create PiP controls in another document', () => {
    const pipDocument = document.implementation.createHTMLDocument('pip')
    const dom = createControlsDOM({
      ownerDocument: pipDocument,
      includePictureInPictureButton: false,
    })

    expect(dom.bar.ownerDocument).toBe(pipDocument)
    expect(dom.pipBtn).toBeUndefined()
    expect(dom.playBtn.ownerDocument).toBe(pipDocument)
    expect(dom.muteBtn.ownerDocument).toBe(pipDocument)
    expect(dom.speedBtn.ownerDocument).toBe(pipDocument)
  })
})
