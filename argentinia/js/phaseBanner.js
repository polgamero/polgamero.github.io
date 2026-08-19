// 23.13.7 — avisos visuales de macro-fase. Presentación pura: no avanza turnos ni toca prioridad.
const MACRO_PHASES = {
  untap: { key: 'untap', label: 'ENDEREZAR' },
  upkeep: { key: 'upkeep', label: 'MANTENIMIENTO' },
  draw: { key: 'draw', label: 'ROBO' },
  main1: { key: 'main1', label: 'MAIN 1', major: true },
  combat_begin: { key: 'combat', label: 'COMBATE', major: true },
  combat_attackers: { key: 'combat', label: 'COMBATE', major: true },
  combat_blockers: { key: 'combat', label: 'COMBATE', major: true },
  combat_damage: { key: 'combat', label: 'COMBATE', major: true },
  combat_end: { key: 'combat', label: 'COMBATE', major: true },
  main2: { key: 'main2', label: 'MAIN 2', major: true },
  end_step: { key: 'end', label: 'PASO FINAL' },
  cleanup: { key: 'cleanup', label: 'LIMPIEZA' }
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
  banner.innerHTML = `<span class="phase-banner-rule"></span><span class="phase-banner-label">${info.label}</span><span class="phase-banner-rule"></span>`;
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
