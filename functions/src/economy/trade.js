// v23.21.6 HF5 — Mercado de Pases server authority.
// HF5 lifts the historical one-listing-per-player storage assumption while keeping
// legacy listing documents readable. Every new listing has its own document/id.
import { FieldValue } from 'firebase-admin/firestore';
import { TRUSTED_CARD_POOL } from '../trusted/cardCatalog.js';
import { loadCardPublicationPolicy, cardEnabledByPolicy, assertCardEnabled } from '../trusted/cardPublication.js';
import { ENGINE_VERSION, ECONOMY_SCHEMA_VERSION } from '../shared/constants.js';
import { economyError } from '../shared/errors.js';
import { argentinaWeekKey } from './commerceCore.js';
import { playerStatsMirrorServer } from './audit.js';
import {
  TRADE_LIMITS,
  TRADE_HARD_LIMITS,
  normalizeTradeLimits,
  normalizeReservation,
  reservationIsEmpty,
  addActiveListing,
  removeActiveListing,
  changeReservedCard,
  tradableCardCount,
  reservationsStillBacked,
  normalizeWantedCriteria,
  cardMatchesWanted,
  swapOneCard
} from './tradeCore.js';

const trustedById = new Map(TRUSTED_CARD_POOL.map(card => [String(card.id), card]));

function mapCriteriaError(error) {
  if (String(error?.message || '') === 'TRADE_CRITERIA_INVALID') throw economyError('TRADE_CRITERIA_INVALID');
  throw error;
}
function cleanCard(cardId) {
  const id = String(cardId || '');
  const card = trustedById.get(id);
  if (!card) throw economyError('TRADE_CARD_INVALID');
  return card;
}
function username(profile = {}) { return String(profile.username || profile.displayName || 'Jugador'); }
function safeDocId(value) { return String(value || '').replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 300); }
function reservationRef(db, uid) { return db.collection('tradeReservations').doc(String(uid)); }
function legacyListingRef(db, uid) { return db.collection('tradeListings').doc(String(uid)); }
function listingRefById(db, listingId) { return db.collection('tradeListings').doc(`listing_${safeDocId(listingId)}`); }
function offerRef(db, listingId, offererUid) { return db.collection('tradeOffers').doc(`offer_${safeDocId(listingId)}_${safeDocId(offererUid)}`.slice(0, 420)); }
function ledgerRef(db, uid, weekKey) { return db.collection('tradeWeeklyLedgers').doc(`${uid}_${weekKey}`); }
function receiptRef(db, tradeId) { return db.collection('tradeReceipts').doc(String(tradeId)); }

