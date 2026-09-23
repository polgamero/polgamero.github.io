import test from 'node:test';
import assert from 'node:assert/strict';
import { INDUSTRIAL_MIX_COPIES_CONSUMED, nextIndustrialMixRarity, generateIndustrialMixResult, industrialMixFreeCopies } from '../src/economy/mixerCore.js';
import fs from 'node:fs';
import { TRUSTED_CARD_POOL } from '../src/trusted/cardCatalog.js';

test('HF23.3.15 industrial mixer advances exactly one rarity tier and Mythic is terminal',()=>{
  assert.equal(INDUSTRIAL_MIX_COPIES_CONSUMED,3);
  assert.equal(nextIndustrialMixRarity('Common'),'Uncommon');
  assert.equal(nextIndustrialMixRarity('Uncommon'),'Rare');
  assert.equal(nextIndustrialMixRarity('Rare'),'Mythic');
  assert.equal(nextIndustrialMixRarity('Mythic'),null);
  assert.equal(nextIndustrialMixRarity(''),null);
});

test('HF23.3.15 mixer randomness is deterministic per seed and cannot leave the contiguous rarity pool',()=>{
  for (const [from,to] of [['Common','Uncommon'],['Uncommon','Rare'],['Rare','Mythic']]) {
    const a=generateIndustrialMixResult({seed:`seed-${from}`,sourceRarity:from,cardPool:TRUSTED_CARD_POOL});
    const b=generateIndustrialMixResult({seed:`seed-${from}`,sourceRarity:from,cardPool:TRUSTED_CARD_POOL});
    assert.deepEqual(a,b);
    assert.equal(a.targetRarity,to);
    const card=TRUSTED_CARD_POOL.find(row=>row.id===a.cardId);
    assert.ok(card,`missing generated card ${a.cardId}`);
    assert.equal(card.rarity,to);
    assert.ok(a.poolSize>0);
  }
  assert.throws(()=>generateIndustrialMixResult({seed:'x',sourceRarity:'Mythic',cardPool:TRUSTED_CARD_POOL}),/INDUSTRIAL_MIX_MAX_RARITY/);
});

test('HF23.3.15 mixer always preserves one physical copy and also respects stronger deck/special/market protection',()=>{
  assert.equal(industrialMixFreeCopies({owned:3,protectedCopies:0,reserved:0}),2,'three owned are never enough');
  assert.equal(industrialMixFreeCopies({owned:4,protectedCopies:0,reserved:0}),3,'four clean copies expose exactly three free');
  assert.equal(industrialMixFreeCopies({owned:5,protectedCopies:2,reserved:0}),3,'enhanced+evolved can reserve two');
  assert.equal(industrialMixFreeCopies({owned:7,protectedCopies:4,reserved:0}),3,'a four-copy saved deck remains intact');
  assert.equal(industrialMixFreeCopies({owned:5,protectedCopies:1,reserved:1}),3,'active market reservation is subtracted independently');
  assert.equal(industrialMixFreeCopies({owned:4,protectedCopies:1,reserved:1}),2,'reservation can block the mix');
});

test('HF23.3.15 mixer costs are Admin-editable but copy count and rarity chain are hard invariants',()=>{
  const source=fs.readFileSync(new URL('../src/economy/workshop.js',import.meta.url),'utf8');
  assert.match(source,/workshopMachine3Available, true/);
  assert.match(source,/industrialMixerEnabled, true/);
  assert.match(source,/industrialMixerCommonPoints \?\? 150/);
  assert.match(source,/industrialMixerCommonFichas \?\? 1/);
  assert.match(source,/industrialMixerCommonEssence \?\? 2/);
  assert.match(source,/industrialMixerUncommonPoints \?\? 400/);
  assert.match(source,/industrialMixerRarePoints \?\? 1000/);
  assert.equal(INDUSTRIAL_MIX_COPIES_CONSUMED,3);
});
