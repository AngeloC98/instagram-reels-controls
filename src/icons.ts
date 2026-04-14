import autoplayNextIcon from '../icons/autoplay-next.svg?raw'
import pauseIcon from '../icons/pause.svg?raw'
import playIcon from '../icons/play.svg?raw'
import volumeHighIcon from '../icons/vol-high.svg?raw'
import volumeLowIcon from '../icons/vol-low.svg?raw'
import volumeMuteIcon from '../icons/vol-mute.svg?raw'

const SVG_NS = 'http://www.w3.org/2000/svg'

export const ICON = {
  autoplayNext: autoplayNextIcon,
  play: playIcon,
  pause: pauseIcon,
  volHigh: volumeHighIcon,
  volLow: volumeLowIcon,
  volMute: volumeMuteIcon,
} as const

const iconCache = new WeakMap<Document, Map<string, SVGSVGElement>>()

function getIconCache(ownerDocument: Document): Map<string, SVGSVGElement> {
  const cached = iconCache.get(ownerDocument)
  if (cached) return cached

  const nextCache = new Map<string, SVGSVGElement>()
  iconCache.set(ownerDocument, nextCache)
  return nextCache
}

function createIcon(svgSource: string, ownerDocument: Document): SVGSVGElement {
  const documentCache = getIconCache(ownerDocument)
  const cached = documentCache.get(svgSource)
  if (cached) return cached.cloneNode(true) as SVGSVGElement

  const template = ownerDocument.createElement('template')
  template.innerHTML = svgSource.trim()

  const svg = template.content.querySelector('svg')
  if (svg?.namespaceURI !== SVG_NS) {
    throw new Error('Invalid icon SVG')
  }

  svg.classList.add('irc-icon')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  documentCache.set(svgSource, svg)

  return svg.cloneNode(true) as SVGSVGElement
}

export function setIcon(target: HTMLElement, icon: string): void {
  target.replaceChildren(createIcon(icon, target.ownerDocument))
}
