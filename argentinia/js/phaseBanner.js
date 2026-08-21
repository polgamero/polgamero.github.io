import { gameText } from './gameTexts.js';
// 23.13.7 — avisos visuales de macro-fase. Presentación pura: no avanza turnos ni toca prioridad.
const MACRO_PHASES = {
  untap: { key: 'untap', textKey: 'phase.banner.untap' },
  upkeep: { key: 'upkeep', textKey: 'phase.banner.upkeep' },
  draw: { key: 'draw', textKey: 'phase.banner.draw' },
  main1: { key: 'main1', textKey: 'phase.banner.main1', major: true },
  combat_begin: { key: 'combat', textKey: 'phase.banner.combat', major: true },
  combat_attackers: { key: 'combat', textKey: 'phase.banner.combat', major: true },
  combat_blockers: { key: 'combat', textKey: 'phase.banner.combat', major: true },
  combat_damage: { key: 'combat', textKey: 'phase.banner.combat', major: true },
  combat_end: { key: 'combat', textKey: 'phase.banner.combat', major: true },
  main2: { key: 'main2', textKey: 'phase.banner.main2', major: true },
  end_step: { key: 'end', textKey: 'phase.banner.end' },
  cleanup: { key: 'cleanup', textKey: 'phase.banner.cleanup' }
};

let lastBannerKey = null;
let lastTurnCount = 0;
let cleanupTimer = null;

function clearLayer(layer) {
  if (!layer) return;
  if (typeof layer.replaceChildren === 'function') { layer.replaceChildren(); return; }
  if ('innerHTML' in layer) { layer.innerHTML = ''; return; }
  while (layer.firstChild && typeof layer.removeChild === 'function') layer.removeChild(layer.firstChild);
}

function detachBanner(banner) {
  if (!banner) return;
  if (typeof banner.remove === 'function') { banner.remove(); return; }
  if (banner.parentNode && typeof banner.parentNode.removeChild === 'function') banner.parentNode.removeChild(banner);
}

function ensureLayer() {
  const board = document.getElementById('board');
  if (!board) return null;
  let layer = document.getElementById('phase-banner-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'phase-banner-layer';
    layer.setAttribute('aria-live', 'polite');
    layer.setAttribute('aria-atomic', 'true');
    board.appendChild(layer);
  }
  return layer;
}

export function announcePhaseTransition({ phase, turnCount = 0, activePlayer = 'local' } = {}) {
  const app = document.getElementById('game-app');
  if (!app || app.classList.contains('hidden')) return false;
  const info = MACRO_PHASES[phase];
  if (!info) return false;

  // Reconnect dentro de un substep de combate sigue mostrando COMBATE una sola vez.
  if (turnCount < lastTurnCount) lastBannerKey = null;
  lastTurnCount = turnCount;
  const key = `${turnCount}:${activePlayer}:${info.key}`;
  if (key === lastBannerKey) return false;
  lastBannerKey = key;

  const layer = ensureLayer();
  if (!layer) return false;
  clearTimeout(cleanupTimer);
  clearLayer(layer);

  const banner = document.createElement('div');
  banner.className = `phase-banner${info.major ? ' major' : ''}${info.key === 'combat' ? ' combat' : ''}`;
  banner.innerHTML = `<span class="phase-banner-rule"></span><span class="phase-banner-label">${gameText(info.textKey)}</span><span class="phase-banner-rule"></span>`;
  layer.appendChild(banner);
  // Reinsertar fuerza reinicio de la animación aun si dos macrofases cambian muy rápido.
  void banner.offsetWidth;
  banner.classList.add('run');
  const schedule = (typeof window !== 'undefined' && typeof window.setTimeout === 'function')
    ? window.setTimeout.bind(window)
    : (typeof globalThis.setTimeout === 'function' ? globalThis.setTimeout.bind(globalThis) : null);
  cleanupTimer = schedule ? schedule(() => detachBanner(banner), info.major ? 3300 : 2850) : null;
  return true;
}

export function resetPhaseBannerState() {
  lastBannerKey = null;
  lastTurnCount = 0;
  clearTimeout(cleanupTimer);
  clearLayer(document.getElementById('phase-banner-layer'));
}
