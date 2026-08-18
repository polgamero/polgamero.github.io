// js/mobileUI.js — Entrega 23.11.2 Mobile Complex Overlays / Private Choices Phase 3.
// Exclusivamente presentación e interacción táctil. NO importa main.js, NO lee state y NO
// contiene reglas de juego. Para decidir entre preview y acción usa únicamente señales DOM
// ya renderizadas por el motor (targetable, mana-payable, textos/botones de fase, etc.).

globalThis.__ARGENTINIA_BOOT_DIAG__?.mark?.('mobile_ui_module_evaluating');

const MOBILE_ROOT_CLASS = 'argentinia-mobile';
const MOBILE_SHELL_READY_CLASS = 'arg-mobile-shell-ready';
const ENTERED_CLASS = 'arg-mobile-entered';
const PORTRAIT_CLASS = 'arg-mobile-portrait';
const LANDSCAPE_CLASS = 'arg-mobile-landscape';
const FULLSCREEN_CLASS = 'arg-mobile-is-fullscreen';
const FORCE_PARAM = 'ui';
const PHONE_SHORT_SIDE_MAX = 720;
const LOG_OPEN_CLASS = 'arg-mobile-log-open';
const STACK_OPEN_CLASS = 'arg-mobile-stack-open';
const CARD_PREVIEW_OPEN_CLASS = 'arg-mobile-card-preview-open';
const STACK_PREVIEW_OPEN_CLASS = 'arg-mobile-stack-preview-open';
const ZONES_OPEN_CLASS = 'arg-mobile-zones-open';
const GAMEPLAY_ZONE_SELECTOR = '#local-hand,#rival-hand,#local-lands,#rival-lands,#local-combat,#rival-combat,#local-support,#rival-support,#local-planeswalkers,#rival-planeswalkers';
const directClickBypass = new WeakSet();
let lastStackPreviewAnchor = null;

export function classifyMobileTapIntent({
  targetable = false,
  manaPayable = false,
  instantAction = false,
  discardChoice = false,
  combatDeclaration = false,
  blockingDeclaration = false,
  pendingChoice = false,
  waitingRival = false,
  damageModalOpen = false,
  stackTargetable = false,
} = {}) {
  if (damageModalOpen) return 'preview';
  if (targetable || manaPayable || instantAction || discardChoice || combatDeclaration || blockingDeclaration || stackTargetable) return 'direct';
  if (pendingChoice && !waitingRival) return 'direct';
  return 'preview';
}

export function classifyMobileOverlayKind({ privateZone = false, zoneBrowser = false, selection = false, damage = false } = {}) {
  if (damage) return 'damage';
  if (privateZone) return 'private-zone';
  if (zoneBrowser) return 'zone-browser';
  if (selection) return 'selection';
  return 'choice';
}

export function normalizeForcedMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'mobile' || normalized === 'desktop' ? normalized : 'auto';
}

export function classifyMobileSurface({ width, height, coarsePointer = false, forcedMode = 'auto' } = {}) {
  const forced = normalizeForcedMode(forcedMode);
  if (forced === 'mobile') return true;
  if (forced === 'desktop') return false;

  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w <= 0 || h <= 0) return false;

  // No identificamos Android/iPhone por User-Agent. Nos importa una superficie táctil
  // de teléfono: puntero grueso + lado corto pequeño. Así una notebook touch no cambia UI.
  return Boolean(coarsePointer) && Math.min(w, h) <= PHONE_SHORT_SIDE_MAX;
}

export function getOrientationForViewport(width, height) {
  return Number(width) > Number(height) ? 'landscape' : 'portrait';
}

function getForcedModeFromLocation() {
  try {
    return normalizeForcedMode(new URLSearchParams(window.location.search).get(FORCE_PARAM));
  } catch {
    return 'auto';
  }
}

