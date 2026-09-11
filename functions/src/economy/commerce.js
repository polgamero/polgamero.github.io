import { FieldValue } from 'firebase-admin/firestore';
import { TRUSTED_CARD_POOL, TRUSTED_CARD_IDS, TRUSTED_CARD_POOL_FINGERPRINT } from '../trusted/cardCatalog.js';
import { TRUSTED_PREBUILT_BY_ID } from '../trusted/prebuiltCatalog.js';
import { loadTrustedEmoteCatalog, normalizeOwnedPremiumEmotes } from '../trusted/emoteCatalog.js';
import { validateUsername } from './usernames.js';
import { economyError } from '../shared/errors.js';
import {
  ENHANCEMENT_KEYWORDS,
  USERNAME_RENAME_COST,
  normalizeStoreSettings,
  buildCommerceCampaignEffects,
  effectivePackPurchaseCost,
  normalizeInventory,
  normalizeClassifiedCounts,
  nextClassifiedCounts,
  argentinaWeekKey,
  nextArgentinaWeekRotationIso
} from './commerceCore.js';

const trustedById = new Map(TRUSTED_CARD_POOL.map(card => [card.id, card]));

// 23.21.4 — productos fijos de infraestructura de mazo. Cada color entrega copias de
// una Tierra básica Common trusted; la economía (precio/cantidad) se resuelve siempre
// desde gameConfig/settings dentro de la autoridad server-side.
export const CLASSIFIED_BASIC_LAND_PACKS = Object.freeze([
  Object.freeze({ color:'W', cardId:'tier_001', label:'Blancas' }),
  Object.freeze({ color:'U', cardId:'tier_003', label:'Azules' }),
  Object.freeze({ color:'B', cardId:'tier_009', label:'Negras' }),
  Object.freeze({ color:'R', cardId:'tier_005', label:'Rojas' }),
  Object.freeze({ color:'G', cardId:'tier_007', label:'Verdes' })
]);
const classifiedBasicLandPackByColor = new Map(CLASSIFIED_BASIC_LAND_PACKS.map(pack => [pack.color, pack]));

function trustedBasicLandPack(colorRaw) {
  const color = String(colorRaw || '').trim().toUpperCase();
  const pack = classifiedBasicLandPackByColor.get(color);
  if (!pack) throw economyError('CLASSIFIEDS_BASIC_LAND_PACK_INVALID_COLOR');
  const card = trustedById.get(pack.cardId);
  const type = String(card?.type || '').toLowerCase();
  if (!card || card.rarity !== 'Common' || !type.includes('tierra básica') || String(card.produces || '').toUpperCase() !== color) {
    throw economyError('CLASSIFIEDS_BASIC_LAND_PACK_CATALOG_INVALID');
  }
  return { ...pack, card };
}

function basicLandPackState(profile, weekKey) {
  const sameWeek = String(profile?.classifiedsBasicLandPackWeekKey || '') === String(weekKey || '');
  return {
    purchasedColors: sameWeek && Array.isArray(profile?.classifiedsBasicLandPacksPurchased)
      ? [...new Set(profile.classifiedsBasicLandPacksPurchased.map(value => String(value || '').toUpperCase()).filter(value => classifiedBasicLandPackByColor.has(value)))]
      : []
  };
}
let campaignCache = { at: 0, events: [] };
const CAMPAIGN_TTL_MS = 15_000;

export async function loadCommerceCampaignEffects(db) {
  const now = Date.now();
  if (now - campaignCache.at >= CAMPAIGN_TTL_MS) {
    try {
      const query = db.collection('campaignEvents').where('startAt', '<=', new Date(now)).orderBy('startAt', 'desc').limit(20);
      const snap = await query.get();
      campaignCache = { at: now, events: snap.docs.map(doc => ({ id: doc.id, ...(doc.data() || {}) })) };
    } catch (error) {
      campaignCache = { at: 0, events: [] };
      throw economyError('CAMPAIGN_POLICY_UNAVAILABLE');
    }
  }
  return buildCommerceCampaignEffects(campaignCache.events, now);
}

