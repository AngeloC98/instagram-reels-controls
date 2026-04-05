# Always-Visible Progress Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the seek bar always visible as a thin progress line, expanding into full controls on hover.

**Architecture:** Pure CSS change. The current `.irc-controls` container hides everything on no-hover. We split the animation: `.irc-bottom` (buttons row) gets the fade/slide, while `.irc-top` (seek bar row) stays always-visible and transitions between a collapsed "resting" state and its normal expanded state. No new DOM elements, no TS changes.

**Tech Stack:** CSS only

---

### Task 1: Rework hover transitions in CSS

**Files:**
- Modify: `content.css:26-48` (`.irc-controls` and hover rules)

- [ ] **Step 1: Remove fade/slide from `.irc-controls`, make it always visible**

In `content.css`, change `.irc-controls` — remove the hiding behavior and keep it as a passive positioning container:

```css
.irc-controls {
  user-select: none;
  position: absolute;
  top: 12px;
  left: 10px;
  right: 10px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  pointer-events: none;
}
```

Remove the existing hover rules:

```css
/* DELETE these rules */
*:hover > .irc-controls,
.irc-controls:hover {
  opacity: 1;
  transform: translateY(0);
  pointer-events: all;
}
```

- [ ] **Step 2: Move the fade/slide animation to `.irc-bottom`**

Change `.irc-bottom` to include the transition that `.irc-controls` previously had:

```css
.irc-bottom {
  background: var(--irc-surface);
  backdrop-filter: var(--irc-blur);
  -webkit-backdrop-filter: var(--irc-blur);
  border-radius: var(--irc-radius-pill);
  padding: 5px 10px;
  gap: 4px;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--irc-border);
  box-shadow: inset 0 1px 0 var(--irc-shadow-light);
  opacity: 0;
  transform: translateY(-6px);
  transition:
    opacity var(--irc-normal) ease,
    transform var(--irc-normal) ease;
}
```

Add hover rules so `.irc-bottom` appears on hover — pointer-events need to go on the whole `.irc-controls` to make the hover area work:

```css
*:hover > .irc-controls,
.irc-controls:hover {
  pointer-events: all;
}

*:hover > .irc-controls .irc-bottom,
.irc-controls:hover .irc-bottom {
  opacity: 1;
  transform: translateY(0);
}
```

- [ ] **Step 3: Style `.irc-top` resting state**

Change `.irc-top` so it's visible in resting state as a flush, edge-to-edge thin bar:

```css
.irc-top {
  width: 100%;
  padding: 0;
  box-sizing: border-box;
  margin-top: 0;
  transition:
    margin-top var(--irc-normal) ease,
    padding var(--irc-normal) ease;
}

*:hover > .irc-controls .irc-top,
.irc-controls:hover .irc-top {
  margin-top: 5px;
  padding: 0 2px;
}
```

- [ ] **Step 4: Adjust seek bar resting state**

The seek bar should be thinner (2px) and more subtle at rest, growing on hover:

```css
.irc-seek {
  width: 100%;
  height: 2px;
  appearance: none;
  background: var(--irc-track);
  border-radius: 3px;
  outline: none;
  cursor: pointer;
  display: block;
  transition: height var(--irc-fast);

  &:hover {
    height: 5px;
  }
}
```

Also add a rule so the seek bar grows to its normal 3px when the controls are hovered (not just when the seek bar itself is hovered):

```css
*:hover > .irc-controls .irc-seek,
.irc-controls:hover .irc-seek {
  height: 3px;
}
```

The thumb visibility rules stay the same (hidden by default, visible on seek bar hover).

- [ ] **Step 5: Build and test manually**

Run: `npm run build`
Expected: Build succeeds with no errors.

Load the extension in the browser and verify:
1. A thin progress line is visible at the top of any Instagram reel without hovering
2. The progress line animates with playback
3. Hovering the video area reveals the full controls bar, and the seek bar smoothly transitions into its normal size/position
4. Moving the mouse away hides the buttons but leaves the progress line visible
5. Scrubbing, speed, volume, play/pause all still work normally

- [ ] **Step 6: Commit**

```bash
git add content.css
git commit -m "feat: always-visible progress bar at top of video"
```

---

### Task 2: Fine-tune resting state visibility

This task handles edge cases after initial testing.

**Files:**
- Modify: `content.css`

- [ ] **Step 1: Ensure resting seek bar doesn't capture pointer events**

The resting progress bar should be non-interactive (clicks pass through to Instagram). Only on hover should it become interactive:

```css
.irc-seek {
  pointer-events: none;
}

*:hover > .irc-controls .irc-seek,
.irc-controls:hover .irc-seek {
  pointer-events: all;
}
```

- [ ] **Step 2: Adjust resting bar opacity**

The resting bar should be slightly dimmed so it doesn't distract:

```css
.irc-top {
  opacity: 0.7;
  transition:
    margin-top var(--irc-normal) ease,
    padding var(--irc-normal) ease,
    opacity var(--irc-normal) ease;
}

*:hover > .irc-controls .irc-top,
.irc-controls:hover .irc-top {
  opacity: 1;
}
```

- [ ] **Step 3: Verify the speed menu still works**

The speed menu drops down from `.irc-speed-wrap` with `position: absolute; top: calc(100% + 8px)`. Since we didn't change the `.irc-bottom` layout or speed menu positioning, this should still work. Build and verify:

Run: `npm run build`
Expected: Speed menu opens and closes correctly, positioned below the speed button.

- [ ] **Step 4: Run linter and tests**

Run: `npm run lint && npm test`
Expected: All pass (CSS changes don't affect TS linting or unit tests, but verify nothing is broken).

- [ ] **Step 5: Commit**

```bash
git add content.css
git commit -m "feat: fine-tune progress bar resting state"
```
