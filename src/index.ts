import { preferenceStore } from './preferences'
import { buildControls, cleanupRemovedVideos } from './controls'
import { startInstagramIntegration } from './instagram'

void preferenceStore.ready.then(() => {
  startInstagramIntegration({
    onVideoFound(video, mount) {
      buildControls(video, mount)
    },
    onVideosRemoved: cleanupRemovedVideos,
  })
})
