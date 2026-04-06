import { preferenceStore } from './preferences'
import { buildControls, cleanupRemovedVideos } from './controls'

document.addEventListener('click', () => {
  document.querySelectorAll<HTMLDivElement>('.irc-speed-menu').forEach((m) => {
    m.hidden = true
  })
})

function findAndInjectReelVideos(): void {
  document.querySelectorAll('video').forEach((video) => {
    if (video.offsetWidth > 200) buildControls(video)
  })
}

let mutationPending = false
const observer = new MutationObserver((mutations) => {
  if (!mutationPending) {
    mutationPending = true
    requestAnimationFrame(() => {
      cleanupRemovedVideos(mutations)
      findAndInjectReelVideos()
      mutationPending = false
    })
  }
})

void preferenceStore.ready.then(() => {
  const root = document.body
  observer.observe(root, { childList: true, subtree: true })
  findAndInjectReelVideos()
})
