import type { ControlElements, PreferenceStore, SyncHandlers, TickLoop } from './types'
import { formatTime, setSliderPosition } from './sync'
import {
  createControlsVisibilityMachine,
  type ControlsVisibilityMachine,
} from './controlsVisibility'
import { hasPointerMoved, recordPointerPosition } from './pointerActivity'

/** 音量变化来源守卫（用计数器处理同时修改 volume 和 muted 触发的多次 volumechange） */
export interface VolumeChangeGuard {
  /** 跳过接下来 N 次 volumechange 事件（因为是插件主动修改触发的） */
  skipNextVolumeChanges: number
}

const KEYBOARD_SEEK_SECONDS = 5
let activeKeyboardVideo: HTMLVideoElement | null = null
const keyboardVideos = new Set<HTMLVideoElement>()

function getVisibleKeyboardVideo(ownerDocument: Document): HTMLVideoElement | null {
  const ownerWindow = ownerDocument.defaultView
  if (!ownerWindow) return null

  const candidates = [...keyboardVideos].filter((candidate) => {
    if (candidate.ownerDocument !== ownerDocument || !candidate.isConnected) return false

    const rect = candidate.getBoundingClientRect()
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < ownerWindow.innerWidth &&
      rect.top < ownerWindow.innerHeight
    )
  })

  if (activeKeyboardVideo && candidates.includes(activeKeyboardVideo)) return activeKeyboardVideo
  if (candidates.length === 0) {
    return activeKeyboardVideo?.ownerDocument === ownerDocument && activeKeyboardVideo.isConnected
      ? activeKeyboardVideo
      : null
  }

  const viewportCenter = ownerWindow.innerHeight / 2
  return candidates.reduce((closest, candidate) => {
    const closestRect = closest.getBoundingClientRect()
    const candidateRect = candidate.getBoundingClientRect()
    const closestDistance = Math.abs(closestRect.top + closestRect.height / 2 - viewportCenter)
    const candidateDistance = Math.abs(
      candidateRect.top + candidateRect.height / 2 - viewportCenter,
    )
    return candidateDistance < closestDistance ? candidate : closest
  })
}

function isEditableTarget(target: EventTarget | null, ownerDocument: Document): boolean {
  if (!isElementInDocument(target, ownerDocument)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

function bindKeyboardSeekEvents(
  video: HTMLVideoElement,
  eventRoot: HTMLElement,
  sig: AbortSignal,
): void {
  const ownerDocument = eventRoot.ownerDocument
  keyboardVideos.add(video)

  const setActiveVideo = (): void => {
    activeKeyboardVideo = video
  }

  eventRoot.addEventListener('pointerenter', setActiveVideo, { signal: sig })
  eventRoot.addEventListener('pointerdown', setActiveVideo, { signal: sig })

  ownerDocument.addEventListener(
    'keydown',
    (event) => {
      if (
        getVisibleKeyboardVideo(ownerDocument) !== video ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        isEditableTarget(event.target, ownerDocument)
      )
        return

      const offset =
        event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a'
          ? -KEYBOARD_SEEK_SECONDS
          : event.key === 'ArrowRight' || event.key.toLowerCase() === 'd'
            ? KEYBOARD_SEEK_SECONDS
            : 0
      if (offset === 0 || !Number.isFinite(video.duration)) return

      event.preventDefault()
      event.stopPropagation()
      video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + offset))
    },
    { capture: true, signal: sig },
  )

  sig.addEventListener(
    'abort',
    () => {
      keyboardVideos.delete(video)
      if (activeKeyboardVideo === video) activeKeyboardVideo = null
    },
    { once: true },
  )
}

function isNodeInDocument(value: EventTarget | null, ownerDocument: Document): value is Node {
  const NodeConstructor = ownerDocument.defaultView?.Node ?? Node
  return value instanceof NodeConstructor
}

function isElementInDocument(value: EventTarget | null, ownerDocument: Document): value is Element {
  const ElementConstructor = ownerDocument.defaultView?.Element ?? Element
  return value instanceof ElementConstructor
}

function setSpeedMenuOpen(
  speedMenu: HTMLDivElement,
  visibility: ControlsVisibilityMachine,
  open: boolean,
  beforeOpen?: () => void,
): void {
  if (open) beforeOpen?.()
  speedMenu.hidden = !open
  if (open) visibility.pin('menu')
  else visibility.unpin('menu')
}

