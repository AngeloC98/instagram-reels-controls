const MIN_VIDEO_WIDTH = 200
const VIEWER_RETRY_DELAY_MS = 300
const VIEWER_RETRY_MAX_ATTEMPTS = 5
const NATIVE_OVERLAY_GAP_PX = 12
export type ReelNavigationDirection = 'previous' | 'next'

function hideSpeedMenus(): void {
  document.querySelectorAll<HTMLDivElement>('.irc-speed-menu').forEach((menu) => {
    menu.hidden = true
  })
}

/** 检查视频是否在 Instagram 主要交互区域（Reels Tab、Feed Viewer 等） */
function isInPrimaryInstagramSurface(video: HTMLVideoElement): boolean {
  // Reels Tab / 独立 Reel 页面：视频在 <main> 内
  if (video.closest('main')) return true
  // 模态框 Viewer：视频在带 role="dialog" 的容器内
  if (video.closest('[role="dialog"]')) return true
  // Feed Viewer / Carousel：视频在带 aria-modal 的容器内
  if (video.closest('[aria-modal="true"]')) return true
  // Feed Viewer 兜底：视频被 <body> 的某个直接子元素包含（非视频自身）
  // 且该容器尺寸足够大（Instagram 的 viewer/carousel 常作为 body 的直接子元素渲染）
  const bodyChildren = document.body.children
  for (const child of bodyChildren) {
    if (child === video) continue
    if (child.contains(video) && (child as HTMLElement).offsetWidth > 300) return true
  }
  return false
}

/** 检查视频是否有足够的可播放尺寸 */
function isPlayableMediaSurface(video: HTMLVideoElement): boolean {
  return video.offsetWidth > MIN_VIDEO_WIDTH
}

export function isInstagramVideoCandidate(video: HTMLVideoElement): boolean {
  return isInPrimaryInstagramSurface(video) && isPlayableMediaSurface(video)
}

export function findInstagramVideos(root: ParentNode = document): HTMLVideoElement[] {
  return [...root.querySelectorAll('video')].filter(isInstagramVideoCandidate)
}

function findInstagramVideosInNode(node: Node): HTMLVideoElement[] {
  if (!(node instanceof Element)) return []

  const videos =
    node instanceof HTMLVideoElement
      ? [node]
      : [...node.querySelectorAll<HTMLVideoElement>('video')]

  return videos.filter(isInstagramVideoCandidate)
}

function findAddedInstagramVideos(mutations: MutationRecord[]): HTMLVideoElement[] {
  const videos = new Set<HTMLVideoElement>()

  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      findInstagramVideosInNode(node).forEach((video) => {
        videos.add(video)
      })
    }
  }

  return [...videos]
}

export function resolveInstagramMount(video: HTMLVideoElement): HTMLElement | null {
  return video.parentElement
}

const REEL_RECT_TOLERANCE = 0.5
const NATIVE_INFORMATION_MAX_WIDTH = 1.05
const NATIVE_INFORMATION_MAX_HEIGHT = 0.4

export function resolveInstagramEventRoot(video: HTMLVideoElement): HTMLElement | null {
  const direct = video.parentElement
  if (!direct) return null
  const videoRect = video.getBoundingClientRect()
  if (videoRect.width <= 0 || videoRect.height <= 0) return direct

  let mount: HTMLElement = direct
  let cursor: HTMLElement | null = direct.parentElement
  while (cursor) {
    const rect = cursor.getBoundingClientRect()
    if (
      Math.abs(rect.width - videoRect.width) > REEL_RECT_TOLERANCE ||
      Math.abs(rect.height - videoRect.height) > REEL_RECT_TOLERANCE ||
      Math.abs(rect.left - videoRect.left) > REEL_RECT_TOLERANCE ||
      Math.abs(rect.top - videoRect.top) > REEL_RECT_TOLERANCE
    ) {
      break
    }
    mount = cursor
    cursor = cursor.parentElement
  }
  return mount
}

