type CapturableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream
}

export function supportsVideoStreamMirror(video: HTMLVideoElement): boolean {
  return typeof (video as CapturableVideo).captureStream === 'function'
}

export function captureVideoStream(video: HTMLVideoElement): MediaStream | null {
  const captureStream = (video as CapturableVideo).captureStream
  if (typeof captureStream !== 'function') return null

  try {
    return captureStream.call(video)
  } catch {
    return null
  }
}