function positionSpeedMenu(
  bar: HTMLDivElement,
  speedBtn: HTMLButtonElement,
  speedMenu: HTMLDivElement,
): void {
  const barRect = bar.getBoundingClientRect()
  const buttonRect = speedBtn.getBoundingClientRect()
  const top = Math.max(0, buttonRect.bottom - barRect.top + 8)
  const right = Math.max(0, barRect.right - buttonRect.right)

  speedMenu.style.setProperty('--irc-speed-menu-top', `${String(Math.round(top))}px`)
  speedMenu.style.setProperty('--irc-speed-menu-right', `${String(Math.round(right))}px`)
}

function bindVisibilityEvents(
  bar: HTMLDivElement,
  eventRoot: HTMLElement,
  speedMenu: HTMLDivElement,
  visibility: ControlsVisibilityMachine,
  sig: AbortSignal,
): void {
  const ownerDocument = bar.ownerDocument
  if (!isElementInDocument(eventRoot, ownerDocument)) return

  let keyboardMayFocusControls = false

  const showFromMountMotion = (e: PointerEvent): void => {
    if (isNodeInDocument(e.target, ownerDocument) && bar.contains(e.target)) return
    if (!hasPointerMoved(e)) return
    visibility.activity()
  }

  const handleMountPointerDown = (e: PointerEvent): void => {
    if (isNodeInDocument(e.target, ownerDocument) && bar.contains(e.target)) return
    recordPointerPosition(e)
    visibility.activity()
  }

  ownerDocument.addEventListener(
    'keydown',
    () => {
      keyboardMayFocusControls = true
    },
    { capture: true, signal: sig },
  )
  ownerDocument.addEventListener(
    'pointerdown',
    (e) => {
      keyboardMayFocusControls = false
      if (!(isNodeInDocument(e.target, ownerDocument) && bar.contains(e.target))) {
        setSpeedMenuOpen(speedMenu, visibility, false)
      }
    },
    { capture: true, signal: sig },
  )
  eventRoot.addEventListener('pointerenter', showFromMountMotion, { signal: sig })
  eventRoot.addEventListener('pointermove', showFromMountMotion, { signal: sig })
  eventRoot.addEventListener('pointerdown', handleMountPointerDown, { signal: sig })
  eventRoot.addEventListener(
    'pointerleave',
    () => {
      visibility.leavePlayer()
    },
    { signal: sig },
  )

  bar.addEventListener(
    'pointerenter',
    () => {
      visibility.pin('controls-hover')
    },
    { signal: sig },
  )

  bar.addEventListener(
    'pointerleave',
    () => {
      visibility.unpin('controls-hover')
    },
    { signal: sig },
  )
  bar.addEventListener(
    'focusin',
    () => {
      if (keyboardMayFocusControls) visibility.pin('keyboard-focus')
      else visibility.activity()
    },
    { signal: sig },
  )
  bar.addEventListener(
    'focusout',
    (e) => {
      if (isNodeInDocument(e.relatedTarget, ownerDocument) && bar.contains(e.relatedTarget)) return
      visibility.unpin('keyboard-focus')
    },
    { signal: sig },
  )
}

