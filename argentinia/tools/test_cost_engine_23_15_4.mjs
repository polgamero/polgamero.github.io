import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applySpellCostModifiers, getSpellPaymentMethods, getConvokeCandidates,
  applyConvokeToCost, applyDelveToCost, applyPhyrexianLifeToCost, planAutomaticPaymentMethods,
  spellCostFilterMatches, parsedManaTotal
} from '../js/costEngine.js';
import { parseManaCost } from '../js/utils.js';
import { emptyManaPool, addMana, spendOneMana, manaCostTotal, canPoolPayCost } from '../js/manaPool.js';

const card = (name,type='Criatura — Humano', colors=['W']) => ({name,type,colors,power:type.includes('Criatura')?2:undefined});
const perm = (c, extra={}) => ({card:c,tapped:false,...extra});
const emptyState = () => ({localCombat:[],localSupport:[],localLands:[],localPlaneswalkers:[],rivalCombat:[],rivalSupport:[],rivalLands:[],rivalPlaneswalkers:[],localGraveyard:[],rivalGraveyard:[],localHand:[],rivalHand:[]});

// Tax global sobre hechizos de criatura del oponente.
{
  const s=emptyState();
  s.rivalSupport.push(perm({name:'Tax',type:'Encantamiento',staticEffect:{type:'spell_cost_modifier',mode:'increase',scope:'opponent',amount:1,filter:{cardType:'creature'}}}));
  const r=applySpellCostModifiers(s,card('Bicho'),true,{W:1,U:0,B:0,R:0,G:0,C:0,generic:1});
  assert.equal(r.cost.W,1); assert.equal(r.cost.generic,2); assert.equal(r.trace.length,1);
}

// Reducciones sólo comen genérico; jamás pips de color.
{
  const s=emptyState();
  s.localSupport.push(perm({name:'Electromancer',type:'Criatura — Mago',power:2,staticEffect:{type:'spell_cost_modifier',mode:'reduce',scope:'own',amount:3,filter:{cardType:'instant_or_sorcery'}}}));
  const spell={name:'Rayo',type:'Instantáneo',colors:['R']};
  const r=applySpellCostModifiers(s,spell,true,{W:0,U:0,B:0,R:1,G:0,C:0,generic:1});
  assert.equal(r.cost.R,1); assert.equal(r.cost.generic,0);
}

// Affinity: una reducción por cada artefacto controlado.
{
  const s=emptyState();
  s.localSupport.push(perm({name:'A1',type:'Artefacto'}),perm({name:'A2',type:'Artefacto'}),perm({name:'A3',type:'Artefacto'}));
  const spell={name:'Affinity',type:'Criatura — Constructo',colors:[],power:4,affinity:'artifact'};
  const r=applySpellCostModifiers(s,spell,true,{W:0,U:0,B:0,R:0,G:0,C:0,generic:6});
  assert.equal(r.cost.generic,3);
}

// Increase -> reduction -> minimum.
{
  const s=emptyState();
  s.localSupport.push(perm({name:'Inc',type:'Encantamiento',staticEffect:{type:'spell_cost_modifier',mode:'increase',scope:'own',amount:2}}));
  s.localSupport.push(perm({name:'Red',type:'Encantamiento',staticEffect:{type:'spell_cost_modifier',mode:'reduce',scope:'own',amount:5}}));
  s.localSupport.push(perm({name:'Floor',type:'Artefacto',staticEffect:{type:'spell_cost_modifier',mode:'minimum',scope:'own',minimumTotalMana:3}}));
  const r=applySpellCostModifiers(s,{name:'X',type:'Conjuro',colors:[]},true,{W:0,U:0,B:0,R:0,G:0,C:0,generic:2});
  assert.equal(parsedManaTotal(r.cost),3);
  assert.deepEqual(r.trace.map(x=>x.mode),['increase','reduce','minimum']);
}

// Predicados.
assert.equal(spellCostFilterMatches({type:'Criatura — Músico',colors:['U']},{cardType:'creature',subtype:'Músico',color:'U'}),true);
assert.equal(spellCostFilterMatches({type:'Criatura — Músico',colors:['U']},{cardType:'noncreature'}),false);

// Convoke: colores primero, luego genérico; una criatura incolora no paga {C}.
{
  const w=perm(card('W','Criatura — Humano',['W']));
  const u=perm(card('U','Criatura — Humano',['U']));
  const c=perm(card('C','Criatura — Constructo',[]));
  const r=applyConvokeToCost({W:1,U:1,B:0,R:0,G:0,C:1,generic:1},[w,u,c]);
  assert.equal(r.cost.W,0); assert.equal(r.cost.U,0); assert.equal(r.cost.C,1); assert.equal(r.cost.generic,0);
  assert.equal(r.usedItems.length,3);
}

// Delve sólo paga genérico.
{
  const r=applyDelveToCost({W:1,U:0,B:0,R:0,G:0,C:0,generic:4},[{id:1},{id:2},{id:3},{id:4},{id:5}]);
  assert.equal(r.cost.W,1); assert.equal(r.cost.generic,0); assert.equal(r.usedCards.length,4);
}