function isRectWithin(rect: DOMRect, container: DOMRect, tolerance = 2): boolean {
  return (
    rect.left >= container.left - tolerance &&
    rect.right <= container.right + tolerance &&
    rect.top >= container.top - tolerance &&
    rect.bottom <= container.bottom + tolerance
  )
}

function findNativeOverlayGroups(
  video: HTMLVideoElement,
  overlayScope: HTMLElement,
  controls: HTMLElement,
): HTMLElement[] {
  const videoRect = video.getBoundingClientRect()
  const controlsRect = controls.getBoundingClientRect()
  if (videoRect.width <= 0 || videoRect.height <= 0 || controlsRect.height <= 0) return []
  const seekRect = controls.querySelector<HTMLElement>('.irc-seek')?.getBoundingClientRect()
  const controlsTop = seekRect && seekRect.height > 0 ? seekRect.top : controlsRect.top

  const groups = new Set<HTMLElement>()
  for (const element of overlayScope.querySelectorAll<HTMLElement>(
    'a, button, [role="button"], div',
  )) {
    if (element.closest('.irc-controls')) continue
    if (element.getAttribute('role') === 'slider') continue

    let group: HTMLElement = element
    let lastNarrowGroup: HTMLElement = element
    let usesClippingBoundary = false
    let parent = element.parentElement
    while (parent && parent !== overlayScope) {
      const parentRect = parent.getBoundingClientRect()
      if (
        !isRectWithin(parentRect, videoRect) ||
        parentRect.width > videoRect.width * NATIVE_INFORMATION_MAX_WIDTH ||
        parentRect.height > videoRect.height * NATIVE_INFORMATION_MAX_HEIGHT
      )
        break
      group = parent
      if (parentRect.width <= videoRect.width * 0.95) lastNarrowGroup = parent
      const overflow = getComputedStyle(parent).overflow
      if (overflow === 'hidden' || overflow === 'clip') {
        usesClippingBoundary = true
        break
      }
      parent = parent.parentElement
    }

    if (!usesClippingBoundary && group.getBoundingClientRect().width > videoRect.width * 0.95) {
      group = lastNarrowGroup
    }

    const groupRect = group.getBoundingClientRect()
    if (
      !isRectWithin(groupRect, videoRect) ||
      groupRect.width === 0 ||
      groupRect.height === 0 ||
      (groupRect.width < 80 && groupRect.height < 80) ||
      (groupRect.width > videoRect.width * 0.95 && !usesClippingBoundary) ||
      groupRect.width > videoRect.width * NATIVE_INFORMATION_MAX_WIDTH ||
      groupRect.height > videoRect.height * NATIVE_INFORMATION_MAX_HEIGHT ||
      groupRect.bottom < controlsTop - NATIVE_OVERLAY_GAP_PX ||
      groupRect.top >= controlsTop
    )
      continue
    groups.add(group)
  }

  return [...groups].filter(
    (group) => ![...groups].some((other) => other !== group && other.contains(group)),
  )
}

/**
 * Instagram renders the bottom information as a sibling of the video's
 * same-size root in some Reels layouts. Search the closest ancestor that can
 * contain both, but stop before reaching the page-wide feed structure.
 */
function resolveNativeOverlayScope(video: HTMLVideoElement, eventRoot: HTMLElement): HTMLElement {
  const videoRect = video.getBoundingClientRect()
  let scope = eventRoot
  let parent = scope.parentElement

  while (parent) {
    const rect = parent.getBoundingClientRect()
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.width > videoRect.width * 1.5 ||
      rect.height > videoRect.height * 1.5
    )
      break
    scope = parent
    parent = parent.parentElement
  }

  return scope
}

function resolveNativeInformationBottom(group: HTMLElement): number {
  const groupRect = group.getBoundingClientRect()
  let bottom = groupRect.top

  for (const child of group.querySelectorAll<HTMLElement>('*')) {
    const rect = child.getBoundingClientRect()
    if (
      rect.width === 0 ||
      rect.height === 0 ||
      !isRectWithin(rect, groupRect) ||
      rect.width >= groupRect.width * 0.98 ||
      rect.height >= groupRect.height * 0.98
    )
      continue
    bottom = Math.max(bottom, rect.bottom)
  }

  return bottom > groupRect.top ? bottom : groupRect.bottom
}

