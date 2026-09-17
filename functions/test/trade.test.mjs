import test from 'node:test';
import assert from 'node:assert/strict';
import { TRUSTED_CARD_POOL } from '../src/trusted/cardCatalog.js';
import {
  TRADE_LIMITS, normalizeTradeLimits, normalizeWantedCriteria, cardMatchesWanted, tradableCardCount,
  changeReservedCard, reservationsStillBacked, swapOneCard, normalizeReservation, addActiveListing, removeActiveListing,
  cardFilterColors
} from '../src/economy/tradeCore.js';

const byId = new Map(TRUSTED_CARD_POOL.map(card => [card.id, card]));
const redMythic = TRUSTED_CARD_POOL.find(c => c.rarity === 'Mythic' && c.colors?.includes('R'));
const blackRare = TRUSTED_CARD_POOL.find(c => c.rarity === 'Rare' && c.colors?.includes('B'));
const exact = TRUSTED_CARD_POOL.find(c => c.id !== redMythic?.id && c.id !== blackRare?.id);
assert.ok(redMythic && blackRare && exact);

test('23.21.3 market UX BUSCO supports exact or type+color+rarity and uses OR between criteria', () => {
  const criteria = normalizeWantedCriteria([
    { type:'exact_card', cardId:exact.id },
    { type:'attributes', rarity:'Mythic', color:'R' },
    { type:'attributes', cardType:'Creature', rarity:'Rare', color:'B' }
  ], false, byId);
  assert.equal(criteria.length, 3);
  const listing = { acceptAnyCard:false, wantedCriteria:criteria };
  assert.equal(cardMatchesWanted(exact, listing), true);
  assert.equal(cardMatchesWanted(redMythic, listing), true);
  assert.equal(cardMatchesWanted(blackRare, listing), true);
  const miss = TRUSTED_CARD_POOL.find(c => c.rarity === 'Common' && c.colors?.includes('G'));
  assert.equal(cardMatchesWanted(miss, listing), false);
});

test('23.21.3 attribute filter uses AND inside one criterion and red includes multicolor', () => {
  const listing = { acceptAnyCard:false, wantedCriteria:[{type:'attributes',rarity:'Mythic',color:'R'}] };
  assert.equal(cardMatchesWanted(redMythic, listing), true);
  const otherMythic = TRUSTED_CARD_POOL.find(c => c.rarity === 'Mythic' && !c.colors?.includes('R'));
  assert.ok(otherMythic);
  assert.equal(cardMatchesWanted(otherMythic, listing), false);
});


test('23.21.3 BUSCO supports type-only and type + rarity + color criteria', () => {
  const mythicArtifact = TRUSTED_CARD_POOL.find(c => c.rarity === 'Mythic' && String(c.type || '').toLowerCase().includes('artefacto'));
  assert.ok(mythicArtifact);
  const [criterion] = normalizeWantedCriteria([
    { type:'attributes', cardType:'Artifact', rarity:'Mythic', color:null }
  ], false, byId);
  assert.deepEqual(criterion, {type:'attributes',cardType:'Artifact',color:null,rarity:'Mythic'});
  const listing={acceptAnyCard:false,wantedCriteria:[criterion]};
  assert.equal(cardMatchesWanted(mythicArtifact,listing), true);
  const nonArtifactMythic = TRUSTED_CARD_POOL.find(c => c.rarity === 'Mythic' && !String(c.type || '').toLowerCase().includes('artefacto'));
  assert.ok(nonArtifactMythic);
  assert.equal(cardMatchesWanted(nonArtifactMythic,listing), false);
});


test('23.21.6 HF23.2 Land color filters use mana produced while colorless nonlands remain C', () => {
  const whiteLand = TRUSTED_CARD_POOL.find(c => String(c.type || '').toLowerCase().includes('tierra') && c.produces === 'W');
  const dualLand = TRUSTED_CARD_POOL.find(c => String(c.type || '').toLowerCase().includes('tierra') && Array.isArray(c.producesOptions) && c.producesOptions.includes('U') && c.producesOptions.includes('R'));
  const colorlessLand = TRUSTED_CARD_POOL.find(c => String(c.type || '').toLowerCase().includes('tierra') && !c.produces && (!Array.isArray(c.producesOptions) || !c.producesOptions.length));
  const colorlessNonland = TRUSTED_CARD_POOL.find(c => !String(c.type || '').toLowerCase().includes('tierra') && (!Array.isArray(c.colors) || c.colors.length === 0));
  assert.ok(whiteLand && dualLand && colorlessLand && colorlessNonland);
  assert.deepEqual(cardFilterColors(whiteLand), ['W']);
  assert.deepEqual(new Set(cardFilterColors(dualLand)), new Set(['U','R']));
  assert.deepEqual(cardFilterColors(colorlessLand), ['C']);
  assert.deepEqual(cardFilterColors(colorlessNonland), ['C']);
  assert.equal(cardMatchesWanted(whiteLand, { acceptAnyCard:false, wantedCriteria:[{type:'attributes', color:'W'}] }), true);
  assert.equal(cardMatchesWanted(whiteLand, { acceptAnyCard:false, wantedCriteria:[{type:'attributes', color:'C'}] }), false);
});