function reservationWrite(tx, ref, uid, reservation, nowMs) {
  const normalized = normalizeReservation(reservation);
  if (reservationIsEmpty(normalized)) tx.delete(ref);
  else tx.set(ref, { uid:String(uid), ...normalized, updatedAtMs:nowMs }, { merge:false });
}
function activeOfferIds(listing = {}) {
  return Array.isArray(listing.offerIds) ? [...new Set(listing.offerIds.map(String).filter(Boolean))].slice(0, TRADE_HARD_LIMITS.maxOffersPerListing) : [];
}
function weekCompleted(snapshot) { return snapshot?.exists ? Math.max(0, Math.floor(Number(snapshot.data()?.completed) || 0)) : 0; }
function publicListing(data = {}) {
  return {
    listingId:String(data.listingId||''), ownerUid:String(data.ownerUid||''), ownerUsername:String(data.ownerUsername||'Jugador'),
    cardId:String(data.cardId||''), acceptAnyCard:data.acceptAnyCard===true,
    wantedCriteria:Array.isArray(data.wantedCriteria)?data.wantedCriteria:[], offerCount:Math.max(0,Math.floor(Number(data.offerCount)||0)),
    status:String(data.status||''), createdAtMs:Number(data.createdAtMs)||0
  };
}
function publicOffer(data = {}) {
  return {
    offerId:String(data.offerId||''), listingId:String(data.listingId||''), listingOwnerUid:String(data.listingOwnerUid||''),
    listingOwnerUsername:String(data.listingOwnerUsername||'Jugador'), offererUid:String(data.offererUid||''), offererUsername:String(data.offererUsername||'Jugador'),
    listedCardId:String(data.listedCardId||''), offeredCardId:String(data.offeredCardId||''), status:String(data.status||''), createdAtMs:Number(data.createdAtMs)||0
  };
}
function activeListingData(snapshot, ownerUid, listingId) {
  if (!snapshot?.exists) return null;
  const data=snapshot.data()||{};
  if (data.status!=='active') return null;
  if (String(data.ownerUid||'')!==String(ownerUid||'')) return null;
  if (listingId && String(data.listingId||'')!==String(listingId)) return null;
  return data;
}
async function resolveListingForTx(db, tx, ownerUid, listingId) {
  const id=String(listingId||'');
  if (!id) return null;
  const modernRef=listingRefById(db,id), legacyRef=legacyListingRef(db,ownerUid);
  const [modernSnap,legacySnap]=await Promise.all([tx.get(modernRef),tx.get(legacyRef)]);
  const modern=activeListingData(modernSnap,ownerUid,id);
  if (modern) return {ref:modernRef,snap:modernSnap,data:modern};
  const legacy=activeListingData(legacySnap,ownerUid,id);
  if (legacy) return {ref:legacyRef,snap:legacySnap,data:legacy};
  return null;
}
async function resolveListing(db, ownerUid, listingId) {
  const id=String(listingId||'');
  if (!id) return null;
  const [modernSnap,legacySnap]=await Promise.all([listingRefById(db,id).get(),legacyListingRef(db,ownerUid).get()]);
  const modern=activeListingData(modernSnap,ownerUid,id);
  if (modern) return modern;
  return activeListingData(legacySnap,ownerUid,id);
}

export async function getTradeMarketView(db, uid) {
  const userRef=db.collection('users').doc(uid);
  const [userSnap,resSnap,listingsSnap,receiptsA,receiptsB,settingsSnap,publication] = await Promise.all([
    userRef.get(), reservationRef(db,uid).get(), db.collection('tradeListings').where('status','==','active').limit(100).get(),
    db.collection('tradeReceipts').where('ownerUid','==',uid).limit(25).get(),
    db.collection('tradeReceipts').where('offererUid','==',uid).limit(25).get(),
    db.doc('gameConfig/settings').get(),
    loadCardPublicationPolicy(db)
  ]);
  const limits=normalizeTradeLimits(settingsSnap.exists?(settingsSnap.data()||{}):{});
  if (!userSnap.exists) throw economyError('PROFILE_MISSING');
  const reservation=normalizeReservation(resSnap.exists?resSnap.data():{});

  // The global active-listings query is enough for exploration; own reservations are also
  // resolved directly so a user's listings are never hidden by the 100-row public window.
  const publicActive=listingsSnap.docs.map(s=>s.data()).filter(d=>d?.status==='active');
  const ownById=new Map();
  for (const data of publicActive) if (String(data.ownerUid||'')===String(uid)) ownById.set(String(data.listingId||''),data);
  for (const listingId of reservation.activeListingIds) {
    if (!ownById.has(String(listingId))) {
      const data=await resolveListing(db,uid,listingId);
      if (data) ownById.set(String(data.listingId||listingId),data);
    }
  }
  const ownListings=[...ownById.values()].filter(x=>x?.status==='active').sort((a,b)=>(Number(a.createdAtMs)||0)-(Number(b.createdAtMs)||0));
  let received=[];
  if (ownListings.length) {
    const ids=[...new Set(ownListings.flatMap(activeOfferIds))];
    const snaps=await Promise.all(ids.map(id=>db.collection('tradeOffers').doc(id).get()));
    received=snaps.filter(s=>s.exists&&s.data()?.status==='active').map(s=>publicOffer(s.data()));
  }
  const outgoingSnaps=await Promise.all(reservation.activeOfferIds.map(id=>db.collection('tradeOffers').doc(id).get()));
  const outgoing=outgoingSnaps.filter(s=>s.exists&&s.data()?.status==='active').map(s=>publicOffer(s.data()));
  const profile=userSnap.data()||{};
  const counts={}; for(const id of Array.isArray(profile.collection)?profile.collection:[]) counts[id]=(counts[id]||0)+1;
  const tradable={}; for(const cardId of Object.keys(counts)) { if(!cardEnabledByPolicy(cardId,publication)) continue; const n=tradableCardCount(profile,reservation,cardId); if(n>0) tradable[cardId]=n; }
  const weekKey=argentinaWeekKey(Date.now());
  const ledgerSnap=await ledgerRef(db,uid,weekKey).get();
  const receipts=new Map(); for(const snap of [...receiptsA.docs,...receiptsB.docs]) receipts.set(snap.id,{receiptId:snap.id,...snap.data()});
  const ownPublic=ownListings.map(x=>({...publicListing(x),cardEnabled:cardEnabledByPolicy(x.cardId,publication)}));
  return {
    limits, weekKey, completedThisWeek:weekCompleted(ledgerSnap), ownReservation:reservation, tradableCounts:tradable,
    listings:publicActive.map(publicListing).filter(x=>x.ownerUid!==uid && cardEnabledByPolicy(x.cardId,publication)),
    ownListings:ownPublic,
    // Legacy mirror for old UI/account code during the HF5 transition.
    ownListing:ownPublic[0]||null,
    receivedOffers:received, outgoingOffers:outgoing,
    history:[...receipts.values()].sort((a,b)=>(Number(b.completedAtMs)||0)-(Number(a.completedAtMs)||0)).slice(0,25)
  };
}