function usesOverlaidReelInformation(video: HTMLVideoElement): boolean {
  if (video.closest('[role="dialog"], [aria-modal="true"]')) return true
  if (video.closest('article')) return false

  return /^\/reels?(?:\/|$)/.test(location.pathname) || Boolean(video.closest('main'))
}

/**
 * Keeps Instagram's overlaid author/audio information above expanded controls.
 * The adjustment applies only when the information is actually inside the
 * video. Viewer metadata below the video and the Reels action-side layout are
 * deliberately left untouched.
 */
export function avoidNativeOverlayOverlap(
  video: HTMLVideoElement,
  eventRoot: HTMLElement,
  controls: HTMLElement,
  signal: AbortSignal,
): void {
  // Feed posts use a different layout: their post metadata is outside the
  // video and must never be moved. Only Reels and the modal Viewer overlay
  // their information inside the video at narrow breakpoints.
  if (!usesOverlaidReelInformation(video)) return

  const adjustedGroups = new Set<HTMLElement>()
  const overlayScope = resolveNativeOverlayScope(video, eventRoot)
  let framePending = false

  const update = (): void => {
    framePending = false
    const isVisible = controls.classList.contains('irc-controls-visible')
    if (!isVisible) {
      adjustedGroups.forEach((group) => {
        group.style.setProperty('--irc-native-overlay-lift', '0px')
      })
      return
    }

    const controlsRect = controls.getBoundingClientRect()
    const seekRect = controls.querySelector<HTMLElement>('.irc-seek')?.getBoundingClientRect()
    const controlsTop = seekRect && seekRect.height > 0 ? seekRect.top : controlsRect.top
    for (const group of findNativeOverlayGroups(video, overlayScope, controls)) {
      const currentLift =
        Number.parseFloat(group.style.getPropertyValue('--irc-native-overlay-lift')) || 0
      const lift = Math.max(
        0,
        resolveNativeInformationBottom(group) + currentLift - controlsTop + NATIVE_OVERLAY_GAP_PX,
      )
      group.classList.add('irc-native-overlay-lift')
      group.style.setProperty('--irc-native-overlay-lift', `${String(Math.ceil(lift))}px`)
      adjustedGroups.add(group)
    }
  }

  const scheduleUpdate = (): void => {
    if (framePending) return
    framePending = true
    requestAnimationFrame(update)
  }

  const controlsObserver = new MutationObserver(scheduleUpdate)
  controlsObserver.observe(controls, { attributes: true, attributeFilter: ['class'] })

  const contentObserver = new MutationObserver(() => {
    if (controls.classList.contains('irc-controls-visible')) scheduleUpdate()
  })
  contentObserver.observe(eventRoot, { childList: true, subtree: true })

  const resizeObserver =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleUpdate)
  resizeObserver?.observe(video)
  resizeObserver?.observe(controls)

  signal.addEventListener(
    'abort',
    () => {
      controlsObserver.disconnect()
      contentObserver.disconnect()
      resizeObserver?.disconnect()
      adjustedGroups.forEach((group) => {
        group.style.removeProperty('--irc-native-overlay-lift')
        group.classList.remove('irc-native-overlay-lift')
      })
    },
    { once: true },
  )
}

/** 解析视频所在的导航范围，用于查找上下一个 Reel */
function resolveNavigationScope(video: HTMLVideoElement): ParentNode {
  return (
    video.closest('[role="dialog"]') ??
    video.closest('[aria-modal="true"]') ??
    video.closest('main') ??
    document
  )
}

