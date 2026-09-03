import assert from 'node:assert/strict';
import {
  campaignStatus, buildCampaignSnapshot, effectivePackCost, effectiveMatchPoints,
  effectiveAllPoints, effectiveFichas, validateAnnouncementPayload, validateEventPayload
} from '../js/campaigns.js';

const now = new Date('2026-08-23T18:00:00Z');
const active = (type, value) => ({ name:type, type, value, startAt:new Date('2026-08-23T00:00:00Z'), endAt:new Date('2026-08-24T00:00:00Z') });
assert.equal(campaignStatus(active('pack_discount',50), now), 'active');
assert.equal(campaignStatus({...active('pack_discount',50), startAt:new Date('2026-08-24T01:00:00Z')}, now), 'future');
assert.equal(campaignStatus({...active('pack_discount',50), finalizedAt:new Date()}, now), 'finalized');

const snap = buildCampaignSnapshot([
  active('pack_discount', 30), active('pack_discount', 50),
  active('all_points_multiplier', 2), active('all_points_multiplier', 3),
  active('match_points_multiplier', 2),
  active('all_fichas_multiplier', 2),
  active('pack_open_ficha_bonus', 1), active('pack_open_ficha_bonus', 2)
], now);
assert.equal(snap.effects.packDiscountPercent, 50); // mismo tipo: gana el más fuerte
assert.equal(snap.effects.allPointsMultiplier, 3);
assert.equal(snap.effects.packOpenFichaBonus, 3); // bonus fijo: suma
assert.equal(effectivePackCost(150, snap), 75);
assert.equal(effectiveMatchPoints(20, snap), 60); // max(x3 global, x2 match)
assert.equal(effectiveAllPoints(10, snap), 30);
assert.equal(effectiveFichas(1, snap, {packOpen:true}), 5); // 1*x2 + 3

const ann = validateAnnouncementPayload({ title:'Pool 620', subtitle:'Se viene', paragraphs:'Uno\n\nDos', imageFilename:'pool_620.png', startAt:now });
assert.deepEqual(ann.paragraphs, ['Uno','Dos']);
assert.equal(ann.imageFilename, 'pool_620.png');
assert.throws(() => validateAnnouncementPayload({title:'X', imageFilename:'../x.png'}));
const evt = validateEventPayload({name:'Mitad de precio', type:'pack_discount', value:50, startAt:now, endAt:new Date(now.getTime()+3600000)});
assert.equal(evt.value,50);
assert.throws(() => validateEventPayload({name:'Mal', type:'pack_discount', value:50, startAt:now, endAt:new Date(now.getTime()-1)}));


import fs from 'node:fs';
const firebaseImpl = fs.readFileSync(new URL('../js/firebaseClientImpl.js', import.meta.url), 'utf8');
assert.match(firebaseImpl, /effectiveMatchPoints\(baseDelta, snapshot\)/);
const commerce = fs.readFileSync(new URL('../../functions/src/economy/commerce.js', import.meta.url), 'utf8');
const commerceCore = fs.readFileSync(new URL('../../functions/src/economy/commerceCore.js', import.meta.url), 'utf8');
assert.match(commerce, /effectivePackPurchaseCost\(settings\.packCost, campaignEffects\)/); // 23.19.5.4: purchase discount authority is server-side
assert.match(commerceCore, /event\.type === 'pack_discount'/);
assert.doesNotMatch(firebaseImpl, /effectiveFichas\(1, campaignSnapshot, \{ packOpen: true \}\)/); // 23.19.5.4: pack-open Ficha authority moved server-side
const packCore = fs.readFileSync(new URL('../../functions/src/economy/packCore.js', import.meta.url), 'utf8');
assert.match(packCore, /packOpenFichaBonus/);
assert.match(packCore, /allFichasMultiplier/);
const dailyCore = fs.readFileSync(new URL('../../functions/src/economy/dailyCore.js', import.meta.url), 'utf8');
assert.match(dailyCore, /all_points_multiplier/);
assert.match(dailyCore, /all_fichas_multiplier/);
assert.match(dailyCore, /effectiveDailyRewards/);
assert.doesNotMatch(firebaseImpl, /effectiveAllPoints\(amount, campaignSnapshot\)/); // 23.19.5.4: Daily campaign authority moved server-side
assert.match(firebaseImpl, /getAuthoritativeClassifiedsNow\(uid\)/); // reloj real, no offset QA de Daily Rewards

console.log('CAMPAIGNS_23_13_53_OK activeEvents=' + snap.activeEvents.length);
