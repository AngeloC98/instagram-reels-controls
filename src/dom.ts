import type { ControlElements } from './types'

const CONTROLS_CLASS = 'irc-controls'
const SPEED_OPTIONS = ['0.25', '0.5', '0.75', '1', '1.25', '1.5', '2'] as const

type ElAttrs = Record<string, string | boolean>

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: ElAttrs,
  children?: HTMLElement[],
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
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

export function createControlsDOM(): ControlElements {
  const playBtn = el('button', { className: 'irc-btn irc-playpause', title: 'Play/Pause' })
  const muteBtn = el('button', { className: 'irc-btn irc-mute', title: 'Mute/Unmute' })
  const volFill = el('div', { className: 'irc-vol-fill' })
  const volThumb = el('div', { className: 'irc-vol-thumb' })
  const volTrack = el('div', { className: 'irc-volume' }, [volFill, volThumb])
  const timeLabel = el('span', { className: 'irc-time', textContent: '0:00 / 0:00' })
  const speedBtn = el('button', {
    className: 'irc-speed-btn',
    title: 'Playback speed',
    textContent: '1\u00D7',
  })

  const speedOptions = SPEED_OPTIONS.map((v) =>
    el('div', {
      className: `irc-speed-option${v === '1' ? ' irc-speed-active' : ''}`,
      'data-speed': v,
      textContent: `${v}\u00D7`,
    }),
  )

  const speedMenu = el('div', { className: 'irc-speed-menu', hidden: true }, [
    el('div', { className: 'irc-speed-title', textContent: 'Playback speed' }),
    ...speedOptions,
  ])

  const seekFill = el('div', { className: 'irc-seek-fill' })
  const seekThumb = el('div', { className: 'irc-seek-thumb' })
  const seekTrack = el('div', { className: 'irc-seek' }, [seekFill, seekThumb])

  const bar = el('div', { className: CONTROLS_CLASS }, [
    el('div', { className: 'irc-row irc-upper' }, [
      playBtn,
      el('div', { className: 'irc-vol-group' }, [muteBtn, volTrack]),
      timeLabel,
      el('div', { className: 'irc-speed-wrap' }, [speedBtn, speedMenu]),
    ]),
    el('div', { className: 'irc-row irc-lower' }, [seekTrack]),
  ])

  return {
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
}
