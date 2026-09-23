// HF23.3.12 — Mi Taller server authority.
import { economyError } from '../shared/errors.js';
import { TRUSTED_EVOLUTION_BASE_ID_SET } from '../trusted/evolutionCatalog.js';
import { normalizeEvolutionSettings, normalizeEvolutionProfile, migrateDecksForEvolution } from './evolutionCore.js';
import { TRUSTED_CARD_POOL } from '../trusted/cardCatalog.js';
import { loadCardPublicationPolicy, cardEnabledByPolicy, enabledTrustedPool } from '../trusted/cardPublication.js';
import { normalizeReservation, protectedCardCount } from './tradeCore.js';
import { INDUSTRIAL_MIX_COPIES_CONSUMED, nextIndustrialMixRarity, generateIndustrialMixResult, industrialMixFreeCopies } from './mixerCore.js';
import { favoriteCardPatchForCollection, favoriteCardPatchForState } from '../shared/profileFavorite.js';

export const WORKSHOP_MACHINE_IDS = Object.freeze(['machine1','machine2','machine3','machine4']);

const nonneg = v => Math.max(0, Math.floor(Number(v) || 0));
const boolOr = (v, fallback) => typeof v === 'boolean' ? v : fallback;

export function normalizeWorkshopSettings(raw = {}) {
  return Object.freeze({
    enabled: boolOr(raw.workshopEnabled, true),
    machine1: Object.freeze({ available: boolOr(raw.workshopMachine1Available, true), points: nonneg(raw.workshopMachine1UnlockPoints ?? 1000), fichas: nonneg(raw.workshopMachine1UnlockFichas ?? 0) }),
    machine2: Object.freeze({ available: boolOr(raw.workshopMachine2Available, true), points: nonneg(raw.workshopMachine2UnlockPoints ?? 2000), fichas: nonneg(raw.workshopMachine2UnlockFichas ?? 20) }),
    machine3: Object.freeze({ available: boolOr(raw.workshopMachine3Available, true), points: nonneg(raw.workshopMachine3UnlockPoints ?? 3000), fichas: nonneg(raw.workshopMachine3UnlockFichas ?? 50) }),
    machine4: Object.freeze({ available: boolOr(raw.workshopMachine4Available, false), points: nonneg(raw.workshopMachine4UnlockPoints ?? 0), fichas: nonneg(raw.workshopMachine4UnlockFichas ?? 0) }),
    essence: Object.freeze({ enabled: boolOr(raw.essenceConversionEnabled, true), pointsPerUnit: Math.max(1, nonneg(raw.essenceConversionPoints ?? 500)), fichasPerUnit: Math.max(0, nonneg(raw.essenceConversionFichas ?? 5)), maxPerOperation: Math.min(100, Math.max(1, nonneg(raw.essenceConversionMaxPerOperation ?? 10))) }),
    evolution: normalizeEvolutionSettings(raw),
    mixer: Object.freeze({
      enabled: boolOr(raw.industrialMixerEnabled, true),
      Common: Object.freeze({ points:nonneg(raw.industrialMixerCommonPoints ?? 150), fichas:nonneg(raw.industrialMixerCommonFichas ?? 1), essence:nonneg(raw.industrialMixerCommonEssence ?? 2) }),
      Uncommon: Object.freeze({ points:nonneg(raw.industrialMixerUncommonPoints ?? 400), fichas:nonneg(raw.industrialMixerUncommonFichas ?? 4), essence:nonneg(raw.industrialMixerUncommonEssence ?? 6) }),
      Rare: Object.freeze({ points:nonneg(raw.industrialMixerRarePoints ?? 1000), fichas:nonneg(raw.industrialMixerRareFichas ?? 10), essence:nonneg(raw.industrialMixerRareEssence ?? 15) })
    })
  });
}

export function normalizeWorkshopProfile(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const unlocked = source.unlockedMachines && typeof source.unlockedMachines === 'object' && !Array.isArray(source.unlockedMachines) ? source.unlockedMachines : {};
  const unlockedMachines = {};
  for (const id of WORKSHOP_MACHINE_IDS) unlockedMachines[id] = unlocked[id] === true;
  return { ...source, unlockedMachines };
}