export async function createTradeListingTx({db,tx,uid,operationId,cardId,wantedCriteria,acceptAnyCard,nowMs=Date.now()}) {
  const card=cleanCard(cardId), listingId=String(operationId||'');
  if(!listingId) throw economyError('OPERATION_ID_REQUIRED');
  const userRef=db.collection('users').doc(uid), listRef=listingRefById(db,listingId), legacyRef=legacyListingRef(db,uid), resRef=reservationRef(db,uid), settingsRef=db.doc('gameConfig/settings');
  const [userSnap,listSnap,legacySnap,resSnap,settingsSnap,publication]=await Promise.all([tx.get(userRef),tx.get(listRef),tx.get(legacyRef),tx.get(resRef),tx.get(settingsRef),loadCardPublicationPolicy(db,tx)]);
  assertCardEnabled(card.id,publication);
  const limits=normalizeTradeLimits(settingsSnap.exists?(settingsSnap.data()||{}):{});
  if(!userSnap.exists) throw economyError('PROFILE_MISSING');
  if(listSnap.exists&&listSnap.data()?.status==='active') throw economyError('TRADE_LISTING_EXISTS');
  const profile=userSnap.data()||{}; let reservation=normalizeReservation(resSnap.exists?resSnap.data():{});
  const legacy=activeListingData(legacySnap,uid,null);
  if(legacy?.listingId && !reservation.activeListingIds.includes(String(legacy.listingId))) reservation=addActiveListing(reservation,legacy.listingId);
  if(reservation.activeListingIds.length>=limits.maxActiveListings) throw economyError(limits.maxActiveListings===1?'TRADE_LISTING_EXISTS':'TRADE_LISTING_LIMIT');
  if(tradableCardCount(profile,reservation,card.id)<1) throw economyError('TRADE_CARD_NOT_TRADABLE');
  const enabledById=new Map([...trustedById].filter(([id])=>cardEnabledByPolicy(id,publication)));
  let criteria; try{criteria=normalizeWantedCriteria(wantedCriteria,acceptAnyCard===true,enabledById,limits);}catch(error){mapCriteriaError(error);}
  let next=changeReservedCard(reservation,card.id,1); next=addActiveListing(next,listingId);
  const data={listingId,ownerUid:uid,ownerUsername:username(profile),cardId:card.id,acceptAnyCard:acceptAnyCard===true,wantedCriteria:criteria,status:'active',offerIds:[],offerCount:0,createdAtMs:nowMs,updatedAtMs:nowMs};
  tx.set(listRef,data,{merge:false}); reservationWrite(tx,resRef,uid,next,nowMs);
  return {kind:'tradeListingCreate',listing:publicListing(data),activeListings:next.activeListingIds.length,limit:limits.maxActiveListings};
}

