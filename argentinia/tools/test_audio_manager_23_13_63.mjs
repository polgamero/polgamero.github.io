import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = process.cwd();
const audio = await import(pathToFileURL(path.join(root, 'js/audioManager.js')).href);
const ui = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const version = fs.readFileSync(path.join(root, 'js/version.js'), 'utf8');

const defaults = audio.getDefaultAudioSettings();
assert.equal(defaults.musicEnabled, true, 'Música debe venir activada por default.');
assert.equal(defaults.musicVolume, 0.25, 'Volumen inicial de música debe ser 25%.');
assert.equal(defaults.sfxEnabled, true, 'SFX debe tener setting independiente desde el inicio.');
assert.equal(defaults.sfxVolume, 0.70, 'Volumen inicial de SFX debe ser 70%.');

const normalized = audio.normalizeAudioSettings({ musicVolume: 2, sfxVolume: -1, musicEnabled: false });
assert.equal(normalized.musicVolume, 1, 'Music volume debe clamp a 1.');
assert.equal(normalized.sfxVolume, 0, 'SFX volume debe clamp a 0.');
assert.equal(normalized.musicEnabled, false, 'Mute de música debe preservarse.');

const menu = audio.AUDIO_CATALOG.music.menu;
assert.equal(menu.preload, 'metadata', 'Música de menú no debe usar preload auto.');
assert.equal(menu.loop, true, 'Tema de menú debe loopear.');
assert.deepEqual(menu.sources.map(s => s.src), [
  './assets/sounds/music/menu.opus',
  './assets/sounds/music/menu.mp3'
], 'Rutas oficiales de menu.opus/menu.mp3 cambiaron.');
assert.match(menu.sources[0].type, /opus/i, 'Opus debe ser source primario.');
assert.equal(menu.sources[1].type, 'audio/mpeg', 'MP3 debe ser fallback.');
assert.equal(audio.AUDIO_SETTINGS_STORAGE_KEY, 'argentinia.audio.v1', 'Persistencia de audio cambió sin migración.');

assert.ok(ui.includes('enterMenuAudio();'), 'Menú principal no arma la escena musical.');
assert.ok(ui.includes("id=\"opt-music-volume\""), 'Opciones no incluye slider de Música.');
assert.ok(ui.includes("id=\"opt-sfx-volume\""), 'Opciones no incluye slider separado de Efectos.');
assert.ok(ui.includes("id=\"menu-music-toggle\""), 'Menú no incluye mute rápido de música.');
assert.ok(main.includes('async function initGame(deckSource) {\n  enterGameplayAudio();'), 'Solitario no hace fade-out al entrar a gameplay.');
assert.ok(main.includes("function startMultiplayerMatch(matchId, myRole, deckSource, rivalName, rivalPhotoURL = '', rawStartingRole = 'host') {\n  enterGameplayAudio();"), 'Multiplayer no hace fade-out al entrar a gameplay.');
assert.ok(fs.readFileSync(path.join(root, 'js/audioManager.js'), 'utf8').includes("document.addEventListener('visibilitychange'"), 'Audio no pausa/reanuda al cambiar visibilidad.');
assert.ok(fs.readFileSync(path.join(root, 'js/audioManager.js'), 'utf8').includes("window.addEventListener('pointerdown'"), 'Audio no espera interacción de usuario para autoplay audible.');
assert.ok(version.includes("ENGINE_VERSION = '23.13.63'"), 'Engine version no fue actualizada.');
assert.ok(version.includes("FIRESTORE_RULES_VERSION = '23.13.62'"), 'Audio local no debe cambiar Firestore Rules.');

console.log('AUDIO_MANAGER_23_13_63_OK menu=opus>mp3 volume=25 sfx=separate autoplay=gesture fade=700 visibility=pause');
