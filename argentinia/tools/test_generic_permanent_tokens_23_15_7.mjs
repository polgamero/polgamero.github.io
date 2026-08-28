import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOKEN_PRESETS, normalizeTokenSpec, buildTokenCard, buildTokenPermanentItem, tokenBattlefieldKind, tokenEngineSummary } from '../js/tokenEngine.js';
import { normalizeManaAbility } from '../js/manaSources.js';
import { isArtifactPermanent, isCreaturePermanent, isLandPermanent, isEnchantmentPermanent } from '../js/permanentTypes.js';
import { resolveReplacementEvent } from '../js/replacementEngine.js';
import { buildTokenCatalog } from '../js/tokenCatalog.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.join(here,'..');

// Legacy create_tokens sigue siendo una criatura 1/1 y conserva el color de la fuente.
{
  const spec=normalizeTokenSpec({type:'create_tokens',tokenName:'Vecino',tokenStats:{power:1,toughness:1},tokenKeywords:['vigilance'],image:'token_vecino.png'},{colors:['W']});
  assert.equal(spec.type,'Criatura — Token'); assert.equal(spec.power,1); assert.equal(spec.toughness,1); assert.deepEqual(spec.colors,['W']);
  const card=buildTokenCard(spec,{id:'tok_legacy'}); const item=buildTokenPermanentItem(card);
  assert.equal(tokenBattlefieldKind(card),'creature'); assert.equal(isCreaturePermanent(item),true); assert.equal(item.summoningSickness,true);
}

// Presets de permanentes no criatura.
{
  const treasure=normalizeTokenSpec({type:'create_tokens',tokenPreset:'treasure',token:{name:'Dólar Blue',image:'token_dolar_blue.png'}},{});
  const card=buildTokenCard(treasure,{id:'tok_treasure'}); const item=buildTokenPermanentItem(card);
  assert.equal(card.name,'Dólar Blue'); assert.equal(card.type,'Artefacto — Tesoro'); assert.equal(tokenBattlefieldKind(card),'support'); assert.equal(isArtifactPermanent(item),true); assert.equal(isCreaturePermanent(item),false);
  assert.deepEqual(normalizeManaAbility(card),{options:['W','U','B','R','G'],amount:1,requiresTap:true,sacrificeSelf:true,sourceSchema:'manaAbility'});

  const clue=buildTokenCard(normalizeTokenSpec({type:'create_tokens',tokenPreset:'clue'},{}),{id:'tok_clue'});
  assert.equal(clue.activatedAbility.cost,'{2}'); assert.equal(clue.activatedAbility.sacrifice,'self'); assert.equal(clue.activatedAbility.effect.type,'draw');
  const food=buildTokenCard(normalizeTokenSpec({type:'create_tokens',tokenPreset:'food'},{}),{id:'tok_food'});
  assert.equal(food.activatedAbility.cost,'{2}{T}'); assert.equal(food.activatedAbility.effect.amount,3);
  const blood=buildTokenCard(normalizeTokenSpec({type:'create_tokens',tokenPreset:'blood'},{}),{id:'tok_blood'});
  assert.equal(blood.activatedAbility.additionalCost.type,'discard'); assert.equal(blood.activatedAbility.sacrifice,'self'); assert.equal(blood.activatedAbility.effect.type,'draw');
}

// Contrato libre: Tierra/Encantamiento/Artefacto-Criatura van a su zona semántica.
{
  const land=buildTokenCard(normalizeTokenSpec({type:'create_tokens',token:{name:'Terreno',type:'Tierra — Solar',manaAbility:{produces:'C'}}},{}),{id:'land'});
  assert.equal(tokenBattlefieldKind(land),'land'); assert.equal(isLandPermanent(land),true);
  const ench=buildTokenCard(normalizeTokenSpec({type:'create_tokens',token:{name:'Marca',type:'Encantamiento — Aura virtual'}},{}),{id:'ench'});
  assert.equal(tokenBattlefieldKind(ench),'support'); assert.equal(isEnchantmentPermanent(ench),true);
  const ac=buildTokenCard(normalizeTokenSpec({type:'create_tokens',token:{name:'Constructo',type:'Criatura Artefacto — Constructo',power:2,toughness:2}},{}),{id:'ac'});
  assert.equal(tokenBattlefieldKind(ac),'creature'); assert.equal(isArtifactPermanent(ac),true); assert.equal(isCreaturePermanent(ac),true);
  assert.throws(()=>buildTokenCard(normalizeTokenSpec({type:'create_tokens',token:{name:'No',type:'Instantáneo'}},{})),/no permanente/i);
  assert.throws(()=>normalizeTokenSpec({type:'create_tokens',tokenPreset:'tesoro_typo'},{}),/tokenPreset desconocido/);
}

