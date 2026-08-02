import type { PreferenceStore } from './types'
import { findAdjacentInstagramReel, scrollInstagramReelIntoView } from './instagram'

const AUTOPLAY_ACTIVE_CLASS = 'irc-control-active'
const autoplayButtons = new Set<HTMLButtonElement>()

interface AutoplayAdvanceOptions {
  canAdvance?: (targetVideo: HTMLVideoElement) => boolean
  onAdvance?: (targetVideo: HTMLVideoElement) => Promise<boolean | undefined> | boolean | undefined
  shouldHandle?: () => boolean
}

function setAutoplayButtonState(button: HTMLButtonElement, enabled: boolean): void {
  button.classList.toggle(AUTOPLAY_ACTIVE_CLASS, enabled)
  button.setAttribute('aria-pressed', enabled ? 'true' : 'false')
  button.setAttribute('aria-label', 'Autoplay')
  button.title = 'Autoplay'
}

function syncAutoplayButtons(enabled: boolean): void {
  autoplayButtons.forEach((button) => {
    if (!button.isConnected) {
      autoplayButtons.delete(button)
      return
    }

    setAutoplayButtonState(button, enabled)
  })
}

export function bindAutoplayButton(
  button: HTMLButtonElement,
  preferences: PreferenceStore,
  signal: AbortSignal,
): void {
  autoplayButtons.add(button)
  setAutoplayButtonState(button, preferences.getSnapshot().autoplayNext)

  button.addEventListener(
    'click',
    (event) => {
      event.stopPropagation()
      event.preventDefault()

      const enabled = !preferences.getSnapshot().autoplayNext
      preferences.setAutoplayNext(enabled)
      syncAutoplayButtons(enabled)
      preferences.save()
    },
    { signal },
  )

  signal.addEventListener(
    'abort',
    () => {
      autoplayButtons.delete(button)
    },
    { once: true },
  )
}

/**
 * 查找下一个要播放的视频
 *
 * 策略：
 *   1. 标准路径：findAdjacentInstagramReel（Reels 页面，DOM 里有多个完整尺寸 video）
 *   2. Viewer 宽松路径：dialog 内找所有 video（不要求 offsetWidth > 200），
 *      按位置排序找当前视频后面的第一个
 */
export function findAutoplayNextReel(
  video: HTMLVideoElement,
  options: Pick<AutoplayAdvanceOptions, 'canAdvance'> = {},
): HTMLVideoElement | null {
  // 标准路径：Reels 页面用这条，DOM 里同时存在多个完整尺寸的 video
  const targetVideo = findAdjacentInstagramReel(video, 'next')
  if (targetVideo) {
    if (options.canAdvance && !options.canAdvance(targetVideo)) return null
    return targetVideo
  }

  // Viewer 宽松路径：dialog 内可能有下一个 video，但 offsetWidth < 200 被标准过滤排除了
  const viewerScope = video.closest('[role="dialog"]') ?? video.closest('[aria-modal="true"]')
  if (viewerScope) {
    const allVideos = Array.from(viewerScope.querySelectorAll<HTMLVideoElement>('video')).filter(
      (v) => v !== video && (v.offsetHeight > 0 || v.clientHeight > 0),
    )

    const currentRect = video.getBoundingClientRect()
    // 按位置排序，找当前视频"后面"的第一个
    const sorted = allVideos.sort((a, b) => {
      const aRect = a.getBoundingClientRect()
      const bRect = b.getBoundingClientRect()
      // 横向排列按 left 排序，纵向按 top 排序
      if (Math.abs(aRect.top - bRect.top) < 50) {
        return aRect.left - bRect.left
      }
      return aRect.top - bRect.top
    })

    for (const v of sorted) {
      const vRect = v.getBoundingClientRect()
      // 在当前视频右边（横向）或下面（纵向）
      if (vRect.left > currentRect.left + 50 || vRect.top > currentRect.top + 50) {
        if (options.canAdvance && !options.canAdvance(v)) continue
        return v
      }
    }
  }

  return null
}

