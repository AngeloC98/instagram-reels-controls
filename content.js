const CONTROLS_CLASS = 'irc-controls';
const SPEED_OPTIONS = ['0.25', '0.5', '0.75', '1', '1.25', '1.5', '2'];

const ext = typeof browser !== 'undefined' ? browser : chrome;
const storage = ext.storage.local;

const ICON = {
  play:    ext.runtime.getURL('icons/play.svg'),
  pause:   ext.runtime.getURL('icons/pause.svg'),
  volHigh: ext.runtime.getURL('icons/vol-high.svg'),
  volLow:  ext.runtime.getURL('icons/vol-low.svg'),
  volMute: ext.runtime.getURL('icons/vol-mute.svg'),
};

function setIcon(target, src) {
  let img = target.querySelector('img');
  if (!img) {
    img = document.createElement('img');
    img.width = 16;
    img.height = 16;
    target.replaceChildren(img);
  }
  img.src = src;
}

let preferredMuted = true;
let preferredVolume = 1;
let preferredSpeed = 1;
let userInteracted = false;

const prefsReady = storage.get(['muted', 'volume', 'speed']).then(prefs => {
  if (prefs.muted !== undefined) preferredMuted = prefs.muted;
  if (prefs.volume !== undefined) preferredVolume = prefs.volume;
  if (prefs.speed !== undefined) preferredSpeed = prefs.speed;
});

let saveTimeout = null;
function savePrefs() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    storage.set({ muted: preferredMuted, volume: preferredVolume, speed: preferredSpeed });
  }, 300);
}

function formatTime(seconds) {
  if (isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function seekGradient(pct) {
  return `linear-gradient(to right, #f9a825 0%, #e91e8c ${pct / 2}%, #833ab4 ${pct}%, rgba(255,255,255,0.3) ${pct}%)`;
}

function volumeGradient(pct) {
  return `linear-gradient(to right, #fff ${pct}%, rgba(255,255,255,0.3) ${pct}%)`;
}

function el(tag, attrs, children) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') e.className = v;
    else if (k === 'textContent') e.textContent = v;
    else if (k === 'hidden') e.hidden = v;
    else e.setAttribute(k, v);
  }
  if (children) for (const c of children) e.appendChild(c);
  return e;
}

function createControlsDOM() {
  const playBtn = el('button', { className: 'irc-btn irc-playpause', title: 'Play/Pause' });
  const muteBtn = el('button', { className: 'irc-btn irc-mute', title: 'Mute/Unmute' });
  const volumeBar = el('input', { className: 'irc-volume', type: 'range', min: '0', max: '1', step: '0.02', value: '1', title: 'Volume' });
  const timeLabel = el('span', { className: 'irc-time', textContent: '0:00 / 0:00' });
  const speedBtn = el('button', { className: 'irc-speed-btn', title: 'Playback speed', textContent: '1×' });

  const speedOptions = SPEED_OPTIONS.map(v =>
    el('div', { className: `irc-speed-option${v === '1' ? ' irc-speed-active' : ''}`, 'data-speed': v, textContent: `${v}×` })
  );

  const speedMenu = el('div', { className: 'irc-speed-menu', hidden: true }, [
    el('div', { className: 'irc-speed-title', textContent: 'Playback speed' }),
    ...speedOptions,
  ]);

  const seekBar = el('input', { className: 'irc-seek', type: 'range', min: '0', max: '100', value: '0', step: '0.1' });

  const bar = el('div', { className: CONTROLS_CLASS }, [
    el('div', { className: 'irc-row irc-bottom' }, [
      playBtn,
      el('div', { className: 'irc-vol-group' }, [muteBtn, volumeBar]),
      timeLabel,
      el('div', { className: 'irc-speed-wrap' }, [speedBtn, speedMenu]),
    ]),
    el('div', { className: 'irc-row irc-top' }, [seekBar]),
  ]);

  return { bar, playBtn, seekBar, timeLabel, speedBtn, speedMenu, speedOptions, muteBtn, volumeBar };
}

