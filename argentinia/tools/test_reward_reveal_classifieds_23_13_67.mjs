import assert from 'node:assert/strict';
import fs from 'node:fs';

const memory = new Map();
globalThis.localStorage = {
  getItem(key) { return memory.has(key) ? memory.get(key) : null; },
  setItem(key, value) { memory.set(key, String(value)); },
  removeItem(key) { memory.delete(key); }
};

const recovery = await import('../js/rewardRevealRecovery.js');
const uid = 'qa-user';
const cardId = 'mythic_qa_1';
const before = {
  inventory: { standardPacks: 0, guaranteedMythics: 1 },
  collection: ['a', cardId]
};

const prepared = recovery.beginGuaranteedMythicReveal(uid, cardId, before);
assert.equal(prepared.status, 'prepared');
assert.equal(prepared.inventoryBefore, 1);
assert.equal(prepared.cardCopiesBefore, 1);
assert.equal(recovery.inferGuaranteedMythicRevealState(before, prepared), 'unconfirmed');

const after = {
  inventory: { standardPacks: 0, guaranteedMythics: 0 },
  collection: ['a', cardId, cardId]
};
assert.equal(recovery.inferGuaranteedMythicRevealState(after, prepared), 'committed');
assert.equal(recovery.markGuaranteedMythicRevealCommitted(uid, cardId), true);
assert.equal(recovery.getPendingGuaranteedMythicReveal(uid)?.status, 'committed');
assert.equal(recovery.clearPendingGuaranteedMythicReveal(uid, cardId), true);
assert.equal(recovery.getPendingGuaranteedMythicReveal(uid), null);

const ui = fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const opening = fs.readFileSync(new URL('../js/packOpening.js', import.meta.url), 'utf8');
const firebase = fs.readFileSync(new URL('../js/firebaseClientImpl.js', import.meta.url), 'utf8');
const texts = fs.readFileSync(new URL('../js/gameTexts.js', import.meta.url), 'utf8');

assert.match(ui, /assets\/images\/ui\/clasificados\.png/);
assert.match(ui, /store-classifieds-icon \{ width:120px; height:120px/);
assert.match(ui, /html\.argentinia-mobile \.store-market-item \.store-classifieds-icon \{ width:96px; height:96px/);
assert.doesNotMatch(ui, /store-classifieds-icon">📰/);
assert.doesNotMatch(texts, /'store\.classifieds\.title': definition\('Tienda', '📰/);
assert.doesNotMatch(texts, /'classifieds\.title': definition\('Clasificados', '📰/);
assert.match(opening, /autoStart = true/);
assert.doesNotMatch(opening, />PREPARAR REVELACIÓN</);
assert.match(ui, /beginGuaranteedMythicReveal/);
assert.match(ui, /markGuaranteedMythicRevealCommitted/);
assert.match(ui, /loadUserProfileFromServer/);
assert.match(firebase, /export async function loadUserProfileFromServer/);

console.log('REWARD_REVEAL_CLASSIFIEDS_23_13_67_OK mythic=journal+auto-resume classifieds=png');
