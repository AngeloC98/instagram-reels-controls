const CONTROLS_CLASS = 'irc-controls';
const SPEED_OPTIONS = ['0.25', '0.5', '0.75', '1', '1.25', '1.5', '2'];

const SVG = {
  play:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5,3 20,12 5,21"/></svg>`,
  pause:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="white"><rect x="5" y="3" width="4" height="18" rx="1"/><rect x="15" y="3" width="4" height="18" rx="1"/></svg>`,
  volHigh: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="white" stroke="none"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
  volLow:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="white" stroke="none"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`,
  volMute: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="white" stroke="none"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`,
};

const storage = (typeof browser !== 'undefined' ? browser : chrome).storage.local;

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

function createControlsDOM() {
  const bar = document.createElement('div');
  bar.className = CONTROLS_CLASS;
  bar.innerHTML = `
    <div class="irc-row irc-bottom">
      <button class="irc-btn irc-playpause" title="Play/Pause"></button>
      <div class="irc-vol-group">
        <button class="irc-btn irc-mute" title="Mute/Unmute"></button>
        <input class="irc-volume" type="range" min="0" max="1" step="0.02" value="1" title="Volume" />
      </div>
      <span class="irc-time">0:00 / 0:00</span>
      <div class="irc-speed-wrap">
        <button class="irc-speed-btn" title="Playback speed">1×</button>
        <div class="irc-speed-menu" hidden>
          <div class="irc-speed-title">Playback speed</div>
          ${SPEED_OPTIONS.map(v =>
            `<div class="irc-speed-option${v === '1' ? ' irc-speed-active' : ''}" data-speed="${v}">${v}×</div>`
          ).join('')}
        </div>
      </div>
    </div>
    <div class="irc-row irc-top">
      <input class="irc-seek" type="range" min="0" max="100" value="0" step="0.1" />
    </div>
  `;
  return {
    bar,
    playBtn:   bar.querySelector('.irc-playpause'),
    seekBar:   bar.querySelector('.irc-seek'),
    timeLabel: bar.querySelector('.irc-time'),
    speedBtn:  bar.querySelector('.irc-speed-btn'),
    speedMenu: bar.querySelector('.irc-speed-menu'),
    muteBtn:   bar.querySelector('.irc-mute'),
    volumeBar: bar.querySelector('.irc-volume'),
  };
}

function createSyncHandlers(video, els) {
  const { playBtn, seekBar, timeLabel, muteBtn, volumeBar } = els;
  let scrubbing = false;

  return {
    get scrubbing() { return scrubbing; },
    set scrubbing(v) { scrubbing = v; },

    updatePlayButton() {
      playBtn.innerHTML = video.paused ? SVG.play : SVG.pause;
    },

    updateSeek() {
      if (video.duration && !scrubbing) {
        const pct = (video.currentTime / video.duration) * 100;
        seekBar.value = pct;
        seekBar.style.background = seekGradient(pct);
        timeLabel.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
      }
    },

    updateMute() {
      if (video.muted || video.volume === 0) {
        muteBtn.innerHTML = SVG.volMute;
      } else if (video.volume < 0.5) {
        muteBtn.innerHTML = SVG.volLow;
      } else {
        muteBtn.innerHTML = SVG.volHigh;
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
  const { bar, playBtn, seekBar, timeLabel, speedBtn, speedMenu, muteBtn, volumeBar } = els;

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

  speedMenu.querySelectorAll('.irc-speed-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const speed = parseFloat(opt.dataset.speed);
      video.playbackRate = speed;
      preferredSpeed = speed;
      speedBtn.textContent = opt.textContent;
      speedMenu.querySelectorAll('.irc-speed-option').forEach(o => o.classList.remove('irc-speed-active'));
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
  const { speedBtn, speedMenu } = els;
  // Mute state applied on play event to avoid breaking autoplay policy
  video.volume = preferredVolume;
  video.playbackRate = preferredSpeed;
  speedBtn.textContent = `${preferredSpeed}×`;
  speedMenu.querySelectorAll('.irc-speed-option').forEach(o => {
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
      // Clean up controls for removed videos
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