export async function unlockWorkshopMachineTx({ db, tx, uid, machineId }) {
  const id = String(machineId || '').trim();
  if (!WORKSHOP_MACHINE_IDS.includes(id)) throw economyError('WORKSHOP_MACHINE_INVALID');
  const userRef = db.collection('users').doc(uid);
  const settingsRef = db.doc('gameConfig/settings');
  const [userSnap, settingsSnap] = await Promise.all([tx.get(userRef), tx.get(settingsRef)]);
  if (!userSnap.exists) throw economyError('PROFILE_MISSING');
  const profile = userSnap.data() || {};
  const settings = normalizeWorkshopSettings(settingsSnap.exists ? settingsSnap.data() || {} : {});
  if (!settings.enabled) throw economyError('WORKSHOP_DISABLED');
  const policy = settings[id];
  const workshop = normalizeWorkshopProfile(profile.workshop);
  if (workshop.unlockedMachines[id]) {
    return { kind:'workshopUnlock', machineId:id, duplicate:true, pointsCost:0, fichasCost:0, pointsAfter:nonneg(profile.points), fichasAfter:nonneg(profile.fichas) };
  }
  if (!policy.available) throw economyError('WORKSHOP_MACHINE_UNAVAILABLE');
  const pointsBefore = nonneg(profile.points), fichasBefore = nonneg(profile.fichas);
  if (pointsBefore < policy.points) throw economyError('WORKSHOP_INSUFFICIENT_FUNDS', { currency:'points', required:policy.points, available:pointsBefore });
  if (fichasBefore < policy.fichas) throw economyError('WORKSHOP_INSUFFICIENT_FUNDS', { currency:'fichas', required:policy.fichas, available:fichasBefore });
  const pointsAfter = pointsBefore - policy.points, fichasAfter = fichasBefore - policy.fichas;
  const unlockedMachines = { ...workshop.unlockedMachines, [id]:true };
  tx.update(userRef, {
    points: pointsAfter,
    fichas: fichasAfter,
    workshop: { ...workshop, unlockedMachines, [`${id}UnlockedAtMs`]: Date.now() }
  });
  return { kind:'workshopUnlock', machineId:id, duplicate:false, pointsCost:policy.points, fichasCost:policy.fichas, pointsAfter, fichasAfter };
}


export async function convertEssenceTx({ db, tx, uid, quantity }) {
  const amount=Math.max(0,Math.floor(Number(quantity)||0));
  const userRef=db.collection('users').doc(uid), settingsRef=db.doc('gameConfig/settings');
  const [userSnap,settingsSnap]=await Promise.all([tx.get(userRef),tx.get(settingsRef)]);
  if(!userSnap.exists) throw economyError('PROFILE_MISSING');
  const profile=userSnap.data()||{}, settings=normalizeWorkshopSettings(settingsSnap.exists?(settingsSnap.data()||{}):{}), policy=settings.essence;
  if(!settings.enabled||!policy.enabled) throw economyError('ESSENCE_CONVERSION_DISABLED');
  if(amount<1||amount>policy.maxPerOperation) throw economyError('ESSENCE_CONVERSION_INVALID',{max:policy.maxPerOperation});
  const pointsCost=policy.pointsPerUnit*amount, fichasCost=policy.fichasPerUnit*amount;
  const pointsBefore=nonneg(profile.points), fichasBefore=nonneg(profile.fichas), essenceBefore=nonneg(profile.essence);
  if(pointsBefore<pointsCost||fichasBefore<fichasCost) throw economyError('ESSENCE_INSUFFICIENT_FUNDS',{pointsRequired:pointsCost,fichasRequired:fichasCost,pointsAvailable:pointsBefore,fichasAvailable:fichasBefore});
  const pointsAfter=pointsBefore-pointsCost, fichasAfter=fichasBefore-fichasCost, essenceAfter=essenceBefore+amount;
  tx.update(userRef,{points:pointsAfter,fichas:fichasAfter,essence:essenceAfter});
  return {kind:'essenceConvert',quantity:amount,pointsCost,fichasCost,essenceGain:amount,pointsAfter,fichasAfter,essenceAfter};
}