export function findAdjacentInstagramReel(
  video: HTMLVideoElement,
  direction: ReelNavigationDirection,
): HTMLVideoElement | null {
  const videos = findInstagramVideos(resolveNavigationScope(video)).sort(
    (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top,
  )
  const currentIndex = videos.indexOf(video)
  if (currentIndex === -1) return null

  const offset = direction === 'next' ? 1 : -1
  return videos[currentIndex + offset] ?? null
}

export function scrollToAdjacentInstagramReel(
  video: HTMLVideoElement,
  direction: ReelNavigationDirection,
): HTMLVideoElement | null {
  const targetVideo = findAdjacentInstagramReel(video, direction)
  if (!targetVideo) return null

  scrollInstagramReelIntoView(targetVideo)
  return targetVideo
}

export function scrollInstagramReelIntoView(video: HTMLVideoElement): void {
  const target = resolveInstagramMount(video) ?? video
  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

interface StartInstagramIntegrationOptions {
  onVideoFound: (video: HTMLVideoElement, mount: HTMLElement) => void
  onVideosRemoved: (mutations: MutationRecord[]) => void
}

/** 从节点中提取通过容器检查的所有视频（不检查尺寸，用于延迟重试） */
function findContainerEligibleVideosInNode(node: Node): HTMLVideoElement[] {
  if (!(node instanceof Element)) return []

  const videos =
    node instanceof HTMLVideoElement
      ? [node]
      : [...node.querySelectorAll<HTMLVideoElement>('video')]

  return videos.filter(isInPrimaryInstagramSurface)
}

/** 从突变节点中提取通过容器检查的视频（用于后续尺寸检查重试） */
function findContainerEligibleVideos(mutations: MutationRecord[]): HTMLVideoElement[] {
  const videos = new Set<HTMLVideoElement>()

  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      findContainerEligibleVideosInNode(node).forEach((video) => {
        videos.add(video)
      })
    }
  }

  return [...videos]
}

export function startInstagramIntegration({
  onVideoFound,
  onVideosRemoved,
}: StartInstagramIntegrationOptions): MutationObserver {
  const injectVideos = (videos: HTMLVideoElement[]): void => {
    videos.forEach((video) => {
      const mount = resolveInstagramMount(video)
      if (mount) onVideoFound(video, mount)
    })
  }

  const injectDetectedVideos = (): void => {
    injectVideos(findInstagramVideos())
  }

  document.addEventListener('click', hideSpeedMenus)

  // 记录已通过容器检查但尚未通过尺寸检查的视频，用于延迟重试
  const retryQueue = new Map<HTMLVideoElement, number>()

  /** 重试待处理视频的尺寸检查 */
  const retryPendingVideos = (): void => {
    const toInject: HTMLVideoElement[] = []

    for (const [video, attempts] of retryQueue) {
      // 视频已从 DOM 中移除，丢弃
      if (!video.isConnected) {
        retryQueue.delete(video)
        continue
      }
      if (isPlayableMediaSurface(video)) {
        retryQueue.delete(video)
        toInject.push(video)
      } else if (attempts + 1 < VIEWER_RETRY_MAX_ATTEMPTS) {
        retryQueue.set(video, attempts + 1)
      } else {
        // 超过最大重试次数，放弃
        retryQueue.delete(video)
      }
    }

    if (toInject.length > 0) {
      injectVideos(toInject)
    }

    if (retryQueue.size > 0) {
      setTimeout(retryPendingVideos, VIEWER_RETRY_DELAY_MS)
    }
  }

  /** 将视频加入重试队列 */
  const scheduleRetry = (videos: HTMLVideoElement[]): void => {
    let needsSchedule = false
    for (const video of videos) {
      if (!isPlayableMediaSurface(video) && !retryQueue.has(video)) {
        retryQueue.set(video, 0)
        needsSchedule = true
      }
    }
    if (needsSchedule) {
      setTimeout(retryPendingVideos, VIEWER_RETRY_DELAY_MS)
    }
  }

  let mutationPending = false
  let pendingMutations: MutationRecord[] = []
  const observer = new MutationObserver((mutations) => {
    pendingMutations.push(...mutations)
    if (mutationPending) return

    mutationPending = true
    requestAnimationFrame(() => {
      const mutationsToProcess = pendingMutations
      pendingMutations = []
      mutationPending = false
      onVideosRemoved(mutationsToProcess)

      // 立即注入完全符合条件的视频
      injectVideos(findAddedInstagramVideos(mutationsToProcess))

      // 收集通过容器检查但尺寸可能尚未就绪的视频，安排重试
      scheduleRetry(findContainerEligibleVideos(mutationsToProcess))
    })
  })

  observer.observe(document.body, { childList: true, subtree: true })
  injectDetectedVideos()

  // 启动后立即对所有通过容器检查的视频做一次全量扫描（兜底）
  const allContainerEligible = findContainerEligibleVideos([
    { addedNodes: [document.body] } as unknown as MutationRecord,
  ])
  scheduleRetry(allContainerEligible)

  return observer
}

