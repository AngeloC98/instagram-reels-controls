const MIN_VIDEO_WIDTH = 200

function hideSpeedMenus(): void {
  document.querySelectorAll<HTMLDivElement>('.irc-speed-menu').forEach((menu) => {
    menu.hidden = true
  })
}

export function isInstagramVideoCandidate(video: HTMLVideoElement): boolean {
  return video.offsetWidth > MIN_VIDEO_WIDTH
}

export function findInstagramVideos(root: ParentNode = document): HTMLVideoElement[] {
  return [...root.querySelectorAll('video')].filter(isInstagramVideoCandidate)
}

export function resolveInstagramMount(video: HTMLVideoElement): HTMLElement | null {
  return video.parentElement
}

interface StartInstagramIntegrationOptions {
  onVideoFound: (video: HTMLVideoElement, mount: HTMLElement) => void
  onVideosRemoved: (mutations: MutationRecord[]) => void
}

export function startInstagramIntegration({
  onVideoFound,
  onVideosRemoved,
}: StartInstagramIntegrationOptions): MutationObserver {
  const injectDetectedVideos = (): void => {
    findInstagramVideos().forEach((video) => {
      const mount = resolveInstagramMount(video)
      if (mount) onVideoFound(video, mount)
    })
  }

  document.addEventListener('click', hideSpeedMenus)

  let mutationPending = false
  const observer = new MutationObserver((mutations) => {
    if (mutationPending) return

    mutationPending = true
    requestAnimationFrame(() => {
      onVideosRemoved(mutations)
      injectDetectedVideos()
      mutationPending = false
    })
  })

  observer.observe(document.body, { childList: true, subtree: true })
  injectDetectedVideos()

  return observer
}