async function loadListingOffersForTx(db,tx,listing) {
  const ids=activeOfferIds(listing); const snaps=await Promise.all(ids.map(id=>tx.get(db.collection('tradeOffers').doc(id))));
  return snaps.filter(s=>s.exists&&s.data()?.status==='active').map(s=>({ref:s.ref,data:s.data()}));
}
async function loadReservationsForOffers(db,tx,offers) {
  const unique=[...new Set(offers.map(o=>String(o.data.offererUid||'')).filter(Boolean))];
  const snaps=await Promise.all(unique.map(uid=>tx.get(reservationRef(db,uid))));
  return new Map(snaps.map((snap,i)=>[unique[i],{ref:reservationRef(db,unique[i]),snap}]));
}

export async function cancelTradeListingTx({db,tx,uid,listingId,nowMs=Date.now()}) {
  const resolved=await resolveListingForTx(db,tx,uid,listingId); if(!resolved) throw economyError('TRADE_LISTING_NOT_FOUND');
  const {ref:listRef,data:listing}=resolved, resRef=reservationRef(db,uid); const resSnap=await tx.get(resRef);
  const offers=await loadListingOffersForTx(db,tx,listing); const resByUid=await loadReservationsForOffers(db,tx,offers);
  for(const offer of offers){
    tx.update(offer.ref,{status:'canceled_by_listing',closedAtMs:nowMs,updatedAtMs:nowMs});
    const entry=resByUid.get(String(offer.data.offererUid)); let r=normalizeReservation(entry?.snap.exists?entry.snap.data():{});
    r=changeReservedCard(r,offer.data.offeredCardId,-1); r.activeOfferIds=r.activeOfferIds.filter(id=>id!==offer.data.offerId); reservationWrite(tx,entry.ref,offer.data.offererUid,r,nowMs);
  }
  let ownerRes=normalizeReservation(resSnap.exists?resSnap.data():{}); ownerRes=changeReservedCard(ownerRes,listing.cardId,-1); ownerRes=removeActiveListing(ownerRes,listing.listingId);
  reservationWrite(tx,resRef,uid,ownerRes,nowMs); tx.update(listRef,{status:'canceled',offerIds:[],offerCount:0,closedAtMs:nowMs,updatedAtMs:nowMs});
  return {kind:'tradeListingCancel',listingId:String(listing.listingId),releasedOffers:offers.length};
}