function bindBarEvents(
  bar: HTMLDivElement,
  speedMenu: HTMLDivElement,
  visibility: ControlsVisibilityMachine,
  sig: AbortSignal,
): void {
  const closeSpeedMenu = (): void => {
    setSpeedMenuOpen(speedMenu, visibility, false)
  }

  /**
   * 阻止点击/指针事件冒泡到 Instagram 的父级监听器（Reels 首页会把容器点击当导航）。
   *
   * 关键修复：
   * 1. 移除 eventPhase 检查 — 当事件目标是 bar 自身时 eventPhase 是 AT_TARGET(2)，
   *    不是 BUBBLING_PHASE(3)，导致 stopPropagation 不被调用，bar 空白区域点击会跳转。
   *    现在直接调用 stopPropagation + preventDefault，无论事件阶段。
   *
   * 2. 添加 preventDefault — 正常工作的按钮（音量、画中画、连播）都有 preventDefault，
   *    而跳转的按钮（播放、倍速）没有。IG 可能通过默认行为机制触发导航。
   *
   * 3. speedMenu 单独绑定拦截器，防止菜单内事件冒泡。
   *
   * 子元素的事件处理在 bar 之前触发（冒泡从内到外），所以不会影响按钮功能。
   */
  const PREVENT_NAV_EVENTS = [
    'click',
    'pointerdown',
    'pointerup',
    'pointercancel',
    'mousedown',
    'mouseup',
    'dblclick',
    'touchstart',
    'touchend',
  ] as const

  // bar 拦截：直接 stopPropagation + preventDefault，不检查 eventPhase
  const blockNav = (e: Event): void => {
    e.stopPropagation()
    e.preventDefault()
  }

  for (const evName of PREVENT_NAV_EVENTS) {
    bar.addEventListener(evName, blockNav, { signal: sig })
  }

  // speedMenu 单独拦截
  for (const evName of PREVENT_NAV_EVENTS) {
    speedMenu.addEventListener(evName, blockNav, { signal: sig })
  }

  /**
   * 捕获阶段拦截 click/dblclick（关键修复）
   *
   * 问题：bar 的 blockNav 是冒泡阶段监听器。如果 IG 在祖先元素上注册了
   * 捕获阶段的 click 监听器，它会在 bar 的冒泡监听器之前触发 → 导航发生。
   *
   * 解决：在 bar 上添加捕获阶段的 click/dblclick 监听器。
   *   - 如果 target 是按钮（button/[role="button"]）：不拦截，让按钮自己处理
   *     （按钮的 click 监听器会调用 stopPropagation 阻止冒泡到 IG）
   *   - 如果 target 不是按钮（音量条、进度条、空白区域）：拦截，阻止事件继续传播
   */
  const CLICK_EVENTS = ['click', 'dblclick'] as const
  const blockClickCapture = (e: Event): void => {
    const target = e.target
    if (target instanceof Element && target.closest('button, [role="button"], .irc-speed-option')) {
      return // 让按钮自己处理（用 Element 兼容 SVG 图标）
    }
    e.stopPropagation()
    e.preventDefault()
  }
  for (const evName of CLICK_EVENTS) {
    bar.addEventListener(evName, blockClickCapture, { capture: true, signal: sig })
    speedMenu.addEventListener(evName, blockClickCapture, { capture: true, signal: sig })
  }

  // click 额外处理：关闭速度菜单（在 stopPropagation 之后的同一监听器中）
  bar.addEventListener(
    'click',
    (e) => {
      if (!isElementInDocument(e.target, bar.ownerDocument)) return
      if (!e.target.closest('.irc-speed-wrap, .irc-speed-menu')) closeSpeedMenu()
    },
    { signal: sig },
  )

  // pointerdown 额外处理：刷新控件可见性
  bar.addEventListener(
    'pointerdown',
    () => {
      visibility.activity()
    },
    { signal: sig },
  )
}

