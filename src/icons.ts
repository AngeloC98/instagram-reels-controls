import { ext } from './browser'

export const ICON = {
  play: ext.runtime.getURL('icons/play.svg'),
  pause: ext.runtime.getURL('icons/pause.svg'),
  volHigh: ext.runtime.getURL('icons/vol-high.svg'),
  volLow: ext.runtime.getURL('icons/vol-low.svg'),
  volMute: ext.runtime.getURL('icons/vol-mute.svg'),
} as const

export function setIcon(target: HTMLElement, src: string): void {
  let img = target.querySelector('img')
  if (!img) {
    img = document.createElement('img')
    img.width = 16
    img.height = 16
    target.replaceChildren(img)
  }
  img.src = src
}