export async function createTradeOfferTx({db,tx,uid,listingOwnerUid,listingId='',cardId,nowMs=Date.now()}) {
  if(String(uid)===String(listingOwnerUid)) throw economyError('TRADE_SELF_OFFER');
  const card=cleanCard(cardId), userRef=db.collection('users').doc(uid), resRef=reservationRef(db,uid), settingsRef=db.doc('gameConfig/settings');
  let resolved=null;
  if(listingId) resolved=await resolveListingForTx(db,tx,listingOwnerUid,listingId);
  else {
    // Compatibility with an HF4 client during Functions-first rollout: only the historical
    // owner-keyed listing can be addressed without a listingId.
    const legacyRef=legacyListingRef(db,listingOwnerUid), legacySnap=await tx.get(legacyRef);
    const legacy=activeListingData(legacySnap,listingOwnerUid,null); if(legacy) resolved={ref:legacyRef,snap:legacySnap,data:legacy};
  }
  if(!resolved) throw economyError('TRADE_LISTING_NOT_FOUND');
  const listing=resolved.data, listRef=resolved.ref, offRef=offerRef(db,listing.listingId,uid);
  const [userSnap,resSnap,offSnap,settingsSnap,publication]=await Promise.all([tx.get(userRef),tx.get(resRef),tx.get(offRef),tx.get(settingsRef),loadCardPublicationPolicy(db,tx)]);
  assertCardEnabled(card.id,publication); assertCardEnabled(listing.cardId,publication);
  const limits=normalizeTradeLimits(settingsSnap.exists?(settingsSnap.data()||{}):{});
  if(!userSnap.exists) throw economyError('PROFILE_MISSING');
  const reservation=normalizeReservation(resSnap.exists?resSnap.data():{});
  if(offSnap.exists&&offSnap.data()?.status==='active'&&offSnap.data()?.listingId===listing.listingId) throw economyError('TRADE_OFFER_EXISTS');
  if(activeOfferIds(listing).length>=limits.maxOffersPerListing) throw economyError('TRADE_OFFER_LIMIT');
  if(reservation.activeOfferIds.length>=limits.maxOutgoingOffers) throw economyError('TRADE_OUTGOING_LIMIT');
  if(!cardMatchesWanted(card,listing)) throw economyError('TRADE_OFFER_NOT_MATCHING');
  const profile=userSnap.data()||{}; if(tradableCardCount(profile,reservation,card.id)<1) throw economyError('TRADE_CARD_NOT_TRADABLE');
  const offerId=offRef.id; let next=changeReservedCard(reservation,card.id,1); next.activeOfferIds=[...next.activeOfferIds,offerId];
  const data={offerId,listingId:String(listing.listingId),listingOwnerUid:String(listing.ownerUid),listingOwnerUsername:String(listing.ownerUsername||'Jugador'),offererUid:uid,offererUsername:username(profile),listedCardId:String(listing.cardId),offeredCardId:card.id,status:'active',createdAtMs:nowMs,updatedAtMs:nowMs};
  tx.set(offRef,data,{merge:false}); tx.update(listRef,{offerIds:[...activeOfferIds(listing),offerId],offerCount:activeOfferIds(listing).length+1,updatedAtMs:nowMs}); reservationWrite(tx,resRef,uid,next,nowMs);
  return {kind:'tradeOfferCreate',offer:publicOffer(data)};
}

async function closeOneOfferTx({db,tx,uid,offerId,mode,nowMs=Date.now()}) {
  const offRef=db.collection('tradeOffers').doc(String(offerId||'')); const offSnap=await tx.get(offRef);
  if(!offSnap.exists||offSnap.data()?.status!=='active') throw economyError('TRADE_OFFER_NOT_FOUND');
  const offer=offSnap.data();
  if(mode==='cancel'&&String(offer.offererUid)!==String(uid)) throw economyError('TRADE_OFFER_NOT_FOUND');
  if(mode==='reject'&&String(offer.listingOwnerUid)!==String(uid)) throw economyError('TRADE_OFFER_NOT_FOUND');
  const resolved=await resolveListingForTx(db,tx,offer.listingOwnerUid,offer.listingId), resRef=reservationRef(db,offer.offererUid); const resSnap=await tx.get(resRef);
  let reservation=normalizeReservation(resSnap.exists?resSnap.data():{}); reservation=changeReservedCard(reservation,offer.offeredCardId,-1); reservation.activeOfferIds=reservation.activeOfferIds.filter(id=>id!==offer.offerId);
  reservationWrite(tx,resRef,offer.offererUid,reservation,nowMs); tx.update(offRef,{status:mode==='cancel'?'canceled':'rejected',closedAtMs:nowMs,updatedAtMs:nowMs});
  if(resolved){const ids=activeOfferIds(resolved.data).filter(id=>id!==offer.offerId);tx.update(resolved.ref,{offerIds:ids,offerCount:ids.length,updatedAtMs:nowMs});}
  return {kind:mode==='cancel'?'tradeOfferCancel':'tradeOfferReject',offerId:offer.offerId};
}
export function cancelTradeOfferTx(args){return closeOneOfferTx({...args,mode:'cancel'});}
export function rejectTradeOfferTx(args){return closeOneOfferTx({...args,mode:'reject'});}

