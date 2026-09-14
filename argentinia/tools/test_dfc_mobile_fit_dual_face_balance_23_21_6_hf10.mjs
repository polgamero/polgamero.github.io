import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildTransformFaceCard, isTransformingDoubleFacedCard } from '../js/transformEngine.js';
import { normalizeManaAbility } from '../js/manaSources.js';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const json = rel => JSON.parse(read(rel));
const ui = read('../js/ui.js');
const css = read('../css/style.css');
const ench = json('../assets/data/encantamientos.json');
const arts = json('../assets/data/artefactos.json');
const lands = json('../assets/data/tierras.json');
const creatures = json('../assets/data/criaturas.json');
const pools = [...creatures, ...ench, ...arts, ...lands];
const byId = id => pools.find(c => c.id === id);
const tdfc = pools.filter(isTransformingDoubleFacedCard);
assert.equal(tdfc.length, 16, 'HF10 must not change physical TDFC count');

// Mobile modal: fit by BOTH viewport axes, use visualViewport on WebKit and refit on resize.
assert.match(ui, /function fitDfcModalPreviewToViewport\(panel\)/);
assert.match(ui, /window\.visualViewport/);
assert.match(ui, /widthByHeight/);
assert.match(ui, /\(5 \/ 7\)/);
assert.match(ui, /is-short-viewport/);
assert.match(ui, /visualViewport\?\.addEventListener\?\.\('resize'/);
assert.match(css, /--dfc-modal-panel-width/);
assert.match(css, /100dvh/);
assert.match(css, /safe-area-inset-bottom/);
assert.match(css, /overflow:hidden/);
assert.match(css, /is-short-viewport \.dfc-face-preview-label \{ display:none; \}/);

// Salamanca: A is a real graveyard filtering engine; B is a real all-creature drain payoff.
const sal = byId('ench_102');
assert.equal(sal.manaCost, '{2}{B}{G}');
assert.equal(sal.activatedAbility.cost, '{B}{G}');
assert.ok(sal.triggers.some(t => t.event === 'creature_died' && t.filter?.controller === 'you' && t.effect?.type === 'surveil' && t.effect?.amount === 1));
const salBack = sal.dfc.backFace;
assert.equal(salBack.activatedAbility.cost, '{B}{G}');
assert.ok(salBack.triggers.some(t => t.event === 'creature_died' && !t.filter && t.effect?.type === 'drain' && t.effect?.amount === 1));

// Tormenta: A filters spells; B burns them. Both faces are strategically usable.
const storm = byId('ench_103');
assert.ok(storm.triggers.some(t => t.event === 'spell_cast' && t.filter?.cardType === 'noncreature' && t.effect?.type === 'scry' && t.effect?.amount === 1));
assert.ok(storm.triggers.some(t => t.event === 'end_step_started' && t.effect?.type === 'transform'));
assert.ok(storm.dfc.backFace.triggers.some(t => t.event === 'spell_cast' && t.effect?.type === 'damage' && t.effect?.amount === 1));

// Televisor: A no longer does nothing; transform is cheaper; B is strictly more than the
// cheap standalone ping enchantment because the transformed payoff doubles the burn rate.
const tv = byId('art_082');
assert.equal(tv.manaCost, '{3}');
assert.ok(Array.isArray(tv.activatedAbilities) && tv.activatedAbilities.length === 2);
assert.ok(tv.activatedAbilities.some(a => a.cost === '{1}{T}' && a.effect?.type === 'scry' && a.effect?.amount === 1));
assert.ok(tv.activatedAbilities.some(a => a.cost === '{U}{R}{T}' && a.effect?.type === 'transform'));
const portal = tv.dfc.backFace;
assert.equal(portal.triggers.filter(t => t.event === 'spell_cast').length, 1, 'one trigger per cast avoids unnecessary trigger-order prompts');
assert.ok(portal.triggers.some(t => t.effect?.type === 'damage' && t.effect?.amount === 2));

// Mate: face A is a normal 2-mana colorless rock; B trades mana production for passive life.
// buildTransformFaceCard must NOT leak A's produces:C into the back face.
const mate = byId('art_083');
assert.equal(mate.produces, 'C');
const mateMana = normalizeManaAbility(mate);
assert.deepEqual(mateMana.options, ['C']);
assert.equal(mateMana.amount, 1);
assert.equal(mate.activatedAbility.cost, '{1}{T}');
const mateBack = buildTransformFaceCard(mate, 'back');
assert.equal(mateBack.name, 'Mate que No Se Vacía');
assert.equal(mateBack.produces, undefined, 'back face must not remain a mana rock');
assert.ok(mateBack.triggers.some(t => t.event === 'upkeep_started' && t.effect?.type === 'heal' && t.effect?.amount === 1));

// Galpón was already a good dual-mode front in HF9; keep its land utility and RR payoff.
const galpon = byId('tier_068');
assert.equal(galpon.produces, 'C');
const usinaMana = normalizeManaAbility(galpon.dfc.backFace);
assert.deepEqual(usinaMana.options, ['R']);
assert.equal(usinaMana.amount, 2);

// Trusted snapshots used by server-side deck/economy authority must stay byte-equivalent for
// the card groups touched by this balance pass.
for (const [clientRel, trustedRel] of [
  ['../assets/data/encantamientos.json', '../../functions/src/trusted/cards/encantamientos.json'],
  ['../assets/data/artefactos.json', '../../functions/src/trusted/cards/artefactos.json']
]) {
  assert.equal(read(clientRel), read(trustedRel), `${clientRel}: trusted snapshot drift`);
}

console.log('DFC_MOBILE_FIT_DUAL_FACE_BALANCE_23_21_6_HF10_OK modal=visualViewport+5:7+safe-area tdfc=16 salamanca=A-surveil/B-drain tormenta=A-scry/B-burn televisor=A-scry/B-burn2 mate=A-mana/B-life');
