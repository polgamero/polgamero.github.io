// js/transformEngine.js — Argentinia 23.16.4 · Transforming Double-Faced Cards Engine
// Capa pura para identidad física TDFC, caras efectivas y acciones de transformar.
// El root de la carta es SIEMPRE la cara frontal fuera del battlefield. En battlefield,
// item.card contiene sólo los valores efectivos de la cara visible y conserva un ancla
// runtime privada (_dfcPhysicalCard) que nunca es copiable por Copy Engine.

export const TRANSFORM_ENGINE_VERSION = '23.16.4';

const PERMANENT_RE = /(Criatura|Artefacto|Encantamiento|Tierra|Planeswalker|Creature|Artifact|Enchantment|Land|Planeswalker)/i;

function cloneValue(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneValue);
  const out = {};
  for (const [key, child] of Object.entries(value)) out[key] = cloneValue(child);
  return out;
}

function cardOf(itemOrCard) {
  return itemOrCard?.card || itemOrCard || null;
}

export function physicalDfcCard(itemOrCard) {
  const card = cardOf(itemOrCard);
  if (!card) return null;
  return card._dfcPhysicalCard || itemOrCard?._dfcPhysicalCard || (card.dfc?.kind === 'transform' ? card : null);
}

export function normalizeTransformSpec(itemOrCard) {
  const physical = physicalDfcCard(itemOrCard);
  const raw = physical?.dfc;
  if (!physical || !raw || raw.kind !== 'transform' || !raw.backFace || typeof raw.backFace !== 'object') return null;
  const back = cloneValue(raw.backFace);
  if (!back.name || !back.type) return null;
  return Object.freeze({
    kind: 'transform',
    frontName: physical.name || null,
    backName: back.name,
    backFace: back,
    canTransformBack: raw.canTransformBack !== false,
    version: raw.version || 1
  });
}

export function isTransformingDoubleFacedCard(itemOrCard) {
  return !!normalizeTransformSpec(itemOrCard);
}

export function isPermanentFace(card) {
  return !!card && PERMANENT_RE.test(String(card.type || ''));
}

function physicalFrontSnapshot(physical) {
  const out = {};
  for (const [key, value] of Object.entries(physical || {})) {
    if (key.startsWith('_dfc')) continue;
    out[key] = cloneValue(value);
  }
  return out;
}

export function buildTransformFaceCard(itemOrCard, face = 'front') {
  const physical = physicalDfcCard(itemOrCard);
  const spec = normalizeTransformSpec(itemOrCard);
  if (!physical || !spec) return cardOf(itemOrCard);
  const normalizedFace = face === 'back' ? 'back' : 'front';
  const front = physicalFrontSnapshot(physical);
  const ownerRole = physical._ownerRole || cardOf(itemOrCard)?._ownerRole || null;
  let out;

  if (normalizedFace === 'front') {
    out = { ...front };
    // En battlefield no exponemos `dfc` como valor copiable. El ancla privada conserva
    // ambas caras y Copy Engine ignora claves que comienzan con `_`.
    delete out.dfc;
  } else {
    out = {
      id: physical.id,
      rarity: physical.rarity,
      ...cloneValue(spec.backFace)
    };
    // Regla TDFC: el mana value de la cara posterior es el de la cara frontal.
    out.cmc = Number.isFinite(Number(physical.cmc)) ? Number(physical.cmc) : (out.cmc ?? 0);
    // Una back face de TDFC normalmente no tiene mana cost. Si el JSON no especifica uno,
    // lo representamos vacío en vez de heredar el de la cara frontal.
    if (!Object.prototype.hasOwnProperty.call(spec.backFace, 'manaCost')) out.manaCost = '';
    if (!Object.prototype.hasOwnProperty.call(spec.backFace, 'rarity')) out.rarity = physical.rarity;
    if (!Object.prototype.hasOwnProperty.call(spec.backFace, 'keywords')) out.keywords = [];
  }

  if (ownerRole) out._ownerRole = ownerRole;
  out._dfcPhysicalCard = physicalFrontSnapshot(physical);
  out._dfcFace = normalizedFace;
  out._dfcEngineVersion = TRANSFORM_ENGINE_VERSION;
  return out;
}