function hasCoarsePointer() {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

function isMobileSurfaceNow() {
  return classifyMobileSurface({
    width: window.innerWidth,
    height: window.innerHeight,
    coarsePointer: hasCoarsePointer(),
    forcedMode: getForcedModeFromLocation(),
  });
}

function isStandaloneDisplay() {
  try {
    return window.matchMedia('(display-mode: fullscreen)').matches
      || window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  } catch {
    return false;
  }
}

function isFullscreenNow() {
  return Boolean(document.fullscreenElement) || isStandaloneDisplay();
}

function ensureMobileGates() {
  if (document.getElementById('arg-mobile-rotate-gate')) return;

  const rotate = document.createElement('div');
  rotate.id = 'arg-mobile-rotate-gate';
  rotate.setAttribute('role', 'dialog');
  rotate.setAttribute('aria-modal', 'true');
  rotate.setAttribute('aria-label', 'Girá el celular para jugar');
  rotate.innerHTML = `
    <div class="arg-mobile-gate-card">
      <span class="arg-mobile-gate-icon" aria-hidden="true">📱↻</span>
      <h1 class="arg-mobile-gate-title">ARGENTINIA</h1>
      <p class="arg-mobile-gate-copy"><strong>Girá el celular.</strong><br>Argentinia se juega exclusivamente en horizontal.</p>
    </div>`;

  const enter = document.createElement('div');
  enter.id = 'arg-mobile-enter-gate';
  enter.setAttribute('role', 'dialog');
  enter.setAttribute('aria-modal', 'true');
  enter.setAttribute('aria-label', 'Entrar a Argentinia en pantalla completa');
  enter.innerHTML = `
    <div class="arg-mobile-gate-card">
      <span class="arg-mobile-gate-icon" aria-hidden="true">🧉</span>
      <h1 class="arg-mobile-gate-title">ARGENTINIA</h1>
      <p class="arg-mobile-gate-copy">Modo celular listo. El juego intentará usar <strong>pantalla completa</strong> y bloquear la orientación en horizontal.</p>
      <button id="arg-mobile-enter-btn" class="arg-mobile-enter-btn" type="button">ENTRAR AL JUEGO</button>
      <p class="arg-mobile-gate-note">Si tu navegador no permite fullscreen u orientation lock, el juego continúa igual y seguirá bloqueando visualmente el modo vertical.</p>
    </div>`;

  const retry = document.createElement('button');
  retry.id = 'arg-mobile-fullscreen-retry';
  retry.type = 'button';
  retry.title = 'Volver a pantalla completa';
  retry.setAttribute('aria-label', 'Volver a pantalla completa');
  retry.textContent = '⛶';

  document.body.append(rotate, enter, retry);
  document.getElementById('arg-mobile-enter-btn')?.addEventListener('click', enterMobileExperience);
  retry.addEventListener('click', requestImmersiveMode);
}

async function requestFullscreenSafely() {
  if (document.fullscreenElement || typeof document.documentElement?.requestFullscreen !== 'function') {
    return Boolean(document.fullscreenElement);
  }
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    return true;
  } catch {
    // Safari/iOS y otros navegadores pueden no exponer Fullscreen API para documentElement.
    return false;
  }
}

async function lockLandscapeSafely() {
  const orientation = window.screen?.orientation;
  if (!orientation || typeof orientation.lock !== 'function') return false;
  try {
    await orientation.lock('landscape');
    return true;
  } catch {
    // No es fatal: el gate de portrait sigue siendo la garantía real del producto.
    return false;
  }
}

export async function requestImmersiveMode() {
  // Fullscreen primero: varios navegadores sólo permiten orientation.lock estando fullscreen.
  const fullscreen = await requestFullscreenSafely();
  const landscapeLocked = await lockLandscapeSafely();
  updateMobileEnvironment();
  return { fullscreen, landscapeLocked };
}

export async function enterMobileExperience() {
  if (!isMobileSurfaceNow()) return { fullscreen: false, landscapeLocked: false };
  document.documentElement.classList.add(ENTERED_CLASS);
  const result = await requestImmersiveMode();
  updateMobileEnvironment();
  return result;
}


