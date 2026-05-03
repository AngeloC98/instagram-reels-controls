// Runs in the page's main world (manifest `"world": "MAIN"`) so we sit on
// the same prototype IG's bundle uses. Suppressing `visibilitychange` (vs.
// patching `pause` directly) leaves IG's scroll-to-next-reel pauses alone,
// which is what mutes past reels.
;(() => {
  if (window.__ircHiddenPauseFighterInstalled) return
  window.__ircHiddenPauseFighterInstalled = true

  document.addEventListener(
    'visibilitychange',
    (event) => {
      if (document.hidden) event.stopImmediatePropagation()
    },
    { capture: true },
  )
})()
