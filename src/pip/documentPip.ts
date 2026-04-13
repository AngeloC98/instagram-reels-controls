import type { ControlElements, PreferenceStore, SyncHandlers, TickLoop } from '../types'
import { applyControlPreferences } from '../controlPreferences'
import { createControlsDOM } from '../dom'
import { wireEvents } from '../events'
import { scrollToAdjacentInstagramReel, type ReelNavigationDirection } from '../instagram'
import { createSyncHandlers, createTickLoop } from '../sync'
import { getDocumentPictureInPictureAPI } from './capabilities'
import { injectDocumentPictureInPictureStyles } from './styles'
import { captureVideoStream, supportsVideoStreamMirror } from './videoSource'

const DOCUMENT_PIP_WIDTH = 360
const DOCUMENT_PIP_HEIGHT = 640
const PIP_FIRST_FRAME_TIMEOUT_MS = 160
const PIP_SLIDE_DURATION_MS = 420
const WHEEL_NAVIGATION_COOLDOWN_MS = 450
const WHEEL_NAVIGATION_THRESHOLD = 20

let activeSession: DocumentPictureInPictureSession | null = null
const activeSourceListeners = new Set<(sourceVideo: HTMLVideoElement | null) => void>()

function getActiveSourceVideo(): HTMLVideoElement | null {
  if (!activeSession?.isOpen()) return null
  return activeSession.getSource()
}

function notifyDocumentPictureInPictureStateChange(): void {
  const sourceVideo = getActiveSourceVideo()
  activeSourceListeners.forEach((listener) => {
    listener(sourceVideo)
  })
}

function isEditableTarget(target: EventTarget | null, ownerDocument: Document): boolean {
  const ElementConstructor = ownerDocument.defaultView?.Element ?? Element
  if (!(target instanceof ElementConstructor)) return false

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => {
    track.stop()
  })
}

export function supportsDocumentPictureInPicture(video: HTMLVideoElement): boolean {
  return Boolean(getDocumentPictureInPictureAPI()) && supportsVideoStreamMirror(video)
}

export function subscribeDocumentPictureInPictureSource(
  listener: (sourceVideo: HTMLVideoElement | null) => void,
): () => void {
  activeSourceListeners.add(listener)
  listener(getActiveSourceVideo())

  return () => {
    activeSourceListeners.delete(listener)
  }
}

export async function openDocumentPictureInPicture(
  video: HTMLVideoElement,
  preferences: PreferenceStore,
): Promise<void> {
  const api = getDocumentPictureInPictureAPI()
  if (!api || !supportsVideoStreamMirror(video)) return

  if (activeSession?.isOpen()) {
    await activeSession.setSource(video)
    return
  }

  const pipWindow = await api.requestWindow({
    width: DOCUMENT_PIP_WIDTH,
    height: DOCUMENT_PIP_HEIGHT,
  })
  const session = new DocumentPictureInPictureSession(pipWindow, preferences)

  activeSession = session
  pipWindow.addEventListener(
    'pagehide',
    () => {
      const wasActiveSession = activeSession === session
      if (wasActiveSession) activeSession = null
      session.destroy()
      if (wasActiveSession) notifyDocumentPictureInPictureStateChange()
    },
    { once: true },
  )

  try {
    await session.mount(video)
  } catch (error) {
    session.close()
    throw error
  }
}

export function toggleDocumentPictureInPicture(
  video: HTMLVideoElement,
  preferences: PreferenceStore,
): Promise<void> {
  if (activeSession?.isOpen()) {
    if (activeSession.hasSource(video)) {
      activeSession.close()
      return Promise.resolve()
    }

    return openDocumentPictureInPicture(video, preferences)
  }

  return openDocumentPictureInPicture(video, preferences)
}

export function closeDocumentPictureInPictureForSource(video: HTMLVideoElement): void {
  if (activeSession?.hasSource(video)) activeSession.close()
}