export async function evolveCardTx({ db, tx, uid, cardId }) {
  const baseId=String(cardId||'').trim();
  if(!TRUSTED_EVOLUTION_BASE_ID_SET.has(baseId)) throw economyError('EVOLUTION_CARD_NOT_ELIGIBLE');
  const userRef=db.collection('users').doc(uid), settingsRef=db.doc('gameConfig/settings');
  const [userSnap,settingsSnap]=await Promise.all([tx.get(userRef),tx.get(settingsRef)]);
  if(!userSnap.exists) throw economyError('PROFILE_MISSING');
  const profile=userSnap.data()||{};
  const workshop=normalizeWorkshopProfile(profile.workshop);
  const settings=normalizeWorkshopSettings(settingsSnap.exists?(settingsSnap.data()||{}):{});
  if(!settings.enabled||settings.machine2.available===false||settings.evolution.enabled===false||workshop.unlockedMachines.machine2!==true) throw economyError('EVOLUTION_WORKSHOP_LOCKED');
  const evolutions=normalizeEvolutionProfile(profile.evolutions);
  const currentStage=Math.max(0,Math.min(2,Math.floor(Number(evolutions[baseId]?.stage)||0)));
  if(currentStage>=2) throw economyError('EVOLUTION_MAX_STAGE');
  const nextStage=currentStage+1, cost=settings.evolution[`stage${nextStage}`];
  const collection=Array.isArray(profile.collection)?profile.collection:[];
  const ownedCopies=collection.filter(id=>String(id)===baseId).length;
  if(ownedCopies<cost.copiesRequired) throw economyError('EVOLUTION_COPIES_REQUIRED',{required:cost.copiesRequired,available:ownedCopies,stage:nextStage});
  const enhanced=!!(profile.enhancements&&typeof profile.enhancements==='object'&&!Array.isArray(profile.enhancements)&&profile.enhancements[baseId]);
  if(ownedCopies<(1+(enhanced?1:0))) throw economyError('EVOLUTION_COPY_CONFLICT');
  const pointsBefore=nonneg(profile.points),fichasBefore=nonneg(profile.fichas),essenceBefore=nonneg(profile.essence);
  if(pointsBefore<cost.points||fichasBefore<cost.fichas||essenceBefore<cost.essence) throw economyError('EVOLUTION_INSUFFICIENT_FUNDS',{pointsRequired:cost.points,fichasRequired:cost.fichas,essenceRequired:cost.essence,pointsAvailable:pointsBefore,fichasAvailable:fichasBefore,essenceAvailable:essenceBefore});
  const deckSync=migrateDecksForEvolution({decks:profile.decks||[],baseId,fromStage:currentStage,toStage:nextStage,ownedCopies,enhanced,maxEvolvedCardsPerDeck:settings.evolution.maxPerDeck});
  if(deckSync.conflictDeckIds.length) throw economyError('EVOLUTION_DECK_LIMIT_CONFLICT',{deckIds:deckSync.conflictDeckIds});
  const now=Date.now();
  const nextEvolutions={...evolutions,[baseId]:{...(evolutions[baseId]||{}),stage:nextStage,evolvedAtMs:now}};
  const pointsAfter=pointsBefore-cost.points,fichasAfter=fichasBefore-cost.fichas,essenceAfter=essenceBefore-cost.essence;
  tx.update(userRef,{points:pointsAfter,fichas:fichasAfter,essence:essenceAfter,evolutions:nextEvolutions,decks:deckSync.decks,...favoriteCardPatchForState(profile,{evolutions:nextEvolutions})});
  return {kind:'cardEvolution',cardId:baseId,fromStage:currentStage,toStage:nextStage,pointsCost:cost.points,fichasCost:cost.fichas,essenceCost:cost.essence,copiesRequired:cost.copiesRequired,pointsAfter,fichasAfter,essenceAfter,deckSync:{updatedDeckIds:deckSync.updatedDeckIds}};
}


const trustedMixerCardsById = new Map(TRUSTED_CARD_POOL.map(card => [String(card.id), card]));

function removeExactCopies(collection, cardId, count) {
  const next=[]; let removed=0;
  for (const raw of Array.isArray(collection) ? collection : []) {
    if (removed < count && String(raw) === cardId) { removed += 1; continue; }
    next.push(raw);
  }
  if (removed !== count) throw economyError('INDUSTRIAL_MIX_COPIES_REQUIRED',{required:count,available:removed});
  return next;
}

