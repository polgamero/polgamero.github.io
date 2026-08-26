// js/tokenEngine.js — Argentinia 23.15.7 · Generic Permanent Tokens
// Normaliza el contrato legacy `create_tokens` y el nuevo `token:{...}` a una única
// definición de permanente-token. Este módulo es puro: no conoce state/DOM/Firestore.

import { getPermanentTypes, isCreaturePermanent, isLandPermanent } from './permanentTypes.js';

const PERMANENT_TYPE_RE = /(Criatura|Artefacto|Encantamiento|Tierra|Planeswalker)/i;
const NON_PERMANENT_TYPE_RE = /(Instantáneo|Instantaneo|Conjuro)/i;

export const TOKEN_PRESETS = Object.freeze({
  treasure: Object.freeze({
    name:'Tesoro', type:'Artefacto — Tesoro', text:'{T}, sacrificá este artefacto: Agregá un maná de cualquier color.', colors:[],
    manaAbility:{ producesOptions:['W','U','B','R','G'], amount:1, requiresTap:true, sacrificeSelf:true }
  }),
  clue: Object.freeze({
    name:'Pista', type:'Artefacto — Pista', text:'{2}, sacrificá este artefacto: Robá una carta.', colors:[],
    activatedAbility:{ cost:'{2}', sacrifice:'self', effect:{type:'draw',amount:1}, requiresTarget:false, timing:'instant' }
  }),
  food: Object.freeze({
    name:'Comida', type:'Artefacto — Comida', text:'{2}, {T}, sacrificá este artefacto: Ganás 3 vidas.', colors:[],
    activatedAbility:{ cost:'{2}{T}', sacrifice:'self', effect:{type:'heal',amount:3}, requiresTarget:false, timing:'instant' }
  }),
  blood: Object.freeze({
    name:'Sangre', type:'Artefacto — Sangre', text:'{1}, {T}, descartá una carta, sacrificá este artefacto: Robá una carta.', colors:[],
    activatedAbility:{ cost:'{1}{T}', additionalCost:{type:'discard',amount:1}, sacrifice:'self', effect:{type:'draw',amount:1}, requiresTarget:false, timing:'instant' }
  })
});

function presetFor(effect){
  const key=String(effect?.tokenPreset || effect?.token?.preset || '').trim().toLowerCase();
  if(!key) return null;
  if(!TOKEN_PRESETS[key]) throw new Error(`tokenPreset desconocido: ${key}`);
  return cloneObject(TOKEN_PRESETS[key]);
}

function cloneObject(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneObject);
  return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, cloneObject(v)]));
}

export function normalizeTokenSpec(effect = {}, sourceCard = {}) {
  const preset = presetFor(effect) || {};
  const explicit = effect?.token && typeof effect.token === 'object' ? effect.token : {};
  const nested = { ...preset, ...explicit };
  const legacyStats = effect?.tokenStats && typeof effect.tokenStats === 'object' ? effect.tokenStats : {};
  const name = String(nested.name ?? effect.tokenName ?? 'Ficha').trim() || 'Ficha';
  const type = String(nested.type ?? effect.tokenType ?? 'Criatura — Token').trim() || 'Criatura — Token';
  const creature = /Criatura/i.test(type) || nested.power !== undefined || legacyStats.power !== undefined;
  const power = creature ? Number(nested.power ?? legacyStats.power ?? 1) : undefined;
  const toughness = creature ? Number(nested.toughness ?? legacyStats.toughness ?? 1) : undefined;
  const colors = Array.isArray(nested.colors)
    ? [...nested.colors]
    : Array.isArray(effect.tokenColors)
      ? [...effect.tokenColors]
      : Array.isArray(sourceCard?.colors) ? [...sourceCard.colors] : [];
  const keywords = Array.isArray(nested.keywords)
    ? [...nested.keywords]
    : Array.isArray(effect.tokenKeywords) ? [...effect.tokenKeywords] : [];
  const image = typeof (nested.image ?? effect.image) === 'string' && String(nested.image ?? effect.image).trim()
    ? String(nested.image ?? effect.image).trim() : null;

  return {
    name,
    type,
    image,
    colors,
    power: Number.isFinite(power) ? power : (creature ? 1 : undefined),
    toughness: Number.isFinite(toughness) ? toughness : (creature ? 1 : undefined),
    loyalty: nested.loyalty !== undefined ? Math.max(0, Number(nested.loyalty) || 0) : undefined,
    text: typeof nested.text === 'string' ? nested.text : (typeof effect.tokenText === 'string' ? effect.tokenText : ''),
    flavorText: typeof nested.flavorText === 'string' ? nested.flavorText : '',
    keywords,
    tapped: nested.tapped === true || effect.tokenTapped === true,
    manaAbility: cloneObject(nested.manaAbility ?? effect.tokenManaAbility ?? null),
    activatedAbility: cloneObject(nested.activatedAbility ?? effect.tokenActivatedAbility ?? null),
    activatedAbilities: cloneObject(nested.activatedAbilities ?? effect.tokenActivatedAbilities ?? null),
    staticEffect: cloneObject(nested.staticEffect ?? null),
    replacementEffect: cloneObject(nested.replacementEffect ?? null),
    triggers: cloneObject(nested.triggers ?? null),
    legendary: nested.legendary === true,
    subtype: nested.subtype || null,
    raw: cloneObject(nested)
  };
}