function ensureMobileTouchUI() {
  if (document.getElementById('arg-mobile-utility-dock')) return;

  const dock = document.createElement('div');
  dock.id = 'arg-mobile-utility-dock';
  dock.setAttribute('aria-label', 'Herramientas móviles');
  dock.innerHTML = `
    <button id="arg-mobile-log-toggle" class="arg-mobile-tool-btn" type="button" aria-label="Abrir bitácora" title="Bitácora">📜</button>
    <button id="arg-mobile-stack-toggle" class="arg-mobile-tool-btn" type="button" aria-label="Abrir pila" title="Pila">⚡<span id="arg-mobile-stack-badge">0</span></button>
    <button id="arg-mobile-zones-toggle" class="arg-mobile-tool-btn" type="button" aria-label="Abrir cementerios y exilios" title="Zonas">🗂️</button>`;

  const scrim = document.createElement('div');
  scrim.id = 'arg-mobile-layer-scrim';
  scrim.setAttribute('aria-hidden', 'true');

  const preview = document.createElement('div');
  preview.id = 'arg-mobile-card-preview';
  preview.setAttribute('role', 'dialog');
  preview.setAttribute('aria-modal', 'true');
  preview.setAttribute('aria-label', 'Vista ampliada de carta');
  preview.innerHTML = `
    <div id="arg-mobile-card-preview-stage"></div>
    <div class="arg-mobile-preview-actions">
      <button id="arg-mobile-preview-action" class="arg-mobile-preview-action-btn" type="button">USAR</button>
      <button id="arg-mobile-preview-close" class="arg-mobile-preview-close-btn" type="button">CERRAR</button>
    </div>`;

  const zones = document.createElement('div');
  zones.id = 'arg-mobile-zones-drawer';
  zones.setAttribute('role', 'dialog');
  zones.setAttribute('aria-modal', 'true');
  zones.setAttribute('aria-label', 'Cementerios y exilios');
  zones.innerHTML = `
    <div class="arg-mobile-zones-title">🗂️ ZONAS PÚBLICAS</div>
    <div class="arg-mobile-zones-grid">
      <button type="button" data-owner="local" data-zone="CEMENTERIO">🪦 Tu cementerio</button>
      <button type="button" data-owner="local" data-zone="EXILIO">🌀 Tu exilio</button>
      <button type="button" data-owner="rival" data-zone="CEMENTERIO">🪦 Cementerio rival</button>
      <button type="button" data-owner="rival" data-zone="EXILIO">🌀 Exilio rival</button>
    </div>
    <button id="arg-mobile-zones-close" class="arg-mobile-preview-close-btn" type="button">CERRAR</button>`;

  document.body.append(scrim, dock, preview, zones);

  dock.querySelector('#arg-mobile-log-toggle')?.addEventListener('click', () => toggleMobileLayer('log'));
  dock.querySelector('#arg-mobile-stack-toggle')?.addEventListener('click', () => toggleMobileLayer('stack'));
  dock.querySelector('#arg-mobile-zones-toggle')?.addEventListener('click', () => toggleMobileLayer('zones'));
  zones.querySelector('#arg-mobile-zones-close')?.addEventListener('click', closeMobileLayers);
  zones.querySelectorAll('[data-owner][data-zone]').forEach(btn => btn.addEventListener('click', () => openPublicZoneFromDock(btn.dataset.owner, btn.dataset.zone)));
  scrim.addEventListener('click', closeMobileLayers);
  preview.querySelector('#arg-mobile-preview-close')?.addEventListener('click', closeMobileLayers);

  const stackCount = document.getElementById('stack-count');
  const stackContainer = document.getElementById('stack-container');
  const syncStackBadge = () => {
    const badge = document.getElementById('arg-mobile-stack-badge');
    const btn = document.getElementById('arg-mobile-stack-toggle');
    if (!badge || !btn) return;
    const count = Number.parseInt(stackCount?.textContent || '0', 10) || 0;
    badge.textContent = String(count);
    btn.classList.toggle('has-items', count > 0);
    btn.setAttribute('aria-label', count > 0 ? `Abrir pila, ${count} objeto${count === 1 ? '' : 's'}` : 'Pila vacía');
    if (count === 0) {
      document.documentElement.classList.remove(STACK_OPEN_CLASS, STACK_PREVIEW_OPEN_CLASS);
      stackContainer?.classList.remove('arg-mobile-drawer-open');
    }
  };
  syncStackBadge();
  if (stackCount) new MutationObserver(syncStackBadge).observe(stackCount, { childList: true, characterData: true, subtree: true });
  if (stackContainer) new MutationObserver(syncStackBadge).observe(stackContainer, { attributes: true, attributeFilter: ['class'] });

  document.addEventListener('click', interceptMobileGameplayTap, true);
}