class DocumentPictureInPictureSession {
  private readonly pipWindow: Window
  private readonly preferences: PreferenceStore
  private controlsAbort: AbortController | null = null
  private controlElements: ControlElements | null = null
  private mirrorVideo: HTMLVideoElement | null = null
  private stage: HTMLDivElement | null = null
  private sourceAbort: AbortController | null = null
  private sourceVideo: HTMLVideoElement | null = null
  private stream: MediaStream | null = null
  private sync: SyncHandlers | null = null
  private tickLoop: TickLoop | null = null
  private videoLayer: HTMLDivElement | null = null
  private destroyed = false
  private lastWheelNavigationAt = 0
  private navigating = false
  private refreshingMirror = false

  constructor(pipWindow: Window, preferences: PreferenceStore) {
    this.pipWindow = pipWindow
    this.preferences = preferences
  }

  isOpen(): boolean {
    return !this.destroyed && !this.pipWindow.closed
  }

  hasSource(video: HTMLVideoElement): boolean {
    return this.sourceVideo === video
  }

  getSource(): HTMLVideoElement | null {
    return this.sourceVideo
  }

  async mount(video: HTMLVideoElement): Promise<void> {
    const pipDocument = this.pipWindow.document
    injectDocumentPictureInPictureStyles(pipDocument)

    pipDocument.body.replaceChildren()
    pipDocument.body.className = 'irc-pip-body'

    const stage = pipDocument.createElement('div')
    stage.className = 'irc-pip-stage'
    this.stage = stage

    const videoLayer = pipDocument.createElement('div')
    videoLayer.className = 'irc-pip-video-layer'
    this.videoLayer = videoLayer

    this.mirrorVideo = this.createMirrorVideo()

    videoLayer.appendChild(this.mirrorVideo)
    stage.appendChild(videoLayer)
    pipDocument.body.appendChild(stage)

    if (!(await this.setSource(video))) throw new Error('Unable to mirror video into Document PiP')
  }

  async setSource(
    video: HTMLVideoElement,
    options: { transitionDirection?: ReelNavigationDirection } = {},
  ): Promise<boolean> {
    if (this.destroyed || !this.mirrorVideo || !this.stage || !this.videoLayer) return false

    const nextStream = captureVideoStream(video)
    if (!nextStream) return false

    const controlsWereVisible =
      this.stage.querySelector('.irc-controls')?.classList.contains('irc-controls-visible') ?? false
    const previousMirrorVideo = this.mirrorVideo
    const previousStream = this.stream
    const shouldAnimateSwap = Boolean(options.transitionDirection && previousStream)
    const nextMirrorVideo = shouldAnimateSwap ? this.createMirrorVideo() : previousMirrorVideo
    if (nextMirrorVideo !== previousMirrorVideo) {
      if (options.transitionDirection) {
        nextMirrorVideo.style.transform = this.getSlideInTransform(options.transitionDirection)
      }
      this.insertMirrorVideo(nextMirrorVideo)
    }

    this.abortSourceEvents()

    this.sourceVideo = video
    this.stream = nextStream
    if (shouldAnimateSwap && nextMirrorVideo !== previousMirrorVideo) {
      this.mirrorVideo = nextMirrorVideo
    }
    this.bindSourceEvents(video, nextMirrorVideo)
    if (options.transitionDirection && previousStream && nextMirrorVideo !== previousMirrorVideo) {
      this.bindMirrorStream(nextMirrorVideo, nextStream, video)
      await this.playMirror(nextMirrorVideo)
      await this.waitForMirrorFrame(nextMirrorVideo)
      await this.animateMirrorSwap(
        previousMirrorVideo,
        nextMirrorVideo,
        options.transitionDirection,
      )
      previousMirrorVideo.remove()
      stopStream(previousStream)
    } else {
      this.bindMirrorStream(previousMirrorVideo, nextStream, video)
      await this.playMirror(previousMirrorVideo)
      stopStream(previousStream)
    }

    this.bindControls(video, { initiallyVisible: controlsWereVisible })
    notifyDocumentPictureInPictureStateChange()
    return true
  }

  close(): void {
    const wasActiveSession = activeSession === this
    if (wasActiveSession) activeSession = null
    this.destroy()
    if (!this.pipWindow.closed) this.pipWindow.close()
    if (wasActiveSession) notifyDocumentPictureInPictureStateChange()
  }

