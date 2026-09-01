// js/copyEngine.js — Argentinia 23.15.9 · Copy Engine
// Capa pura para valores copiables de cartas, objetos de Stack y permanentes.
// No conoce state/DOM/Firestore. Los callers deciden targets, zonas, triggers y autoridad.

import { buildTokenPermanentItem, tokenBattlefieldKind } from './tokenEngine.js';

export const COPY_ENGINE_VERSION = '23.15.9';

const NON_COPIABLE_CARD_KEYS = new Set([
  'id', '_ownerRole', '_controlEffectId',
  'isToken', 'tokenSpecVersion', 'tokenCreatedBy',
  'copyOfCardId', 'copyOfCardName', 'copyEngineVersion', 'copyOriginKind',
  // 23.16.4 — ser físicamente double-faced NO es un valor copiable. Copiar una TDFC
  // copia sólo las características de la cara actualmente visible.
  'dfc'
]);

function cloneValue(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneValue);
  const out = {};
  for (const [key, child] of Object.entries(value)) out[key] = cloneValue(child);
  return out;
}

export function extractCopiableCardValues(card = {}) {
  const out = {};
  for (const [key, value] of Object.entries(card || {})) {
    if (NON_COPIABLE_CARD_KEYS.has(key) || key.startsWith('_')) continue;
    out[key] = cloneValue(value);
  }
  return out;
}

export function applyCopyOverrides(values = {}, overrides = null) {
  const out = cloneValue(values || {});
  if (!overrides || typeof overrides !== 'object') return out;

  // Overrides directos: permiten expresar los "excepto que..." más comunes sin
  // inventar un effect distinto por carta.
  const direct = [
    'name', 'type', 'manaCost', 'cmc', 'colors', 'text', 'flavorText', 'image',
    'power', 'toughness', 'loyalty', 'rarity', 'keywords', 'legendary',
    'effect', 'etbEffect', 'staticEffect', 'replacementEffect', 'triggers',
    'activatedAbility', 'activatedAbilities', 'loyaltyAbilities',
    'saga', 'chapters', 'finalChapter'
  ];
  for (const key of direct) if (Object.prototype.hasOwnProperty.call(overrides, key)) out[key] = cloneValue(overrides[key]);

  if (Array.isArray(overrides.addKeywords)) {
    const merged = [...(Array.isArray(out.keywords) ? out.keywords : []), ...overrides.addKeywords];
    out.keywords = [...new Set(merged.map(v => String(v)))];
  }
  if (Array.isArray(overrides.removeKeywords) && Array.isArray(out.keywords)) {
    const denied = new Set(overrides.removeKeywords.map(v => String(v).toLowerCase()));
    out.keywords = out.keywords.filter(v => !denied.has(String(v).toLowerCase()));
  }
  if (typeof overrides.appendText === 'string' && overrides.appendText.trim()) {
    out.text = `${String(out.text || '').trim()}${out.text ? ' ' : ''}${overrides.appendText.trim()}`;
  }
  return out;
}

export function buildCopiedCard(sourceCard, options = {}) {
  if (!sourceCard || typeof sourceCard !== 'object') throw new Error('Copy Engine: sourceCard inválida.');
  const values = applyCopyOverrides(extractCopiableCardValues(sourceCard), options.overrides || null);
  const id = options.id || sourceCard.id || `copy_${Date.now().toString(36)}`;
  const out = {
    ...values,
    id,
    copyOfCardId: sourceCard.copyOfCardId || sourceCard.id || null,
    copyOfCardName: sourceCard.name || null,
    copyEngineVersion: COPY_ENGINE_VERSION,
    copyOriginKind: options.originKind || 'copy'
  };
  if (options.isToken === true) out.isToken = true;
  if (options.ownerRole) out._ownerRole = options.ownerRole;
  return out;
}

// Un permanente que se vuelve copia sigue siendo EL MISMO objeto: conserva identidad física,
// dueño y condición de ficha/no-ficha. Sólo se reemplazan sus valores copiables de carta.
export function buildBecameCopyCard(targetCard, sourceCard, options = {}) {
  if (!targetCard || !sourceCard) throw new Error('Copy Engine: target/source requeridos.');
  const copied = buildCopiedCard(sourceCard, {
    id: targetCard.id,
    overrides: options.overrides || null,
    originKind: 'permanent_became_copy'
  });
  if (targetCard._ownerRole) copied._ownerRole = targetCard._ownerRole;
  if (targetCard.isToken) copied.isToken = true;
  if (targetCard.tokenSpecVersion) copied.tokenSpecVersion = targetCard.tokenSpecVersion;
  if (targetCard.tokenCreatedBy) copied.tokenCreatedBy = targetCard.tokenCreatedBy;
  // 23.16.4 — si el OBJETO físico que se vuelve copia es una TDFC, conserva sus dos
  // caras físicas. Mientras dure el copy effect, transformar sólo cambia qué cara física
  // está arriba; las características copiadas siguen ganando.
  if (targetCard._dfcPhysicalCard) {
    copied._dfcPhysicalCard = cloneValue(targetCard._dfcPhysicalCard);
    copied._dfcFace = targetCard._dfcFace === 'back' ? 'back' : 'front';
    copied._dfcCopyLocked = true;
  }
  copied.copyOfCardId = sourceCard.copyOfCardId || sourceCard.id || null;
  copied.copyOfCardName = sourceCard.name || null;
  return copied;
}

