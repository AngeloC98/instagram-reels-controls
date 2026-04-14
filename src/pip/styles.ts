import controlsCss from '../../content.css?raw'

const PIP_STYLE_ID = 'irc-document-pip-styles'

export function injectDocumentPictureInPictureStyles(ownerDocument: Document): void {
  if (ownerDocument.getElementById(PIP_STYLE_ID)) return

  const style = ownerDocument.createElement('style')
  style.id = PIP_STYLE_ID
  style.textContent = controlsCss
  ownerDocument.head.appendChild(style)
}
