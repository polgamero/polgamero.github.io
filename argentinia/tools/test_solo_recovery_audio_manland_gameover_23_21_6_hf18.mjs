import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const main = read('../js/main.js');
const ui = read('../js/ui.js');
const bot = read('../js/bot.js');
const audio = read('../js/audioManager.js');
const animation = read('../js/animationDirector.js');
const social = read('../js/multiplayerSocial.js');

function slice(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  if (!endMarker) return src.slice(start);
  const end = src.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `missing ${endMarker}`);
  return src.slice(start, end);
}

// 1) Game over reuse: a Solo game must always undo the tournament label/disabled state.
const gameOver = slice(ui, 'export function showGameOverOverlay', 'export function showGameRewardStatus');
assert.match(gameOver, /const tournamentGameOver = !!state\.currentTournamentMatch/);
assert.match(gameOver, /gameText\(tournamentGameOver \? 'tournament\.match\.returnFixture' : 'game\.over\.backMenu'\)/);
assert.match(gameOver, /els\.btnRestart\.disabled = tournamentGameOver/);

// 2) Solo recovery owns the route over stale tournament-reopen state.
assert.match(main, /const TOURNAMENT_REOPEN_STORAGE_KEY = 'argentinia\.tournament\.openAfterReload\.v1'/);
const longSuspend = slice(main, 'function forceSoloRecoveryReloadAfterLongSuspend', 'function handleSoloVisibilityLifecycle');
assert.ok(longSuspend.indexOf('clearTournamentReopenIntent();') < longSuspend.indexOf('window.location.reload()'),
  'long Solo suspend must clear stale tournament route before reload');
const resume = slice(main, 'async function resumeSoloRecoveryGame', 'async function offerSoloRecoveryIfAvailable');
assert.match(resume, /clearTournamentReopenIntent\(\)/);
assert.match(resume, /state\.currentTournamentMatch = null/);
assert.match(resume, /#tournament-overlay/);
const offer = slice(main, 'async function offerSoloRecoveryIfAvailable', '// Mulligan de Londres');
assert.match(offer, /clearTournamentReopenIntent\(\)/);
assert.match(offer, /document\.querySelector\('#tournament-overlay'\)\?\.remove\(\)/);
const bootTournament = slice(main, '// 23.20.0 — after a finished/aborted tournament gameplay reload', '// 23.13.61 — el popup');
assert.match(bootTournament, /soloRecoveryOwnsBootRoute\(\)/);
assert.ok(bootTournament.indexOf('soloRecoveryOwnsBootRoute()') < bootTournament.indexOf('await startTournamentFlow()'),
  'boot must adjudicate Solo recovery before opening tournament fixture');

// 3) Tano man-land: only animate offensively in its own Main1 and only when it can attack.
const activate = slice(bot, "if (effect.type === 'animate_land')", "else if (effect.type === 'crew_vehicle')");
assert.match(activate, /state\.activePlayer === 'rival' && state\.phase === 'main1' && canAttackAfterAnimation/);
assert.match(activate, /!supportItem\.tapped && \(!supportItem\.enteredThisTurn \|\| animationHasHaste\)/);
assert.match(activate, /state\.activePlayer === 'local' && state\.phase === 'combat_blockers' && canBlockAfterAnimation/);
assert.doesNotMatch(activate, /shouldActivate = state\.phase === 'main1' \|\|/);
assert.match(activate, /bot_animate_land_deferred/);

// 4) Quick mixer channels are orthogonal at runtime, not only by static shape.
const audioModule = await import('../js/audioManager.js');
audioModule.setQuickSfxLevel(0.53);
audioModule.setQuickMusicLevel(0);
let settings = audioModule.getAudioSettings();
assert.equal(settings.musicVolume, 0);
assert.equal(settings.musicEnabled, false);
assert.equal(settings.sfxVolume, 0.53);
assert.equal(settings.sfxEnabled, true);
audioModule.setQuickMusicLevel(0.31);
audioModule.setQuickSfxLevel(0);
settings = audioModule.getAudioSettings();
assert.equal(settings.musicVolume, 0.31);
assert.equal(settings.musicEnabled, true);
assert.equal(settings.sfxVolume, 0);
assert.equal(settings.sfxEnabled, false);

const musicSetter = slice(audio, 'export function setQuickMusicLevel', 'export function setQuickSfxLevel');
assert.doesNotMatch(musicSetter, /sfxVolume|sfxEnabled/);
const sfxSetter = slice(audio, 'export function setQuickSfxLevel', 'export function setMusicVolume');
assert.doesNotMatch(sfxSetter, /musicVolume|musicEnabled/);
assert.match(audio, /export function playExternalSfx/);
assert.match(social, /playExternalSfx\(url\)/);
assert.doesNotMatch(social, /new Audio\(/);

// 5) Mana-tap SFX is semantic: it must fire even if the visual snapshot cannot be captured.
const eventRouter = slice(animation, 'export function queueGameEventAnimation', 'export function preparePresentationCuePlayback');
const tapBranchStart = eventRouter.indexOf("type==='permanent_tapped' && event.cause==='mana_ability'");
const semanticSfx = eventRouter.indexOf("playSfx('landTap'", tapBranchStart);
const capture = eventRouter.indexOf('captureCardVisual', tapBranchStart);
assert.ok(tapBranchStart >= 0 && semanticSfx > tapBranchStart && capture > semanticSfx,
  'land tap sound must happen before optional visual capture');
assert.match(eventRouter, /queueLandTapAnimation\(\{snapshot,isLocal\},\{\.\.\.options,semanticSfxPlayed:true\}\)/);
const landAnim = slice(animation, 'async function animateLandTap', 'function targetDelta');
assert.match(landAnim, /if \(!payload\?\.semanticSfxPlayed\) playAnimationSfx\('landTap','land','start'\)/);
assert.match(landAnim, /if \(!payload\?\.semanticSfxPlayed\) playAnimationSfx\('landTap','land','key'\)/);

console.log('SOLO_RECOVERY_AUDIO_MANLAND_GAMEOVER_23_21_6_HF18_OK route=solo audio=independent manland=guarded gameover=reset');