export function initializeTransformPermanentItem(item, physicalCard = null, { face = 'front' } = {}) {
  if (!item || typeof item !== 'object') return { changed:false, reason:'invalid_item' };
  const source = physicalCard || item.card;
  if (!isTransformingDoubleFacedCard(source)) return { changed:false, reason:'not_tdfc', item };
  if (source?.isToken || item?.card?.isToken) return { changed:false, reason:'token_cannot_transform', item };
  const physical = physicalFrontSnapshot(physicalDfcCard(source) || source);
  const spec = normalizeTransformSpec(physical);
  if (!spec) return { changed:false, reason:'invalid_spec', item };
  if (face === 'back' && !isPermanentFace(spec.backFace)) return { changed:false, reason:'back_not_permanent', item };
  item._dfcPhysicalCard = physical;
  item._dfcFace = face === 'back' ? 'back' : 'front';
  item.card = buildTransformFaceCard({ ...physical, _dfcPhysicalCard: physical }, item._dfcFace);
  item.card._dfcPhysicalCard = physical;
  item.card._dfcFace = item._dfcFace;
  item.card._dfcEngineVersion = TRANSFORM_ENGINE_VERSION;
  return { changed:true, face:item._dfcFace, item, card:item.card };
}

export function currentTransformFace(itemOrCard) {
  if (itemOrCard?._dfcFace === 'back' || itemOrCard?._dfcFace === 'front') return itemOrCard._dfcFace;
  const card = cardOf(itemOrCard);
  return card?._dfcFace === 'back' ? 'back' : 'front';
}

// 23.16.5.2 — identidad de PRESENTACIÓN por cara. Una TDFC física comparte card.id para
// reglas/colección, pero arte y textbox necesitan claves independientes. Para cartas
// normales preservamos exactamente el ID histórico.
export function transformFaceLayoutId(itemOrCard) {
  const card = cardOf(itemOrCard);
  const physical = physicalDfcCard(itemOrCard);
  const id = String(physical?.id || card?.id || '').trim();
  if (!id) return '';
  if (!physical || !normalizeTransformSpec(itemOrCard)) return id;
  return `${id}::${currentTransformFace(itemOrCard)}`;
}

export function canTransformPermanent(item) {
  if (!item || item?.card?.isToken) return false;
  const physical = physicalDfcCard(item);
  const spec = normalizeTransformSpec(item);
  if (!physical || !spec) return false;
  if (currentTransformFace(item) === 'back' && spec.canTransformBack === false) return false;
  return isPermanentFace(spec.backFace);
}

export function setTransformFace(item, face) {
  if (!item || !canTransformPermanent(item)) return { transformed:false, reason:'not_transformable', item };
  const toFace = face === 'back' ? 'back' : 'front';
  const fromFace = currentTransformFace(item);
  if (fromFace === toFace) return { transformed:false, reason:'same_face', item, fromFace, toFace };
  const physical = physicalDfcCard(item);
  const beforeCard = item.card;
  item._dfcPhysicalCard = physicalFrontSnapshot(physical);
  item._dfcFace = toFace;

  // Si una TDFC se convirtió en copia de otra cosa, transformar cambia la cara física pero
  // NO elimina el copy effect. Copy Engine marca ese overlay con _dfcCopyLocked.
  if (beforeCard?._dfcCopyLocked) {
    item.card = { ...beforeCard, _dfcPhysicalCard:item._dfcPhysicalCard, _dfcFace:toFace, _dfcEngineVersion:TRANSFORM_ENGINE_VERSION };
  } else {
    item.card = buildTransformFaceCard({ ...item._dfcPhysicalCard, _dfcPhysicalCard:item._dfcPhysicalCard }, toFace);
  }
  return { transformed:true, item, fromFace, toFace, beforeCard, afterCard:item.card };
}

export function transformPermanent(item) {
  const fromFace = currentTransformFace(item);
  return setTransformFace(item, fromFace === 'back' ? 'front' : 'back');
}

export function cardForNonBattlefieldZone(cardOrItem) {
  const card = cardOf(cardOrItem);
  if (!card) return card;
  const physical = physicalDfcCard(cardOrItem);
  if (!physical) return card;
  const front = physicalFrontSnapshot(physical);
  // Mantener ownership físico; el estado de cara nunca viaja a zonas no-battlefield.
  if (card._ownerRole) front._ownerRole = card._ownerRole;
  return front;
}

export function transformEngineSummary() {
  return Object.freeze({
    version: TRANSFORM_ENGINE_VERSION,
    schema: 'card.dfc={kind:"transform",backFace:{...}}',
    outsideBattlefieldFace: 'front',
    stackFace: 'front',
    battlefieldFace: 'current',
    backFaceManaValue: 'front_cmc',
    samePhysicalObjectOnTransform: true,
    preservesRuntimeState: ['controller','tapped','damage','counters','attachments','summoningSickness'],
    copyRules: ['copies_current_face_only','token_copy_cannot_transform','physical_tdfc_copy_overlay_survives_transform']
  });
}
