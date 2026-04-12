import type { PreferenceStore, SyncHandlers, TickLoop } from '../types'
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

function isKeyboardActivatedControl(target: EventTarget | null, ownerDocument: Document): boolean {
  const ElementConstructor = ownerDocument.defaultView?.Element ?? Element
  if (!(target instanceof ElementConstructor)) return false

  return Boolean(target.closest('button, [role="button"], a[href]'))
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
  private mirrorVideo: HTMLVideoElement | null = null
  private stage: HTMLDivElement | null = null
  private sourceAbort: AbortController | null = null
  private sourceVideo: HTMLVideoElement | null = null
  private stream: MediaStream | null = null
  private sync: SyncHandlers | null = null
  private tickLoop: TickLoop | null = null
  private destroyed = false
  private lastWheelNavigationAt = 0
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

    this.mirrorVideo = pipDocument.createElement('video')
    this.mirrorVideo.className = 'irc-pip-video'
    this.mirrorVideo.autoplay = true
    this.mirrorVideo.muted = true
    this.mirrorVideo.playsInline = true

    stage.appendChild(this.mirrorVideo)
    pipDocument.body.appendChild(stage)

    if (!(await this.setSource(video))) throw new Error('Unable to mirror video into Document PiP')
  }

  async setSource(video: HTMLVideoElement): Promise<boolean> {
    if (this.destroyed || !this.mirrorVideo || !this.stage) return false

    const nextStream = captureVideoStream(video)
    if (!nextStream) return false

    this.abortControls()
    this.abortSourceEvents()
    stopStream(this.stream)

    this.sourceVideo = video
    this.stream = nextStream
    this.bindSourceEvents(video)
    this.bindMirrorStream(nextStream, video)
    await this.playMirror()

    this.bindControls(video)
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

    if (this.mirrorVideo) this.mirrorVideo.srcObject = null

    try {
      this.pipWindow.document.body.replaceChildren()
    } catch {
      // Closing the PiP window can make its document unavailable.
    }
  }

  private bindControls(video: HTMLVideoElement): void {
    if (!this.stage) return

    const els = createControlsDOM({
      ownerDocument: this.pipWindow.document,
      includePictureInPictureButton: false,
    })
    const ac = new AbortController()
    const sync = createSyncHandlers(video, els)
    const tickLoop = createTickLoop(sync.updateSeek, this.pipWindow)

    this.controlsAbort = ac
    this.sync = sync
    this.tickLoop = tickLoop
    this.stage.querySelector('.irc-controls')?.remove()
    this.stage.appendChild(els.bar)

    wireEvents(video, els, sync, tickLoop, this.preferences, ac.signal)
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
        if (
          (event.key === ' ' || event.key === 'Enter') &&
          isKeyboardActivatedControl(event.target, ownerDocument)
        ) {
          return
        }

        if (event.key === 'ArrowDown') {
          event.preventDefault()
          void this.navigate('next')
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          void this.navigate('previous')
        } else if (event.key === ' ') {
          event.preventDefault()
          void this.togglePlay()
        } else if (event.key === 'ArrowRight') {
          event.preventDefault()
          this.seekBy(5)
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault()
          this.seekBy(-5)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          this.close()
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

  private bindSourceEvents(video: HTMLVideoElement): void {
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
    this.mirrorVideo?.addEventListener('ended', refreshMirror, { signal: ac.signal })
  }

  private bindMirrorStream(stream: MediaStream, sourceVideo: HTMLVideoElement): void {
    if (!this.mirrorVideo) return

    this.mirrorVideo.srcObject = stream
    this.mirrorVideo.muted = true
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

  private async refreshMirrorStream(video: HTMLVideoElement): Promise<void> {
    if (this.destroyed || this.refreshingMirror || this.sourceVideo !== video || !this.mirrorVideo)
      return

    const nextStream = captureVideoStream(video)
    if (!nextStream) return

    this.refreshingMirror = true
    try {
      const oldStream = this.stream
      this.stream = nextStream
      this.bindMirrorStream(nextStream, video)
      stopStream(oldStream)
      await this.playMirror()
    } finally {
      this.refreshingMirror = false
    }
  }

  private async playMirror(): Promise<void> {
    try {
      await this.mirrorVideo?.play()
    } catch {
      // The mirrored stream can still render once the source video starts playing.
    }
  }

  private async navigate(direction: ReelNavigationDirection): Promise<void> {
    const sourceVideo = this.sourceVideo
    if (!sourceVideo) return

    const targetVideo = scrollToAdjacentInstagramReel(sourceVideo, direction)
    if (!targetVideo || !supportsDocumentPictureInPicture(targetVideo)) return

    if (!(await this.setSource(targetVideo))) return

    try {
      await targetVideo.play()
    } catch {
      // The user can still press play in the PiP controls if Instagram blocks playback.
    }
    this.sync?.updatePlayButton()
  }

  private async togglePlay(): Promise<void> {
    if (!this.sourceVideo) return

    if (this.sourceVideo.paused) {
      try {
        await this.sourceVideo.play()
      } catch {
        // Keep the current state if playback is blocked.
      }
    } else {
      this.sourceVideo.pause()
    }

    this.sync?.updatePlayButton()
  }

  private seekBy(seconds: number): void {
    if (!this.sourceVideo?.duration) return

    this.sourceVideo.currentTime = Math.max(
      0,
      Math.min(this.sourceVideo.duration, this.sourceVideo.currentTime + seconds),
    )
    this.sync?.updateSeek()
  }
}