/**
 * 点击 Instagram 原生"下一个"按钮（Viewer 懒加载，DOM 里只有当前 1 个 video 时使用）
 *
 * 策略：
 *   1. aria-label 精确匹配（多语言）
 *   2. 位置评分找到右侧导航按钮
 *
 * 用简单的 button.click()，不模拟 PointerEvent 事件链
 * （React 合成事件对 click() 的支持是可靠的，复杂的事件链反而可能被过滤）
 */
function clickInstagramNextButton(): boolean {
  // Instagram's viewer navigation button is exposed as "Go to next Reel"
  // ("前往下一条 Reels" in Simplified Chinese), not simply "Next".
  // Prefer that semantic control over proximity: the adjacent action rail
  // contains like, comment, and share buttons that are closer to the video.
  const selectors = [
    'button[aria-label*="下一条 Reels"]',
    'button[aria-label*="next reel" i]',
    'button[aria-label="下一个"]',
    'button[aria-label="Next"]',
    'button[aria-label="Next post"]',
    'button[aria-label="下一則"]',
    'button[aria-label="下一张"]',
    'button[aria-label="다음"]',
    'button[aria-label="次へ"]',
  ]

  // Step 1: aria-label 精确匹配
  for (const selector of selectors) {
    const button = document.querySelector<HTMLButtonElement>(selector)
    if (button && !button.disabled && button.offsetWidth > 0) {
      button.click()
      return true
    }
  }

  return false
}

function waitForNextViewerButton(): Promise<boolean> {
  const maxWaitMs = 2500
  const intervalMs = 100

  return new Promise((resolve) => {
    let elapsed = 0

    const check = (): void => {
      if (clickInstagramNextButton()) {
        resolve(true)
        return
      }

      elapsed += intervalMs
      if (elapsed >= maxWaitMs) {
        resolve(false)
        return
      }

      setTimeout(check, intervalMs)
    }

    check()
  })
}

/**
 * 在视口中找到最靠近中心的视频（用于 IG 原生导航后定位新视频）
 *
 * 优先在 Viewer（dialog）内查找，避免找到 feed 流中的背景视频
 */
function findMostCenteredVisibleVideo(): HTMLVideoElement | null {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const cx = vw / 2
  const cy = vh / 2

  const calcDist = (vid: HTMLVideoElement): number | null => {
    try {
      const rect = vid.getBoundingClientRect()
      const h = vid.offsetHeight || vid.clientHeight
      if (rect.right < 0 || rect.left > vw || rect.bottom < 0 || rect.top > vh) return null
      if (h < 50) return null
      const dx = rect.left + rect.width / 2 - cx
      const dy = rect.top + rect.height / 2 - cy
      return dx * dx + dy * dy
    } catch {
      return null
    }
  }

  const findClosest = (videos: HTMLVideoElement[]): HTMLVideoElement | null => {
    let best: HTMLVideoElement | null = null
    let bestDist = Infinity
    for (const v of videos) {
      const d = calcDist(v)
      if (d !== null && d < bestDist) {
        bestDist = d
        best = v
      }
    }
    return best
  }

  // 优先在 Viewer 内查找
  const viewer =
    document.querySelector('[role="dialog"]') ?? document.querySelector('[aria-modal="true"]')
  if (viewer) {
    const best = findClosest(Array.from(viewer.querySelectorAll<HTMLVideoElement>('video')))
    if (best) return best
  }

  // 其次在 main 内查找（Reels Tab）
  const main = document.querySelector('main')
  if (main) {
    const best = findClosest(Array.from(main.querySelectorAll<HTMLVideoElement>('video')))
    if (best) return best
  }

  // 最后搜索整个 document
  return findClosest(Array.from(document.querySelectorAll<HTMLVideoElement>('video')))
}

/**
 * 连播到下一个 Reel
 *
 * 核心路径（和 Reels 页面一样）：找到下一个 video → scrollIntoView + play
 * Fallback 路径：DOM 里找不到下一个 video → 点击 IG 原生按钮 → 等待新视频出现 → play
 */