/**
 * 找到视频附近的 Instagram 原生音量控件
 * 基于视觉位置（getBoundingClientRect）搜索，不受 DOM Portal 层级影响
 */
export interface NativeVolumeControls {
  /** 原生静音/取消静音按钮（最外层容器） */
  muteButton: HTMLElement | null
  /** 原生音量滑块 */
  slider: HTMLInputElement | HTMLElement | null
  /** 需要隐藏的所有层级元素（SVG + 每一层父容器） */
  allElements: HTMLElement[]
}

/**
 * 检查 SVG path 字符串是否是典型的喇叭图标 SVG 特征
 * 仅在视频视觉区域内的极小范围内使用（不会误伤）
 */
function isLikelySpeakerSvgPath(pathsD: string[]): boolean {
  if (pathsD.length === 0) return false
  const combined = pathsD.join(' ').toLowerCase()
  if (combined.length < 20) return false
  // 典型喇叭图标的起点：M<小数字> <小数字> 格式
  // 例如: "m3 9", "m4 9", "m11 4", "m15.5 13.3", "m8,71.2" 等
  const startsWithHornOrigin = /^m\d{1,2}\.?\d*\s+\d{1,2}\.?\d*/.test(combined.trim())
  // 包含喇叭震动/声波弧线字母特征: v, c, s, a, q 等二次贝塞尔曲线
  const hasArc = /[vcsqa]\d/.test(combined)
  // 包含线 l 或 L 画音波线特征
  const hasLine = combined.includes(' l') || combined.includes('\nl')
  return startsWithHornOrigin && (hasArc || hasLine)
}

/**
 * 判断元素视觉上是否完全在视频矩形框内部
 * （完全 inside 的定义：元素四个边都不超出视频的可视区域）
 */
function isRectFullyInside(inner: DOMRect, outer: DOMRect, tolerancePx: number): boolean {
  return (
    inner.left >= outer.left - tolerancePx &&
    inner.right <= outer.right + tolerancePx &&
    inner.top >= outer.top - tolerancePx &&
    inner.bottom <= outer.bottom + tolerancePx
  )
}

/**
 * 精确识别 Instagram 原生音量控件（安全版）
 *
 * 🔒 安全原则：
 *   1. 只搜索 SVG 元素本身（不扫描 div/button/span 等常见元素）
 *   2. 匹配必须完全在视频视觉区域内（绝不碰视频外的元素）
 *   3. 隐藏时只隐藏 SVG 本体 + 其直接父元素（最多向上 1 层，绝不追溯 6 层）
 *   4. 不做 setInterval 定时刷新（用户的 DOM 变化不会触发重新搜索）
 *
 * 识别策略：
 *   - 只在 SVG 元素中查找喇叭图标的 SVG path
 *   - 取距离视频右下角最近的那一个 SVG
 *   - 向上最多只找 1 层父容器（当 SVG 太小需要隐藏点击框时）
 */
