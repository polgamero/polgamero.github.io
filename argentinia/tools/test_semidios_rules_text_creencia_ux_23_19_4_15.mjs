import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { buildCardTextLayout, buildLoyaltyAbilityDisplay } from '../js/cardTextFormatter.js';
import { publicCardTypeLine } from '../js/publicTerminology.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const pws=JSON.parse(read('assets/data/planeswalkers.json'));

assert.equal(ENGINE_VERSION,'23.19.5.5');
assert.equal(ENGINE_PROTOCOL_VERSION,'mp-23.19.2');
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.equal(pws.length,8);

// Contract: all 8 Semidioses are readable cards with exactly three Creencia abilities.
for(const pw of pws){
  assert.match(publicCardTypeLine(pw.type),/^Semidiós\b/);
  assert.equal(pw.loyaltyAbilities?.length,3,`${pw.id} must have exactly 3 Creencia abilities`);
  for(const ability of pw.loyaltyAbilities){
    assert.equal(typeof ability.cost,'number',`${pw.id} ability cost`);
    assert.ok(String(ability.name||'').trim(),`${pw.id} ability name`);
    assert.ok(String(ability.text||'').trim(),`${pw.id} ability text`);
    assert.ok(ability.effect && typeof ability.effect==='object',`${pw.id} ability effect`);
  }
  const layout=buildCardTextLayout(pw);
  const loyaltyRows=layout.paragraphs.filter(x=>x.kind==='loyalty-ability');
  assert.equal(loyaltyRows.length,3,`${pw.id} textbox must expose 3 Creencia rows`);
  loyaltyRows.forEach((row,idx)=>{
    const expected=buildLoyaltyAbilityDisplay(pw.loyaltyAbilities[idx]);
    assert.equal(row.loyaltyCost,expected.loyaltyCost);
    assert.equal(row.abilityName,expected.abilityName);
    assert.equal(row.text,expected.text);
    assert.match(row.loyaltyCost,/^(?:\+\d+|−\d+|0)$/);
  });
}

// La Negra is intentionally normalized to the same three-ability model.
const negra=pws.find(pw=>pw.id==='pw_007');
assert.ok(negra);
assert.equal(negra.text,'');
assert.equal('spellCastTrigger' in negra,false,'La Negra must no longer have the extra spell-cast passive');
assert.deepEqual(negra.loyaltyAbilities.map(x=>x.cost),[1,-2,-7]);

// Wave 4 public language reaches the loyalty UI too; internal scry remains unchanged.
const bruja=pws.find(pw=>pw.id==='pw_002');
assert.equal(bruja.loyaltyAbilities[0].text,'Anticipá 2.');
assert.deepEqual(bruja.loyaltyAbilities[0].effect,{type:'scry',amount:2});

// The 24 loyalty ability MECHANICS are identical to the 23.19.4.14 baseline.
// Public names/text are deliberately presentation fields, so the fingerprint excludes them.
const stable=(value)=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const mechanical=pws.map(pw=>({
  id:pw.id,
  loyalty:pw.loyalty,
  abilities:pw.loyaltyAbilities.map(a=>({cost:a.cost,effect:a.effect,requiresTarget:!!a.requiresTarget}))
}));
const fingerprint=crypto.createHash('sha256').update(JSON.stringify(stable(mechanical))).digest('hex');
assert.equal(fingerprint,'ffb066fca083a9d3b43c635bd6b5b9f0c1008fc0f7f4011f80bbc3c61102c889');

const ui=read('js/ui.js');
const formatter=read('js/cardTextFormatter.js');
const css=read('css/style.css');
assert.match(formatter,/kind:\s*'loyalty-ability'/);
assert.match(ui,/card-loyalty-cost-inline/);
assert.match(ui,/buildLoyaltyAbilityDisplay\(ability\)/);
assert.match(css,/\.card-loyalty-rule\s*\{/);
assert.match(css,/\.card-loyalty-cost-inline\s*\{/);

console.log('SEMIDIOS_RULES_TEXT_CREENCIA_UX_23_19_4_15_OK');
console.log('semidioses=8 visibleCreenciaAbilities=24 negraExtraPassive=REMOVED loyaltyMechanics=UNCHANGED cardImages=EXTERNALIZED');