function findPublicPile(owner, label) {
  const wrapperId = owner === 'local' ? 'local-wrapper' : 'rival-wrapper';
  const row = document.getElementById(wrapperId)?.closest('.zone-row-container');
  if (!row) return null;
  return [...row.querySelectorAll('.side-pile')].find(pile => pile.querySelector('.pile-label')?.textContent?.trim().toUpperCase() === String(label || '').toUpperCase()) || null;
}

function openPublicZoneFromDock(owner, label) {
  const pile = findPublicPile(owner, label);
  closeMobileLayers();
  pile?.click();
}

function syncPublicZoneDrawer() {
  document.querySelectorAll('#arg-mobile-zones-drawer [data-owner][data-zone]').forEach(btn => {
    const owner = btn.dataset.owner;
    const label = btn.dataset.zone;
    const pile = findPublicPile(owner, label);
    const count = Number.parseInt(pile?.querySelector('.pile-badge')?.textContent || '0', 10) || 0;
    const icon = label === 'EXILIO' ? '🌀' : '🪦';
    const ownerLabel = owner === 'local' ? 'Tu' : 'Rival';
    const zoneLabel = label === 'EXILIO' ? 'exilio' : 'cementerio';
    btn.textContent = `${icon} ${ownerLabel} ${zoneLabel} · ${count}`;
    btn.disabled = !pile;
  });
}

function decorateComplexOverlays() {
  if (!document?.body) return;
  document.querySelectorAll('.gy-modal-overlay').forEach(overlay => {
    const kind = classifyMobileOverlayKind({
      privateZone: Boolean(overlay.querySelector('#private-zone-row')),
      zoneBrowser: Boolean(overlay.querySelector('.gy-modal-grid')),
    });
    overlay.dataset.mobileOverlayKind = kind;
    overlay.classList.toggle('arg-mobile-private-zone-overlay', kind === 'private-zone');
    overlay.classList.toggle('arg-mobile-zone-browser-overlay', kind === 'zone-browser');
    overlay.classList.toggle('arg-mobile-choice-overlay', kind === 'choice');
  });
  document.querySelectorAll('#mulligan-overlay').forEach(overlay => {
    overlay.dataset.mobileOverlayKind = classifyMobileOverlayKind({ selection: true });
    overlay.classList.add('arg-mobile-selection-overlay');
  });
  const damage = document.getElementById('damage-modal-overlay');
  if (damage && !damage.classList.contains('hidden')) damage.dataset.mobileOverlayKind = classifyMobileOverlayKind({ damage: true });
}

let complexOverlayObserver = null;
function ensureComplexOverlayObserver() {
  if (complexOverlayObserver || typeof MutationObserver === 'undefined' || !document.body) return;
  complexOverlayObserver = new MutationObserver(decorateComplexOverlays);
  complexOverlayObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  decorateComplexOverlays();
}

function isMobileGameplayActive() {
  const root = document.documentElement;
  return root.classList.contains(MOBILE_ROOT_CLASS)
    && root.classList.contains(ENTERED_CLASS)
    && root.classList.contains(LANDSCAPE_CLASS);
}

function getTurnButtonText() {
  return (document.getElementById('btn-end-turn')?.textContent || '').trim();
}

function isWaitingRivalDom() {
  return /^Esperando a /i.test(getTurnButtonText());
}

function isPendingChoiceDom() {
  const btn = document.getElementById('btn-end-turn');
  if (!btn) return false;
  if (btn.classList.contains('hidden')) return true;
  const text = getTurnButtonText();
  if (/^(Esperando a |Resolviendo la pila|Avanzando|Sin bloqueadores)/i.test(text)) return false;
  return Boolean(btn.disabled);
}

function isDamageModalOpenDom() {
  const modal = document.getElementById('damage-modal-overlay');
  return Boolean(modal && !modal.classList.contains('hidden'));
}