async function loadSettings(db, tx = null) {
  const ref = db.doc('gameConfig/settings');
  const snap = tx ? await tx.get(ref) : await ref.get();
  return normalizeStoreSettings(snap.exists ? snap.data() || {} : {});
}

export async function storefrontSnapshot(db) {
  const [settings, campaign, emoteCatalog] = await Promise.all([loadSettings(db), loadCommerceCampaignEffects(db), loadTrustedEmoteCatalog(db)]);
  return {
    pack: {
      baseCost: settings.packCost,
      effectiveCost: effectivePackPurchaseCost(settings.packCost, campaign),
      discountPercent: campaign.packDiscountPercent,
      activeEventIds: campaign.activeEventIds
    },
    craft: { fichasCost: settings.craftCost, allowedKeywords: [...ENHANCEMENT_KEYWORDS] },
    prebuilt: { pointsCost: settings.prebuiltPoints, fichasCost: settings.prebuiltFichas, maxSavedDecks: settings.maxSavedDecks },
    classifiedBasicLandPacks: { pointsCost: settings.classifiedBasicLandPackPrice, quantity: settings.classifiedBasicLandPackQuantity },
    username: { renameFichasCost: USERNAME_RENAME_COST },
    emotes: { schemaVersion:emoteCatalog.schemaVersion, catalogVersion:emoteCatalog.catalogVersion, items:emoteCatalog.items.map(item => ({ ...item })) },
    trustedPoolFingerprint: TRUSTED_CARD_POOL_FINGERPRINT
  };
}

export async function purchasePackTx({ db, tx, uid, campaignEffects }) {
  const [userSnap, settings] = await Promise.all([
    tx.get(db.collection('users').doc(uid)),
    loadSettings(db, tx)
  ]);
  if (!userSnap.exists) throw economyError('PROFILE_MISSING');
  const profile = userSnap.data() || {};
  const pointsBefore = Math.max(0, Math.floor(Number(profile.points) || 0));
  const cost = effectivePackPurchaseCost(settings.packCost, campaignEffects);
  if (pointsBefore < cost) throw economyError('STORE_INSUFFICIENT_POINTS', { required: cost, available: pointsBefore });
  const inventory = normalizeInventory(profile.inventory);
  const nextInventory = { ...inventory, standardPacks: inventory.standardPacks + 1 };
  const pointsAfter = pointsBefore - cost;
  tx.update(db.collection('users').doc(uid), { points: pointsAfter, inventory: nextInventory });
  return {
    kind: 'packPurchase', baseCost: settings.packCost, effectiveCost: cost, pointsAfter,
    inventoryAfter: nextInventory,
    campaign: { packDiscountPercent: campaignEffects.packDiscountPercent, activeEventIds: campaignEffects.activeEventIds }
  };
}

function enhancementCard(cardId) {
  const card = trustedById.get(String(cardId || ''));
  if (!card || !String(card.type || '').toLocaleLowerCase('es-AR').includes('criatura')) {
    throw economyError('CRAFT_CARD_NOT_ELIGIBLE');
  }
  return card;
}
export async function craftEnhancementTx({ db, tx, uid, cardId, keyword }) {
  const card = enhancementCard(cardId);
  const cleanKeyword = String(keyword || '').trim();
  if (!ENHANCEMENT_KEYWORDS.includes(cleanKeyword)) throw economyError('CRAFT_KEYWORD_INVALID');
  const [userSnap, settings] = await Promise.all([
    tx.get(db.collection('users').doc(uid)),
    loadSettings(db, tx)
  ]);
  if (!userSnap.exists) throw economyError('PROFILE_MISSING');
  const profile = userSnap.data() || {};
  const collection = Array.isArray(profile.collection) ? profile.collection : [];
  if (!collection.includes(card.id)) throw economyError('CRAFT_CARD_NOT_OWNED');
  const enhancements = profile.enhancements && typeof profile.enhancements === 'object' && !Array.isArray(profile.enhancements)
    ? profile.enhancements : {};
  if (enhancements[card.id]) throw economyError('CRAFT_ALREADY_ENHANCED');
  const fichasBefore = Math.max(0, Math.floor(Number(profile.fichas) || 0));
  if (fichasBefore < settings.craftCost) throw economyError('CRAFT_INSUFFICIENT_FICHAS', { required: settings.craftCost, available: fichasBefore });
  const fichasAfter = fichasBefore - settings.craftCost;
  tx.update(db.collection('users').doc(uid), {
    fichas: fichasAfter,
    enhancements: { ...enhancements, [card.id]: cleanKeyword }
  });
  return { kind: 'enhancementCraft', cardId: card.id, keyword: cleanKeyword, fichasCost: settings.craftCost, fichasAfter };
}