export async function acceptTradeOfferTx({db,tx,uid,offerId,operationId='',nowMs=Date.now()}) {
  const offRef=db.collection('tradeOffers').doc(String(offerId||'')); const offSnap=await tx.get(offRef);
  if(!offSnap.exists||offSnap.data()?.status!=='active') throw economyError('TRADE_OFFER_NOT_FOUND');
  const accepted=offSnap.data(); if(String(accepted.listingOwnerUid)!==String(uid)) throw economyError('TRADE_OFFER_NOT_FOUND');
  const resolved=await resolveListingForTx(db,tx,uid,accepted.listingId); if(!resolved) throw economyError('TRADE_LISTING_NOT_ACTIVE');
  const listRef=resolved.ref, listing=resolved.data; const offers=await loadListingOffersForTx(db,tx,listing); const acceptedEntry=offers.find(o=>o.data.offerId===accepted.offerId); if(!acceptedEntry) throw economyError('TRADE_OFFER_NOT_FOUND');
  const ownerRef=db.collection('users').doc(uid),offererRef=db.collection('users').doc(accepted.offererUid),ownerResRef=reservationRef(db,uid),offererResRef=reservationRef(db,accepted.offererUid);
  const ownerStatsRef=db.collection('playerStats').doc(uid),offererStatsRef=db.collection('playerStats').doc(accepted.offererUid),settingsRef=db.doc('gameConfig/settings');
  const weekKey=argentinaWeekKey(nowMs),ownerLedgerRef=ledgerRef(db,uid,weekKey),offererLedgerRef=ledgerRef(db,accepted.offererUid,weekKey);
  const [ownerSnap,offererSnap,ownerResSnap,offererResSnap,ownerLedgerSnap,offererLedgerSnap,ownerStatsSnap,offererStatsSnap,settingsSnap,publication]=await Promise.all([
    tx.get(ownerRef),tx.get(offererRef),tx.get(ownerResRef),tx.get(offererResRef),tx.get(ownerLedgerRef),tx.get(offererLedgerRef),
    tx.get(ownerStatsRef),tx.get(offererStatsRef),tx.get(settingsRef),loadCardPublicationPolicy(db,tx)
  ]);
  assertCardEnabled(listing.cardId,publication); assertCardEnabled(accepted.offeredCardId,publication);
  const limits=normalizeTradeLimits(settingsSnap.exists?(settingsSnap.data()||{}):{});
  if(!ownerSnap.exists||!offererSnap.exists) throw economyError('PROFILE_MISSING');
  if(weekCompleted(ownerLedgerSnap)>=limits.maxCompletedPerWeek||weekCompleted(offererLedgerSnap)>=limits.maxCompletedPerWeek) throw economyError('TRADE_WEEKLY_LIMIT');
  const ownerProfile=ownerSnap.data()||{},offererProfile=offererSnap.data()||{},ownerRes=normalizeReservation(ownerResSnap.exists?ownerResSnap.data():{}),offererRes=normalizeReservation(offererResSnap.exists?offererResSnap.data():{});
  const offeredCard=cleanCard(accepted.offeredCardId); if(!cardMatchesWanted(offeredCard,listing)) throw economyError('TRADE_OFFER_NOT_MATCHING');
  if(!reservationsStillBacked(ownerProfile,ownerRes,listing.cardId)||!reservationsStillBacked(offererProfile,offererRes,accepted.offeredCardId)) throw economyError('TRADE_RESERVATION_CONFLICT');
  let swapped; try{swapped=swapOneCard(ownerProfile.collection,listing.cardId,offererProfile.collection,accepted.offeredCardId);}catch{throw economyError('TRADE_RESERVATION_CONFLICT');}
  const otherOffers=offers.filter(o=>o.data.offerId!==accepted.offerId); const otherResByUid=await loadReservationsForOffers(db,tx,otherOffers);
  const ownerProfileAfter={...ownerProfile,collection:swapped.collectionA}, offererProfileAfter={...offererProfile,collection:swapped.collectionB};
  tx.update(ownerRef,{collection:swapped.collectionA}); tx.update(offererRef,{collection:swapped.collectionB});
  tx.set(ownerStatsRef,playerStatsMirrorServer(uid,ownerProfileAfter,ownerStatsSnap.exists?(ownerStatsSnap.data()||{}):{},{tradesCompleted:1}),{merge:false});
  tx.set(offererStatsRef,playerStatsMirrorServer(accepted.offererUid,offererProfileAfter,offererStatsSnap.exists?(offererStatsSnap.data()||{}):{},{tradesCompleted:1}),{merge:false});
  let nextOwner=changeReservedCard(ownerRes,listing.cardId,-1); nextOwner=removeActiveListing(nextOwner,listing.listingId); reservationWrite(tx,ownerResRef,uid,nextOwner,nowMs);
  let nextOfferer=changeReservedCard(offererRes,accepted.offeredCardId,-1); nextOfferer.activeOfferIds=nextOfferer.activeOfferIds.filter(id=>id!==accepted.offerId); reservationWrite(tx,offererResRef,accepted.offererUid,nextOfferer,nowMs);
  tx.update(offRef,{status:'accepted',closedAtMs:nowMs,updatedAtMs:nowMs});
  for(const other of otherOffers){tx.update(other.ref,{status:'rejected_after_accept',closedAtMs:nowMs,updatedAtMs:nowMs}); const entry=otherResByUid.get(String(other.data.offererUid)); let r=normalizeReservation(entry?.snap.exists?entry.snap.data():{});r=changeReservedCard(r,other.data.offeredCardId,-1);r.activeOfferIds=r.activeOfferIds.filter(id=>id!==other.data.offerId);reservationWrite(tx,entry.ref,other.data.offererUid,r,nowMs);}
  tx.update(listRef,{status:'completed',offerIds:[],offerCount:0,closedAtMs:nowMs,updatedAtMs:nowMs,acceptedOfferId:accepted.offerId});
  const ownerCompleted=weekCompleted(ownerLedgerSnap)+1,offererCompleted=weekCompleted(offererLedgerSnap)+1;
  tx.set(ownerLedgerRef,{uid,weekKey,completed:ownerCompleted,updatedAtMs:nowMs},{merge:true});tx.set(offererLedgerRef,{uid:accepted.offererUid,weekKey,completed:offererCompleted,updatedAtMs:nowMs},{merge:true});
  const tradeId=`trade_${accepted.listingId}_${accepted.offerId}`.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,420);
  const receipt={tradeId,listingId:listing.listingId,offerId:accepted.offerId,ownerUid:uid,ownerUsername:String(listing.ownerUsername||username(ownerProfile)),offererUid:accepted.offererUid,offererUsername:String(accepted.offererUsername||username(offererProfile)),ownerGaveCardId:listing.cardId,offererGaveCardId:accepted.offeredCardId,weekKey,completedAtMs:nowMs};
  tx.create(receiptRef(db,tradeId),receipt);
  tx.create(db.collection('economyEvents').doc(`trade_market_${tradeId}`.slice(0,420)),{
    actorUid:String(uid),targetUid:String(accepted.offererUid),source:'trade_market_complete_server', operationId:String(operationId||tradeId),type:'trade.complete',
    pointsDelta:0,fichasDelta:0,packsDelta:0,cardsDelta:0,tradeDelta:1,
    metadata:{tradeId,listingId:String(listing.listingId),offerId:String(accepted.offerId),ownerUid:String(uid),ownerUsername:receipt.ownerUsername,ownerGaveCardId:String(listing.cardId),offererUid:String(accepted.offererUid),offererUsername:receipt.offererUsername,offererGaveCardId:String(accepted.offeredCardId),weekKey},
    authority:'server',immutable:true,engineVersion:ENGINE_VERSION,economySchemaVersion:ECONOMY_SCHEMA_VERSION,createdAt:FieldValue.serverTimestamp()
  });
  return {kind:'tradeComplete',receipt,rejectedOtherOffers:otherOffers.length,completedThisWeek:{owner:ownerCompleted,offerer:offererCompleted},limits};
}
