// js/audioManager.js — Entrega 23.19.4.4 Animation Tuning Matrix + Draggable Test Console.
// Un único dueño del audio de Argentinia: música por escena (menú / Tano / multiplayer)
// con Opus primero y MP3 fallback, más SFX separados. Todo es local al navegador.

export const AUDIO_SETTINGS_STORAGE_KEY = 'argentinia.audio.v1';

export const AUDIO_CATALOG = Object.freeze({
  music: Object.freeze({
    menu: Object.freeze({
      id: 'menu',
      loop: true,
      preload: 'metadata',
      sources: Object.freeze([
        Object.freeze({ src: './assets/sounds/music/menu.opus', type: 'audio/ogg; codecs="opus"' }),
        Object.freeze({ src: './assets/sounds/music/menu.mp3', type: 'audio/mpeg' })
      ])
    }),
    solo: Object.freeze({
      id: 'solo',
      loop: true,
      preload: 'metadata',
      sources: Object.freeze([
        Object.freeze({ src: './assets/sounds/music/solo.opus', type: 'audio/ogg; codecs="opus"' }),
        Object.freeze({ src: './assets/sounds/music/solo.mp3', type: 'audio/mpeg' })
      ])
    }),
    multiplayer: Object.freeze({
      id: 'multiplayer',
      loop: true,
      preload: 'metadata',
      sources: Object.freeze([
        Object.freeze({ src: './assets/sounds/music/multiplayer.opus', type: 'audio/ogg; codecs="opus"' }),
        Object.freeze({ src: './assets/sounds/music/multiplayer.mp3', type: 'audio/mpeg' })
      ])
    })
  }),
  // SFX viven separados de la música y respetan su propio ON/OFF + volumen de OPCIONES.
  // Contrato de assets 23.13.65: no reorganizar cards/tokens; los efectos viven en sounds/sfx.
  sfx: Object.freeze({
    coinToss: Object.freeze({
      id: 'coinToss',
      loop: false,
      sources: Object.freeze([
        Object.freeze({ src: './assets/sounds/sfx/moneda.opus', type: 'audio/ogg; codecs=\"opus\"' }),
        Object.freeze({ src: './assets/sounds/sfx/moneda.mp3', type: 'audio/mpeg' })
      ])
    }),
    cardImpact: Object.freeze({
      id: 'cardImpact', loop: false,
      sources: Object.freeze([
        Object.freeze({ src: './assets/sounds/sfx/choque.opus', type: 'audio/ogg; codecs=\"opus\"' }),
        Object.freeze({ src: './assets/sounds/sfx/choque.mp3', type: 'audio/mpeg' })
      ])
    }),
    playerImpact: Object.freeze({
      id: 'playerImpact', loop: false,
      sources: Object.freeze([
        Object.freeze({ src: './assets/sounds/sfx/golpe_jugador.opus', type: 'audio/ogg; codecs=\"opus\"' }),
        Object.freeze({ src: './assets/sounds/sfx/golpe_jugador.mp3', type: 'audio/mpeg' })
      ])
    }),
    landTap: Object.freeze({
      id: 'landTap', loop: false,
      sources: Object.freeze([
        Object.freeze({ src: './assets/sounds/sfx/tierra.opus', type: 'audio/ogg; codecs=\"opus\"' }),
        Object.freeze({ src: './assets/sounds/sfx/tierra.mp3', type: 'audio/mpeg' })
      ])
    }),
    firstStrike: Object.freeze({
      id: 'firstStrike', loop: false,
      sources: Object.freeze([
        Object.freeze({ src: './assets/sounds/sfx/iniciativa.opus', type: 'audio/ogg; codecs=\"opus\"' }),
        Object.freeze({ src: './assets/sounds/sfx/iniciativa.mp3', type: 'audio/mpeg' })
      ])
    }),
    doubleStrike: Object.freeze({
      id: 'doubleStrike', loop: false,
      sources: Object.freeze([
        Object.freeze({ src: './assets/sounds/sfx/doble_golpe.opus', type: 'audio/ogg; codecs=\"opus\"' }),
        Object.freeze({ src: './assets/sounds/sfx/doble_golpe.mp3', type: 'audio/mpeg' })
      ])
    }),
    shieldImpact: Object.freeze({
      id: 'shieldImpact', loop: false,
      sources: Object.freeze([
        Object.freeze({ src: './assets/sounds/sfx/escudo.opus', type: 'audio/ogg; codecs=\"opus\"' }),
        Object.freeze({ src: './assets/sounds/sfx/escudo.mp3', type: 'audio/mpeg' })
      ])
    }),
    deathtouchImpact: Object.freeze({
      id: 'deathtouchImpact', loop: false,
      sources: Object.freeze([
        Object.freeze({ src: './assets/sounds/sfx/toque_mortal.opus', type: 'audio/ogg; codecs=\"opus\"' }),
        Object.freeze({ src: './assets/sounds/sfx/toque_mortal.mp3', type: 'audio/mpeg' })
      ])
    }),
    indestructibleImpact: Object.freeze({
      id: 'indestructibleImpact', loop: false,
      sources: Object.freeze([
        Object.freeze({ src: './assets/sounds/sfx/indestructible.opus', type: 'audio/ogg; codecs=\"opus\"' }),
        Object.freeze({ src: './assets/sounds/sfx/indestructible.mp3', type: 'audio/mpeg' })
      ])
    }),
    spellCountered: Object.freeze({
      id: 'spellCountered', loop: false,
      sources: Object.freeze([
        Object.freeze({ src: './assets/sounds/sfx/counter.opus', type: 'audio/ogg; codecs=\"opus\"' }),
        Object.freeze({ src: './assets/sounds/sfx/counter.mp3', type: 'audio/mpeg' })
      ])
    }),
    cardExiled: Object.freeze({
      id: 'cardExiled', loop: false,
      sources: Object.freeze([
        Object.freeze({ src: './assets/sounds/sfx/exilio.opus', type: 'audio/ogg; codecs=\"opus\"' }),
        Object.freeze({ src: './assets/sounds/sfx/exilio.mp3', type: 'audio/mpeg' })
      ])
    }),
    cardBounced: Object.freeze({
      id: 'cardBounced', loop: false,
      sources: Object.freeze([
        Object.freeze({ src: './assets/sounds/sfx/volver_mano.opus', type: 'audio/ogg; codecs=\"opus\"' }),
        Object.freeze({ src: './assets/sounds/sfx/volver_mano.mp3', type: 'audio/mpeg' })
      ])
    }),
    cardDrawn: Object.freeze({
      id: 'cardDrawn', loop: false,
      sources: Object.freeze([
        Object.freeze({ src: './assets/sounds/sfx/robo.opus', type: 'audio/ogg; codecs=\"opus\"' }),
        Object.freeze({ src: './assets/sounds/sfx/robo.mp3', type: 'audio/mpeg' })
      ])
    }),
    cardDiscarded: Object.freeze({
      id: 'cardDiscarded', loop: false,
      sources: Object.freeze([
        Object.freeze({ src: './assets/sounds/sfx/descarte.opus', type: 'audio/ogg; codecs=\"opus\"' }),
        Object.freeze({ src: './assets/sounds/sfx/descarte.mp3', type: 'audio/mpeg' })
      ])
    }),
    cardSacrificed: Object.freeze({
      id: 'cardSacrificed', loop: false,
      sources: Object.freeze([
        Object.freeze({ src: './assets/sounds/sfx/sacrificio.opus', type: 'audio/ogg; codecs=\"opus\"' }),
        Object.freeze({ src: './assets/sounds/sfx/sacrificio.mp3', type: 'audio/mpeg' })
      ])
    }),
    cardToGraveyard: Object.freeze({
      id: 'cardToGraveyard', loop: false,
      sources: Object.freeze([
        Object.freeze({ src: './assets/sounds/sfx/cementerio.opus', type: 'audio/ogg; codecs=\"opus\"' }),
        Object.freeze({ src: './assets/sounds/sfx/cementerio.mp3', type: 'audio/mpeg' })
      ])
    }),
    cardReanimated: Object.freeze({
      id: 'cardReanimated', loop: false,
      sources: Object.freeze([
        Object.freeze({ src: './assets/sounds/sfx/reanimar.opus', type: 'audio/ogg; codecs=\"opus\"' }),
        Object.freeze({ src: './assets/sounds/sfx/reanimar.mp3', type: 'audio/mpeg' })
      ])
    })
  })
});