export async function purchaseEmoteTx({ db, tx, uid, emoteId }) {
  // Catalog + user are read inside the same Firestore transaction. The browser can submit
  // only an emoteId; active/premium/price are resolved from gameConfig/emotes server-side.
  const catalog = await loadTrustedEmoteCatalog(db, tx);
  const item = catalog.byId.get(String(emoteId || '').trim());
  if (!item) throw economyError('EMOTE_NOT_FOUND');
  if (item.active === false) throw economyError('EMOTE_INACTIVE');
  if (!item.premium) throw economyError('EMOTE_FREE_INCLUDED');
  const userRef = db.collection('users').doc(uid);
  const userSnap = await tx.get(userRef);
  if (!userSnap.exists) throw economyError('PROFILE_MISSING');
  const profile = userSnap.data() || {};
  // Ownership IDs are intentionally preserved even if an Admin temporarily removes or
  // deactivates an emote. Re-adding the same ID restores the prior purchase automatically.
  const owned = normalizeOwnedPremiumEmotes(profile);
  if (owned.includes(item.id)) throw economyError('EMOTE_ALREADY_OWNED');
  const pointsBefore = Math.max(0, Math.floor(Number(profile.points) || 0));
  const cost = Math.max(1, Math.floor(Number(item.pricePoints) || 0));
  if (pointsBefore < cost) throw economyError('EMOTE_INSUFFICIENT_POINTS', { required:cost, available:pointsBefore });
  const pointsAfter = pointsBefore - cost;
  const nextOwned = [...owned, item.id].slice(0,256);
  const cosmetics = profile.cosmetics && typeof profile.cosmetics === 'object' && !Array.isArray(profile.cosmetics) ? profile.cosmetics : {};
  tx.update(userRef, { points:pointsAfter, cosmetics:{ ...cosmetics, emotes:nextOwned } });
  return { kind:'emotePurchase', emoteId:item.id, label:item.label, pointsCost:cost, pointsAfter, ownedEmotes:nextOwned, catalogVersion:catalog.catalogVersion };
}

