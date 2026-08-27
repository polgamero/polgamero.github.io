// js/exilePlayEngine.js — Argentinia 23.16.2 · Cast-from-Exile Engine
// Capa pura de permisos de jugar/castear cartas desde Exilio. La mutación de zonas,
// pago CR601, UI y sincronización viven en main/ui/turnManager.

export const EXILE_PLAY_ENGINE_VERSION = '23.16.2';

export const EXILE_PLAY_DURATIONS = Object.freeze([
  'until_end_of_turn',
  'until_end_of_next_turn',
  'while_exiled'
]);

export const EXILE_PLAY_MODES = Object.freeze(['any', 'spell', 'land']);
export const EXILE_PLAY_TIMINGS = Object.freeze(['normal', 'any_time']);
export const EXILE_PLAY_COST_MODES = Object.freeze(['normal', 'without_paying_mana_cost', 'custom']);

let exileObjectSerial = 1;
let permissionSerial = 1;

function norm(v) { return String(v ?? '').trim().toLowerCase(); }

export function isLandExileCard(card) {
  return !!card && !card.isToken && String(card.type || '').includes('Tierra');
}

export function ensureExileObjectId(card, ownerRole = 'p') {
  if (!card || typeof card !== 'object') return null;
  if (!card._exileObjectId) {
    card._exileObjectId = `${ownerRole || 'p'}_ex_${Date.now().toString(36)}_${(exileObjectSerial++).toString(36)}_${Math.random().toString(36).slice(2,7)}`;
  }
  return card._exileObjectId;
}

export function normalizeExilePlayPermission(raw = {}) {
  const durationRaw = norm(raw.duration || raw.expires || 'until_end_of_turn');
  const duration = EXILE_PLAY_DURATIONS.includes(durationRaw) ? durationRaw : 'until_end_of_turn';
  const playRaw = norm(raw.playMode || raw.play || raw.kind || 'any');
  const playMode = EXILE_PLAY_MODES.includes(playRaw) ? playRaw : 'any';
  const timingRaw = norm(raw.timing || (raw.asThoughFlash ? 'any_time' : 'normal'));
  const timing = EXILE_PLAY_TIMINGS.includes(timingRaw) ? timingRaw : 'normal';
  const costRaw = norm(raw.costMode || (raw.withoutPayingManaCost ? 'without_paying_mana_cost' : (raw.cost ? 'custom' : 'normal')));
  const costMode = EXILE_PLAY_COST_MODES.includes(costRaw) ? costRaw : 'normal';
  const customCost = costMode === 'custom' ? String(raw.cost || raw.manaCost || '{0}') : null;
  return {
    duration,
    playMode,
    timing,
    costMode,
    customCost,
    singleUse: raw.singleUse !== false,
    allowKicker: raw.allowKicker !== false,
    label: String(raw.label || '').trim() || null
  };
}

export function grantExilePlayPermission(card, options = {}) {
  if (!card) return null;
  const spec = normalizeExilePlayPermission(options.spec || options.permission || options);
  const controllerRole = options.controllerRole || 'local';
  const activePlayerRole = options.activePlayerRole || null;
  const turnCount = Math.max(0, Number(options.turnCount) || 0);
  const permission = {
    permissionId: options.permissionId || `xp_${Date.now().toString(36)}_${(permissionSerial++).toString(36)}_${Math.random().toString(36).slice(2,6)}`,
    engineVersion: EXILE_PLAY_ENGINE_VERSION,
    exileObjectId: ensureExileObjectId(card, options.ownerRole || controllerRole),
    controllerRole,
    sourceCardId: options.sourceCard?.id || options.sourceCardId || null,
    sourceCardName: options.sourceCard?.name || options.sourceCardName || null,
    grantedTurnCount: turnCount,
    duration: spec.duration,
    playMode: spec.playMode,
    timing: spec.timing,
    costMode: spec.costMode,
    customCost: spec.customCost,
    singleUse: spec.singleUse,
    allowKicker: spec.allowKicker,
    label: spec.label,
    // Si se concede durante TU propio turno, "hasta el final de tu próximo turno" debe
    // sobrevivir el cleanup actual y el próximo: 2 cierres propios. Si se concede fuera
    // de tu turno, alcanza con 1 cierre propio.
    controllerTurnEndsRemaining: spec.duration === 'until_end_of_next_turn'
      ? (activePlayerRole === controllerRole ? 2 : 1)
      : null
  };
  const list = Array.isArray(card._exilePlayPermissions) ? card._exilePlayPermissions : [];
  card._exilePlayPermissions = [...list.filter(p => p?.permissionId !== permission.permissionId), permission];
  return permission;
}

