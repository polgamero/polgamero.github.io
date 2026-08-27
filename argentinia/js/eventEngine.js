import { cardHasSubtype, cardHasAllSubtypes, cardsShareCreatureType, resolveSubtypeReference } from './typalEngine.js';
// Argentinia 23.15.3 — Generic Event Engine + Trigger Predicate System
// Pure rules/data layer: it does not import state, UI, Stack or multiplayer code.
// Callers provide the event and battlefield watchers; this module normalizes the
// declarative contract and returns matching trigger descriptors.

export const GENERIC_EVENT_ENGINE_VERSION = '23.16.5';

export const GAME_EVENT_TYPES = Object.freeze([
  'spell_cast', 'cast_from_exile', 'card_played_from_exile',
  'permanent_entered', 'creature_entered', 'land_entered',
  'permanent_left_battlefield', 'creature_died', 'permanent_sacrificed', 'card_exiled',
  'card_drawn', 'card_discarded',
  'life_gained', 'life_lost',
  'damage_dealt', 'combat_damage_dealt',
  'counter_added', 'counter_removed', 'saga_chapter_triggered',
  'token_created',
  'permanent_tapped', 'permanent_untapped',
  'spell_countered', 'spell_copied', 'ability_copied', 'permanent_became_copy', 'permanent_transformed', 'creature_type_chosen',
  'attack_declared', 'block_declared',
  'turn_started', 'upkeep_started', 'combat_started', 'end_step_started'
]);

const EVENT_TYPE_SET = new Set(GAME_EVENT_TYPES);

const TYPE_ALIASES = Object.freeze({
  creature_entered: ['permanent_entered'],
  land_entered: ['permanent_entered'],
  creature_died: ['permanent_left_battlefield'],
  permanent_sacrificed: ['permanent_left_battlefield'],
  combat_damage_dealt: ['damage_dealt']
});