function bindVideoSyncEvents(
  video: HTMLVideoElement,
  sync: SyncHandlers,
  tickLoop: TickLoop,
  preferences: PreferenceStore,
  guard: VolumeChangeGuard,
  sig: AbortSignal,
): void {
  video.addEventListener('play', sync.updatePlayButton, { signal: sig })
  video.addEventListener('pause', sync.updatePlayButton, { signal: sig })
  video.addEventListener('durationchange', sync.updateSeek, { signal: sig })
  video.addEventListener('volumechange', sync.updateMute, { signal: sig })

  video.addEventListener(
    'play',
    () => {
      tickLoop.start()
    },
    { signal: sig },
  )

  video.addEventListener(
    'pause',
    () => {
      tickLoop.stop()
    },
    { signal: sig },
  )

  /**
   * 强制应用插件偏好到视频元素（忽略任何「外部」改变 video.volume/muted 的行为）
   *
   * ⚠️ 关键前置判断：
   *   1. muted 状态：只有在用户「交互过」插件后，才允许强制把静音解除到非静音
   *      新视频刚加载时（currentTime < 0.5s）不强制非静音
   *   2. volume 大小：用户交互过即可恢复音量，无论是否是新视频
   *      （volume 恢复不违反 autoplay 策略，只有 unmute 会违反）
   */
  const enforcePluginPreferences = (): void => {
    if (guard.skipNextVolumeChanges > 0) {
      guard.skipNextVolumeChanges--
      return
    }
    const snapshot = preferences.getSnapshot()
    // 新视频刚加载（currentTime < 0.5s），不强制非静音，避免浏览器 autoplay 阻止
    const isNewVideo = video.currentTime < 0.5
    let needReapply = false
    // 1. muted 状态：只有交互过且不是新视频才允许强制非静音；始终允许强制静音
    const allowUnmute = snapshot.userInteracted && !isNewVideo
    const willChangeMuted = video.muted !== snapshot.muted && (snapshot.muted || allowUnmute)
    if (willChangeMuted) needReapply = true
    // 2. volume 大小：用户交互过即可恢复（不违反 autoplay 策略）
    let willChangeVolume = false
    if (snapshot.userInteracted && !snapshot.muted) {
      if (Math.abs(video.volume - snapshot.volume) > 0.0001) {
        willChangeVolume = true
        needReapply = true
      }
    }

    if (needReapply) {
      // 先加 guard，再改 video 属性，避免改后再次触发 volumechange 导致死循环
      let changes = 0
      if (willChangeMuted) changes++
      if (willChangeVolume) changes++
      if (changes > 0) guard.skipNextVolumeChanges += changes
      if (willChangeMuted) video.muted = snapshot.muted
      if (willChangeVolume) video.volume = snapshot.volume
    }
  }

  /**
   * 在播放时延迟尝试恢复音量和取消静音
   *
   * 处理 IG 在以下场景将 video.volume 重置为 0 的问题：
   *   1. Viewer 连播到新视频 → IG 设置 volume=0, muted=true（autoplay 策略）
   *   2. 拖动进度条 seek → IG 内部重置 volume=0
   *   3. 点击静音按钮 → IG 异步重置 volume=0
   *
   * 延迟 300ms 等视频播放稳定后再恢复：
   *   - 恢复音量到用户保存的水平
   *   - 如果需要，同时取消静音
   *   - 如果浏览器阻止非静音，自动回退到静音并重新播放
   */
  let unmuteRetryTimer: ReturnType<typeof setTimeout> | null = null
  const tryUnmuteAfterPlay = (): void => {
    const snapshot = preferences.getSnapshot()
    if (!snapshot.userInteracted || snapshot.muted) return

    // 取消之前的重试定时器
    if (unmuteRetryTimer) clearTimeout(unmuteRetryTimer)

    // 延迟 300ms 恢复音量和取消静音
    unmuteRetryTimer = setTimeout(() => {
      unmuteRetryTimer = null
      if (video.paused) return

      // 判断需要恢复什么：音量 / 静音状态
      const targetVolume = snapshot.volume > 0 ? snapshot.volume : 0.5
      const needVolumeRestore = Math.abs(video.volume - targetVolume) > 0.0001
      const needUnmute = video.muted

      // 如果都不需要恢复，直接返回
      if (!needVolumeRestore && !needUnmute) return

      // 先恢复音量（如果需要）
      if (needVolumeRestore) {
        guard.skipNextVolumeChanges++
        video.volume = targetVolume
      }

      // 再取消静音（如果需要）
      if (needUnmute) {
        guard.skipNextVolumeChanges++
        video.muted = false
      }

      // 检查浏览器是否阻止非静音播放（视频是否被暂停）
      setTimeout(() => {
        if (video.paused && !video.muted) {
          // 浏览器阻止了非静音播放，改回静音并重新播放
          guard.skipNextVolumeChanges++
          video.muted = true
          void video.play().catch(() => undefined)
        }
      }, 100)
    }, 300)
  }

  // volumechange：强制以插件偏好为准（但新视频不强制非静音）
  video.addEventListener('volumechange', enforcePluginPreferences, { signal: sig })
  // play：延迟尝试取消静音（不立即强制，避免浏览器阻止播放）
  video.addEventListener('play', tryUnmuteAfterPlay, { signal: sig })

  // 清理定时器
  sig.addEventListener(
    'abort',
    () => {
      if (unmuteRetryTimer) {
        clearTimeout(unmuteRetryTimer)
        unmuteRetryTimer = null
      }
    },
    { once: true },
  )
}

function bindPlayButton(
  video: HTMLVideoElement,
  playBtn: HTMLButtonElement,
  sig: AbortSignal,
): void {
  playBtn.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      e.preventDefault()
      if (video.paused) void video.play()
      else video.pause()
    },
    { signal: sig },
  )
}