const DEFAULT_SETTINGS = Object.freeze({
  musicEnabled: true,
  musicVolume: 0.25,
  sfxEnabled: true,
  sfxVolume: 0.70
});

const clamp01 = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
};

export function normalizeAudioSettings(raw = {}) {
  return {
    musicEnabled: raw?.musicEnabled !== false,
    musicVolume: clamp01(raw?.musicVolume, DEFAULT_SETTINGS.musicVolume),
    sfxEnabled: raw?.sfxEnabled !== false,
    sfxVolume: clamp01(raw?.sfxVolume, DEFAULT_SETTINGS.sfxVolume)
  };
}

export function getDefaultAudioSettings() {
  return { ...DEFAULT_SETTINGS };
}

function loadStoredSettings() {
  if (typeof localStorage === 'undefined') return getDefaultAudioSettings();
  try {
    const raw = localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
    return raw ? normalizeAudioSettings(JSON.parse(raw)) : getDefaultAudioSettings();
  } catch {
    return getDefaultAudioSettings();
  }
}

let settings = loadStoredSettings();
let musicElement = null;
let currentMusicTrackId = null;
export const MUSIC_SCENE_TRACKS = Object.freeze({ menu: 'menu', solo: 'solo', multiplayer: 'multiplayer' });

let desiredScene = 'silent'; // 'menu' | 'solo' | 'multiplayer' | 'silent'
let audioUnlockedByGesture = false;
let pausedForVisibility = false;
let fadeSerial = 0;

