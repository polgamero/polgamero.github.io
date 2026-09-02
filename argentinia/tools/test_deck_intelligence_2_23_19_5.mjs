import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DECK_INTELLIGENCE_VERSION,
  DECK_QUALITY_PROFILES,
  buildCompetitiveDeck,
  inferCardDeckProfile,
  validateCompetitiveDeck
} from '../js/deckIntelligence.js';
import { botDeckQuality } from '../js/botDifficulty.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const repoRoot=path.resolve(root,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const cards=['criaturas','instantaneos','conjuros','encantamientos','artefactos','tierras','planeswalkers']
  .flatMap(k=>json(`assets/data/${k}.json`));
const byId=new Map(cards.map(c=>[c.id,c]));
function seeded(seed){ let x=seed>>>0; return()=>{ x=(Math.imul(x,1664525)+1013904223)>>>0; return x/4294967296; }; }

assert.equal(DECK_INTELLIGENCE_VERSION,'23.19.5-di2');
assert.equal(cards.length,880);

// 1) Target-aware interaction: daño a la cara NO es removal.
for (const id of ['crea_294','crea_093','crea_326']) {
  const p=inferCardDeckProfile(byId.get(id));
  assert.ok(p.roles.includes('reach'),`${id} must remain reach`);
  assert.ok(!p.roles.includes('broadInteraction'),`${id} player-only damage must not satisfy broad interaction`);
  assert.ok(!p.roles.includes('creatureInteraction'),`${id} player-only damage must not satisfy creature interaction`);
  assert.ok(!p.roles.includes('removal'),`${id} player-only damage must not be removal`);
}
const anyTarget=inferCardDeckProfile(byId.get('inst_011'));
assert.ok(anyTarget.roles.includes('broadInteraction') && anyTarget.roles.includes('creatureInteraction') && anyTarget.roles.includes('reach'));
const playerOnly=inferCardDeckProfile(byId.get('inst_010'));
assert.ok(playerOnly.roles.includes('reach') && !playerOnly.roles.includes('broadInteraction'));

// 2) Product intent: Medio is deliberately advanced-but-not-elite; Difícil gets the full builder.
assert.equal(botDeckQuality('medium'),'strong');
assert.equal(botDeckQuality('hard'),'elite');
assert.equal(DECK_QUALITY_PROFILES.strong.sophistication,'advanced');
assert.equal(DECK_QUALITY_PROFILES.elite.sophistication,'elite');
assert.ok(DECK_QUALITY_PROFILES.strong.quantile < DECK_QUALITY_PROFILES.elite.quantile);
assert.ok(DECK_QUALITY_PROFILES.strong.candidateCount < DECK_QUALITY_PROFILES.elite.candidateCount);
assert.ok(DECK_QUALITY_PROFILES.strong.deadSynergyMax > DECK_QUALITY_PROFILES.elite.deadSynergyMax);

// 3) Structural human-deck floor across real identities. No more 35-creature accidental soup,
// no more fake interaction, and every selected deck remains legal.
const identities=[['W'],['U','R'],['B','G'],['W','B'],['R','G']];
let audited=0;
for (const quality of ['strong','elite']) {
  for (let i=0;i<identities.length;i++) {
    const identity=identities[i];
    const built=buildCompetitiveDeck(cards,identity,{quality,rng:seeded(2319500+i+(quality==='elite'?100:0)),candidateCount:18,goldfishIterations:12});
    const c=built.report.composition;
    assert.ok(validateCompetitiveDeck(built.deck,identity).ok,`${quality} ${identity.join('/')} legality`);
    assert.ok(c.creatures>=built.report.creatureFloor && c.creatures<=built.report.creatureCeiling,`${quality} ${identity.join('/')} creature range`);
    assert.ok(c.vehicles<=built.report.maxVehicles,`${quality} ${identity.join('/')} vehicle cap`);
    assert.ok(c.broadInteraction>=built.report.broadInteractionFloor,`${quality} ${identity.join('/')} real interaction`);
    assert.ok(c.creatureInteraction>=built.report.creatureInteractionFloor,`${quality} ${identity.join('/')} creature interaction`);
    assert.ok(c.instantSorcery>=built.report.instantSorceryFloor,`${quality} ${identity.join('/')} spell mix`);
    assert.ok(c.nonCreature>=built.report.nonCreatureFloor,`${quality} ${identity.join('/')} noncreature mix`);
    const coreDeficits=built.report.constructionDeficits.filter(d=>['creatures','creatureCeiling','vehicles','broadInteraction','creatureInteraction','instantSorcery','nonCreature'].includes(d.key));
    assert.equal(coreDeficits.length,0,`${quality} ${identity.join('/')} no core deficits`);
    audited++;
  }
}

// 4) Elite typal must pick ONE actual tribe and make the payoffs live.
const typal=buildCompetitiveDeck(cards,['U','R'],{archetypeId:'typal',quality:'elite',rng:seeded(9917),candidateCount:24,goldfishIterations:12});
assert.ok(typal.report.focusSubtype,'elite typal needs a real focus subtype');
assert.ok(typal.report.composition.typalDensity>=0.68,'elite typal density');
assert.ok(typal.report.composition.tribalSupport>=typal.report.composition.focusCreatures/4 || typal.report.composition.tribalSupport>=3,'typal support must be live');
assert.ok(typal.report.composition.deadSynergy<=DECK_QUALITY_PROFILES.elite.deadSynergyMax,'elite typal dead synergy cap');

// 5) Starter is intentionally medium-basic: coherent/playable, but low premium ceiling and
// much lower selection pressure than elite. This is the server-authoritative onboarding path.
const starter=buildCompetitiveDeck(cards,['G','W'],{quality:'starter',rng:seeded(5519),candidateCount:24,goldfishIterations:12});
assert.ok(validateCompetitiveDeck(starter.deck,['G','W']).ok);
assert.equal(starter.report.sophistication,'starter');
assert.ok(['aggro','midrange','tokens','counters','typal','artifacts','ramp'].includes(starter.report.archetypeId),'starter should prefer a readable archetype');
assert.ok((starter.report.rarity.Mythic||0)<=1);
assert.ok((starter.report.rarity.Mythic||0)+(starter.report.rarity.Rare||0)<=6);
assert.ok(starter.report.composition.broadInteraction>=starter.report.broadInteractionFloor);
assert.ok(DECK_QUALITY_PROFILES.starter.quantile < DECK_QUALITY_PROFILES.strong.quantile);
const accounts=fs.readFileSync(path.join(repoRoot,'functions/src/economy/accounts.js'),'utf8');
assert.ok(accounts.includes("quality: 'starter'"),'server starter must use starter quality');

// 6) Trusted/server and browser intelligence remain literally identical.
const frontend=read('js/deckIntelligence.js');
const trusted=fs.readFileSync(path.join(repoRoot,'functions/src/trusted/deckIntelligence.js'),'utf8');
assert.equal(frontend,trusted,'frontend/trusted Deck Intelligence parity');

console.log(`DECK_INTELLIGENCE_2_23_19_5_OK audited=${audited} targetDamage=TARGET_AWARE medium=ADVANCED hard=ELITE starter=GUIDED_BASIC typal=${typal.report.focusSubtype}:${Math.round(typal.report.composition.typalDensity*100)}%`);