// Replacement de token_create puede filtrar por características del prototipo.
{
  const empty=()=>({localCombat:[],localSupport:[],localLands:[],localPlaneswalkers:[],rivalCombat:[],rivalSupport:[],rivalLands:[],rivalPlaneswalkers:[],activeEffects:[]});
  const s=empty();
  s.localSupport.push({card:{id:'doubler',name:'Duplicador',type:'Encantamiento',replacementEffect:{event:'token_create',scope:'own',filter:{cardType:'artifact'},multiplyAmount:2}}});
  const treasure=buildTokenCard(normalizeTokenSpec({type:'create_tokens',tokenPreset:'treasure'},{}),{id:'proto_t'});
  const soldier=buildTokenCard(normalizeTokenSpec({type:'create_tokens',token:{name:'Soldado',type:'Criatura — Soldado',power:1,toughness:1}},{}),{id:'proto_c'});
  assert.equal(resolveReplacementEvent(s,{type:'token_create',amount:2,affectedIsLocal:true,card:treasure}).event.amount,4);
  assert.equal(resolveReplacementEvent(s,{type:'token_create',amount:2,affectedIsLocal:true,card:soldier}).event.amount,2);
}

assert.deepEqual(tokenEngineSummary().permanentKinds,['creature','artifact','enchantment','land','planeswalker']);
assert.ok(TOKEN_PRESETS.treasure && TOKEN_PRESETS.clue && TOKEN_PRESETS.food && TOKEN_PRESETS.blood);

{
  const catalog=buildTokenCatalog([{id:'maker',name:'Casa de Cambio',colors:['U'],effect:{type:'create_tokens',amount:1,tokenPreset:'treasure',token:{name:'Dólar Blue',image:'token_dolar_blue.png'}}}]);
  assert.equal(catalog.length,1); assert.equal(catalog[0].type,'Artefacto — Tesoro'); assert.equal(catalog[0].power,undefined); assert.equal(catalog[0].manaAbility.sacrificeSelf,true);
}

// Contratos de integración: resolver, catálogo, manifest y Blood-like activated discard cost.
{
  const stack=fs.readFileSync(path.join(root,'js/stackManager.js'),'utf8');
  const main=fs.readFileSync(path.join(root,'js/main.js'),'utf8');
  const bot=fs.readFileSync(path.join(root,'js/bot.js'),'utf8');
  const catalog=fs.readFileSync(path.join(root,'js/tokenCatalog.js'),'utf8');
  const manifest=fs.readFileSync(path.join(root,'tools/generate_image_manifest.py'),'utf8');
  const ui=fs.readFileSync(path.join(root,'js/ui.js'),'utf8');
  assert.match(stack,/normalizeTokenSpec\(effectToApply, card\)/);
  assert.match(stack,/tokenBattlefieldKind/);
  assert.match(stack,/collectCreatureEtbBatchEntries/);
  // 23.15.7.1 — reanimate ETB must remain inside the revivedCard loop.
  assert.doesNotMatch(stack,/triggerCreatureEtb\(isLocal, revivedCard, newUnit\);\s*}\s*if \(revivedCard\.etbEffect\)/);
  assert.match(stack,/triggerCreatureEtb\(isLocal, revivedCard, newUnit\);\s*if \(revivedCard\.etbEffect\)[\s\S]*?revivedCount\+\+;\s*}/);
  assert.match(stack,/type:'token_created'/);
  assert.doesNotMatch(stack,/type: 'Criatura Token'/);
  assert.match(main,/abilityAdditionalCost.*additionalCost/s);
  assert.match(main,/reason: 'activated_cost'/);
  assert.match(main,/payBotActivatedDiscardCost/);
  assert.match(bot,/payBotActivatedDiscardCost/);
  assert.match(catalog,/normalizeTokenSpec/);
  assert.match(manifest,/tokenType/);
  assert.doesNotMatch(ui,/type: gameText\('encyclopedia\.tokens\.type'\)/);
}

// Pool no cambia en esta versión y los producers legacy siguen presentes.
{
  let count=0,producers=0;
  for(const file of ['criaturas.json','tierras.json','encantamientos.json','artefactos.json','instantaneos.json','planeswalkers.json','conjuros.json']){
    const data=JSON.parse(fs.readFileSync(path.join(root,'assets/data',file),'utf8')); count+=data.length;
    const walk=v=>{ if(!v)return; if(Array.isArray(v))return v.forEach(walk); if(typeof v!=='object')return; if(v.type==='create_tokens')producers++; Object.values(v).forEach(walk); };
    data.forEach(walk);
  }
  assert.ok(count>=673); assert.ok(producers>=33);
}

console.log('PASS test_generic_permanent_tokens_23_15_7');
