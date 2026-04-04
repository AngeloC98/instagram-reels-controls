import type { ControlElements, SyncHandlers, TickLoop } from './types'
import { ICON, setIcon } from './icons'

export function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')
  return `${String(m)}:${s}`
}

export function seekGradient(pct: number): string {
  return `linear-gradient(to right, #f9a825 0%, #e91e8c ${String(pct / 2)}%, #833ab4 ${String(pct)}%, rgba(255,255,255,0.3) ${String(pct)}%)`
}

export function volumeGradient(pct: number): string {
  return `linear-gradient(to right, #fff ${String(pct)}%, rgba(255,255,255,0.3) ${String(pct)}%)`
}

export function createSyncHandlers(video: HTMLVideoElement, els: ControlElements): SyncHandlers {
  const { playBtn, seekBar, timeLabel, muteBtn, volumeBar } = els
  let scrubbing = false
  let lastTimeText = ''

  function formatTimeLabel(): string {
    return `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`
  }

  return {
    get scrubbing() {
      return scrubbing
    },
    set scrubbing(v: boolean) {
      scrubbing = v
    },

    updatePlayButton() {
      setIcon(playBtn, video.paused ? ICON.play : ICON.pause)
    },

    updateSeek() {
      if (video.duration && !scrubbing) {
        const pct = (video.currentTime / video.duration) * 100
        seekBar.value = String(pct)
        seekBar.style.background = seekGradient(pct)
        const text = formatTimeLabel()
        if (text !== lastTimeText) {
          timeLabel.textContent = text
          lastTimeText = text
        }
      }
    },

    updateMute() {
      if (video.muted || video.volume === 0) {
        setIcon(muteBtn, ICON.volMute)
      } else if (video.volume < 0.5) {
        setIcon(muteBtn, ICON.volLow)
      } else {
        setIcon(muteBtn, ICON.volHigh)
      }
      const vol = video.muted ? 0 : video.volume
      volumeBar.value = String(vol)
      volumeBar.style.background = volumeGradient(vol * 100)
    },
  }
}

export function createTickLoop(updateSeek: () => void): TickLoop {
  let rafId: number | null = null
  return {
    start() {
      if (!rafId) {
        const tick = (): void => {
          updateSeek()
          rafId = requestAnimationFrame(tick)
        }
        tick()
      }
    },
    stop() {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = null
    },
  }
}
