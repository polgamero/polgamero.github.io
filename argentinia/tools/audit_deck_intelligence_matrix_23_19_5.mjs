import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHETYPE_IDS, buildCompetitiveDeck, validateCompetitiveDeck } from '../js/deckIntelligence.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const cards=['criaturas','instantaneos','conjuros','encantamientos','artefactos','tierras','planeswalkers']
  .flatMap(k=>JSON.parse(fs.readFileSync(path.join(root,'assets/data',`${k}.json`),'utf8')));
const identities=[['W'],['U'],['B'],['R'],['G'],['W','U'],['U','B'],['B','R'],['R','G'],['G','W'],['W','B'],['U','R'],['B','G'],['R','W'],['G','U']];
const qualities=['starter','good','strong','elite'];
function seeded(seed){let x=seed>>>0;return()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};}
let audited=0, eliteStrict=0, starterBudget=0;
for (let q=0;q<qualities.length;q++) {
  const quality=qualities[q];
  for (let i=0;i<ARCHETYPE_IDS.length;i++) {
    const archetypeId=ARCHETYPE_IDS[i];
    const identity=identities[i%identities.length];
    const built=buildCompetitiveDeck(cards,identity,{quality,archetypeId,rng:seeded(23195000+q*100+i),candidateCount:14,goldfishIterations:12});
    assert.ok(validateCompetitiveDeck(built.deck,identity).ok,`${quality}/${archetypeId}/${identity.join('/')}: legal 60-card deck`);
    const c=built.report.composition;
    assert.ok(c.creatures>=built.report.creatureFloor && c.creatures<=built.report.creatureCeiling,`${quality}/${archetypeId}: creature range`);
    assert.ok(c.vehicles<=built.report.maxVehicles,`${quality}/${archetypeId}: vehicle cap`);
    assert.ok(c.broadInteraction>=built.report.broadInteractionFloor,`${quality}/${archetypeId}: broad interaction`);
    assert.ok(c.creatureInteraction>=built.report.creatureInteractionFloor,`${quality}/${archetypeId}: creature interaction`);
    assert.ok(c.instantSorcery>=built.report.instantSorceryFloor,`${quality}/${archetypeId}: instant/sorcery mix`);
    assert.ok(c.nonCreature>=built.report.nonCreatureFloor,`${quality}/${archetypeId}: non-creature mix`);
    if (archetypeId==='typal' && built.report.focusSubtype) {
      assert.ok(c.typalDensity>=0.50,`${quality}/typal: coherent subtype density`);
    }
    if (quality==='elite') {
      const core=new Set(['creatures','creatureCeiling','vehicles','broadInteraction','creatureInteraction','instantSorcery','nonCreature','typalDensity','tribalSupport','deadSynergy']);
      assert.equal(built.report.constructionDeficits.filter(d=>core.has(d.key)).length,0,`elite/${archetypeId}: zero core deficits`);
      eliteStrict++;
    }
    if (quality==='starter') {
      const mythic=built.report.rarity.Mythic||0, rare=built.report.rarity.Rare||0;
      assert.ok(mythic<=1 && mythic+rare<=6,`starter/${archetypeId}: premium ceiling`);
      starterBudget++;
    }
    audited++;
  }
}
console.log(`DECK_INTELLIGENCE_MATRIX_23_19_5_OK archetypes=${ARCHETYPE_IDS.length} qualities=${qualities.length} builds=${audited} eliteStrict=${eliteStrict} starterBudget=${starterBudget}`);
