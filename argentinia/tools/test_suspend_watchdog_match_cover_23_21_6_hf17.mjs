import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const main = read('../js/main.js');
const ui = read('../js/ui.js');
const telemetry = read('../js/telemetry.js');
const recovery = read('../js/soloRecovery.js');
const turn = read('../js/turnManager.js');
const coin = read('../js/startingCoin.js');

function slice(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  if (!endMarker) return src.slice(start);
  const end = src.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `missing ${endMarker}`);
  return src.slice(start, end);
}

// RCA real: al resolverse En espera, la Stack ya puede estar vacía mientras el humano
// todavía decide "Castear gratis". Ese estado debe ser pending explícito para Telemetry.
assert.match(main, /pendingSuspendCastChoice:\s*null/);
const suspendResolve = slice(main, 'export async function resolveSuspendCastFromExile', 'export function canPlayCard');
const setPending = suspendResolve.indexOf('state.pendingSuspendCastChoice = {');
const awaitModal = suspendResolve.indexOf('await showSuspendCastModal');
const clearPending = suspendResolve.indexOf('state.pendingSuspendCastChoice = null;');
assert.ok(setPending >= 0 && awaitModal > setPending, 'Suspend choice pending must be armed before awaiting human input');
assert.ok(clearPending > awaitModal, 'Suspend choice pending must be cleared after the modal completes');
assert.match(suspendResolve, /try\s*\{[\s\S]*await showSuspendCastModal[\s\S]*\}\s*finally\s*\{[\s\S]*pendingSuspendCastChoice = null/);
assert.match(telemetry, /'pendingSuspendTransaction', 'pendingSuspendCastChoice'/);
assert.match(recovery, /'pendingCastTransaction','pendingSuspendCastChoice'/);
assert.match(turn, /hasSoloInteractiveResolutionPending\(\)[\s\S]*pendingSuspendCastChoice/);

// No se desactiva BOT_PRIORITY_STALL globalmente: una prioridad rival realmente vacía
// sigue siendo sospechosa cuando no hay pending humano.
const watchdog = slice(telemetry, 'function pollBotPriorityWatchdog()', 'function startBotPriorityWatchdog()');
assert.match(watchdog, /state\?\.priorityPlayer === 'rival'/);
assert.match(watchdog, /Object\.keys\(pending\)\.length === 0/);

// Cover de inicio: los pickers arman negro+spinner ANTES de retirarse y llamar al flow.
assert.match(main, /globalThis\.__ARGENTINIA_SHOW_MATCH_LOADING__ = showMatchInitializationOverlay/);
const picker = slice(ui, 'export function showPlayDeckPickerModal', 'export function showMyDecksScreen');
const showCover = picker.indexOf('showMatchLoadingBeforeGameplayCommit();');
const removePicker = picker.indexOf('overlay.remove();', showCover);
const chooseDeck = picker.indexOf('onChooseDeck(deck);', showCover);
assert.ok(showCover >= 0 && removePicker > showCover && chooseDeck > removePicker,
  'Saved-deck start must arm cover before removing picker/calling gameplay');
assert.match(picker, /playpicker-testdeck[\s\S]*showMatchLoadingBeforeGameplayCommit\(\);[\s\S]*overlay\.remove\(\);[\s\S]*onPlayTestDeck\(\)/);

// Guest/random Solo follows the same no-bare-board contract.
const deckSelect = slice(ui, 'export function showDeckSelectionModal', 'export function showMulliganModal');
assert.match(deckSelect, /if \(!mandatory\) \{[\s\S]*showMatchLoadingBeforeGameplayCommit\(\);[\s\S]*closeOverlay\(\);[\s\S]*onChoose\(identity\)/);

// Menú -> selector/superficie: destination mounts before the menu cover is removed.
const menu = slice(ui, 'export function showMainMenu', null);
assert.match(menu, /#menu-play[\s\S]*await onPlay\(\);[\s\S]*overlay\.remove\(\);/);
assert.match(menu, /#menu-tournament[\s\S]*await onTournament\(\);[\s\S]*overlay\.remove\(\);/);

// Solo/Torneo siguen forzando paint antes del setup pesado.
const initGame = slice(main, 'async function initGame(deckSource, options = {})', 'async function abandonRecoveredSolo');
assert.ok(initGame.indexOf('showMatchInitializationOverlay();') < initGame.indexOf('await paintMatchInitializationOverlay();'));
assert.ok(initGame.indexOf('await paintMatchInitializationOverlay();') < initGame.indexOf('setupBoardLayout();'));

// Multiplayer ahora tiene la MISMA garantía: async + paint real antes de retirar overlays/setup.
const mp = slice(main, 'async function startMultiplayerMatch', '// FASE 4, ETAPA 2');
const mpShow = mp.indexOf('showMatchInitializationOverlay();');
const mpPaint = mp.indexOf('await paintMatchInitializationOverlay();');
const mpRemove = mp.indexOf("document.querySelectorAll('#main-menu-overlay, #multiplayer-overlay, #mydecks-overlay')");
const mpSetup = mp.indexOf('setupBoardLayout();');
assert.ok(mpShow >= 0 && mpPaint > mpShow && mpRemove > mpPaint && mpSetup > mpPaint,
  'Multiplayer must paint cover before removing flow overlays or building the board');

// La moneda reemplaza al spinner sólo después de estar montada en DOM.
const appendCoin = coin.indexOf('document.body.appendChild(overlay);');
const hideLoading = coin.indexOf('__ARGENTINIA_HIDE_MATCH_LOADING__');
assert.ok(appendCoin >= 0 && hideLoading > appendCoin, 'Coin must mount before initialization cover is hidden');

console.log('SUSPEND_WATCHDOG_MATCH_COVER_23_21_6_HF17_OK suspendPending=explicit solo=tournament=multiplayer=covered');