// Presets + plan automático compartido por Tano/QA.
{
  const s=emptyState();
  s.localCombat.push(perm(card('W','Criatura — Humano',['W'])),perm(card('N','Criatura — Humano',[])));
  s.localGraveyard.push({name:'g1'},{name:'g2'},{name:'g3'});
  const spell={name:'Both',type:'Conjuro',colors:['W'],paymentMethods:['convoke','delve']};
  assert.deepEqual(getSpellPaymentMethods(spell).map(x=>x.type),['convoke','delve']);
  assert.equal(getConvokeCandidates(s,true).length,2);
  const p=planAutomaticPaymentMethods(s,spell,true,{W:1,U:0,B:0,R:0,G:0,C:0,generic:4});
  assert.equal(parsedManaTotal(p.cost),0);
  assert.equal(p.plan.convoke.length,2);
  assert.equal(p.plan.delve.length,3);
}



// Símbolos híbridos y Phyrexian son aditivos: el parser legacy no cambia si no aparecen.
{
  assert.deepEqual(parseManaCost('{1}{W}'),{W:1,U:0,B:0,R:0,G:0,C:0,generic:1});
  const cost=parseManaCost('{W/U}{U/P}{2}');
  assert.deepEqual(cost.hybrid,[['W','U']]);
  assert.deepEqual(cost.phyrexian,['U']);
  assert.equal(manaCostTotal(cost),4);
  const pool=emptyManaPool(); addMana(pool,'W',1); addMana(pool,'U',1); addMana(pool,'G',2);
  assert.equal(canPoolPayCost(pool,{...cost,hybrid:cost.hybrid.map(x=>[...x]),phyrexian:[...cost.phyrexian]}),true);
  const mutable=parseManaCost('{W/U}{U/P}');
  const p=emptyManaPool(); addMana(p,'W',1); addMana(p,'U',1);
  assert.match(spendOneMana(p,mutable,'W').paid,/hybrid/);
  assert.match(spendOneMana(p,mutable,'U').paid,/phyrexian/);
  assert.equal(manaCostTotal(mutable),0);
}

// Phyrexian por vida se prepara sin mutar HP; el commit lo hace main.js.
{
  const c=parseManaCost('{U/P}{B/P}{1}');
  const r=applyPhyrexianLifeToCost(c,[1]);
  assert.equal(r.life,2); assert.deepEqual(r.paidSymbols,['B']);
  assert.deepEqual(r.cost.phyrexian,['U']); assert.equal(r.cost.generic,1);
}



// Integración 601.2f/h + Tano + pool unchanged.
{
  const here=path.dirname(fileURLToPath(import.meta.url));
  const main=fs.readFileSync(path.join(here,'../js/main.js'),'utf8');
  const version=fs.readFileSync(path.join(here,'../js/version.js'),'utf8');
  const workflow=fs.readFileSync(path.join(here,'../../.github/workflows/pages.yml'),'utf8');
  const bot=fs.readFileSync(path.join(here,'../js/bot.js'),'utf8');
  const ui=fs.readFileSync(path.join(here,'../js/ui.js'),'utf8');
  if (!version.includes("ENGINE_VERSION = '23.18'")) assert.match(version,/ENGINE_VERSION = '23\.15\.(?:[4-9]|[1-9][0-9]+)(?:\.\d+)?'|ENGINE_VERSION = '23\.16\.1(?:\.1)?'|ENGINE_VERSION = '23\.16\.(?:2(?:\.1)?|3(?:\.1)?|4(?:\.1)?|5(?:\.[12])?)'/);
  assert.match(workflow,/regression_legacy_23_(?:15|16|17)_[0-9_]+\.zip/);
  assert.match(workflow,/ci_regression_manifest_23_(?:15|16|17)_[0-9_]+\.txt/);
  assert.match(main,/getFinalCastingManaCost\(tx\.card/);
  assert.match(main,/prepareOptionalCastPaymentMethods/);
  assert.match(main,/commitPreparedCastPaymentMethods/);
  assert.match(main,/cause:'convoke_cost'/);
  assert.match(main,/cause:'delve_cost'/);
  assert.match(main,/cause:'phyrexian_cost'/);
  assert.match(bot,/getFinalCastingManaCost\(card/);
  assert.match(bot,/botPaymentMethodPlan/);
  assert.match(ui,/showCostPaymentResourceModal/);
  assert.match(ui,/showPhyrexianCostChoiceModal/);
  let count=0;
  for(const file of ['criaturas.json','tierras.json','encantamientos.json','artefactos.json','instantaneos.json','planeswalkers.json','conjuros.json']){
    const d=JSON.parse(fs.readFileSync(path.join(here,'../assets/data',file),'utf8'));
    if(Array.isArray(d)) count+=d.length; else for(const v of Object.values(d)) if(Array.isArray(v)) count+=v.length;
  }
  assert.ok(count>=643,'cumulative source must preserve the historical 643-card pool from 23.15.4');
}

console.log('PASS test_cost_engine_23_15_4');