test('23.21.0 rejects empty filters, duplicate criteria and more than three BUSCO slots', () => {
  assert.throws(() => normalizeWantedCriteria([{type:'attributes',cardType:null,rarity:null,color:null}], false, byId), /TRADE_CRITERIA_INVALID/);
  assert.throws(() => normalizeWantedCriteria([{type:'attributes',cardType:'Bogus',rarity:'Rare',color:null}], false, byId), /TRADE_CRITERIA_INVALID/);
  assert.throws(() => normalizeWantedCriteria([
    {type:'exact_card',cardId:exact.id},{type:'exact_card',cardId:exact.id}
  ], false, byId), /TRADE_CRITERIA_INVALID/);
  assert.throws(() => normalizeWantedCriteria([1,2,3,4].map(()=>({type:'attributes',rarity:'Rare',color:null})), false, byId), /TRADE_CRITERIA_INVALID/);
  assert.deepEqual(normalizeWantedCriteria([], true, byId), []);
});


test('23.21.0 Admin trade limits are configurable but bounded by hard server ceilings', () => {
  assert.deepEqual(normalizeTradeLimits({}), TRADE_LIMITS);
  assert.deepEqual(normalizeTradeLimits({
    tradeMaxActiveListings:3,
    tradeMaxWantedCriteria:2,
    tradeMaxOffersPerListing:17,
    tradeMaxOutgoingOffers:8,
    tradeMaxCompletedPerWeek:6
  }), {
    maxActiveListings:3,
    maxWantedCriteria:2,
    maxOffersPerListing:17,
    maxOutgoingOffers:8,
    maxCompletedPerWeek:6
  });
  assert.deepEqual(normalizeTradeLimits({
    tradeMaxActiveListings:999,
    tradeMaxWantedCriteria:999,
    tradeMaxOffersPerListing:999,
    tradeMaxOutgoingOffers:999,
    tradeMaxCompletedPerWeek:999
  }), {
    maxActiveListings:10,
    maxWantedCriteria:3,
    maxOffersPerListing:50,
    maxOutgoingOffers:20,
    maxCompletedPerWeek:20
  });
});


test('23.21.6 HF5 reservation migrates legacy listing id and preserves multiple active listings independently', () => {
  let r=normalizeReservation({activeListingId:'legacy-1',cards:{a:1}});
  assert.deepEqual(r.activeListingIds,['legacy-1']);
  r=addActiveListing(r,'listing-2');
  r=addActiveListing(r,'listing-3');
  assert.deepEqual(r.activeListingIds,['legacy-1','listing-2','listing-3']);
  assert.equal(r.activeListingId,'legacy-1');
  r=removeActiveListing(r,'listing-2');
  assert.deepEqual(r.activeListingIds,['legacy-1','listing-3']);
  r=removeActiveListing(r,'legacy-1');
  assert.deepEqual(r.activeListingIds,['listing-3']);
  assert.equal(r.activeListingId,'listing-3');
});

test('23.21.0 deck protection uses the maximum copies required by any saved deck, not the sum', () => {
  const id = exact.id;
  const profile = {
    collection:[id,id,id,id], enhancements:{},
    decks:[{cardIds:[id,id]},{cardIds:[id,id,id]},{cardIds:[id]}]
  };
  assert.equal(tradableCardCount(profile, {}, id), 1);
  let reservation = changeReservedCard({}, id, 1);
  assert.equal(tradableCardCount(profile, reservation, id), 0);
  assert.equal(reservationsStillBacked(profile, reservation, id), true);
  profile.decks.push({cardIds:[id,id,id,id]});
  assert.equal(reservationsStillBacked(profile, reservation, id), false);
});

test('23.21.0 one enhanced copy is protected and repeated outgoing offers consume real free copies', () => {
  const id = exact.id;
  const profile = {collection:[id,id,id], enhancements:{[id]:'flying'}, decks:[]};
  assert.equal(tradableCardCount(profile, {}, id), 2);
  let reservation = changeReservedCard({}, id, 1);
  assert.equal(tradableCardCount(profile, reservation, id), 1);
  reservation = changeReservedCard(reservation, id, 1);
  assert.equal(tradableCardCount(profile, reservation, id), 0);
});

test('23.21.0 swap is exactly one card for one card', () => {
  const a=exact.id,b=redMythic.id;
  const swapped=swapOneCard([a,a],[a],[b,b],[b]);
  assert.deepEqual(swapped.collectionA.sort(),[a,b].sort());
  assert.deepEqual(swapped.collectionB.sort(),[a,b].sort());
  assert.equal(TRADE_LIMITS.maxActiveListings,1);
  assert.equal(TRADE_LIMITS.maxWantedCriteria,3);
  assert.equal(TRADE_LIMITS.maxOffersPerListing,10);
  assert.equal(TRADE_LIMITS.maxOutgoingOffers,5);
  assert.equal(TRADE_LIMITS.maxCompletedPerWeek,3);
});
