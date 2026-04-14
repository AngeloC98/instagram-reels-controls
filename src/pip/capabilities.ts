export interface DocumentPictureInPictureAPI {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>
  window?: Window | null
}

type DocumentPictureInPictureWindow = Window &
  typeof globalThis & {
    documentPictureInPicture?: DocumentPictureInPictureAPI
  }

export function getDocumentPictureInPictureAPI(): DocumentPictureInPictureAPI | null {
  const api = (window as DocumentPictureInPictureWindow).documentPictureInPicture
  return typeof api?.requestWindow === 'function' ? api : null
}