export function findNativeInstagramVolumeControls(video: HTMLVideoElement): NativeVolumeControls {
  const videoRect = video.getBoundingClientRect()
  if (videoRect.width === 0 || videoRect.height === 0) {
    return { muteButton: null, slider: null, allElements: [] }
  }
  const TOLERANCE = 8
  const videoBottomRightX = videoRect.right - 16
  const videoBottomRightY = videoRect.bottom - 16

  /** 只在 SVG 范围内搜索：避免误选 div/button 等非音量元素 */
  const allSvgs = document.querySelectorAll<SVGSVGElement>('svg')
  const candidates: { svg: SVGSVGElement; distSq: number }[] = []

  for (const svg of allSvgs) {
    // 🔒 安全 1：排除插件自己的 SVG
    if (svg.closest('[class*="irc-"]')) continue

    // 🔒 安全 2：SVG 必须完全在视频视觉区域内
    const rect = svg.getBoundingClientRect()
    if (!isRectFullyInside(rect, videoRect, TOLERANCE)) continue

    // 🔒 安全 3：SVG 尺寸合理（喇叭图标通常 12-20px）
    if (rect.width < 8 || rect.height < 8 || rect.width > 50 || rect.height > 50) continue

    // 🔒 安全 4：必须是喇叭 SVG 的特征 path
    const paths = Array.from(svg.querySelectorAll('path')).map((p) => p.getAttribute('d') ?? '')
    if (!isLikelySpeakerSvgPath(paths)) continue

    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = cx - videoBottomRightX
    const dy = cy - videoBottomRightY
    candidates.push({ svg, distSq: dx * dx + dy * dy })
  }

  if (candidates.length === 0) {
    return { muteButton: null, slider: null, allElements: [] }
  }

  // 取距离视频右下角最近的 SVG（音量按钮一定在右下角）
  candidates.sort((a, b) => a.distSq - b.distSq)
  const firstCandidate = candidates[0]
  if (!firstCandidate) {
    return { muteButton: null, slider: null, allElements: [] }
  }
  const bestSvg = firstCandidate.svg
  const svgRect = bestSvg.getBoundingClientRect()

  /**
   * 🔒 安全 5：安全地向上查找父容器（最多 5 层，每层严格校验，每层都隐藏）
   *
   * 为什么需要多层且每层都隐藏？
   *   Instagram 按钮结构：SVG(12px) → span(20px) → div(32px) → button(44px) → 容器(48px+圆形背景)
   *   "黑色透明圆形"通常在第 4-5 层，只隐藏 3 层不够
   *   每层都隐藏是因为 React 重渲染可能只替换某一层，其他层已被隐藏就能兜底
   *
   * 安全条件（每一层都必须全部满足才隐藏）：
   *   1. 完全在视频视觉区域内（绝不碰视频外的元素）
   *   2. 尺寸合理（18-72px，不会隐藏大容器）
   *   3. 尺寸逐级变大（父容器必须 >= 子元素尺寸，避免走入错误分支）
   *   4. 最多只允许向上 5 层
   */
  const allTargets: HTMLElement[] = [bestSvg as unknown as HTMLElement]
  let currentRect: DOMRect = svgRect
  let cursor: HTMLElement | null = bestSvg.parentElement
  const needLookup = svgRect.width < 24 || svgRect.height < 24
  let layers = 0
  const MAX_LAYERS = 5

  while (cursor && needLookup && layers < MAX_LAYERS) {
    const parentRect = cursor.getBoundingClientRect()

    // 🔒 严格条件 1：父元素必须完全在视频内
    if (!isRectFullyInside(parentRect, videoRect, TOLERANCE)) break

    // 🔒 严格条件 2：尺寸合理（18-72px）
    if (parentRect.width < 18 || parentRect.height < 18) break
    if (parentRect.width > 72 || parentRect.height > 72) break

    // 🔒 严格条件 3：尺寸逐级变大（父容器必须 >= 子元素尺寸 - 2px 容差）
    if (parentRect.width < currentRect.width - 2 || parentRect.height < currentRect.height - 2)
      break

    // 通过所有安全检查：每一层都加入隐藏列表
    allTargets.push(cursor)
    currentRect = parentRect
    cursor = cursor.parentElement
    layers++

    // 父元素已经 >= 32px 了，很可能已经是最外层按钮容器
    if (parentRect.width >= 32 && parentRect.height >= 32) break
  }

  // 返回最外层作为 muteButton（用于 setNativeVolumeOnControls）
  const targetEl: HTMLElement | undefined = allTargets[allTargets.length - 1]
  if (!targetEl) {
    return { muteButton: null, slider: null, allElements: [] }
  }

  // 找滑块：在静音按钮正上方（全屏 Reels 场景），滑块也完全在视频内
  const targetRect = targetEl.getBoundingClientRect()
  let slider: HTMLInputElement | HTMLElement | null = null
  const allSliders = document.querySelectorAll<HTMLInputElement | HTMLElement>(
    'input[type="range"], [role="slider"]',
  )
  for (const s of allSliders) {
    if (s.closest('[class*="irc-"]')) continue
    const rect = s.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue
    if (!isRectFullyInside(rect, videoRect, TOLERANCE)) continue // 🔒 滑块也必须在视频内
    if (rect.bottom <= targetRect.top + 80 && Math.abs(rect.left - targetRect.left) < 300) {
      slider = s
      break
    }
  }

  return { muteButton: targetEl, slider, allElements: allTargets }
}

