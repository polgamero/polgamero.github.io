import assert from 'node:assert/strict';
import fs from 'node:fs';
import { migrateDecksForEnhancementCraft, cardHasEnhancementKeyword, normalizeMaxEnhancedCardsPerDeck } from '../../functions/src/economy/commerceCore.js';
import { reconcileDeckEnhancementSlots, ENHANCED_SUFFIX } from '../js/store.js';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const ui = read('../js/ui.js');
const firebaseClient = read('../js/firebaseClientImpl.js');
const commerce = read('../../functions/src/economy/commerce.js');
const errors = read('../../functions/src/shared/errors.js');
const creatures = JSON.parse(read('../assets/data/criaturas.json'));

const viuda = creatures.find(card => card.id === 'crea_144');
assert.ok(viuda, 'Viuda del Kilómetro 9 must exist');
assert.equal(cardHasEnhancementKeyword(viuda, 'deathtouch'), true, 'intrinsic keyword must block duplicate craft');
assert.equal(cardHasEnhancementKeyword(viuda, 'firststrike'), false);

const base = viuda.id;
const enhanced = `${base}${ENHANCED_SUFFIX}`;
const migrated = migrateDecksForEnhancementCraft({
  cardId: base,
  ownedCopies: 2,
  maxEnhancedCardsPerDeck: 3,
  decks: [
    { id:'deck_a', cardIds:[base, base, 'x'] },
    { id:'deck_b', cardIds:[base, 'y'] },
    { id:'deck_c', cardIds:['z'] }
  ]
});
assert.deepEqual(migrated.updatedDeckIds, ['deck_a','deck_b']);
assert.equal(migrated.conflictDeckIds.length, 0);
assert.equal(migrated.decks[0].cardIds.filter(id => id === base).length, 1);
assert.equal(migrated.decks[0].cardIds.filter(id => id === enhanced).length, 1);
assert.equal(migrated.decks[1].cardIds.filter(id => id === enhanced).length, 1);

const capConflict = migrateDecksForEnhancementCraft({
  cardId: base,
  ownedCopies: 2,
  maxEnhancedCardsPerDeck: 3,
  decks: [{ id:'full', cardIds:[base,base,'a::enhanced','b::enhanced','c::enhanced'] }]
});
assert.deepEqual(capConflict.conflictDeckIds, ['full'], 'must fail closed when physical split requires upgrade but deck cap is full');

assert.deepEqual(
  reconcileDeckEnhancementSlots([base, base, 'x'], { [base]:'firststrike' }, { [base]:2 }, 3),
  [enhanced, base, 'x'],
  'legacy deck display/editor must normalize one enhanced slot'
);
assert.deepEqual(
  reconcileDeckEnhancementSlots([base, 'x'], { [base]:'firststrike' }, { [base]:4 }, 3),
  [base, 'x'],
  'a deliberate normal-only slot remains valid when enough normal copies exist'
);
assert.equal(normalizeMaxEnhancedCardsPerDeck({ maxEnhancedCardsPerDeck:5 }), 5);

const migratedWithEvolution = migrateDecksForEnhancementCraft({
  cardId: base,
  ownedCopies: 2,
  evolved: true,
  maxEnhancedCardsPerDeck: 3,
  decks: [{ id:'deck_evo', cardIds:[base, 'x'] }]
});
assert.deepEqual(migratedWithEvolution.updatedDeckIds, ['deck_evo']);
assert.equal(migratedWithEvolution.decks[0].cardIds[0], enhanced, 'an evolved copy reserves the second physical copy; crafting enhancement must migrate the remaining base slot');

// UI: one improvement per base card ID remains the explicit contract; browser now has
// search/color/rarity filters, and intrinsic keywords disappear from the choice list.
assert.match(ui, /filter\(id => !enhancements\[id\]\)/);
assert.match(ui, /id="store-craft-search"/);
assert.match(ui, /data-craft-color-filter/);
assert.match(ui, /id="store-craft-rarity"/);
assert.match(ui, /store-craft-filter-clear/);
assert.match(ui, /availableKeywords = ENHANCEMENT_KEYWORDS\.filter/);
assert.match(ui, /intrinsicKeywords\.has/);

// Saved deck/detail behavior: defensive legacy normalization + type/CMC canonical ordering.
assert.match(ui, /normalizedExistingIds = reconcileDeckEnhancementSlots/);
assert.match(ui, /displayDeckIds = reconcileDeckEnhancementSlots/);
assert.match(ui, /detailCategoryOrder = new Map\(ENCYCLOPEDIA_TABS/);
assert.match(ui, /const cmcDelta = \(Number\(a\.displayCard\?\.cmc\) \|\| 0\) - \(Number\(b\.displayCard\?\.cmc\) \|\| 0\)/);

// Authority: server rejects duplicate natural keywords and writes migrated decks atomically.
assert.match(commerce, /CRAFT_KEYWORD_ALREADY_PRESENT/);
assert.match(commerce, /migrateDecksForEnhancementCraft/);
assert.match(commerce, /decks: deckSync\.decks/);
assert.match(errors, /CRAFT_DECK_ENHANCED_LIMIT_CONFLICT/);
assert.match(firebaseClient, /normalSlotCounts/);
assert.match(firebaseClient, /const reserved = \(enhancedSlotCounts\[baseId\] \|\| 0\) \+ \(evolvedSlotCounts\[baseId\] \|\| 0\)/);
assert.match(firebaseClient, /normalOwned = Math\.max\(0, \(ownedCounts\[baseId\] \|\| 0\) - reserved\)/);

console.log('CRAFT_DECK_SYNC_BROWSER_23_21_6_HF8_OK autoDeckSync=atomic evolutionCopyFence=twoPhysicalCopies oneEnhancedPerId=yes filters=search+color+rarity duplicateKeyword=blocked deckDetail=type+cmc');
