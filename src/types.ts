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
  volTrack: HTMLDivElement
  volFill: HTMLDivElement
  volThumb: HTMLDivElement
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

export interface PreferenceSnapshot extends Preferences {
  userInteracted: boolean
}

export interface PreferenceStore {
  ready: Promise<void>
  getSnapshot: () => PreferenceSnapshot
  setMuted: (value: boolean) => void
  setVolume: (value: number) => void
  setSpeed: (value: number) => void
  markUserInteracted: () => void
  save: () => void
}