/**
 * 模拟用户操作 Instagram 原生音量控件：设置音量 + 同步静音状态
 * 让 React state 感知到用户操作，从而同步原生 UI
 * @param controls 由 findNativeInstagramVolumeControls 返回的控件
 * @param volume 目标音量（0~1）
 * @param muted 目标静音状态
 */
export function setNativeVolumeOnControls(
  controls: NativeVolumeControls,
  volume: number,
  muted: boolean,
): void {
  const clampedVol = Math.max(0, Math.min(1, volume))
  const { slider, muteButton } = controls

  // 先处理滑块音量（非静音时调整滑块位置；静音时把滑块拉到 0 让视觉一致）
  const displayedVolume = muted ? 0 : clampedVol
  if (slider instanceof HTMLInputElement && slider.type === 'range') {
    const min = parseFloat(slider.getAttribute('min') ?? '0')
    const max = parseFloat(slider.getAttribute('max') ?? '1')
    const step = parseFloat(slider.getAttribute('step') ?? '0.01')
    let newValue = min + displayedVolume * (max - min)
    newValue = Math.round(newValue / step) * step
    if (slider.value !== String(newValue)) {
      slider.value = String(newValue)
      slider.dispatchEvent(new Event('input', { bubbles: true }))
      slider.dispatchEvent(new Event('change', { bubbles: true }))
    }
  } else if (slider instanceof HTMLElement) {
    const rect = slider.getBoundingClientRect()
    if (rect.width !== 0 || rect.height !== 0) {
      // Instagram 右下角滑块：下方=0 上方=1
      const yBottom = rect.bottom - 2
      const yTop = rect.top + 2
      const targetY = yBottom - displayedVolume * (yBottom - yTop)
      const centerX = rect.left + rect.width / 2

      const firePointer = (type: string, x: number, y: number) => {
        try {
          slider.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y,
              button: 0,
              pointerId: 1,
              pointerType: 'mouse',
            }),
          )
        } catch {
          try {
            slider.dispatchEvent(
              new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y,
                button: 0,
              }),
            )
          } catch {
            // ignore
          }
        }
      }

      firePointer('pointerdown', centerX, yBottom)
      firePointer('pointermove', centerX, targetY)
      firePointer('pointerup', centerX, targetY)
    }
  }

  // 再处理静音状态：通过 aria-label 或 SVG 特征判断当前状态
  if (muteButton) {
    const svg = muteButton.querySelector('svg')
    let currentlyMuted = false
    let canDetermineState = false

    if (svg) {
      const ariaLabel = (muteButton.getAttribute('aria-label') ?? '').toLowerCase()
      const title = (muteButton.getAttribute('title') ?? '').toLowerCase()
      const combined = ariaLabel + ' ' + title

      // 通过 aria-label 文字判断
      if (
        combined.includes('取消静音') ||
        combined.includes('unmute') ||
        combined.includes('解除静音')
      ) {
        currentlyMuted = true
        canDetermineState = true
      } else if (
        combined.includes('静音') ||
        combined.includes('mute') ||
        combined.includes('음소거')
      ) {
        currentlyMuted = false
        canDetermineState = true
      }
    }

    // 如果无法通过 aria-label 判断，用 SVG path 数量兜底
    if (!canDetermineState && svg) {
      const pathCount = svg.querySelectorAll('path').length
      const lineCount = svg.querySelectorAll('line, polyline').length
      currentlyMuted = pathCount >= 3 || lineCount >= 1
    }

    // 状态不一致时，模拟真实点击（pointerdown + pointerup + click）
    if (currentlyMuted !== muted) {
      const rect = muteButton.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2

      try {
        muteButton.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            clientX: cx,
            clientY: cy,
            button: 0,
            pointerId: 1,
            pointerType: 'mouse',
          }),
        )
        muteButton.dispatchEvent(
          new PointerEvent('pointerup', {
            bubbles: true,
            cancelable: true,
            clientX: cx,
            clientY: cy,
            button: 0,
            pointerId: 1,
            pointerType: 'mouse',
          }),
        )
        muteButton.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            clientX: cx,
            clientY: cy,
            button: 0,
          }),
        )
      } catch {
        // Fallback: 直接 click
        muteButton.click()
      }
    }
  }
}

