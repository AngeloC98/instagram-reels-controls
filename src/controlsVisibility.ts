const CONTROLS_VISIBLE_CLASS = 'irc-controls-visible'
const CONTROLS_IDLE_HIDE_DELAY_MS = 1800
const CONTROLS_LEAVE_HIDE_DELAY_MS = 200

type ControlsVisibilityState = 'hidden' | 'visible' | 'pinned'

export type ControlsVisibilityPin =
  | 'controls-hover'
  | 'keyboard-focus'
  | 'menu'
  | 'scrubbing'
  | 'volume-drag'

type ControlsVisibilityEvent =
  | { type: 'activity' }
  | { type: 'leave-player' }
  | { type: 'pin'; pin: ControlsVisibilityPin }
  | { type: 'unpin'; pin: ControlsVisibilityPin }
  | { type: 'timeout' }
  | { type: 'reset' }

export interface ControlsVisibilityMachine {
  activity: () => void
  leavePlayer: () => void
  pin: (pin: ControlsVisibilityPin) => void
  unpin: (pin: ControlsVisibilityPin) => void
}

interface ControlsVisibilityOptions {
  initiallyVisible?: boolean
}

export function createControlsVisibilityMachine(
  bar: HTMLDivElement,
  sig: AbortSignal,
  options: ControlsVisibilityOptions = {},
): ControlsVisibilityMachine {
  let state: ControlsVisibilityState = 'hidden'
  let hideTimer: number | undefined
  let pointerInsidePlayer = false
  const pins = new Set<ControlsVisibilityPin>()

  const clearHideTimer = (): void => {
    if (hideTimer === undefined) return
    window.clearTimeout(hideTimer)
    hideTimer = undefined
  }

  const enterHidden = (): void => {
    state = 'hidden'
    clearHideTimer()
    bar.classList.remove(CONTROLS_VISIBLE_CLASS)
  }

  const enterPinned = (): void => {
    state = 'pinned'
    clearHideTimer()
    bar.classList.add(CONTROLS_VISIBLE_CLASS)
  }

  const enterVisible = (delayMs = CONTROLS_IDLE_HIDE_DELAY_MS): void => {
    state = 'visible'
    bar.classList.add(CONTROLS_VISIBLE_CLASS)
    clearHideTimer()
    hideTimer = window.setTimeout(() => {
      hideTimer = undefined
      dispatch({ type: 'timeout' })
    }, delayMs)
  }

  const enterUnpinnedVisible = (): void => {
    enterVisible(pointerInsidePlayer ? CONTROLS_IDLE_HIDE_DELAY_MS : CONTROLS_LEAVE_HIDE_DELAY_MS)
  }

  function dispatch(event: ControlsVisibilityEvent): void {
    switch (event.type) {
      case 'activity':
        pointerInsidePlayer = true
        if (pins.size > 0) enterPinned()
        else enterVisible()
        break
      case 'leave-player':
        pointerInsidePlayer = false
        if (pins.size > 0) enterPinned()
        else enterVisible(CONTROLS_LEAVE_HIDE_DELAY_MS)
        break
      case 'pin':
        pins.add(event.pin)
        enterPinned()
        break
      case 'unpin':
        pins.delete(event.pin)
        if (pins.size > 0) enterPinned()
        else if (state !== 'hidden') enterUnpinnedVisible()
        break
      case 'timeout':
        if (pins.size > 0) enterPinned()
        else enterHidden()
        break
      case 'reset':
        pins.clear()
        pointerInsidePlayer = false
        enterHidden()
        break
    }
  }

  sig.addEventListener(
    'abort',
    () => {
      dispatch({ type: 'reset' })
    },
    { once: true },
  )

  if (options.initiallyVisible) dispatch({ type: 'activity' })

  return {
    activity: () => {
      dispatch({ type: 'activity' })
    },
    leavePlayer: () => {
      dispatch({ type: 'leave-player' })
    },
    pin: (pin) => {
      dispatch({ type: 'pin', pin })
    },
    unpin: (pin) => {
      dispatch({ type: 'unpin', pin })
    },
  }
}