  destroy(): void {
    if (this.destroyed) return

    this.destroyed = true
    this.abortControls()
    this.abortSourceEvents()
    stopStream(this.stream)
    this.stream = null
    this.sourceVideo = null
    this.sync = null
    this.controlElements = null
    this.videoLayer = null

    if (this.mirrorVideo) this.mirrorVideo.srcObject = null

    try {
      this.pipWindow.document.body.replaceChildren()
    } catch {
      // Closing the PiP window can make its document unavailable.
    }
  }

  private bindControls(
    video: HTMLVideoElement,
    options: { initiallyVisible?: boolean } = {},
  ): void {
    if (!this.stage) return

    const els =
      this.controlElements ??
      createControlsDOM({
        ownerDocument: this.pipWindow.document,
        includePictureInPictureButton: false,
      })
    const ac = new AbortController()
    const sync = createSyncHandlers(video, els)
    const tickLoop = createTickLoop(sync.updateSeek, this.pipWindow)

    this.abortControls()
    this.controlsAbort = ac
    this.sync = sync
    this.tickLoop = tickLoop
    if (!this.controlElements) {
      this.stage.appendChild(els.bar)
      this.controlElements = els
    }

    wireEvents(
      video,
      els,
      sync,
      tickLoop,
      this.preferences,
      ac.signal,
      options.initiallyVisible ? { initiallyVisible: true } : {},
    )
    applyControlPreferences(video, els, this.preferences)
    sync.updatePlayButton()
    sync.updateSeek()
    sync.updateMute()
    if (!video.paused) tickLoop.start()

    this.bindPictureInPictureEvents(els.bar.ownerDocument, ac.signal)
  }

  private bindPictureInPictureEvents(ownerDocument: Document, signal: AbortSignal): void {
    ownerDocument.addEventListener(
      'keydown',
      (event) => {
        if (event.defaultPrevented || isEditableTarget(event.target, ownerDocument)) return

        if (event.key === 'ArrowDown') {
          event.preventDefault()
          void this.navigate('next')
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          void this.navigate('previous')
        }
      },
      { signal },
    )

    ownerDocument.addEventListener(
      'wheel',
      (event) => {
        if (Math.abs(event.deltaY) < WHEEL_NAVIGATION_THRESHOLD) return

        const now = Date.now()
        if (now - this.lastWheelNavigationAt < WHEEL_NAVIGATION_COOLDOWN_MS) {
          event.preventDefault()
          return
        }

        this.lastWheelNavigationAt = now
        event.preventDefault()
        void this.navigate(event.deltaY > 0 ? 'next' : 'previous')
      },
      { passive: false, signal },
    )
  }

  private abortControls(): void {
    this.tickLoop?.stop()
    this.tickLoop = null
    this.controlsAbort?.abort()
    this.controlsAbort = null
  }

  private abortSourceEvents(): void {
    this.sourceAbort?.abort()
    this.sourceAbort = null
  }

  private bindSourceEvents(video: HTMLVideoElement, mirrorVideo: HTMLVideoElement | null): void {
    const ac = new AbortController()
    this.sourceAbort = ac

    const refreshMirror = (): void => {
      void this.refreshMirrorStream(video)
    }

    video.addEventListener(
      'ended',
      () => {
        if (this.sourceVideo !== video) return
        video.currentTime = 0
        void video.play()
        refreshMirror()
      },
      { signal: ac.signal },
    )
    video.addEventListener('emptied', refreshMirror, { signal: ac.signal })
    video.addEventListener('loadeddata', refreshMirror, { signal: ac.signal })
    mirrorVideo?.addEventListener('ended', refreshMirror, { signal: ac.signal })
  }

  private createMirrorVideo(): HTMLVideoElement {
    const video = this.pipWindow.document.createElement('video')
    video.className = 'irc-pip-video'
    video.autoplay = true
    video.muted = true
    video.playsInline = true
    return video
  }

  private insertMirrorVideo(video: HTMLVideoElement): void {
    this.videoLayer?.appendChild(video)
  }

