const MIN_VIDEO_WIDTH = 200
export type ReelNavigationDirection = 'previous' | 'next'

function hideSpeedMenus(): void {
  document.querySelectorAll<HTMLDivElement>('.irc-speed-menu').forEach((menu) => {
    menu.hidden = true
  })
}

function isInPrimaryInstagramSurface(video: HTMLVideoElement): boolean {
  return Boolean(video.closest('main') ?? video.closest('[role="dialog"]'))
}

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

function resolveNavigationScope(video: HTMLVideoElement): ParentNode {
  return video.closest('[role="dialog"]') ?? video.closest('main') ?? document
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
      injectVideos(findAddedInstagramVideos(mutationsToProcess))
    })
  })

  observer.observe(document.body, { childList: true, subtree: true })
  injectDetectedVideos()

  return observer
}
