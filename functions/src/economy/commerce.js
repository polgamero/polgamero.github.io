import { FieldValue } from 'firebase-admin/firestore';
import { TRUSTED_CARD_POOL, TRUSTED_CARD_IDS, TRUSTED_CARD_POOL_FINGERPRINT } from '../trusted/cardCatalog.js';
import { TRUSTED_PREBUILT_BY_ID } from '../trusted/prebuiltCatalog.js';
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
  const [settings, campaign] = await Promise.all([loadSettings(db), loadCommerceCampaignEffects(db)]);
  return {
    pack: {
      baseCost: settings.packCost,
      effectiveCost: effectivePackPurchaseCost(settings.packCost, campaign),
      discountPercent: campaign.packDiscountPercent,
      activeEventIds: campaign.activeEventIds
    },
    craft: { fichasCost: settings.craftCost, allowedKeywords: [...ENHANCEMENT_KEYWORDS] },
    prebuilt: { pointsCost: settings.prebuiltPoints, fichasCost: settings.prebuiltFichas, maxSavedDecks: settings.maxSavedDecks },
    username: { renameFichasCost: USERNAME_RENAME_COST },
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
  const [scheduleSnap, userSnap] = await Promise.all([
    db.doc('gameConfig/classifiedsSchedule').get(),
    db.collection('users').doc(uid).get()
  ]);
  if (!userSnap.exists) throw economyError('PROFILE_MISSING');
  const week = validatedClassifiedWeek(scheduleSnap.exists ? scheduleSnap.data() || {} : {}, weekKey);
  const profile = userSnap.data() || {};
  const state = classifiedState(profile, weekKey);
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
  return {
    schemaVersion: 1,
    weekKey,
    weekStart: week.weekStart || weekKey,
    premiumRarity: week.premiumRarity || entries.at(-1)?.rarity || null,
    serverNow: new Date(nowMs).toISOString(),
    nextRotationAt: nextArgentinaWeekRotationIso(nowMs),
    entries,
    purchased: state.purchased,
    purchaseCounts: state.counts,
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

export async function renameUsernameTx({ db, tx, uid, usernameRaw }) {
  const validated = validateUsername(usernameRaw);
  if (!validated.ok) throw economyError(validated.code);
  const userRef = db.collection('users').doc(uid);
  const userSnap = await tx.get(userRef);
  if (!userSnap.exists) throw economyError('PROFILE_MISSING');
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
  return true;
}