function createSyncHandlers(video, els) {
  const { playBtn, seekBar, timeLabel, muteBtn, volumeBar } = els;
  let scrubbing = false;
  let lastTimeText = '';

  function formatTimeLabel() {
    return `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
  }

  return {
    get scrubbing() { return scrubbing; },
    set scrubbing(v) { scrubbing = v; },

    updatePlayButton() {
      setIcon(playBtn, video.paused ? ICON.play : ICON.pause);
    },

    updateSeek() {
      if (video.duration && !scrubbing) {
        const pct = (video.currentTime / video.duration) * 100;
        seekBar.value = pct;
        seekBar.style.background = seekGradient(pct);
        const text = formatTimeLabel();
        if (text !== lastTimeText) {
          timeLabel.textContent = text;
          lastTimeText = text;
        }
      }
    },

    updateMute() {
      if (video.muted || video.volume === 0) {
        setIcon(muteBtn, ICON.volMute);
      } else if (video.volume < 0.5) {
        setIcon(muteBtn, ICON.volLow);
      } else {
        setIcon(muteBtn, ICON.volHigh);
      }
      const vol = video.muted ? 0 : video.volume;
      volumeBar.value = vol;
      volumeBar.style.background = volumeGradient(vol * 100);
    },
  };
}

function createTickLoop(updateSeek) {
  let rafId = null;
  return {
    start() { if (!rafId) { const tick = () => { updateSeek(); rafId = requestAnimationFrame(tick); }; tick(); } },
    stop()  { cancelAnimationFrame(rafId); rafId = null; },
  };
}

function wireEvents(video, els, sync, tickLoop, sig) {
  const { bar, playBtn, seekBar, timeLabel, speedBtn, speedMenu, speedOptions, muteBtn, volumeBar } = els;

  // Stop clicks from reaching Instagram's handlers (which toggle play/mute)
  bar.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!e.target.closest('.irc-speed-wrap')) speedMenu.hidden = true;
  }, { signal: sig });
  bar.addEventListener('pointerdown', (e) => e.stopPropagation(), { signal: sig });
  bar.addEventListener('pointerup', (e) => {
    if (e.target.matches('input[type="range"]')) setTimeout(() => e.target.blur(), 0);
  }, { signal: sig });

  video.addEventListener('play', sync.updatePlayButton, { signal: sig });
  video.addEventListener('pause', sync.updatePlayButton, { signal: sig });
  video.addEventListener('durationchange', sync.updateSeek, { signal: sig });
  video.addEventListener('volumechange', sync.updateMute, { signal: sig });

  video.addEventListener('play', () => tickLoop.start(), { signal: sig });
  video.addEventListener('pause', () => tickLoop.stop(), { signal: sig });

  // Override Instagram's volume resets, but only after user has interacted with our controls
  video.addEventListener('volumechange', () => {
    if (!userInteracted) return;
    if (video.muted !== preferredMuted) video.muted = preferredMuted;
    if (video.volume !== preferredVolume) video.volume = preferredVolume;
  }, { signal: sig });

  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    video.paused ? video.play() : video.pause();
  }, { signal: sig });

  let wasPlaying = false;
  seekBar.addEventListener('pointerdown', () => {
    sync.scrubbing = true;
    wasPlaying = !video.paused;
    if (wasPlaying) video.pause();
  }, { signal: sig });
  seekBar.addEventListener('input', (e) => {
    e.stopPropagation();
    if (video.duration) {
      video.currentTime = (seekBar.value / 100) * video.duration;
      seekBar.style.background = seekGradient(parseFloat(seekBar.value));
      timeLabel.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    }
  }, { signal: sig });
  document.addEventListener('pointerup', () => {
    if (sync.scrubbing) {
      sync.scrubbing = false;
      if (wasPlaying) video.play();
    }
  }, { signal: sig });
  seekBar.addEventListener('click', (e) => e.stopPropagation(), { signal: sig });

  speedBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    speedMenu.hidden = !speedMenu.hidden;
  }, { signal: sig });

  speedOptions.forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const speed = parseFloat(opt.dataset.speed);
      video.playbackRate = speed;
      preferredSpeed = speed;
      speedBtn.textContent = opt.textContent;
      speedOptions.forEach(o => o.classList.remove('irc-speed-active'));
      opt.classList.add('irc-speed-active');
      speedMenu.hidden = true;
      savePrefs();
    }, { signal: sig });
  });

  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    userInteracted = true;
    preferredMuted = !video.muted;
    video.muted = preferredMuted;
    savePrefs();
  }, { signal: sig });

  volumeBar.addEventListener('input', (e) => {
    e.stopPropagation();
    userInteracted = true;
    preferredVolume = parseFloat(volumeBar.value);
    preferredMuted = preferredVolume === 0;
    video.volume = preferredVolume;
    video.muted = preferredMuted;
    savePrefs();
  }, { signal: sig });
  volumeBar.addEventListener('click', (e) => e.stopPropagation(), { signal: sig });
}

function applyPreferences(video, els) {
  const { speedBtn, speedOptions } = els;
  // Mute state applied on play event to avoid breaking autoplay policy
  video.volume = preferredVolume;
  video.playbackRate = preferredSpeed;
  speedBtn.textContent = `${preferredSpeed}×`;
  speedOptions.forEach(o => {
    o.classList.toggle('irc-speed-active', parseFloat(o.dataset.speed) === preferredSpeed);
  });
}

const injected = new WeakMap();

document.addEventListener('click', () => {
  document.querySelectorAll('.irc-speed-menu').forEach(m => { m.hidden = true; });
});

function buildControls(video) {
  if (injected.has(video)) return;

  const wrapper = video.parentElement;
  if (!wrapper) return;
  wrapper.style.position = 'relative';
  wrapper.style.overflow = 'hidden';

  const ac = new AbortController();
  const els = createControlsDOM();
  const sync = createSyncHandlers(video, els);
  const tickLoop = createTickLoop(sync.updateSeek);

  wrapper.appendChild(els.bar);
  wireEvents(video, els, sync, tickLoop, ac.signal);
  applyPreferences(video, els);
  sync.updatePlayButton();
  sync.updateSeek();
  sync.updateMute();
  if (!video.paused) tickLoop.start();

  injected.set(video, () => {
    tickLoop.stop();
    ac.abort();
    els.bar.remove();
  });
}

function findAndInjectReelVideos() {
  document.querySelectorAll('video').forEach(video => {
    if (video.offsetWidth > 200) buildControls(video);
  });
}

let mutationPending = false;
const observer = new MutationObserver((mutations) => {
  if (!mutationPending) {
    mutationPending = true;
    requestAnimationFrame(() => {
      for (const mutation of mutations) {
        for (const node of mutation.removedNodes) {
          if (node.nodeType !== 1) continue;
          const videos = node.tagName === 'VIDEO' ? [node] : node.querySelectorAll?.('video') || [];
          for (const video of videos) {
            const cleanup = injected.get(video);
            if (cleanup) { cleanup(); injected.delete(video); }
          }
        }
      }
      findAndInjectReelVideos();
      mutationPending = false;
    });
  }
});

prefsReady.then(() => {
  const root = document.body || document.documentElement;
  observer.observe(root, { childList: true, subtree: true });
  findAndInjectReelVideos();
});
