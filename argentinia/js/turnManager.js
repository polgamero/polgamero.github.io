import { logMsg, els, showGameOverOverlay, render } from './ui.js';
import { state } from './main.js';
import { startRivalTurn } from './bot.js';
import { spellStack } from './stackManager.js';

export function checkGameOver() {
  if (state.gameOver) return;
  if (state.localHP <= 0) {
    state.gameOver = true; logMsg("💀 Te quedaste sin HP. ¡Ganó el Tano!"); showGameOverOverlay(false);
  } else if (state.rivalHP <= 0) {
    state.gameOver = true; logMsg("🏆 ¡VICTORIA! Hiciste morder el polvo al Tano."); showGameOverOverlay(true);
  }
}

export function attemptPassTurn() {
  if (!state.isPlayerTurn || state.gameOver) return;

  // NUEVO: Bloqueo por pila activa
  if (spellStack.length > 0) {
    logMsg("❌ No podés pasar el turno con hechizos en la pila. ¡Resolvelos primero!");
    return;
  }

  if (state.isDiscarding) {
    logMsg("❌ ¡Epa! Primero tenés que descartar las cartas que te sobran.");
    return;
  }

  const excess = state.localHand.length - 7;
  
  if (excess > 0) {
    state.isDiscarding = true;
    state.cardsToDiscard = excess;
    logMsg(`⚠️ Tenés demasiadas cartas. Hacé clic en ${excess} carta(s) de tu mano para descartar.`);
    render(); 
  } else {
    logMsg("Terminás tu turno.");
    passTurnToRival();
  }
}

export function handleDiscardClick(index) {
  const discardedCard = state.localHand.splice(index, 1)[0];
  state.localGraveyard.push(discardedCard);
  state.cardsToDiscard--;
  
  logMsg(`🗑️ Descartaste ${discardedCard.name}.`);

  if (state.cardsToDiscard <= 0) {
    state.isDiscarding = false;
    logMsg("Mano en 7 cartas. ¡Turno del Tano!");
    passTurnToRival();
  }
  
  render();
}

export async function passTurnToRival() {
  if (!state.isPlayerTurn || state.gameOver) return;
  state.isPlayerTurn = false;
  state.localCombat.forEach(c => c.isAttacking = false);
  els.btnEndTurn.textContent = "Turno Rival...";
  els.btnEndTurn.style.backgroundColor = "#7f8c8d";
  logMsg("Terminaste tu turno. El Tano está pensando...");
  
  state.localCombat.forEach(c => c.damageTaken = 0);
  state.rivalCombat.forEach(c => c.damageTaken = 0);
  
  render();
  setTimeout(startRivalTurn, 1500);
}

export function startLocalTurn() {
  if (state.gameOver) return;
  state.turnCount++;
  state.isPlayerTurn = true;
  state.phase = 'main';

  state.localLandPlayedThisTurn = false;
  state.localLands.forEach(l => l.tapped = false);
  state.localCombat.forEach(c => { c.tapped = false; c.summoningSickness = false; c.isAttacking = false; c.blockingIndex = null; c.damageTaken = 0; });
  state.rivalCombat.forEach(c => c.damageTaken = 0); 
  state.localSupport.forEach(s => s.tapped = false);

  if (state.localDeck.length > 0) {
    state.localHand.push(state.localDeck.pop());
    logMsg(`Turno ${state.turnCount}: Enderezaste y robaste una carta.`);
  }
  render();
}