export function listExilePlayPermissions(card, controllerRole = null) {
  const list = Array.isArray(card?._exilePlayPermissions) ? card._exilePlayPermissions : [];
  return list.filter(p => p && (!controllerRole || p.controllerRole === controllerRole));
}

export function permissionAllowsCard(permission, card) {
  if (!permission || !card) return false;
  const land = isLandExileCard(card);
  if (permission.playMode === 'land') return land;
  if (permission.playMode === 'spell') return !land;
  return true;
}

export function findExilePlayPermission(card, controllerRole, options = {}) {
  const permissions = listExilePlayPermissions(card, controllerRole).filter(p => permissionAllowsCard(p, card));
  if (!permissions.length) return null;
  // Preferimos una ruta de costo explícita sobre normal; después cualquier permiso válido.
  return permissions.find(p => p.costMode === 'without_paying_mana_cost')
    || permissions.find(p => p.costMode === 'custom')
    || permissions[0];
}

export function permissionBaseManaOverride(permission) {
  if (!permission) return null;
  if (permission.costMode === 'without_paying_mana_cost') return '{0}';
  if (permission.costMode === 'custom') return permission.customCost || '{0}';
  return null;
}

export function consumeExilePlayPermission(card, permissionId) {
  if (!card || !permissionId) return false;
  const list = Array.isArray(card._exilePlayPermissions) ? card._exilePlayPermissions : [];
  const before = list.length;
  card._exilePlayPermissions = list.filter(p => p?.permissionId !== permissionId);
  if (!card._exilePlayPermissions.length) delete card._exilePlayPermissions;
  return before !== (card._exilePlayPermissions?.length || 0);
}

export function clearExilePlayPermissions(card) {
  if (!card) return;
  delete card._exilePlayPermissions;
}

// Al dejar Exilio, tanto el permiso como la identidad de ESA permanencia en Exilio
// dejan de existir. Si la misma carta vuelve a ser exiliada más tarde recibe un objectId nuevo.
export function clearExilePlayStateOnLeave(card) {
  if (!card) return;
  delete card._exilePlayPermissions;
  delete card._exileObjectId;
}

export function expireExilePermissionsAtCleanup(exileCards = [], options = {}) {
  const endingPlayerRole = options.endingPlayerRole || null;
  const turnCount = Math.max(0, Number(options.turnCount) || 0);
  const expired = [];
  for (const card of Array.isArray(exileCards) ? exileCards : []) {
    const list = Array.isArray(card?._exilePlayPermissions) ? card._exilePlayPermissions : [];
    if (!list.length) continue;
    const kept = [];
    for (const permission of list) {
      let remove = false;
      if (permission.duration === 'until_end_of_turn' && turnCount >= Number(permission.grantedTurnCount || 0)) {
        remove = true;
      } else if (permission.duration === 'until_end_of_next_turn' && permission.controllerRole === endingPlayerRole) {
        permission.controllerTurnEndsRemaining = Math.max(0, Number(permission.controllerTurnEndsRemaining || 1) - 1);
        remove = permission.controllerTurnEndsRemaining <= 0;
      }
      if (remove) expired.push({ card, permission }); else kept.push(permission);
    }
    if (kept.length) card._exilePlayPermissions = kept;
    else delete card._exilePlayPermissions;
  }
  return expired;
}

export function exilePermissionSummary(permission) {
  if (!permission) return '';
  const timing = permission.timing === 'any_time' ? 'cualquier momento' : 'timing normal';
  const cost = permission.costMode === 'without_paying_mana_cost'
    ? 'sin pagar su coste de maná'
    : permission.costMode === 'custom'
      ? `por ${permission.customCost || '{0}'}`
      : 'por su coste normal';
  return `${cost} · ${timing}`;
}
