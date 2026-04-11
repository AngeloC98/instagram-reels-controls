import pauseIcon from '../icons/pause.svg?raw'
import playIcon from '../icons/play.svg?raw'
import volumeHighIcon from '../icons/vol-high.svg?raw'
import volumeLowIcon from '../icons/vol-low.svg?raw'
import volumeMuteIcon from '../icons/vol-mute.svg?raw'

const SVG_NS = 'http://www.w3.org/2000/svg'

export const ICON = {
  play: playIcon,
  pause: pauseIcon,
  volHigh: volumeHighIcon,
  volLow: volumeLowIcon,
  volMute: volumeMuteIcon,
} as const

const iconCache = new Map<string, SVGSVGElement>()

function createIcon(svgSource: string): SVGSVGElement {
  const cached = iconCache.get(svgSource)
  if (cached) return cached.cloneNode(true) as SVGSVGElement

  const template = document.createElement('template')
  template.innerHTML = svgSource.trim()

  const svg = template.content.querySelector('svg')
  if (svg?.namespaceURI !== SVG_NS) {
    throw new Error('Invalid icon SVG')
  }

  svg.classList.add('irc-icon')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  iconCache.set(svgSource, svg)

  return svg.cloneNode(true) as SVGSVGElement
}

export function setIcon(target: HTMLElement, icon: string): void {
  target.replaceChildren(createIcon(icon))
}