export function cloneStackTarget(target) {
  if (!target || typeof target !== 'object') return target || null;
  if (target.type === 'multi') {
    return { ...target, targets: (target.targets || []).map(cloneStackTarget) };
  }
  // Los refs a permanentes DEBEN seguir apuntando al mismo objeto de battlefield. Clonar
  // profundamente item/fightWithItem convertiría un target legal en un snapshot huérfano.
  const out = { ...target };
  if (target._syncDescriptor) out._syncDescriptor = cloneValue(target._syncDescriptor);
  if (target.item) out.item = target.item;
  if (target.fightWithItem) out.fightWithItem = target.fightWithItem;
  return out;
}

export function stackObjectKind(item) {
  if (!item) return 'invalid';
  if (item.type === 'ability') return 'ability';
  return 'spell';
}

export function isCopyableStackItem(item, filter = 'any') {
  if (!item?.card) return false;
  const kind = stackObjectKind(item);
  const normalized = String(filter || 'any').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'any' || normalized === 'stack_object') return kind === 'spell' || kind === 'ability';
  if (normalized === 'ability' || normalized === 'activated_or_triggered_ability') return kind === 'ability';
  if (kind !== 'spell') return false;
  if (normalized === 'spell') return true;
  const type = String(item.card.type || '').toLowerCase();
  const instant = type.includes('instantáneo') || type.includes('instantaneo') || type.includes('instant');
  const sorcery = type.includes('conjuro') || type.includes('sorcery');
  const permanent = type.includes('criatura') || type.includes('artefacto') || type.includes('encantamiento') || type.includes('tierra') || type.includes('planeswalker') || item.type === 'summon' || item.type === 'permanent' || item.type === 'planeswalker' || item.type === 'aura';
  if (normalized === 'instant') return instant;
  if (normalized === 'sorcery') return sorcery;
  if (normalized === 'instant_or_sorcery' || normalized === 'instantaneo_o_conjuro') return instant || sorcery;
  if (normalized === 'permanent_spell') return permanent;
  if (normalized === 'nonpermanent_spell') return !permanent;
  return false;
}

export function buildStackCopy(original, options = {}) {
  if (!original?.card) throw new Error('Copy Engine: objeto de Stack inválido.');
  const kind = stackObjectKind(original);
  const targetObj = options.targetObj === undefined ? cloneStackTarget(original.targetObj) : cloneStackTarget(options.targetObj);
  const copied = {
    ...original,
    // addToStack asigna un ID de objeto nuevo. Nunca reutilizar el ID del original.
    id: undefined,
    // 23.16.4 — copiar un hechizo TDFC copia sólo su cara visible (la frontal en Stack),
    // nunca la naturaleza double-faced del cartón físico.
    card: { ...extractCopiableCardValues(original.card), id: original.card.id || null },
    isLocal: options.controllerIsLocal !== false,
    targetObj,
    ability: original.ability ? cloneValue(original.ability) : original.ability,
    source: original.source ? { ...original.source } : original.source,
    sourceItem: original.sourceItem || null,
    isCopy: true,
    wasCast: false,
    // El origen de casteo es historia del objeto original, no un valor copiable. Una copia de
    // un hechizo casteado desde Exilio/Otra vuelta/Zafar nunca fue casteada desde esa zona.
    castFrom: null,
    exilePermissionId: null,
    exilePlayEngineVersion: null,
    suspendEngineVersion: null,
    suspendHaste: false,
    copyKind: kind,
    copiedFromStackId: original.id ?? null,
    copyEngineVersion: COPY_ENGINE_VERSION
  };
  if (options.sourceCardId) copied.copyCreatedBy = options.sourceCardId;
  return copied;
}

export function buildPermanentCopyToken(sourceItemOrCard, options = {}) {
  const sourceCard = sourceItemOrCard?.card || sourceItemOrCard;
  if (!sourceCard) throw new Error('Copy Engine: permanente fuente inválido.');
  const card = buildCopiedCard(sourceCard, {
    id: options.id,
    isToken: true,
    ownerRole: options.ownerRole || null,
    overrides: options.overrides || null,
    originKind: 'token_copy'
  });
  const kind = tokenBattlefieldKind(card);
  if (kind === 'invalid') throw new Error(`Copy Engine: ${sourceCard.name || 'objeto'} no es un permanente copiable.`);
  const item = buildTokenPermanentItem(card, { tapped: !!options.tapped });
  return { card, item, kind };
}

export function copyEngineSummary() {
  return Object.freeze({
    version: COPY_ENGINE_VERSION,
    stackCopies: ['spell', 'ability'],
    permanentTokenCopies: true,
    permanentBecomesCopy: true,
    copiesTargetsAndChoices: ['targetObj', 'xValue', 'kicked', 'mode-resolved-card'],
    nonCopiableRuntimeState: ['tapped', 'damage', 'counters', 'attachments', 'summoningSickness', 'temporaryEffects']
  });
}