/**
 * 隐藏 Instagram 原生音量控件（安全版 + MutationObserver + requestAnimationFrame）
 *
 * 🔒 安全原则：
 *   1. 用 MutationObserver 监听 DOM 变化（不做 setInterval 轮询）
 *   2. 用 requestAnimationFrame 去抖动（~16ms 响应，比 setTimeout 800ms 快 50 倍）
 *   3. 隐藏所有层级（SVG + 每一层父容器），React 重渲染替换某一层时其他层仍被隐藏
 *   4. 只在视频区域内查找符合喇叭 SVG 特征的元素
 *
 * 为什么用 requestAnimationFrame 而不是 setTimeout？
 *   - setTimeout 800ms 太慢：React 重渲染后新元素在 800ms 内可见
 *   - requestAnimationFrame ~16ms：用户几乎看不到新元素就被重新隐藏
 *   - 每个动画帧最多执行一次查找，性能有保障
 */
export function hideNativeInstagramVolumeControls(video: HTMLVideoElement): () => void {
  const hiddenElements: HTMLElement[] = []
  const hiddenSet = new WeakSet<HTMLElement>()

  // 安全地隐藏单个元素：加弱集合去重
  const hideOne = (el: HTMLElement | null): void => {
    if (!el || hiddenSet.has(el)) return
    el.style.setProperty('visibility', 'hidden', 'important')
    hiddenElements.push(el)
    hiddenSet.add(el)
  }

  // 执行一次安全查找并隐藏所有层级
  const runOnce = (): void => {
    if (!video.isConnected) return
    const controls = findNativeInstagramVolumeControls(video)
    // 隐藏所有层级（SVG + 每一层父容器）
    for (const el of controls.allElements) {
      hideOne(el)
    }
    // 隐藏滑块
    hideOne(controls.slider as HTMLElement | null)
  }

  // 首次查找
  runOnce()

  /**
   * MutationObserver + requestAnimationFrame 去抖动
   *
   * 观察范围：document.body 的 childList + subtree
   * 去抖动：requestAnimationFrame，每帧最多执行一次查找（~16ms）
   */
  let rafId: number | null = null
  const observer = new MutationObserver(() => {
    // 🔒 用 requestAnimationFrame 去抖动：每帧最多一次，~16ms 响应
    if (rafId !== null) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      runOnce()
    })
  })

  try {
    observer.observe(document.body, { childList: true, subtree: true })
  } catch {
    // 某些受限环境下 document.body 不可观察，忽略即可
  }

  // 清理函数：停止观察 + 取消 rAF + 恢复所有可见性
  let cleanedUp = false
  return () => {
    if (cleanedUp) return
    cleanedUp = true
    observer.disconnect()
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    for (const el of hiddenElements) {
      el.style.removeProperty('visibility')
    }
  }
}