  private bindMirrorStream(
    mirrorVideo: HTMLVideoElement,
    stream: MediaStream,
    sourceVideo: HTMLVideoElement,
  ): void {
    mirrorVideo.srcObject = stream
    mirrorVideo.muted = true
    stream.getTracks().forEach((track) => {
      const signal = this.sourceAbort?.signal
      const options = signal ? { signal } : undefined
      track.addEventListener(
        'ended',
        () => {
          void this.refreshMirrorStream(sourceVideo)
        },
        options,
      )
    })
  }

  private async animateMirrorSwap(
    previousVideo: HTMLVideoElement,
    nextVideo: HTMLVideoElement,
    direction: ReelNavigationDirection,
  ): Promise<void> {
    const slideOut = direction === 'next' ? '-100%' : '100%'
    const slideIn = this.getSlideInTransform(direction)

    previousVideo.style.transform = 'translateY(0)'
    nextVideo.style.transform = slideIn
    nextVideo.getBoundingClientRect()

    await Promise.all([
      this.animateMirrorVideo(previousVideo, [
        { transform: 'translateY(0)' },
        { transform: `translateY(${slideOut})` },
      ]),
      this.animateMirrorVideo(nextVideo, [{ transform: slideIn }, { transform: 'translateY(0)' }]),
    ])

    previousVideo.style.transform = ''
    nextVideo.style.transform = ''
  }

  private getSlideInTransform(direction: ReelNavigationDirection): string {
    return `translateY(${direction === 'next' ? '100%' : '-100%'})`
  }

  private async animateMirrorVideo(video: HTMLVideoElement, keyframes: Keyframe[]): Promise<void> {
    const ownerWindow = video.ownerDocument.defaultView
    if (
      ownerWindow !== null &&
      typeof ownerWindow.matchMedia === 'function' &&
      ownerWindow.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }
    if (typeof video.animate !== 'function') return

    try {
      await video.animate(keyframes, {
        duration: PIP_SLIDE_DURATION_MS,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
        fill: 'both',
      }).finished
    } catch {
      // Animation cancellation should not block the source swap.
    }
  }

  private async waitForMirrorFrame(video: HTMLVideoElement): Promise<void> {
    if (
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      video.videoWidth > 0 &&
      video.videoHeight > 0
    ) {
      return
    }

    if (typeof video.requestVideoFrameCallback !== 'function') return

    await new Promise<void>((resolve) => {
      const ownerWindow = video.ownerDocument.defaultView ?? window
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        ownerWindow.clearTimeout(timeout)
        resolve()
      }
      const timeout = ownerWindow.setTimeout(finish, PIP_FIRST_FRAME_TIMEOUT_MS)

      try {
        video.requestVideoFrameCallback(() => {
          finish()
        })
      } catch {
        finish()
      }
    })
  }

  private async refreshMirrorStream(video: HTMLVideoElement): Promise<void> {
    if (this.destroyed || this.refreshingMirror || this.sourceVideo !== video || !this.mirrorVideo)
      return

    const nextStream = captureVideoStream(video)
    if (!nextStream) return

    this.refreshingMirror = true
    try {
      const oldStream = this.stream
      this.stream = nextStream
      this.bindMirrorStream(this.mirrorVideo, nextStream, video)
      stopStream(oldStream)
      await this.playMirror(this.mirrorVideo)
    } finally {
      this.refreshingMirror = false
    }
  }

  private async playMirror(mirrorVideo: HTMLVideoElement | null = this.mirrorVideo): Promise<void> {
    try {
      await mirrorVideo?.play()
    } catch {
      // The mirrored stream can still render once the source video starts playing.
    }
  }

  private async navigate(direction: ReelNavigationDirection): Promise<void> {
    if (this.navigating) return

    const sourceVideo = this.sourceVideo
    if (!sourceVideo) return

    const targetVideo = scrollToAdjacentInstagramReel(sourceVideo, direction)
    if (!targetVideo || !supportsDocumentPictureInPicture(targetVideo)) return

    this.navigating = true
    try {
      try {
        await targetVideo.play()
      } catch {
        // The user can still press play in the PiP controls if Instagram blocks playback.
      }

      if (!(await this.setSource(targetVideo, { transitionDirection: direction }))) return

      this.sync?.updatePlayButton()
    } finally {
      this.navigating = false
    }
  }
}
