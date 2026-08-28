import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DECK_INTELLIGENCE_VERSION,
  DEFAULT_CANDIDATE_COUNT,
  DECK_QUALITY_PROFILES,
  inferCardDeckProfile,
  rankViableArchetypes,
  buildCompetitiveDeck,
  validateCompetitiveDeck
} from '../js/deckIntelligence.js';
import { cardDb } from '../js/cardLoader.js';
import { buildRandomDeck, getLastRandomDeckReport } from '../js/utils.js';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { CURRENT_POOL_MILESTONE, POOL_BASELINE } from '../js/poolContract.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const dataFiles=['criaturas','instantaneos','conjuros','encantamientos','artefactos','tierras','planeswalkers'];
const cards=dataFiles.flatMap(k=>json(`assets/data/${k}.json`));
function seeded(seed){ let x=seed>>>0; return()=>{ x=(Math.imul(x,1664525)+1013904223)>>>0; return x/4294967296; }; }

assert.ok(['23.17.1','23.17.2','23.17.3','23.18.3','23.19','23.19.2','23.19.3'].includes(ENGINE_VERSION));
assert.equal(DECK_INTELLIGENCE_VERSION,'23.17.1');
assert.ok(['mp-23.10.0','mp-23.19.0','mp-23.19.1'].includes(ENGINE_PROTOCOL_VERSION));
assert.equal(FIRESTORE_RULES_VERSION,'23.13.77');
assert.equal(CURRENT_POOL_MILESTONE,'pool_expansion_viii_880');
assert.equal(POOL_BASELINE.total,880);
assert.equal(cards.length,880);
assert.ok(DEFAULT_CANDIDATE_COUNT>=48,'production builder must evaluate many candidates');
assert.ok(DECK_QUALITY_PROFILES.good.quantile < DECK_QUALITY_PROFILES.strong.quantile);
assert.ok(DECK_QUALITY_PROFILES.strong.quantile < DECK_QUALITY_PROFILES.elite.quantile);

// Metadata is inferred from the real schema, not a hand-written list of 880 cards.
const tokenCard=cards.find(c=>JSON.stringify(c).includes('create_tokens'));
assert.ok(tokenCard && inferCardDeckProfile(tokenCard).themes.includes('tokens'));
const removalCard=cards.find(c=>JSON.stringify(c).includes('destroy_creature'));
assert.ok(removalCard && inferCardDeckProfile(removalCard).roles.includes('interaction'));
const suspendCard=cards.find(c=>c.suspend);
assert.ok(suspendCard && inferCardDeckProfile(suspendCard).themes.includes('suspend'));
const typalCard=cards.find(c=>JSON.stringify(c).includes('choose_creature_type'));
assert.ok(typalCard && inferCardDeckProfile(typalCard).themes.includes('typal'));

const viableBR=rankViableArchetypes(cards,['B','R']);
assert.ok(viableBR.length>=10 && viableBR[0].score>0);
assert.ok(viableBR.some(x=>x.id==='sacrifice' && x.matching>=20),'real BR pool must have sacrifice depth');

const brSac=buildCompetitiveDeck(cards,['B','R'],{archetypeId:'sacrifice',quality:'competitive',rng:seeded(23171),candidateCount:28,goldfishIterations:20});
assert.equal(brSac.deck.length,60);
assert.equal(brSac.report.archetypeId,'sacrifice');
assert.ok(brSac.report.candidateCount>=28);
assert.ok((brSac.report.themes.sacrifice||0)>=15,'archetype deck must contain real thematic density');
assert.ok((brSac.report.roles.enabler||0)>=5 && (brSac.report.roles.payoff||0)>=5);
assert.ok(brSac.report.goldfish.healthyPct>=50);
assert.ok(validateCompetitiveDeck(brSac.deck,['B','R']).ok);
assert.ok(brSac.deck.every(c=>(c.colors||[]).every(col=>['B','R'].includes(col))),'forced identity must be exact');

// Same candidate universe + same seed: quality profiles choose progressively better percentiles.
const qualityScores={};
for(const quality of ['good','strong','elite']){
  const built=buildCompetitiveDeck(cards,['U','R'],{archetypeId:'spells',quality,rng:seeded(777),candidateCount:30,goldfishIterations:20});
  assert.ok(validateCompetitiveDeck(built.deck,['U','R']).ok);
  qualityScores[quality]=built.report.selectedScore;
}
assert.ok(qualityScores.good <= qualityScores.strong && qualityScores.strong <= qualityScores.elite,
  `quality percentile monotonicity failed: ${JSON.stringify(qualityScores)}`);

const starter=buildCompetitiveDeck(cards,['G'],{quality:'starter',rng:seeded(321),candidateCount:32,goldfishIterations:20});
assert.ok(validateCompetitiveDeck(starter.deck,['G']).ok);
assert.ok((starter.report.rarity.Mythic||0)<=2,'starter mythic budget');
assert.ok((starter.report.rarity.Mythic||0)+(starter.report.rarity.Rare||0)<=8,'starter premium rarity budget');
assert.ok(starter.report.landCount>=21 && starter.report.landCount<=26,'archetype land count is dynamic but sane');

// Historical public wrapper remains array-returning and now exposes a diagnostic report.
cardDb.allCards=cards;
const wrapped=buildRandomDeck(['W','U'],{quality:'competitive',rng:seeded(55),candidateCount:20,goldfishIterations:16,archetypeId:'control'});
assert.equal(wrapped.length,60);
assert.ok(validateCompetitiveDeck(wrapped,['W','U']).ok);
const report=getLastRandomDeckReport();
assert.equal(report.engineVersion,'23.17.1');
assert.equal(report.archetypeId,'control');
assert.equal(report.quality,'competitive');

const main=read('js/main.js');
assert.ok(main.includes("buildRandomDeck(deckSource.identity, { quality: 'competitive' })"),'human random keeps colors-only UX and gets competitive profile');
assert.ok(main.includes('botDeckQuality(state.botDifficulty)'),'Difficulty 2.0 must consume the deck-quality profiles without changing Deck Intelligence');
assert.ok(main.includes("buildRandomDeck(chosenIdentity, { quality: 'starter' })"),'starter gets curated rarity profile');
assert.ok(!main.includes("showArchetypeSelectionModal"),'23.17.1 must not ask the player to choose an archetype');

const workflow=read('../.github/workflows/pages.yml');
assert.ok(workflow.includes('test_prebuilt_decks_store_23_17_3.mjs'));

console.log(`PASS test_competitive_deck_intelligence_23_17_1.mjs · Pool 880 · archetypes + roles + 60-card candidates + dynamic lands + goldfish + starter/competitive/good/strong/elite profiles · scores ${JSON.stringify(qualityScores)}`);
