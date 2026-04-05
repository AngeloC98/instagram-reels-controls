export interface ControlElements {
  bar: HTMLDivElement
  playBtn: HTMLButtonElement
  seekTrack: HTMLDivElement
  seekFill: HTMLDivElement
  seekThumb: HTMLDivElement
  timeLabel: HTMLSpanElement
  speedBtn: HTMLButtonElement
  speedMenu: HTMLDivElement
  speedOptions: HTMLDivElement[]
  muteBtn: HTMLButtonElement
  volumeBar: HTMLInputElement
}

export interface SyncHandlers {
  scrubbing: boolean
  updatePlayButton: () => void
  updateSeek: () => void
  updateMute: () => void
}

export interface TickLoop {
  start: () => void
  stop: () => void
}

export interface Preferences {
  muted: boolean
  volume: number
  speed: number
}