function arr(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeEventType(value) {
  return text(value).replace(/[\s-]+/g, '_');
}

function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function boolOrNull(value) {
  if (value === true || value === false) return value;
  return null;
}

function sameObject(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const aid = a._syncObjectId || a._effectObjectId || a.id || null;
  const bid = b._syncObjectId || b._effectObjectId || b.id || null;
  return !!aid && !!bid && aid === bid;
}

function cardTypeText(card) {
  return text(card?.type || card?.typeLine || card?.cardType || '');
}

function cardSubtypeText(card) {
  const values = [
    card?.subtype,
    card?.subType,
    card?.subtypes,
    card?.types,
    card?.type,
    card?.typeLine
  ].flatMap(arr).filter(Boolean);
  return values.map(v => text(v)).join(' ');
}

function cardColors(card) {
  const out = new Set();
  for (const value of arr(card?.colors || card?.color)) {
    for (const part of String(value ?? '').toUpperCase().split(/[^WUBRGC]+/).filter(Boolean)) out.add(part);
  }
  return out;
}

function cardMatchesTypeToken(card, rawToken) {
  const token = normalizeEventType(rawToken);
  const t = cardTypeText(card);
  if (!token || token === 'any') return true;
  const isCreature = t.includes('criatura') || t.includes('creature');
  const isInstant = t.includes('instantáneo') || t.includes('instantaneo') || t.includes('instant');
  const isSorcery = t.includes('conjuro') || t.includes('sorcery');
  const isLand = t.includes('tierra') || t.includes('land');
  const isArtifact = t.includes('artefacto') || t.includes('artifact');
  const isEnchantment = t.includes('encantamiento') || t.includes('enchantment');
  const isPlaneswalker = t.includes('planeswalker');
  const isPermanent = isCreature || isLand || isArtifact || isEnchantment || isPlaneswalker;
  if (token === 'creature' || token === 'criatura') return isCreature;
  if (token === 'noncreature' || token === 'non_creature' || token === 'no_criatura') return !isCreature;
  if (token === 'instant' || token === 'instantaneo') return isInstant;
  if (token === 'sorcery' || token === 'conjuro') return isSorcery;
  if (token === 'instant_or_sorcery' || token === 'instantaneo_o_conjuro') return isInstant || isSorcery;
  if (token === 'land' || token === 'tierra') return isLand;
  if (token === 'artifact' || token === 'artefacto') return isArtifact;
  if (token === 'enchantment' || token === 'encantamiento') return isEnchantment;
  if (token === 'planeswalker') return isPlaneswalker;
  if (token === 'permanent' || token === 'permanente') return isPermanent;
  if (token === 'nonpermanent' || token === 'non_permanent') return !isPermanent;
  return t.includes(token.replaceAll('_', ' '));
}

function relationMatches(raw, sourceIsLocal, subjectIsLocal) {
  const rel = text(raw || 'any');
  if (!rel || rel === 'any' || rel === 'cualquiera') return true;
  if (subjectIsLocal !== true && subjectIsLocal !== false) return false;
  // Relaciones controller-relative: funcionan igual para watchers locales y rivales.
  if (rel === 'you' || rel === 'your' || rel === 'vos' || rel === 'self_controller') return sourceIsLocal === subjectIsLocal;
  if (rel === 'opponent' || rel === 'opposing' || rel === 'enemy') return sourceIsLocal !== subjectIsLocal;
  // Relaciones absolutas del cliente: útiles en tooling/debug y contratos multiplayer.
  if (rel === 'local') return subjectIsLocal === true;
  if (rel === 'rival' || rel === 'remote') return subjectIsLocal === false;
  return false;
}

export function normalizeGameEvent(raw = {}) {
  const type = normalizeEventType(raw.type || raw.event);
  const aliases = new Set([
    ...arr(raw.aliases).map(normalizeEventType),
    ...(TYPE_ALIASES[type] || [])
  ].filter(Boolean));
  return {
    ...raw,
    type,
    aliases: [...aliases],
    controllerIsLocal: boolOrNull(raw.controllerIsLocal),
    ownerIsLocal: boolOrNull(raw.ownerIsLocal),
    actorIsLocal: boolOrNull(raw.actorIsLocal ?? raw.controllerIsLocal),
    sourceControllerIsLocal: boolOrNull(raw.sourceControllerIsLocal ?? raw.actorIsLocal),
    targetControllerIsLocal: boolOrNull(raw.targetControllerIsLocal ?? raw.controllerIsLocal),
    targetPlayerIsLocal: boolOrNull(raw.targetPlayerIsLocal),
    activePlayerIsLocal: boolOrNull(raw.activePlayerIsLocal),
    amount: numberOrNull(raw.amount),
    combat: boolOrNull(raw.combat),
    zoneFrom: raw.zoneFrom == null ? null : normalizeEventType(raw.zoneFrom),
    zoneTo: raw.zoneTo == null ? null : normalizeEventType(raw.zoneTo),
    cause: raw.cause == null ? null : normalizeEventType(raw.cause),
    card: raw.card || raw.eventCard || raw.item?.card || raw.eventItem?.card || null,
    item: raw.item || raw.eventItem || null,
    sourceCard: raw.sourceCard || raw.sourceItem?.card || null,
    sourceItem: raw.sourceItem || null,
    targetCard: raw.targetCard || raw.targetItem?.card || null,
    targetItem: raw.targetItem || null
  };
}

export function isKnownGameEventType(type) {
  const key = normalizeEventType(type);
  return EVENT_TYPE_SET.has(key);
}

export function normalizeGenericTriggerSpecs(card) {
  if (!card || typeof card !== 'object') return [];
  let raw = card.triggers ?? card.genericTriggers ?? null;
  if (!raw) return [];
  if (!Array.isArray(raw)) {
    // Shorthand: { "spell_cast": {filter:{...}, effect:{...}}, ... }
    if (raw && typeof raw === 'object' && !raw.event && !raw.type && !raw.effect) {
      raw = Object.entries(raw).map(([event, spec]) => ({ event, ...(spec || {}) }));
    } else raw = [raw];
  }
  return raw.map((spec, index) => {
    if (!spec || typeof spec !== 'object') return null;
    const event = normalizeEventType(spec.event || spec.on || spec.when || '');
    const effect = spec.effect || (spec.effectType ? { type: spec.effectType, ...(spec.effectArgs || {}) } : null);
    return {
      ...spec,
      _index: index,
      event,
      filter: spec.filter && typeof spec.filter === 'object' ? spec.filter : {},
      effect
    };
  }).filter(spec => spec?.event && spec?.effect?.type);
}

export function eventTypeMatches(specEvent, rawEvent) {
  const event = normalizeGameEvent(rawEvent);
  const wanted = normalizeEventType(specEvent);
  return wanted === event.type || event.aliases.includes(wanted);
}

export function eventFilterMatches(rawFilter = {}, rawEvent = {}, context = {}) {
  const filter = rawFilter || {};
  const event = normalizeGameEvent(rawEvent);
  const sourceIsLocal = context.sourceIsLocal === true;
  const sourceItem = context.sourceItem || null;
  const sourceCard = context.sourceCard || sourceItem?.card || null;
  const eventCard = event.card;

  if (!relationMatches(filter.controller, sourceIsLocal, event.controllerIsLocal)) return false;
  if (filter.owner != null && !relationMatches(filter.owner, sourceIsLocal, event.ownerIsLocal)) return false;
  if (filter.actor != null && !relationMatches(filter.actor, sourceIsLocal, event.actorIsLocal)) return false;
  if (filter.sourceController != null && !relationMatches(filter.sourceController, sourceIsLocal, event.sourceControllerIsLocal)) return false;
  if (filter.targetController != null && !relationMatches(filter.targetController, sourceIsLocal, event.targetControllerIsLocal)) return false;
  if (filter.targetPlayer != null && !relationMatches(filter.targetPlayer, sourceIsLocal, event.targetPlayerIsLocal)) return false;
  if (filter.activePlayer != null && !relationMatches(filter.activePlayer, sourceIsLocal, event.activePlayerIsLocal)) return false;

  if (filter.self === true && !sameObject(sourceItem, event.item)) return false;
  if (filter.notSelf === true && sameObject(sourceItem, event.item)) return false;
  if (filter.sourceSelf === true && !sameObject(sourceItem, event.sourceItem)) return false;
  if (filter.targetSelf === true && !sameObject(sourceItem, event.targetItem)) return false;

  const typeFilters = arr(filter.cardType ?? filter.type).filter(Boolean);
  if (typeFilters.length && !typeFilters.some(token => cardMatchesTypeToken(eventCard, token))) return false;
  const excludedTypes = arr(filter.excludeCardType ?? filter.notCardType).filter(Boolean);
  if (excludedTypes.some(token => cardMatchesTypeToken(eventCard, token))) return false;

  const subtypes = arr(filter.subtype ?? filter.subtypes).map(v => resolveSubtypeReference(v,{sourceItem,sourceCard})).filter(Boolean);
  if (subtypes.length) {
    const mode = text(filter.subtypeMode || 'any');
    const matches = subtypes.map(st => cardHasSubtype(eventCard,st));
    if (mode === 'all' ? matches.some(v => !v) : matches.every(v => !v)) return false;
  }
  if ((filter.sharedCreatureTypeWithSource === true || filter.sharesCreatureTypeWithSource === true) && !cardsShareCreatureType(eventCard,sourceCard)) return false;

  const wantedColors = arr(filter.color ?? filter.colors).map(v => String(v).toUpperCase()).filter(Boolean);
  if (wantedColors.length) {
    const colors = cardColors(eventCard);
    const mode = text(filter.colorMode || 'any');
    const matches = wantedColors.map(c => colors.has(c));
    if (mode === 'all' ? matches.some(v => !v) : matches.every(v => !v)) return false;
  }

  if (filter.zoneFrom != null && !arr(filter.zoneFrom).map(normalizeEventType).includes(event.zoneFrom)) return false;
  if (filter.zoneTo != null && !arr(filter.zoneTo).map(normalizeEventType).includes(event.zoneTo)) return false;
  if (filter.cause != null && !arr(filter.cause).map(normalizeEventType).includes(event.cause)) return false;
  if (filter.counterType != null && !arr(filter.counterType).map(text).includes(text(event.metadata?.counterType))) return false;
  if (filter.metadata && typeof filter.metadata === 'object') {
    for (const [key, expected] of Object.entries(filter.metadata)) {
      const actual=event.metadata?.[key];
      if (Array.isArray(expected)) { if (!expected.includes(actual)) return false; }
      else if (actual !== expected) return false;
    }
  }
  if (filter.combat === true && event.combat !== true) return false;
  if (filter.combat === false && event.combat !== false) return false;

  const exactAmount = numberOrNull(filter.amount);
  const minAmount = numberOrNull(filter.minAmount ?? filter.amountAtLeast);
  const maxAmount = numberOrNull(filter.maxAmount ?? filter.amountAtMost);
  if (exactAmount != null && event.amount !== exactAmount) return false;
  if (minAmount != null && (event.amount == null || event.amount < minAmount)) return false;
  if (maxAmount != null && (event.amount == null || event.amount > maxAmount)) return false;

  // Optional source predicate: useful for "this Aura/Artifact..." style schemas without
  // teaching the event itself about the source permanent.
  const sourceTypes = arr(filter.sourceCardType).filter(Boolean);
  if (sourceTypes.length && !sourceTypes.some(token => cardMatchesTypeToken(sourceCard, token))) return false;
  const eventSourceTypes = arr(filter.eventSourceCardType ?? filter.dealtByCardType).filter(Boolean);
  if (eventSourceTypes.length && !eventSourceTypes.some(token => cardMatchesTypeToken(event.sourceCard, token))) return false;
  const targetTypes = arr(filter.targetCardType).filter(Boolean);
  if (targetTypes.length && !targetTypes.some(token => cardMatchesTypeToken(event.targetCard, token))) return false;
  const sourceSubtypes = arr(filter.sourceSubtype).map(v => resolveSubtypeReference(v,{sourceItem,sourceCard})).filter(Boolean);
  if (sourceSubtypes.length && sourceSubtypes.every(st => !cardHasSubtype(sourceCard,st))) return false;
  const targetSubtypes = arr(filter.targetSubtype).map(v => resolveSubtypeReference(v,{sourceItem,sourceCard})).filter(Boolean);
  if (targetSubtypes.length && targetSubtypes.every(st => !cardHasSubtype(event.targetCard,st))) return false;

  return true;
}

export function genericTriggerMatchesEvent(spec, rawEvent, context = {}) {
  const event = normalizeGameEvent(rawEvent);
  if (!spec?.event || !spec?.effect?.type) return false;
  return eventTypeMatches(spec.event, event) && eventFilterMatches(spec.filter, event, context);
}

export function collectGenericEventMatches({ event: rawEvent, watchers = [], isSuppressed = null } = {}) {
  const event = normalizeGameEvent(rawEvent);
  const matches = [];
  for (const watcher of watchers || []) {
    const sourceItem = watcher?.item || watcher?.unit || null;
    const sourceCard = watcher?.card || sourceItem?.card || null;
    const sourceIsLocal = watcher?.isLocal === true;
    if (!sourceCard || !sourceItem) continue;
    if (typeof isSuppressed === 'function' && isSuppressed(sourceItem, sourceIsLocal)) continue;
    for (const spec of normalizeGenericTriggerSpecs(sourceCard)) {
      if (!genericTriggerMatchesEvent(spec, event, { sourceItem, sourceCard, sourceIsLocal })) continue;
      matches.push({ sourceItem, sourceCard, sourceIsLocal, spec, event });
    }
  }
  return matches;
}
