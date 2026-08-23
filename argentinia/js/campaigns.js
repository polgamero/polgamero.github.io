// js/campaigns.js — Entrega 23.13.53
// Modelo puro de Anuncios/Eventos. Sin Firebase ni DOM.

export const CAMPAIGN_EVENT_TYPES = Object.freeze({
  pack_discount: Object.freeze({ labelKey: 'campaign.eventType.packDiscount', unit: 'percent', defaultValue: 50, min: 1, max: 90 }),
  all_points_multiplier: Object.freeze({ labelKey: 'campaign.eventType.allPoints', unit: 'multiplier', defaultValue: 2, min: 1, max: 10 }),
  match_points_multiplier: Object.freeze({ labelKey: 'campaign.eventType.matchPoints', unit: 'multiplier', defaultValue: 2, min: 1, max: 10 }),
  all_fichas_multiplier: Object.freeze({ labelKey: 'campaign.eventType.allFichas', unit: 'multiplier', defaultValue: 2, min: 1, max: 10 }),
  pack_open_ficha_bonus: Object.freeze({ labelKey: 'campaign.eventType.packFichaBonus', unit: 'integer', defaultValue: 1, min: 1, max: 20 })
});

function dateMs(value) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function campaignStatus(item, now = Date.now()) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  if (item?.finalizedAt || item?.finalized === true) return 'finalized';
  const start = dateMs(item?.startAt);
  const end = dateMs(item?.endAt);
  if (end && nowMs >= end) return 'finalized';
  if (start && nowMs < start) return 'future';
  return 'active';
}

export function isCampaignActive(item, now = Date.now()) {
  return campaignStatus(item, now) === 'active';
}

export function validateEventPayload(payload = {}) {
  const type = String(payload.type || '');
  const def = CAMPAIGN_EVENT_TYPES[type];
  if (!def) throw new Error('Tipo de evento inválido.');
  const name = String(payload.name || '').trim();
  if (!name) throw new Error('Ingresá un nombre para el evento.');
  const start = dateMs(payload.startAt);
  const end = dateMs(payload.endAt);
  if (!start || !end || end <= start) throw new Error('La fecha de fin debe ser posterior a la fecha de inicio.');
  let value = Number(payload.value);
  if (!Number.isFinite(value)) value = def.defaultValue;
  value = Math.max(def.min, Math.min(def.max, value));
  if (def.unit === 'integer' || def.unit === 'percent') value = Math.round(value);
  return { name, type, value, startAt: new Date(start), endAt: new Date(end) };
}

export function validateAnnouncementPayload(payload = {}) {
  const title = String(payload.title || '').trim();
  if (!title) throw new Error('Ingresá un título para el anuncio.');
  const subtitle = String(payload.subtitle || '').trim();
  const paragraphs = Array.isArray(payload.paragraphs)
    ? payload.paragraphs.map(x => String(x || '').trim()).filter(Boolean)
    : String(payload.paragraphs || '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
  const imageFilename = String(payload.imageFilename || '').trim();
  if (imageFilename && !/^[A-Za-z0-9._-]+\.png$/i.test(imageFilename)) throw new Error('La imagen debe ser sólo el nombre de un PNG, por ejemplo evento_agosto.png.');
  const start = dateMs(payload.startAt) || Date.now();
  const end = dateMs(payload.endAt);
  if (end && end <= start) throw new Error('La fecha de fin del anuncio debe ser posterior al inicio.');
  return {
    title, subtitle, paragraphs, imageFilename,
    startAt: new Date(start),
    endAt: end ? new Date(end) : null,
    showPopup: payload.showPopup !== false,
    showInNews: payload.showInNews !== false,
    dismissible: payload.dismissible !== false
  };
}

export function buildCampaignSnapshot(events = [], now = Date.now()) {
  const activeEvents = (Array.isArray(events) ? events : []).filter(e => isCampaignActive(e, now));
  const effects = {
    packDiscountPercent: 0,
    allPointsMultiplier: 1,
    matchPointsMultiplier: 1,
    allFichasMultiplier: 1,
    packOpenFichaBonus: 0
  };
  activeEvents.forEach(event => {
    const value = Math.max(0, Number(event?.value) || 0);
    if (event.type === 'pack_discount') effects.packDiscountPercent = Math.max(effects.packDiscountPercent, value);
    if (event.type === 'all_points_multiplier') effects.allPointsMultiplier = Math.max(effects.allPointsMultiplier, value || 1);
    if (event.type === 'match_points_multiplier') effects.matchPointsMultiplier = Math.max(effects.matchPointsMultiplier, value || 1);
    if (event.type === 'all_fichas_multiplier') effects.allFichasMultiplier = Math.max(effects.allFichasMultiplier, value || 1);
    if (event.type === 'pack_open_ficha_bonus') effects.packOpenFichaBonus += Math.max(0, Math.floor(value));
  });
  return { now: now instanceof Date ? now : new Date(Number(now) || Date.now()), activeEvents, effects };
}

export function effectivePackCost(baseCost, snapshot) {
  const base = Math.max(0, Math.floor(Number(baseCost) || 0));
  const pct = Math.max(0, Math.min(90, Number(snapshot?.effects?.packDiscountPercent) || 0));
  return Math.max(0, Math.round(base * (1 - pct / 100)));
}

export function effectiveMatchPoints(baseDelta, snapshot) {
  const delta = Math.floor(Number(baseDelta) || 0);
  if (delta <= 0) return delta;
  const all = Math.max(1, Number(snapshot?.effects?.allPointsMultiplier) || 1);
  const match = Math.max(1, Number(snapshot?.effects?.matchPointsMultiplier) || 1);
  return Math.round(delta * Math.max(all, match));
}

export function effectiveAllPoints(baseAmount, snapshot) {
  const amount = Math.max(0, Math.floor(Number(baseAmount) || 0));
  const mult = Math.max(1, Number(snapshot?.effects?.allPointsMultiplier) || 1);
  return Math.round(amount * mult);
}

export function effectiveFichas(baseAmount, snapshot, { packOpen = false } = {}) {
  const amount = Math.max(0, Math.floor(Number(baseAmount) || 0));
  const mult = Math.max(1, Number(snapshot?.effects?.allFichasMultiplier) || 1);
  const bonus = packOpen ? Math.max(0, Math.floor(Number(snapshot?.effects?.packOpenFichaBonus) || 0)) : 0;
  return Math.round(amount * mult) + bonus;
}

export function eventValueLabel(event) {
  const def = CAMPAIGN_EVENT_TYPES[event?.type];
  const value = Number(event?.value) || 0;
  if (!def) return String(value);
  if (def.unit === 'percent') return `${value}%`;
  if (def.unit === 'multiplier') return `×${value}`;
  return `+${value}`;
}
