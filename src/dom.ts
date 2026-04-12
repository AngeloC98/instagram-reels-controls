import type { ControlElements } from './types'
import { ICON, setIcon } from './icons'

const CONTROLS_CLASS = 'irc-controls'
const SPEED_OPTIONS = ['0.25', '0.5', '0.75', '1', '1.25', '1.5', '2'] as const

type ElAttrs = Record<string, string | boolean>

interface CreateControlsDOMOptions {
  ownerDocument?: Document
  includePictureInPictureButton?: boolean
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: ElAttrs,
  children?: HTMLElement[],
  ownerDocument: Document = document,
): HTMLElementTagNameMap[K] {
  const e = ownerDocument.createElement(tag)
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className' && typeof v === 'string') e.className = v
      else if (k === 'textContent' && typeof v === 'string') e.textContent = v
      else if (k === 'hidden' && typeof v === 'boolean') e.hidden = v
      else if (typeof v === 'string') e.setAttribute(k, v)
    }
  }
  if (children) {
    for (const c of children) e.appendChild(c)
  }
  return e
}

export function createControlsDOM(options: CreateControlsDOMOptions = {}): ControlElements {
  const ownerDocument = options.ownerDocument ?? document
  const includePictureInPictureButton = options.includePictureInPictureButton ?? true
  const create = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs?: ElAttrs,
    children?: HTMLElement[],
  ): HTMLElementTagNameMap[K] => el(tag, attrs, children, ownerDocument)

  const playBtn = create('button', {
    className: 'irc-control-button irc-compact-control irc-icon-control irc-btn irc-playpause',
    title: 'Play/Pause',
  })
  const muteBtn = create('button', {
    className: 'irc-control-button irc-compact-control irc-icon-control irc-btn irc-mute',
    title: 'Mute/Unmute',
  })
  const volFill = create('div', { className: 'irc-vol-fill' })
  const volThumb = create('div', { className: 'irc-vol-thumb' })
  const volTrack = create('div', { className: 'irc-volume' }, [volFill, volThumb])
  const timeLabel = create('span', {
    className: 'irc-control-label irc-time',
    textContent: '0:00 / 0:00',
  })
  const speedBtn = create('button', {
    className: 'irc-control-button irc-compact-control irc-speed-btn',
    title: 'Playback speed',
    textContent: '1\u00D7',
  })

  const speedOptions = SPEED_OPTIONS.map((v) =>
    create('div', {
      className: `irc-speed-option${v === '1' ? ' irc-speed-active' : ''}`,
      'data-speed': v,
      textContent: `${v}\u00D7`,
    }),
  )

  const speedMenu = create('div', { className: 'irc-speed-menu', hidden: true }, [
    create('div', { className: 'irc-speed-title', textContent: 'Playback speed' }),
    ...speedOptions,
  ])

  const seekFill = create('div', { className: 'irc-seek-fill' })
  const seekThumb = create('div', { className: 'irc-seek-thumb' })
  const seekTrack = create('div', { className: 'irc-seek' }, [seekFill, seekThumb])
  const pipBtn = includePictureInPictureButton
    ? create('button', {
        className: 'irc-control-button irc-compact-control irc-icon-control irc-btn irc-pip-btn',
        title: 'Picture-in-picture',
        'aria-label': 'Picture-in-picture',
        hidden: true,
      })
    : undefined

  if (pipBtn) setIcon(pipBtn, ICON.pictureInPicture)

  const upperChildren = [
    playBtn,
    create('div', { className: 'irc-vol-group' }, [muteBtn, volTrack]),
    timeLabel,
    pipBtn,
    create('div', { className: 'irc-speed-wrap' }, [speedBtn]),
  ].filter((child): child is HTMLElement => Boolean(child))

  const bar = create(
    'div',
    {
      className: CONTROLS_CLASS,
    },
    [
      create('div', { className: 'irc-row irc-upper' }, upperChildren),
      create('div', { className: 'irc-row irc-lower' }, [seekTrack]),
      speedMenu,
    ],
  )

  const controls: ControlElements = {
    bar,
    playBtn,
    seekTrack,
    seekFill,
    seekThumb,
    timeLabel,
    speedBtn,
    speedMenu,
    speedOptions,
    muteBtn,
    volTrack,
    volFill,
    volThumb,
  }

  if (pipBtn) controls.pipBtn = pipBtn

  return controls
}