function persistSettings() {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(settings)); } catch {}
}

function emitSettingsChanged() {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent('argentinia:audio-settings-changed', { detail: getAudioSettings() })); } catch {}
}

function emitSceneChanged() {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent('argentinia:audio-scene-changed', { detail: getAudioRuntimeStatus() })); } catch {}
}

export function getAudioSettings() {
  return { ...settings };
}

function ensureMusicElement(trackId = 'menu') {
  if (typeof document === 'undefined') return null;
  if (musicElement && currentMusicTrackId === trackId) return musicElement;

  if (musicElement) {
    try { musicElement.pause(); } catch {}
    try { musicElement.remove(); } catch {}
  }

  const track = AUDIO_CATALOG.music[trackId];
  if (!track) return null;

  const audio = document.createElement('audio');
  audio.dataset.argentiniaAudioRole = 'music';
  audio.dataset.argentiniaTrackId = trackId;
  audio.loop = track.loop !== false;
  audio.preload = track.preload || 'metadata';
  audio.setAttribute('playsinline', '');
  audio.volume = 0;

  for (const sourceDef of track.sources || []) {
    const source = document.createElement('source');
    source.src = sourceDef.src;
    source.type = sourceDef.type || '';
    audio.appendChild(source);
  }

  // El elemento no necesita UI nativa. Lo dejamos en DOM para que el navegador haga la
  // selección de <source> (Opus primero, MP3 fallback) según soporte real.
  audio.style.display = 'none';
  (document.body || document.documentElement)?.appendChild(audio);
  musicElement = audio;
  currentMusicTrackId = trackId;
  return audio;
}

function raf(callback) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback);
  return setTimeout(() => callback(Date.now()), 16);
}

function nowMs() {
  return (typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now();
}

function fadeMusicTo(targetVolume, durationMs = 700, pauseAtEnd = false) {
  const audio = musicElement;
  if (!audio) return;
  const target = clamp01(targetVolume, 0);
  const duration = Math.max(0, Number(durationMs) || 0);
  const serial = ++fadeSerial;
  const start = clamp01(audio.volume, 0);

  if (duration === 0 || Math.abs(start - target) < 0.002) {
    audio.volume = target;
    if (pauseAtEnd && target <= 0.001) audio.pause();
    return;
  }

  const startedAt = nowMs();
  const step = (timestamp) => {
    if (serial !== fadeSerial || audio !== musicElement) return;
    const elapsed = Math.max(0, Number(timestamp) - startedAt);
    const t = Math.min(1, elapsed / duration);
    // Smoothstep: arranque/freno suaves sin depender de Web Audio API.
    const eased = t * t * (3 - 2 * t);
    audio.volume = start + ((target - start) * eased);
    if (t < 1) {
      raf(step);
      return;
    }
    audio.volume = target;
    if (pauseAtEnd && target <= 0.001) audio.pause();
  };
  raf(step);
}

async function syncMusicToDesiredScene({ fadeMs = 700 } = {}) {
  const trackId = MUSIC_SCENE_TRACKS[desiredScene] || null;
  const shouldPlay = !!trackId
    && settings.musicEnabled
    && audioUnlockedByGesture
    && (typeof document === 'undefined' || !document.hidden);

  if (!shouldPlay) {
    if (musicElement && !musicElement.paused) fadeMusicTo(0, Math.min(400, fadeMs), true);
    return false;
  }

  const audio = ensureMusicElement(trackId);
  if (!audio) return false;

  try {
    const result = audio.play();
    if (result && typeof result.then === 'function') await result;
    fadeMusicTo(settings.musicVolume, fadeMs, false);
    return true;
  } catch (err) {
    // Autoplay audible puede ser rechazado hasta una interacción válida. No se considera
    // error de juego; simplemente rearmamos el unlock para el próximo click/tap/tecla.
    if (err?.name === 'NotAllowedError') audioUnlockedByGesture = false;
    return false;
  }
}

function markAudioGestureUnlocked() {
  if (audioUnlockedByGesture) return;
  audioUnlockedByGesture = true;
  void syncMusicToDesiredScene({ fadeMs: 450 });
}

if (typeof window !== 'undefined') {
  // Captura, pero jamás preventDefault: la misma interacción sigue llegando al botón real.
  window.addEventListener('pointerdown', markAudioGestureUnlocked, { capture: true, passive: true });
  window.addEventListener('touchend', markAudioGestureUnlocked, { capture: true, passive: true });
  window.addEventListener('keydown', markAudioGestureUnlocked, { capture: true });
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pausedForVisibility = !!musicElement && !musicElement.paused && !!MUSIC_SCENE_TRACKS[desiredScene];
      if (musicElement && !musicElement.paused) musicElement.pause();
      return;
    }
    if (pausedForVisibility) {
      pausedForVisibility = false;
      void syncMusicToDesiredScene({ fadeMs: 250 });
    }
  });
}

