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

export function setSliderPosition(fill: HTMLDivElement, thumb: HTMLDivElement, pct: number): void {
  const clamped = Math.max(0, Math.min(100, pct))
  fill.style.width = `${String(clamped)}%`
  thumb.style.left = `${String(clamped)}%`
}

export function createSyncHandlers(video: HTMLVideoElement, els: ControlElements): SyncHandlers {
  const { playBtn, seekFill, seekThumb, timeLabel, muteBtn, volFill, volThumb } = els
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
        setSliderPosition(seekFill, seekThumb, pct)
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
      setSliderPosition(volFill, volThumb, vol * 100)
    },
  }
}

export function createTickLoop(
  updateSeek: () => void,
  animationFrameHost: Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'> = window,
): TickLoop {
  let rafId: number | null = null
  return {
    start() {
      if (rafId === null) {
        const tick = (): void => {
          updateSeek()
          rafId = animationFrameHost.requestAnimationFrame(tick)
        }
        tick()
      }
    },
    stop() {
      if (rafId !== null) animationFrameHost.cancelAnimationFrame(rafId)
      rafId = null
    },
  }
}