function cleanDeckName(value) {
  const name = String(value || '').trim();
  if (!name) throw economyError('PREBUILT_NAME_REQUIRED');
  if (name.length > 30) throw economyError('PREBUILT_NAME_TOO_LONG');
  return name;
}
function prebuiltPurchaseIds(profile) {
  const value = profile?.prebuiltDeckPurchases;
  if (Array.isArray(value)) return new Set(value.map(String).filter(Boolean));
  if (value && typeof value === 'object') return new Set(Object.keys(value).filter(k => value[k]));
  return new Set();
}
function deckIdFor(productId, operationId) {
  const suffix = String(operationId || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(-40) || 'purchase';
  return `prebuilt_${productId}_${suffix}`.slice(0, 120);
}
export async function purchasePrebuiltTx({ db, tx, uid, productId, deckName, operationId }) {
  const product = TRUSTED_PREBUILT_BY_ID.get(String(productId || ''));
  if (!product) throw economyError('PREBUILT_NOT_FOUND');
  const cleanName = cleanDeckName(deckName);
  const [userSnap, settings] = await Promise.all([
    tx.get(db.collection('users').doc(uid)),
    loadSettings(db, tx)
  ]);
  if (!userSnap.exists) throw economyError('PROFILE_MISSING');
  const profile = userSnap.data() || {};
  const decks = Array.isArray(profile.decks) ? profile.decks : [];
  if (decks.length >= settings.maxSavedDecks) throw economyError('PREBUILT_DECK_LIMIT', { maxSavedDecks: settings.maxSavedDecks });
  if (prebuiltPurchaseIds(profile).has(product.id)) throw economyError('PREBUILT_ALREADY_PURCHASED');
  const pointsBefore = Math.max(0, Math.floor(Number(profile.points) || 0));
  const fichasBefore = Math.max(0, Math.floor(Number(profile.fichas) || 0));
  if (pointsBefore < settings.prebuiltPoints || fichasBefore < settings.prebuiltFichas) {
    throw economyError('PREBUILT_INSUFFICIENT_FUNDS', {
      pointsRequired: settings.prebuiltPoints, fichasRequired: settings.prebuiltFichas,
      pointsAvailable: pointsBefore, fichasAvailable: fichasBefore
    });
  }
  const collection = Array.isArray(profile.collection) ? profile.collection : [];
  const nextCollection = [...collection, ...product.cardIds];
  const id = deckIdFor(product.id, operationId);
  const createdAt = Date.now();
  const newDeck = { id, name: cleanName, cardIds: [...product.cardIds], isDefault: false, createdAt, prebuiltProductId: product.id };
  const existingReceipts = profile.prebuiltDeckPurchases && typeof profile.prebuiltDeckPurchases === 'object' && !Array.isArray(profile.prebuiltDeckPurchases)
    ? profile.prebuiltDeckPurchases : {};
  const receipt = { productId: product.id, purchasedAt: createdAt, deckId: id, pointsCost: settings.prebuiltPoints, fichasCost: settings.prebuiltFichas };
  const updated = {
    points: pointsBefore - settings.prebuiltPoints,
    fichas: fichasBefore - settings.prebuiltFichas,
    collection: nextCollection,
    decks: [...decks, newDeck],
    prebuiltDeckPurchases: { ...existingReceipts, [product.id]: receipt }
  };
  tx.update(db.collection('users').doc(uid), updated);
  return {
    kind: 'prebuiltPurchase', productId: product.id, deck: newDeck,
    pointsCost: settings.prebuiltPoints, fichasCost: settings.prebuiltFichas,
    pointsAfter: updated.points, fichasAfter: updated.fichas,
    cardsGranted: product.cardIds.length, collectionCountAfter: nextCollection.length
  };
}

function validatedClassifiedWeek(schedule, weekKey) {
  const week = schedule?.weeks?.[weekKey];
  if (!week || !Array.isArray(week.cardIds) || week.cardIds.length !== 7 || new Set(week.cardIds).size !== 7) {
    throw economyError('CLASSIFIEDS_WEEK_NOT_PUBLISHED', { weekKey });
  }
  const rarityCounts = { Common: 0, Uncommon: 0, Rare: 0, Mythic: 0 };
  let commonLands = 0;
  for (const cardId of week.cardIds) {
    const card = trustedById.get(String(cardId));
    if (!card) throw economyError('CLASSIFIEDS_SCHEDULE_INVALID', { cardId });
    const rarity = String(week.rarities?.[cardId] || '');
    if (rarity !== card.rarity || !Object.hasOwn(rarityCounts, rarity)) throw economyError('CLASSIFIEDS_SCHEDULE_INVALID', { cardId, rarity });
    rarityCounts[rarity] += 1;
    if (rarity === 'Common' && String(card.type || '').toLowerCase().includes('tierra')) commonLands += 1;
    const price = week.prices?.[rarity];
    if (!price || !Number.isInteger(price.points) || !Number.isInteger(price.fichas) || price.points < 0 || price.fichas < 0) {
      throw economyError('CLASSIFIEDS_SCHEDULE_INVALID', { rarity, reason: 'price' });
    }
  }
  if (rarityCounts.Common !== 4 || rarityCounts.Uncommon !== 2 || rarityCounts.Rare + rarityCounts.Mythic !== 1 || commonLands > 1) {
    throw economyError('CLASSIFIEDS_SCHEDULE_INVALID', { rarityCounts, commonLands });
  }
  return { weekKey, ...week };
}
function classifiedState(profile, weekKey) {
  const sameWeek = String(profile?.classifiedsWeekKey || '') === weekKey;
  return {
    purchased: sameWeek && Array.isArray(profile?.classifiedsPurchased)
      ? [...new Set(profile.classifiedsPurchased.map(String).filter(Boolean))] : [],
    counts: sameWeek ? normalizeClassifiedCounts(profile?.classifiedsPurchaseCounts) : normalizeClassifiedCounts(null)
  };
}
export async function getClassifiedsView(db, uid, nowMs = Date.now()) {
  const weekKey = argentinaWeekKey(nowMs);
  const [scheduleSnap, userSnap, settings] = await Promise.all([
    db.doc('gameConfig/classifiedsSchedule').get(),
    db.collection('users').doc(uid).get(),
    loadSettings(db)
  ]);
  if (!userSnap.exists) throw economyError('PROFILE_MISSING');
  const week = validatedClassifiedWeek(scheduleSnap.exists ? scheduleSnap.data() || {} : {}, weekKey);
  const profile = userSnap.data() || {};
  const state = classifiedState(profile, weekKey);
  const landPackState = basicLandPackState(profile, weekKey);
  const collection = Array.isArray(profile.collection) ? profile.collection : [];
  const ownedCounts = new Map();
  for (const id of collection) ownedCounts.set(id, (ownedCounts.get(id) || 0) + 1);
  const entries = week.cardIds.map((cardId, slot) => {
    const rarity = week.rarities[cardId];
    const price = week.prices[rarity];
    return {
      slot, cardId, rarity,
      points: price.points, fichas: price.fichas,
      ownedCount: ownedCounts.get(cardId) || 0,
      purchased: state.purchased.includes(cardId)
    };
  });
  const basicLandPacks = CLASSIFIED_BASIC_LAND_PACKS.map(definition => {
    const trusted = trustedBasicLandPack(definition.color);
    return {
      color: trusted.color,
      label: trusted.label,
      cardId: trusted.cardId,
      rarity: 'Common',
      points: settings.classifiedBasicLandPackPrice,
      quantity: settings.classifiedBasicLandPackQuantity,
      ownedCount: ownedCounts.get(trusted.cardId) || 0,
      purchased: landPackState.purchasedColors.includes(trusted.color)
    };
  });
  return {
    schemaVersion: 2,
    weekKey,
    weekStart: week.weekStart || weekKey,
    premiumRarity: week.premiumRarity || entries.at(-1)?.rarity || null,
    serverNow: new Date(nowMs).toISOString(),
    nextRotationAt: nextArgentinaWeekRotationIso(nowMs),
    entries,
    basicLandPacks,
    purchased: state.purchased,
    purchaseCounts: state.counts,
    basicLandPacksPurchased: landPackState.purchasedColors,
    wallet: {
      points: Math.max(0, Math.floor(Number(profile.points) || 0)),
      fichas: Math.max(0, Math.floor(Number(profile.fichas) || 0))
    }
  };
}

export async function purchaseClassifiedTx({ db, tx, uid, cardId, nowMs = Date.now() }) {
  const weekKey = argentinaWeekKey(nowMs);
  const scheduleRef = db.doc('gameConfig/classifiedsSchedule');
  const userRef = db.collection('users').doc(uid);
  const [scheduleSnap, userSnap] = await Promise.all([tx.get(scheduleRef), tx.get(userRef)]);
  if (!userSnap.exists) throw economyError('PROFILE_MISSING');
  const week = validatedClassifiedWeek(scheduleSnap.exists ? scheduleSnap.data() || {} : {}, weekKey);
  const cleanCardId = String(cardId || '');
  if (!week.cardIds.includes(cleanCardId)) throw economyError('CLASSIFIEDS_CARD_NOT_OFFERED');
  const rarity = week.rarities[cleanCardId];
  const price = week.prices[rarity];
  const profile = userSnap.data() || {};
  const state = classifiedState(profile, weekKey);
  if (state.purchased.includes(cleanCardId)) throw economyError('CLASSIFIEDS_ALREADY_PURCHASED');
  const pointsBefore = Math.max(0, Math.floor(Number(profile.points) || 0));
  const fichasBefore = Math.max(0, Math.floor(Number(profile.fichas) || 0));
  if (pointsBefore < price.points || fichasBefore < price.fichas) throw economyError('CLASSIFIEDS_INSUFFICIENT_FUNDS');
  let counts;
  try { counts = nextClassifiedCounts(profile.classifiedsPurchaseCounts, rarity, String(profile.classifiedsWeekKey || '') !== weekKey); }
  catch (error) {
    if (String(error?.message || '') === 'CLASSIFIEDS_SLOT_LIMIT_REACHED') throw economyError('CLASSIFIEDS_SLOT_LIMIT_REACHED');
    throw error;
  }
  const purchased = String(profile.classifiedsWeekKey || '') === weekKey ? [...state.purchased, cleanCardId] : [cleanCardId];
  const collection = Array.isArray(profile.collection) ? profile.collection : [];
  const purchase = { weekKey, cardId: cleanCardId, rarity, pointsCost: price.points, fichasCost: price.fichas };
  tx.update(userRef, {
    points: pointsBefore - price.points,
    fichas: fichasBefore - price.fichas,
    collection: [...collection, cleanCardId],
    classifiedsWeekKey: weekKey,
    classifiedsPurchased: purchased,
    classifiedsPurchaseCounts: counts,
    classifiedsLastPurchase: purchase,
    classifiedsUpdatedAt: FieldValue.serverTimestamp()
  });
  return {
    kind: 'classifiedPurchase', ...purchase,
    pointsAfter: pointsBefore - price.points,
    fichasAfter: fichasBefore - price.fichas,
    purchaseCounts: counts,
    collectionCountAfter: collection.length + 1
  };
}

export async function purchaseClassifiedBasicLandPackTx({ db, tx, uid, color, nowMs = Date.now() }) {
  const weekKey = argentinaWeekKey(nowMs);
  const pack = trustedBasicLandPack(color);
  const userRef = db.collection('users').doc(uid);
  const settingsRef = db.doc('gameConfig/settings');
  const [userSnap, settingsSnap] = await Promise.all([tx.get(userRef), tx.get(settingsRef)]);
  if (!userSnap.exists) throw economyError('PROFILE_MISSING');
  const settings = normalizeStoreSettings(settingsSnap.exists ? settingsSnap.data() || {} : {});
  const profile = userSnap.data() || {};
  const state = basicLandPackState(profile, weekKey);
  if (state.purchasedColors.includes(pack.color)) throw economyError('CLASSIFIEDS_BASIC_LAND_PACK_ALREADY_PURCHASED');
  const pointsBefore = Math.max(0, Math.floor(Number(profile.points) || 0));
  const price = settings.classifiedBasicLandPackPrice;
  const quantity = settings.classifiedBasicLandPackQuantity;
  if (pointsBefore < price) throw economyError('CLASSIFIEDS_BASIC_LAND_PACK_INSUFFICIENT_POINTS', { required: price, available: pointsBefore });
  const collection = Array.isArray(profile.collection) ? profile.collection : [];
  const resetWeek = String(profile.classifiedsBasicLandPackWeekKey || '') !== weekKey;
  const purchasedColors = resetWeek ? [pack.color] : [...state.purchasedColors, pack.color];
  const grantedCards = Array(quantity).fill(pack.cardId);
  const purchase = { weekKey, color: pack.color, cardId: pack.cardId, quantity, pointsCost: price };
  tx.update(userRef, {
    points: pointsBefore - price,
    collection: [...collection, ...grantedCards],
    classifiedsBasicLandPackWeekKey: weekKey,
    classifiedsBasicLandPacksPurchased: purchasedColors,
    classifiedsBasicLandPackLastPurchase: purchase,
    classifiedsBasicLandPackUpdatedAt: FieldValue.serverTimestamp()
  });
  return {
    kind: 'classifiedBasicLandPackPurchase',
    ...purchase,
    pointsAfter: pointsBefore - price,
    purchasedColors,
    collectionCountAfter: collection.length + quantity
  };
}

export async function renameUsernameTx({ db, tx, uid, usernameRaw }) {
  const validated = validateUsername(usernameRaw);
  if (!validated.ok) throw economyError(validated.code);
  const userRef = db.collection('users').doc(uid);
  const tradeReservationRef = db.collection('tradeReservations').doc(uid);
  const [userSnap, tradeReservationSnap] = await Promise.all([tx.get(userRef), tx.get(tradeReservationRef)]);
  if (!userSnap.exists) throw economyError('PROFILE_MISSING');
  if (tradeReservationSnap.exists) throw economyError('USERNAME_TRADE_RESERVED');
  const profile = userSnap.data() || {};
  const oldKey = String(profile.usernameKey || '');
  const oldUsername = String(profile.username || '');
  if (!oldKey || !oldUsername) throw economyError('USERNAME_REQUIRED');
  if (profile.activeMatchId) throw economyError('USERNAME_ACTIVE_MATCH');
  if (oldUsername === validated.username) throw economyError('USERNAME_SAME');
  const fichasBefore = Math.max(0, Math.floor(Number(profile.fichas) || 0));
  if (fichasBefore < USERNAME_RENAME_COST) throw economyError('USERNAME_NOT_ENOUGH_FICHAS');
  const newNameRef = db.collection('usernames').doc(validated.usernameKey);
  const oldNameRef = db.collection('usernames').doc(oldKey);
  const [newSnap, oldSnap] = validated.usernameKey === oldKey
    ? [await tx.get(newNameRef), null]
    : await Promise.all([tx.get(newNameRef), tx.get(oldNameRef)]);
  const currentOldSnap = validated.usernameKey === oldKey ? newSnap : oldSnap;
  if (newSnap.exists && newSnap.data()?.uid !== uid) throw economyError('USERNAME_TAKEN');
  if (!currentOldSnap?.exists || currentOldSnap.data()?.uid !== uid) throw economyError('USERNAME_REGISTRY_MISMATCH');
  const now = FieldValue.serverTimestamp();
  tx.update(userRef, {
    username: validated.username,
    usernameKey: validated.usernameKey,
    usernameUpdatedAt: now,
    fichas: fichasBefore - USERNAME_RENAME_COST
  });
  tx.set(newNameRef, { uid, username: validated.username, updatedAt: now, ...(newSnap.exists ? {} : { createdAt: now }) }, { merge: newSnap.exists });
  if (validated.usernameKey !== oldKey) tx.delete(oldNameRef);
  return {
    kind: 'usernameRename', username: validated.username, usernameKey: validated.usernameKey,
    fichasCost: USERNAME_RENAME_COST, fichasAfter: fichasBefore - USERNAME_RENAME_COST
  };
}

export function assertTrustedCommerceCatalog() {
  if (TRUSTED_CARD_IDS.size !== 880) throw new Error('TRUSTED_COMMERCE_POOL_INVALID');
  if (TRUSTED_PREBUILT_BY_ID.size !== 10) throw new Error('TRUSTED_COMMERCE_PREBUILT_INVALID');
  for (const pack of CLASSIFIED_BASIC_LAND_PACKS) trustedBasicLandPack(pack.color);
  return true;
}