export function enterMenuAudio() {
  desiredScene = 'menu';
  // Crear el elemento ya permite preload=metadata sin violar autoplay; el play audible
  // sigue bloqueado hasta el primer gesto válido.
  ensureMusicElement('menu');
  emitSceneChanged();
  void syncMusicToDesiredScene({ fadeMs: 700 });
}

export function enterGameplayAudio(mode = 'solo') {
  desiredScene = mode === 'multiplayer' ? 'multiplayer' : 'solo';
  ensureMusicElement(MUSIC_SCENE_TRACKS[desiredScene]);
  emitSceneChanged();
  void syncMusicToDesiredScene({ fadeMs: 650 });
}

export function silenceAudio() {
  desiredScene = 'silent';
  emitSceneChanged();
  if (musicElement && !musicElement.paused) fadeMusicTo(0, 350, true);
}

export function setMusicEnabled(enabled) {
  settings = { ...settings, musicEnabled: !!enabled };
  persistSettings();
  emitSettingsChanged();
  if (settings.musicEnabled) void syncMusicToDesiredScene({ fadeMs: 250 });
  else if (musicElement && !musicElement.paused) fadeMusicTo(0, 250, true);
  return settings.musicEnabled;
}

export function toggleMusic() {
  return setMusicEnabled(!settings.musicEnabled);
}

export function setMusicVolume(volume) {
  settings = { ...settings, musicVolume: clamp01(volume, settings.musicVolume) };
  persistSettings();
  emitSettingsChanged();
  if (musicElement && !musicElement.paused && !!MUSIC_SCENE_TRACKS[desiredScene] && settings.musicEnabled) {
    fadeMusicTo(settings.musicVolume, 100, false);
  }
  return settings.musicVolume;
}

export function setSfxEnabled(enabled) {
  settings = { ...settings, sfxEnabled: !!enabled };
  persistSettings();
  emitSettingsChanged();
  return settings.sfxEnabled;
}

export function setSfxVolume(volume) {
  settings = { ...settings, sfxVolume: clamp01(volume, settings.sfxVolume) };
  persistSettings();
  emitSettingsChanged();
  return settings.sfxVolume;
}

export function playSfx(id, options = {}) {
  if (!settings.sfxEnabled || settings.sfxVolume <= 0 || typeof document === 'undefined') return null;
  const def = AUDIO_CATALOG.sfx[id];
  if (!def) return null;
  const audio = document.createElement('audio');
  audio.preload = 'auto';
  const relativeVolumeRaw=Number(options?.volumeMultiplier ?? options?.relativeVolume ?? 1);
  const relativeVolume=Number.isFinite(relativeVolumeRaw) ? Math.max(0,Math.min(2,relativeVolumeRaw)) : 1;
  audio.volume = Math.max(0,Math.min(1,settings.sfxVolume * relativeVolume));
  audio.setAttribute('playsinline', '');
  for (const sourceDef of def.sources || []) {
    const source = document.createElement('source');
    source.src = sourceDef.src;
    source.type = sourceDef.type || '';
    audio.appendChild(source);
  }
  const cleanup = () => { try { audio.remove(); } catch {} };
  audio.addEventListener('ended', cleanup, { once: true });
  audio.addEventListener('error', cleanup, { once: true });
  (document.body || document.documentElement)?.appendChild(audio);
  const promise = audio.play();
  if (promise && typeof promise.catch === 'function') promise.catch(cleanup);
  return audio;
}

export function getAudioRuntimeStatus() {
  return {
    desiredScene,
    musicTrackId: currentMusicTrackId,
    musicPlaying: !!musicElement && !musicElement.paused,
    currentTime: musicElement?.currentTime || 0,
    unlocked: audioUnlockedByGesture,
    ...getAudioSettings()
  };
}