export async function advanceToNextReel(
  video: HTMLVideoElement,
  options: AutoplayAdvanceOptions = {},
): Promise<boolean> {
  const targetVideo = findAutoplayNextReel(video, options)

  // 核心路径：找到了下一个 video，直接 scrollIntoView + play
  if (targetVideo) {
    if (options.canAdvance && !options.canAdvance(targetVideo)) return false

    try {
      if ((await options.onAdvance?.(targetVideo)) === false) return false
    } catch {
      return false
    }

    scrollInstagramReelIntoView(targetVideo)

    try {
      await targetVideo.play()
    } catch {
      // Autoplay can be blocked; still advance the visible reel
    }

    return true
  }

  // Fallback：Viewer 懒加载时只有当前 video。原生“下一条 Reels”按钮有时会在
  // 视频结束后才挂载，因此只轮询这个语义明确的按钮；不会猜测或点击 Feed 操作按钮。
  const clicked = await waitForNextViewerButton()
  if (!clicked) return false

  // 等待 IG 切换后新视频出现在视口中，找到后 play
  await new Promise<void>((resolve) => {
    const maxWaitMs = 2500
    const intervalMs = 100
    let elapsed = 0

    const check = (): void => {
      const centered = findMostCenteredVisibleVideo()
      if (centered && centered !== video) {
        if (!options.canAdvance || options.canAdvance(centered)) {
          try {
            void centered.play().catch(() => undefined)
          } catch {
            // 忽略
          }
        }
        resolve()
        return
      }
      elapsed += intervalMs
      if (elapsed >= maxWaitMs) {
        resolve()
        return
      }
      setTimeout(check, intervalMs)
    }

    setTimeout(check, intervalMs)
  })

  return true
}

/**
 * 绑定连播事件
 *
 * 监听：
 *   1. ended 事件 — 非 loop 视频播放结束时触发
 *   2. timeupdate 事件 — loop 视频接近结尾时触发（loop 视频不触发 ended）
 *   3. 50ms 兜底轮询 — timeupdate 150-250ms 才触发一次，可能漏过触发窗口
 */
export function bindAutoplayNextReel(
  video: HTMLVideoElement,
  preferences: PreferenceStore,
  signal: AbortSignal,
  options: AutoplayAdvanceOptions = {},
): void {
  let advancing = false
  let pollTimer: ReturnType<typeof setInterval> | null = null

  /** 触发连播的统一入口（防止重复触发） */
  const triggerAdvance = (): void => {
    if (!preferences.getSnapshot().autoplayNext || advancing || options.shouldHandle?.() === false)
      return

    advancing = true
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    void advanceToNextReel(video, options).finally(() => {
      // 延迟重置，防止切换后的新视频立即触发
      setTimeout(() => {
        advancing = false
      }, 500)
    })
  }

  // 监听 1: ended 事件（非 loop 视频才会触发）
  video.addEventListener('ended', triggerAdvance, { signal })

  // 监听 2: timeupdate（loop 视频永远不会触发 ended，需要主动检测接近结尾）
  video.addEventListener(
    'timeupdate',
    () => {
      if (!video.duration || video.duration < 1) return
      // 距离结尾 0.5s 内启动兜底轮询
      if (video.currentTime >= video.duration - 0.5 && !pollTimer) {
        pollTimer = setInterval(() => {
          if (!video.isConnected) {
            if (pollTimer) {
              clearInterval(pollTimer)
              pollTimer = null
            }
            return
          }
          if (!video.duration || video.duration < 1) return
          // 距离结尾 0.2s 内触发连播
          if (video.currentTime >= video.duration - 0.2) {
            triggerAdvance()
          }
        }, 50)
      }
      // timeupdate 本身也检查
      if (video.currentTime >= video.duration - 0.2) {
        triggerAdvance()
      }
    },
    { signal },
  )

  // 清理：AbortSignal 触发时停止轮询
  signal.addEventListener(
    'abort',
    () => {
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
    },
    { once: true },
  )
}