export async function mixCardsTx({ db, tx, uid, cardId, seed, entropyCommitment }) {
  const inputId=String(cardId||'').trim();
  const inputCard=trustedMixerCardsById.get(inputId);
  if(!inputCard) throw economyError('INDUSTRIAL_MIX_CARD_INVALID');
  const targetRarity=nextIndustrialMixRarity(inputCard.rarity);
  if(!targetRarity) throw economyError('INDUSTRIAL_MIX_MAX_RARITY');
  const userRef=db.collection('users').doc(uid), settingsRef=db.doc('gameConfig/settings'), reservationRef=db.collection('tradeReservations').doc(String(uid));
  const [userSnap,settingsSnap,reservationSnap,publication]=await Promise.all([
    tx.get(userRef), tx.get(settingsRef), tx.get(reservationRef), loadCardPublicationPolicy(db,tx)
  ]);
  if(!userSnap.exists) throw economyError('PROFILE_MISSING');
  if(!cardEnabledByPolicy(inputId,publication)) throw economyError('CARD_DISABLED',{cardId:inputId});
  const profile=userSnap.data()||{}, workshop=normalizeWorkshopProfile(profile.workshop);
  const settings=normalizeWorkshopSettings(settingsSnap.exists?(settingsSnap.data()||{}):{});
  if(!settings.enabled||settings.machine3.available===false||settings.mixer.enabled===false||workshop.unlockedMachines.machine3!==true) throw economyError('INDUSTRIAL_MIX_WORKSHOP_LOCKED');
  const collection=Array.isArray(profile.collection)?profile.collection:[];
  const owned=collection.reduce((n,id)=>n+(String(id)===inputId?1:0),0);
  // Mezcladora: siempre preserva al menos 1 copia física para colección/Enciclopedia,
  // además de cualquier protección mayor impuesta por mazos/mejora/evolución.
  const protectedByGame=protectedCardCount(profile,inputId);
  const protectedCopies=Math.max(1,protectedByGame);
  const reservation=normalizeReservation(reservationSnap.exists?(reservationSnap.data()||{}):{});
  const reserved=Math.max(0,Math.floor(Number(reservation.cards?.[inputId])||0));
  const free=industrialMixFreeCopies({owned,protectedCopies,reserved});
  if(free<INDUSTRIAL_MIX_COPIES_CONSUMED) throw economyError('INDUSTRIAL_MIX_COPIES_REQUIRED',{required:INDUSTRIAL_MIX_COPIES_CONSUMED,owned,protected:protectedCopies,reserved,free});
  const cost=settings.mixer[inputCard.rarity];
  if(!cost) throw economyError('INDUSTRIAL_MIX_MAX_RARITY');
  const pointsBefore=nonneg(profile.points),fichasBefore=nonneg(profile.fichas),essenceBefore=nonneg(profile.essence);
  if(pointsBefore<cost.points||fichasBefore<cost.fichas||essenceBefore<cost.essence) throw economyError('INDUSTRIAL_MIX_INSUFFICIENT_FUNDS',{pointsRequired:cost.points,fichasRequired:cost.fichas,essenceRequired:cost.essence,pointsAvailable:pointsBefore,fichasAvailable:fichasBefore,essenceAvailable:essenceBefore});
  let generated;
  try { generated=generateIndustrialMixResult({seed,sourceRarity:inputCard.rarity,cardPool:enabledTrustedPool(publication)}); }
  catch(error){ if(String(error?.message||'').includes('POOL_EMPTY')) throw economyError('INDUSTRIAL_MIX_POOL_EMPTY',{targetRarity}); throw error; }
  const nextCollection=removeExactCopies(collection,inputId,INDUSTRIAL_MIX_COPIES_CONSUMED);
  nextCollection.push(generated.cardId);
  const pointsAfter=pointsBefore-cost.points,fichasAfter=fichasBefore-cost.fichas,essenceAfter=essenceBefore-cost.essence;
  tx.update(userRef,{collection:nextCollection,points:pointsAfter,fichas:fichasAfter,essence:essenceAfter,...favoriteCardPatchForCollection(profile,nextCollection)});
  return {kind:'industrialMix',inputCardId:inputId,outputCardId:generated.cardId,fromRarity:inputCard.rarity,toRarity:generated.targetRarity,copiesConsumed:INDUSTRIAL_MIX_COPIES_CONSUMED,pointsCost:cost.points,fichasCost:cost.fichas,essenceCost:cost.essence,pointsAfter,fichasAfter,essenceAfter,collectionCountAfter:nextCollection.length,randomnessCommitment:String(entropyCommitment||''),eligiblePoolSize:generated.poolSize};
}
