import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildTransformFaceCard, initializeTransformPermanentItem, currentTransformFace, isTransformingDoubleFacedCard } from '../js/transformEngine.js';
import { normalizeManaAbility } from '../js/manaSources.js';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const json = rel => JSON.parse(read(rel));
const ui = read('../js/ui.js');
const css = read('../css/style.css');
const pools = [
  ...json('../assets/data/criaturas.json'),
  ...json('../assets/data/encantamientos.json'),
  ...json('../assets/data/artefactos.json'),
  ...json('../assets/data/tierras.json')
];
const tdfc = pools.filter(isTransformingDoubleFacedCard);
assert.equal(tdfc.length, 16, 'physical TDFC count must remain 16');

// Identity: every physical front maps to ITS OWN back face. This locks the exact class of
// regression reported as "Pibe -> 4/3 Intimidante" (that 4/3 is Lobizón, not Avatar).
for (const physical of tdfc) {
  const expected = physical.dfc.backFace;
  const built = buildTransformFaceCard(physical, 'back');
  assert.equal(built.id, physical.id, `${physical.id}: physical id must survive face switch`);
  assert.equal(built.name, expected.name, `${physical.id}: wrong back-face identity`);
  assert.deepEqual(built.keywords || [], expected.keywords || [], `${physical.id}: wrong back-face keywords`);
  if (expected.power !== undefined) assert.equal(built.power, expected.power, `${physical.id}: wrong back power`);
  if (expected.toughness !== undefined) assert.equal(built.toughness, expected.toughness, `${physical.id}: wrong back toughness`);
  const item = { card:physical, tapped:false, damageTaken:0, counters:{} };
  assert.equal(initializeTransformPermanentItem(item, physical, {face:'back'}).changed, true);
  assert.equal(currentTransformFace(item), 'back');
  assert.equal(item.card.name, expected.name, `${physical.id}: runtime transform crossed identities`);
}

const byId = id => pools.find(card => card.id === id);
const pibe = byId('crea_332');
const avatar = pibe.dfc.backFace;
assert.equal(pibe.name, 'Pibe del Barrio Imposible');
assert.equal(pibe.manaCost, '{2}{W}{U}{B}{R}{G}');
assert.equal(pibe.power, 5); assert.equal(pibe.toughness, 5);
assert.deepEqual(pibe.keywords, ['vigilance','ward_2']);
assert.equal(avatar.name, 'Avatar de la Argentina Secreta');
assert.equal(avatar.power, 9); assert.equal(avatar.toughness, 9);
for (const kw of ['flying','trample','vigilance','ward_2']) assert.ok(avatar.keywords.includes(kw));
assert.ok(avatar.triggers.some(t => t.effect?.type === 'draw' && t.effect?.amount === 2));
assert.ok(avatar.triggers.some(t => t.target === 'opponent_player' && t.effect?.type === 'damage' && t.effect?.amount === 3));

const lobizon = byId('crea_326').dfc.backFace;
assert.equal(lobizon.name, 'Lobizón de Medianoche');
assert.equal(lobizon.power, 4); assert.equal(lobizon.toughness, 3);
assert.deepEqual(lobizon.keywords, ['menace']);

assert.deepEqual(byId('crea_324').dfc.backFace.keywords, ['firststrike'], 'post-attack haste was dead text; back now matters in combat');
assert.equal(byId('crea_325').dfc.backFace.power, 5); assert.equal(byId('crea_325').dfc.backFace.toughness, 5);
assert.deepEqual(byId('crea_329').dfc.backFace.keywords, ['trample','firststrike']);
assert.deepEqual(byId('crea_330').dfc.backFace.keywords, ['reach','trample']);

// HF10 supersedes the exact tuning of Salamanca/Storm/Televisor/Mate while preserving
// HF9's contract that these cards have real Transform gameplay on their back faces.
const salamanca = byId('ench_102');
assert.ok(salamanca.activatedAbility?.effect?.type === 'transform');
assert.ok(salamanca.dfc.backFace.triggers?.length > 0);
const stormBack = byId('ench_103').dfc.backFace;
assert.ok(stormBack.triggers.some(t => t.event === 'spell_cast'));
const televisor = byId('art_082');
assert.ok((televisor.activatedAbilities || [televisor.activatedAbility]).some(a => a?.effect?.type === 'transform'));
const usina = byId('tier_068').dfc.backFace;
const usinaMana = normalizeManaAbility(usina);
assert.deepEqual(usinaMana.options, ['R']); assert.equal(usinaMana.amount, 2);

// Back-face previews must actually communicate rules, not hide the behavior behind flavor.
for (const physical of tdfc) {
  assert.ok(String(physical.dfc.backFace.text || '').trim().length > 0, `${physical.id}: back rules text missing`);
  assert.ok(String(physical.dfc.backFace.flavorText || '').trim().length > 0, `${physical.id}: original back prose must survive as flavor`);
}

// Global renderer contract. Delegation is intentional because some catalog/market views
// serialize createCardElement(...).outerHTML, which discards direct event listeners.
assert.match(ui, /data-dfc-card-id/);
assert.match(ui, /data-dfc-face/);
assert.match(ui, /function showDfcFacePreview/);
assert.match(ui, /buildTransformFaceCard\(physical, targetFace\)/);
assert.match(ui, /zone !== 'dfc-preview'/);
assert.match(ui, /\.dfc-face-badge\[data-dfc-card-id\]/);
assert.match(ui, /pointerover/);
assert.match(ui, /event\.stopPropagation\(\)/);
assert.match(ui, /showDfcFacePreview\(badge, \{ modal:true \}\)/);
assert.match(css, /\.dfc-face-preview-layer\.is-modal/);
assert.match(css, /\.dfc-face-preview-panel/);

console.log('DFC_PREVIEW_BALANCE_23_21_6_HF9_OK tdfc=16 identity=locked preview=hover+tap pibe=5/5ward2->9/9fly+trample+vigilance+ward2+draw2+damage3 balancePass=targeted');