export function tokenSpecIsPermanent(spec) {
  const type = String(spec?.type || '');
  return PERMANENT_TYPE_RE.test(type) && !NON_PERMANENT_TYPE_RE.test(type);
}

export function buildTokenCard(spec, { id, sourceCard = null } = {}) {
  if (!tokenSpecIsPermanent(spec)) throw new Error(`Tipo de ficha no permanente: ${spec?.type || '—'}`);
  const card = {
    id: id || `token_${Date.now().toString(36)}`,
    name: spec.name || 'Ficha',
    type: spec.type || 'Criatura — Token',
    manaCost: null,
    image: spec.image ?? null,
    cmc: 0,
    rarity: 'Common',
    colors: Array.isArray(spec.colors) ? [...spec.colors] : [],
    text: spec.text || '',
    flavorText: spec.flavorText || '',
    keywords: Array.isArray(spec.keywords) ? [...spec.keywords] : [],
    isToken: true,
    tokenSpecVersion: 2
  };
  if (spec.power !== undefined) card.power = Number(spec.power) || 0;
  if (spec.toughness !== undefined) card.toughness = Number(spec.toughness) || 0;
  if (spec.loyalty !== undefined) card.loyalty = Math.max(0, Number(spec.loyalty) || 0);
  if (spec.manaAbility) card.manaAbility = cloneObject(spec.manaAbility);
  if (spec.activatedAbilities) card.activatedAbilities = cloneObject(spec.activatedAbilities);
  else if (spec.activatedAbility) card.activatedAbility = cloneObject(spec.activatedAbility);
  if (spec.staticEffect) card.staticEffect = cloneObject(spec.staticEffect);
  if (spec.replacementEffect) card.replacementEffect = cloneObject(spec.replacementEffect);
  if (spec.triggers) card.triggers = cloneObject(spec.triggers);
  if (spec.legendary) card.legendary = true;
  if (sourceCard?.id) card.tokenCreatedBy = sourceCard.id;
  return card;
}

export function tokenBattlefieldKind(card) {
  const types = new Set(getPermanentTypes(card));
  if (types.has('creature')) return 'creature';
  if (types.has('planeswalker')) return 'planeswalker';
  if (types.has('land')) return 'land';
  if (types.has('artifact') || types.has('enchantment')) return 'support';
  return 'invalid';
}

export function buildTokenPermanentItem(card, { tapped = false } = {}) {
  const kind = tokenBattlefieldKind(card);
  if (kind === 'invalid') throw new Error(`La ficha ${card?.name || 'Ficha'} no tiene un tipo de permanente soportado.`);
  const baseTapped = !!tapped;
  if (kind === 'creature') {
    return { card, tapped:baseTapped, enteredThisTurn:true, summoningSickness:true, isAttacking:false, blockingIndex:null, damageTaken:0, auras:[] };
  }
  if (kind === 'planeswalker') {
    return { card, tapped:baseTapped, enteredThisTurn:true, loyalty:Math.max(0,Number(card.loyalty)||0), abilityUsedThisTurn:false };
  }
  if (kind === 'land') {
    return { card, tapped:baseTapped, enteredThisTurn:true, permanentTypes:['land'] };
  }
  const item = { card, tapped:baseTapped, enteredThisTurn:true };
  if (card.equipment) item.attachedTo = null;
  return item;
}

export function tokenEngineSummary() {
  return {
    version:'23.15.7',
    legacyCreateTokens:true,
    permanentKinds:['creature','artifact','enchantment','land','planeswalker'],
    supportsManaAbility:true,
    supportsActivatedAbilities:true,
    tokenLeavesBattlefieldCeases:true
  };
}