function classifyGameplayCardElement(card, eventTarget) {
  const zone = card.closest(GAMEPLAY_ZONE_SELECTOR);
  const turnText = getTurnButtonText();
  const localCombat = zone?.id === 'local-combat';
  return classifyMobileTapIntent({
    targetable: card.classList.contains('targetable'),
    manaPayable: card.classList.contains('mana-payable'),
    instantAction: Boolean(eventTarget?.closest?.('.instant-ability-fab')),
    discardChoice: zone?.id === 'local-hand' && zone.classList.contains('discard-warning'),
    combatDeclaration: localCombat && /Confirmar Ataque|Saltar Ataque/i.test(turnText),
    blockingDeclaration: localCombat && /Confirmar Bloqueos/i.test(turnText),
    pendingChoice: isPendingChoiceDom(),
    waitingRival: isWaitingRivalDom(),
    damageModalOpen: isDamageModalOpenDom(),
  });
}

function getPreviewActionForCard(card) {
  const modalWrapper = card.closest('.gy-modal-grid') ? card.parentElement : null;
  const modalAction = modalWrapper?.querySelector?.('.mulligan-btn-keep');
  if (modalAction) return { label: (modalAction.textContent || 'USAR').trim(), clickTarget: modalAction };

  const zone = card.closest(GAMEPLAY_ZONE_SELECTOR);
  if (!zone || !zone.id.startsWith('local-') || isWaitingRivalDom() || isDamageModalOpenDom()) return null;
  if (zone.id === 'local-hand') return { label: 'JUGAR CARTA', clickTarget: card };
  if (zone.id === 'local-planeswalkers') return { label: 'HABILIDADES', clickTarget: card };
  if (zone.id === 'local-support') return { label: 'ACTIVAR / USAR', clickTarget: card };
  if (zone.id === 'local-lands') return { label: 'USAR TIERRA', clickTarget: card };
  if (zone.id === 'local-combat') return { label: 'ACCIONAR', clickTarget: card };
  return null;
}

function openCardPreview(card) {
  ensureMobileTouchUI();
  closeMobileLayers({ keepPreview: true });
  const stage = document.getElementById('arg-mobile-card-preview-stage');
  const actionBtn = document.getElementById('arg-mobile-preview-action');
  if (!stage || !actionBtn) return;

  const clone = card.cloneNode(true);
  clone.classList.remove('tapped', 'targetable', 'mana-payable', 'paying', 'attacking', 'blocking', 'selected-blocker', 'crewing-selected', 'card-with-instant-action');
  clone.removeAttribute('style');
  clone.querySelector('.card-inner')?.removeAttribute('style');
  clone.querySelectorAll('.instant-ability-fab').forEach(el => el.remove());
  clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  clone.setAttribute('aria-hidden', 'true');
  stage.replaceChildren(clone);

  const action = getPreviewActionForCard(card);
  actionBtn.classList.toggle('hidden', !action);
  if (action) {
    actionBtn.textContent = action.label;
    actionBtn.onclick = () => invokeOriginalAction(action.clickTarget || card);
  } else {
    actionBtn.onclick = null;
  }

  document.documentElement.classList.add(CARD_PREVIEW_OPEN_CLASS);
}

function invokeOriginalAction(target) {
  closeMobileLayers();
  if (!target?.isConnected) return; // si hubo un render mientras mirábamos, jamás accionar una referencia vieja
  directClickBypass.add(target);
  try {
    target.click();
  } finally {
    queueMicrotask(() => directClickBypass.delete(target));
  }
}

function openStackItemPreview(stackItem) {
  closeMobileLayers({ keepStack: true });
  lastStackPreviewAnchor = stackItem;
  document.documentElement.classList.add(STACK_PREVIEW_OPEN_CLASS);
  stackItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, cancelable: false, view: window }));
}

function hideStackItemPreview() {
  if (lastStackPreviewAnchor) {
    lastStackPreviewAnchor.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false, cancelable: false, view: window }));
  }
  lastStackPreviewAnchor = null;
  document.documentElement.classList.remove(STACK_PREVIEW_OPEN_CLASS);
}

