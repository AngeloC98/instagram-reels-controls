declare const __IRC_ENABLE_DOCUMENT_PIP__: boolean

export const ENABLE_DOCUMENT_PIP =
  typeof __IRC_ENABLE_DOCUMENT_PIP__ === 'boolean' ? __IRC_ENABLE_DOCUMENT_PIP__ : true
