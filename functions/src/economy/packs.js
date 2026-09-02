import { TRUSTED_CARD_POOL_FINGERPRINT } from '../trusted/cardCatalog.js';
import { economyError } from '../shared/errors.js';
import {
  DEFAULT_MYTHIC_CHANCE,
  clamp,
  buildPackCampaignEffects,
  effectivePackOpenFichas,
  createServerEntropy,
  generateTrustedPack,
  generateTrustedGuaranteedMythic
} from './packCore.js';

export { createServerEntropy, generateTrustedPack, generateTrustedGuaranteedMythic, buildPackCampaignEffects, effectivePackOpenFichas } from './packCore.js';

let settingsCache = { at: 0, value: null };
let campaignCache = { at: 0, events: [] };
const SETTINGS_TTL_MS = 30_000;
const CAMPAIGN_TTL_MS = 15_000;

export async function loadPackPolicy(db) {
  const now = Date.now();
  if (settingsCache.value && now - settingsCache.at < SETTINGS_TTL_MS) return settingsCache.value;
  const snap = await db.doc('gameConfig/settings').get();
  const raw = snap.exists ? snap.data() || {} : {};
  const value = Object.freeze({ mythicChance: clamp(raw.mythicChance, 0, 1, DEFAULT_MYTHIC_CHANCE) });
  settingsCache = { at: now, value };
  return value;
}
export async function loadPackCampaignEffects(db) {
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
  return buildPackCampaignEffects(campaignCache.events, now);
}
function normalizeInventory(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    standardPacks: Math.max(0, Math.floor(Number(source.standardPacks) || 0)),
    guaranteedMythics: Math.max(0, Math.floor(Number(source.guaranteedMythics) || 0))
  };
}
export async function openTrustedPackTx({ db, tx, uid, generated, entropyCommitment, campaignEffects, packPolicy }) {
  const userRef = db.collection('users').doc(uid);
  const snap = await tx.get(userRef);
  if (!snap.exists) throw economyError('PROFILE_MISSING');
  const profile = snap.data() || {};
  const inventory = normalizeInventory(profile.inventory);
  if (inventory.standardPacks < 1) throw economyError('NO_PACKS_AVAILABLE');
  const collection = Array.isArray(profile.collection) ? profile.collection : [];
  const fichasBefore = Math.max(0, Math.floor(Number(profile.fichas) || 0));
  const fichasGain = effectivePackOpenFichas(campaignEffects);
  const nextInventory = { ...inventory, standardPacks: inventory.standardPacks - 1 };
  const nextCollection = [...collection, ...generated.cardIds];
  const fichasAfter = fichasBefore + fichasGain;
  tx.update(userRef, { inventory: nextInventory, collection: nextCollection, fichas: fichasAfter });
  return {
    kind: 'pack', cardIds: generated.cardIds, rareSlotRarity: generated.rareSlotRarity,
    fichasGain, fichasAfter, inventoryAfter: nextInventory, collectionCountAfter: nextCollection.length,
    trustedPoolFingerprint: TRUSTED_CARD_POOL_FINGERPRINT, randomnessCommitment: entropyCommitment,
    mythicChanceApplied: packPolicy.mythicChance,
    campaign: { allFichasMultiplier: campaignEffects.allFichasMultiplier, packOpenFichaBonus: campaignEffects.packOpenFichaBonus, activeEventIds: campaignEffects.activeEventIds }
  };
}
export async function openTrustedGuaranteedMythicTx({ db, tx, uid, cardId, entropyCommitment }) {
  const userRef = db.collection('users').doc(uid);
  const snap = await tx.get(userRef);
  if (!snap.exists) throw economyError('PROFILE_MISSING');
  const profile = snap.data() || {};
  const inventory = normalizeInventory(profile.inventory);
  if (inventory.guaranteedMythics < 1) throw economyError('NO_MYTHICS_AVAILABLE');
  const collection = Array.isArray(profile.collection) ? profile.collection : [];
  const nextInventory = { ...inventory, guaranteedMythics: inventory.guaranteedMythics - 1 };
  const nextCollection = [...collection, cardId];
  tx.update(userRef, { inventory: nextInventory, collection: nextCollection });
  return {
    kind: 'guaranteedMythic', cardId, inventoryAfter: nextInventory, collectionCountAfter: nextCollection.length,
    trustedPoolFingerprint: TRUSTED_CARD_POOL_FINGERPRINT, randomnessCommitment: entropyCommitment
  };
}