function interceptMobileGameplayTap(event) {
  if (!isMobileGameplayActive()) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('#arg-mobile-card-preview,#arg-mobile-utility-dock,#arg-mobile-layer-scrim')) return;

  const stackItem = target.closest('.stack-item-card');
  if (stackItem && stackItem.closest('#stack-list')) {
    const intent = classifyMobileTapIntent({ stackTargetable: stackItem.classList.contains('targetable-stack') });
    if (intent === 'direct') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openStackItemPreview(stackItem);
    return;
  }

  const modalCard = target.closest('.gy-modal-grid .card');
  if (modalCard && !directClickBypass.has(modalCard) && !target.closest('button')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openCardPreview(modalCard);
    return;
  }

  const card = target.closest('.card');
  if (!card || !card.closest(GAMEPLAY_ZONE_SELECTOR) || directClickBypass.has(card)) return;
  if (target.closest('.instant-ability-fab')) return;

  const intent = classifyGameplayCardElement(card, target);
  if (intent === 'direct') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openCardPreview(card);
}

function toggleMobileLayer(kind) {
  const root = document.documentElement;
  const stack = document.getElementById('stack-container');
  if (kind === 'stack' && (Number.parseInt(document.getElementById('stack-count')?.textContent || '0', 10) || 0) <= 0) return;
  const openingLog = kind === 'log' && !root.classList.contains(LOG_OPEN_CLASS);
  const openingStack = kind === 'stack' && !root.classList.contains(STACK_OPEN_CLASS);
  const openingZones = kind === 'zones' && !root.classList.contains(ZONES_OPEN_CLASS);
  closeMobileLayers();
  if (openingLog) root.classList.add(LOG_OPEN_CLASS);
  if (openingStack) {
    root.classList.add(STACK_OPEN_CLASS);
    stack?.classList.add('arg-mobile-drawer-open');
  }
  if (openingZones) { syncPublicZoneDrawer(); root.classList.add(ZONES_OPEN_CLASS); }
}

export function closeMobileLayers({ keepPreview = false, keepStack = false } = {}) {
  const root = document.documentElement;
  root.classList.remove(LOG_OPEN_CLASS, ZONES_OPEN_CLASS);
  if (!keepStack) {
    root.classList.remove(STACK_OPEN_CLASS);
    document.getElementById('stack-container')?.classList.remove('arg-mobile-drawer-open');
  }
  if (!keepPreview) root.classList.remove(CARD_PREVIEW_OPEN_CLASS);
  hideStackItemPreview();
}

export function updateMobileEnvironment() {
  const root = document.documentElement;
  const mobile = isMobileSurfaceNow();

  root.classList.toggle(MOBILE_ROOT_CLASS, mobile);
  if (!mobile) {
    root.classList.remove(PORTRAIT_CLASS, LANDSCAPE_CLASS, ENTERED_CLASS, FULLSCREEN_CLASS, LOG_OPEN_CLASS, STACK_OPEN_CLASS, ZONES_OPEN_CLASS, CARD_PREVIEW_OPEN_CLASS, STACK_PREVIEW_OPEN_CLASS);
    document.getElementById('stack-container')?.classList.remove('arg-mobile-drawer-open');
    return false;
  }

  ensureMobileGates();
  ensureMobileTouchUI();
  ensureComplexOverlayObserver();
  decorateComplexOverlays();
  const orientation = getOrientationForViewport(window.innerWidth, window.innerHeight);
  root.classList.toggle(PORTRAIT_CLASS, orientation === 'portrait');
  root.classList.toggle(LANDSCAPE_CLASS, orientation === 'landscape');
  root.classList.toggle(FULLSCREEN_CLASS, isFullscreenNow());
  if (orientation === 'portrait') closeMobileLayers();

  // En modo PWA/fullscreen no necesitamos bloquear el juego detrás del launcher.
  if (isStandaloneDisplay()) root.classList.add(ENTERED_CLASS);
  return true;
}

export function initMobileUI() {
  updateMobileEnvironment();
  document.documentElement.classList.add(MOBILE_SHELL_READY_CLASS);
  globalThis.__ARGENTINIA_BOOT_DIAG__?.mark?.('mobile_shell_ready', { width: window.innerWidth, height: window.innerHeight });

  const refresh = () => window.requestAnimationFrame(updateMobileEnvironment);
  window.addEventListener('resize', refresh, { passive: true });
  window.addEventListener('orientationchange', refresh, { passive: true });
  document.addEventListener('fullscreenchange', updateMobileEnvironment);

  try {
    window.screen?.orientation?.addEventListener?.('change', refresh);
  } catch {
    // API opcional.
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileUI, { once: true });
  } else {
    initMobileUI();
  }
}
