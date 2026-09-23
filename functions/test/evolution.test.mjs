import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { normalizeEvolutionSettings, migrateDecksForEvolution, evolutionVariantId, parseEvolutionVariantId } from '../src/economy/evolutionCore.js';
import { TRUSTED_EVOLUTION_BASE_IDS } from '../src/trusted/evolutionCatalog.js';
import { protectedCardCount, tradableCardCount } from '../src/economy/tradeCore.js';
import { migrateDecksForEnhancementCraft } from '../src/economy/commerceCore.js';
const here=dirname(fileURLToPath(import.meta.url));

test('HF23.3.14 evolution defaults are bounded and server-authoritative',()=>{
  const d=normalizeEvolutionSettings({});
  assert.equal(d.enabled,true); assert.equal(d.maxPerDeck,1);
  assert.deepEqual(d.stage1,{points:250,fichas:2,essence:10,copiesRequired:1});
  assert.deepEqual(d.stage2,{points:500,fichas:5,essence:25,copiesRequired:2});
  const c=normalizeEvolutionSettings({maxEvolvedCardsPerDeck:99,evolutionStage1CopiesRequired:0});
  assert.equal(c.maxPerDeck,20); assert.equal(c.stage1.copiesRequired,1);
});

test('HF23.3.14 trusted evolution catalog is a closed 20-card creature pool',()=>{
  assert.equal(TRUSTED_EVOLUTION_BASE_IDS.length,20); assert.equal(new Set(TRUSTED_EVOLUTION_BASE_IDS).size,20);
  const creatures=JSON.parse(fs.readFileSync(resolve(here,'../../../01_GitHubSource/argentinia/assets/data/criaturas.json'),'utf8'));
  const byId=new Map(creatures.map(card=>[card.id,card]));
  for(const id of TRUSTED_EVOLUTION_BASE_IDS){ const card=byId.get(id); assert.ok(card,`missing ${id}`); assert.match(String(card.type||''),/Criatura/i); assert.notEqual(card.enabled,false); }
});

test('HF23.3.14 evolution variant IDs round-trip and deck migration upgrades in place',()=>{
  assert.deepEqual(parseEvolutionVariantId(evolutionVariantId('crea_001',1)),{baseId:'crea_001',stage:1});
  assert.deepEqual(parseEvolutionVariantId(evolutionVariantId('crea_001',2)),{baseId:'crea_001',stage:2});
  const deck={id:'d1',cardIds:['crea_001','crea_001','x']};
  const stage1=migrateDecksForEvolution({decks:[deck],baseId:'crea_001',fromStage:0,toStage:1,ownedCopies:2,enhanced:false,maxEvolvedCardsPerDeck:1});
  assert.deepEqual(stage1.decks[0].cardIds,['crea_001::evo1','crea_001','x']);
  const stage2=migrateDecksForEvolution({decks:stage1.decks,baseId:'crea_001',fromStage:1,toStage:2,ownedCopies:2,enhanced:false,maxEvolvedCardsPerDeck:1});
  assert.deepEqual(stage2.decks[0].cardIds,['crea_001::evo2','crea_001','x']);
});

test('HF23.3.14 enhancement + evolution reserve two distinct physical copies',()=>{
  const profile={collection:['crea_001','crea_001','crea_001'],enhancements:{crea_001:'vigilance'},evolutions:{crea_001:{stage:1}},decks:[]};
  assert.equal(protectedCardCount(profile,'crea_001'),2); assert.equal(tradableCardCount(profile,{},'crea_001'),1);
  const migrated=migrateDecksForEnhancementCraft({decks:[{id:'d',cardIds:['crea_001','crea_001']}],cardId:'crea_001',ownedCopies:2,evolved:true,maxEnhancedCardsPerDeck:3});
  assert.equal(migrated.normalOwnedAfter,0); assert.deepEqual(migrated.decks[0].cardIds,['crea_001::enhanced','crea_001']);
});

test('HF23.3.14.1 global defender contract: every defender creature has power 0',()=>{
  const creatures=JSON.parse(fs.readFileSync(resolve(here,'../src/trusted/cards/criaturas.json'),'utf8'));
  const violations=creatures.filter(card=>Array.isArray(card.keywords)&&card.keywords.includes('defender')&&Number(card.power)!==0);
  assert.deepEqual(violations.map(card=>({id:card.id,power:card.power})),[]);
});