function bindSeekEvents(
  video: HTMLVideoElement,
  seekTrack: HTMLDivElement,
  seekFill: HTMLDivElement,
  seekThumb: HTMLDivElement,
  timeLabel: HTMLSpanElement,
  sync: SyncHandlers,
  visibility: ControlsVisibilityMachine,
  sig: AbortSignal,
): void {
  let wasPlaying = false

  function seekToPointer(e: PointerEvent): void {
    const rect = seekTrack.getBoundingClientRect()
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    if (video.duration) {
      video.currentTime = (pct / 100) * video.duration
      setSliderPosition(seekFill, seekThumb, pct)
      timeLabel.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`
    }
  }

  seekTrack.addEventListener(
    'pointerdown',
    (e) => {
      e.stopPropagation()
      e.preventDefault()
      sync.scrubbing = true
      visibility.pin('scrubbing')
      wasPlaying = !video.paused
      if (wasPlaying) video.pause()
      seekToPointer(e)
      seekTrack.setPointerCapture(e.pointerId)
    },
    { signal: sig },
  )

  seekTrack.addEventListener(
    'pointermove',
    (e) => {
      if (sync.scrubbing) {
        e.stopPropagation()
        e.preventDefault()
        seekToPointer(e)
      }
    },
    { signal: sig },
  )

  const endSeekDrag = (e: PointerEvent) => {
    if (sync.scrubbing) {
      e.stopPropagation()
      e.preventDefault()
      sync.scrubbing = false
      seekTrack.releasePointerCapture(e.pointerId)
      if (wasPlaying) void video.play()
      visibility.unpin('scrubbing')
    }
  }

  seekTrack.addEventListener('pointerup', endSeekDrag, { signal: sig })
  seekTrack.addEventListener('pointercancel', endSeekDrag, { signal: sig })
}

function bindSpeedEvents(
  bar: HTMLDivElement,
  video: HTMLVideoElement,
  speedBtn: HTMLButtonElement,
  speedMenu: HTMLDivElement,
  speedOptions: HTMLDivElement[],
  preferences: PreferenceStore,
  visibility: ControlsVisibilityMachine,
  sig: AbortSignal,
): void {
  const updateMenuPosition = (): void => {
    positionSpeedMenu(bar, speedBtn, speedMenu)
  }

  bar.ownerDocument.defaultView?.addEventListener('resize', updateMenuPosition, { signal: sig })

  speedBtn.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      e.preventDefault()
      const shouldOpenMenu = speedMenu.hidden !== false
      setSpeedMenuOpen(speedMenu, visibility, shouldOpenMenu, updateMenuPosition)
    },
    { signal: sig },
  )

  speedOptions.forEach((opt) => {
    opt.addEventListener(
      'click',
      (e) => {
        e.stopPropagation()
        e.preventDefault()
        const speed = parseFloat(opt.dataset.speed ?? '1')
        video.playbackRate = speed
        preferences.setSpeed(speed)
        speedBtn.textContent = opt.textContent
        speedOptions.forEach((option) => {
          option.classList.remove('irc-speed-active')
        })
        opt.classList.add('irc-speed-active')
        setSpeedMenuOpen(speedMenu, visibility, false)
        preferences.save()
      },
      { signal: sig },
    )
  })
}

function bindMuteEvents(
  video: HTMLVideoElement,
  muteBtn: HTMLButtonElement,
  sync: SyncHandlers,
  preferences: PreferenceStore,
  guard: VolumeChangeGuard,
  sig: AbortSignal,
): void {
  muteBtn.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      e.preventDefault()

      const snapshot = preferences.getSnapshot()
      preferences.markUserInteracted()

      // 先计算需要跳过的 volumechange 次数
      let eventsToSkip = 0
      if (video.muted || video.volume === 0) eventsToSkip++
      eventsToSkip++
      // ⚠️ 关键顺序：先加 guard，再改 video 属性
      guard.skipNextVolumeChanges += eventsToSkip

      // 检查 video.volume（实际视频音量）是否为 0，而不是保存的 snapshot.volume
      // Instagram 自动播放时 video.volume 通常为 0，需要先设置一个非零值才能恢复声音
      if (video.muted || video.volume === 0) {
        const restoreVolume = snapshot.volume > 0 ? snapshot.volume : 0.5
        preferences.setVolume(restoreVolume)
        video.volume = restoreVolume
      }

      const newMuted = !video.muted
      preferences.setMuted(newMuted)
      video.muted = newMuted
      sync.updateMute()
      preferences.save()
    },
    { signal: sig },
  )
}

function bindVolumeEvents(
  video: HTMLVideoElement,
  volTrack: HTMLDivElement,
  volFill: HTMLDivElement,
  volThumb: HTMLDivElement,
  preferences: PreferenceStore,
  visibility: ControlsVisibilityMachine,
  guard: VolumeChangeGuard,
  sig: AbortSignal,
): void {
  function volToPointer(e: PointerEvent): void {
    const rect = volTrack.getBoundingClientRect()
    const vol = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))

    preferences.markUserInteracted()
    preferences.setVolume(vol)
    const newMuted = vol === 0
    preferences.setMuted(newMuted)

    // 同时设置 volume 和 muted 会触发两次 volumechange
    guard.skipNextVolumeChanges += 2
    video.volume = vol
    video.muted = newMuted
    setSliderPosition(volFill, volThumb, vol * 100)
  }

  let volDragging = false

  volTrack.addEventListener(
    'pointerdown',
    (e) => {
      e.stopPropagation()
      e.preventDefault()
      volDragging = true
      visibility.pin('volume-drag')
      volToPointer(e)
      volTrack.setPointerCapture(e.pointerId)
    },
    { signal: sig },
  )

  volTrack.addEventListener(
    'pointermove',
    (e) => {
      // 关键：pointermove 也需要 stopPropagation，否则拖拽滑块时事件会冒泡到 IG
      if (volDragging) {
        e.stopPropagation()
        e.preventDefault()
        volToPointer(e)
      }
    },
    { signal: sig },
  )

  const endVolDrag = (e: PointerEvent) => {
    if (volDragging) {
      // 关键：pointerup/pointercancel 也需要 stopPropagation
      e.stopPropagation()
      e.preventDefault()
      volDragging = false
      volTrack.releasePointerCapture(e.pointerId)
      preferences.save()
      visibility.unpin('volume-drag')
    }
  }

  volTrack.addEventListener('pointerup', endVolDrag, { signal: sig })
  volTrack.addEventListener('pointercancel', endVolDrag, { signal: sig })
  volTrack.addEventListener(
    'click',
    (e) => {
      e.stopPropagation()
      e.preventDefault()
    },
    { signal: sig },
  )
}

interface WireEventsOptions {
  initiallyVisible?: boolean
  eventRoot?: HTMLElement
}

export function wireEvents(
  video: HTMLVideoElement,
  els: ControlElements,
  sync: SyncHandlers,
  tickLoop: TickLoop,
  preferences: PreferenceStore,
  sig: AbortSignal,
  options: WireEventsOptions = {},
): VolumeChangeGuard {
  const visibility = createControlsVisibilityMachine(
    els.bar,
    sig,
    options.initiallyVisible ? { initiallyVisible: true } : {},
  )

  /** 每个视频实例独立的音量变化守卫（由外部创建，共享给 applyControlPreferences） */
  const volumeGuard: VolumeChangeGuard = { skipNextVolumeChanges: 0 }

  // 确定事件监听根节点：优先使用传入的 eventRoot，其次使用 video.parentElement，最后用 video 自身
  // Feed 模式下 eventRoot 可能为 null 或不稳定，需要 fallback 到 video.parentElement 或 video
  // 使用 parentElement 作为主要 fallback，因为它通常是视频的容器，能正确接收鼠标事件
  const eventRoot: HTMLElement = options.eventRoot ?? video.parentElement ?? video

  bindVisibilityEvents(els.bar, eventRoot, els.speedMenu, visibility, sig)
  bindKeyboardSeekEvents(video, eventRoot, sig)
  bindBarEvents(els.bar, els.speedMenu, visibility, sig)
  bindVideoSyncEvents(video, sync, tickLoop, preferences, volumeGuard, sig)
  bindPlayButton(video, els.playBtn, sig)
  bindSeekEvents(
    video,
    els.seekTrack,
    els.seekFill,
    els.seekThumb,
    els.timeLabel,
    sync,
    visibility,
    sig,
  )
  bindSpeedEvents(
    els.bar,
    video,
    els.speedBtn,
    els.speedMenu,
    els.speedOptions,
    preferences,
    visibility,
    sig,
  )
  bindMuteEvents(video, els.muteBtn, sync, preferences, volumeGuard, sig)
  bindVolumeEvents(
    video,
    els.volTrack,
    els.volFill,
    els.volThumb,
    preferences,
    visibility,
    volumeGuard,
    sig,
  )

  return volumeGuard
}
