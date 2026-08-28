import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AUDIO_CATALOG, MUSIC_SCENE_TRACKS, enterGameplayAudio, getAudioRuntimeStatus } from '../js/audioManager.js';
import { ENGINE_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';

assert.equal(ENGINE_VERSION, '23.19.2');
assert.equal(FIRESTORE_RULES_VERSION, '23.13.77');
assert.deepEqual(MUSIC_SCENE_TRACKS, { menu:'menu', solo:'solo', multiplayer:'multiplayer' });

const sources = (id) => AUDIO_CATALOG.music[id].sources.map(x => x.src);
assert.deepEqual(sources('solo'), ['./assets/sounds/music/solo.opus','./assets/sounds/music/solo.mp3']);
assert.deepEqual(sources('multiplayer'), ['./assets/sounds/music/multiplayer.opus','./assets/sounds/music/multiplayer.mp3']);
assert.equal(AUDIO_CATALOG.music.solo.loop, true);
assert.equal(AUDIO_CATALOG.music.multiplayer.loop, true);

enterGameplayAudio('solo');
assert.equal(getAudioRuntimeStatus().desiredScene, 'solo');
enterGameplayAudio('multiplayer');
assert.equal(getAudioRuntimeStatus().desiredScene, 'multiplayer');

const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
assert.match(main, /async function initGame\(deckSource\)[\s\S]{0,160}enterGameplayAudio\('solo'\)/);
assert.match(main, /resumeSoloRecoveryGame\(candidate\)[\s\S]{0,160}enterGameplayAudio\('solo'\)/);
assert.match(main, /startMultiplayerMatch\([\s\S]{0,700}enterGameplayAudio\('multiplayer'\)/);
assert.match(main, /resumeReconnectedMatch\([\s\S]{0,220}enterGameplayAudio\('multiplayer'\)/);

const telemetry = fs.readFileSync(new URL('../js/telemetry.js', import.meta.url), 'utf8');
assert.match(telemetry, /id = 'arg-game-music-toggle'/);
assert.match(telemetry, /panel\.append\(recToggle, gameplayMusicToggleEl,/);
assert.match(telemetry, /toggleMusic\(\)/);
assert.match(telemetry, /audio\.desiredScene === 'solo' \|\| audio\.desiredScene === 'multiplayer'/);
assert.match(telemetry, /argentinia:audio-settings-changed/);
assert.match(telemetry, /argentinia:audio-scene-changed/);

const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const mobile = fs.readFileSync(new URL('../css/mobile.css', import.meta.url), 'utf8');
assert.match(css, /\.arg-game-music-toggle/);
assert.match(css, /:not\(\.arg-game-music-toggle\)/);
assert.match(mobile, /html\.argentinia-mobile \.arg-game-music-toggle/);
assert.match(mobile, /:not\(\.arg-game-music-toggle\)/);

console.log('GAMEPLAY_MUSIC_23_17_5_OK tracks=menu+solo+multiplayer fallback=opus>mp3 hud=REC+music persistent=shared');
