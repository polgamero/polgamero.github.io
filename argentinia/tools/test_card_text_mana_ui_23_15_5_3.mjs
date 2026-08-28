import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCardTextLayout, stripDuplicatedLeadingKeywords } from '../js/cardTextFormatter.js';
import { MANA_ICON_URLS, manaIconKeyForSymbol, manaIconUrlForSymbol } from '../js/manaSymbolCatalog.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const dataDir=path.join(root,'assets','data');
const read=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');

function allCards(){
  const files=['artefactos.json','conjuros.json','criaturas.json','encantamientos.json','instantaneos.json','planeswalkers.json','tierras.json'];
  return files.flatMap(name=>JSON.parse(fs.readFileSync(path.join(dataDir,name),'utf8')));
}

// 1) Mana symbol catalog: all supplied assets have canonical mappings, including reversed hybrid syntax.
const expectedFiles=[
 'azul_negro.png','azul_rojo.png','blanco_azul.png','blanco_negro.png','negro_rojo.png','negro_verde.png',
 'pir_azul.png','pir_azul_negro.png','pir_azul_rojo.png','pir_blanco.png','pir_blanco_azul.png','pir_blanco_negro.png',
 'pir_blanco_rojo.png','pir_blanco_verde.png','pir_generico.png','pir_negro.png','pir_negro_rojo.png','pir_negro_verde.png',
 'pir_rojo.png','pir_rojo_verde.png','pir_verde.png','pir_verde_azul.png','rojo_blanco.png','rojo_verde.png',
 'verde_azul.png','verde_blanco.png'
];
for(const filename of expectedFiles){
  assert.ok(Object.values(MANA_ICON_URLS).some(url=>url.endsWith('/'+filename)),`missing mana asset mapping: ${filename}`);
}
assert.equal(manaIconKeyForSymbol('U/W'),'W/U');
assert.equal(manaIconKeyForSymbol('P/U'),'U/P');
assert.equal(manaIconKeyForSymbol('U/W/P'),'W/U/P');
assert.equal(manaIconKeyForSymbol('P/G/U'),'G/U/P');
assert.ok(manaIconUrlForSymbol('P')?.endsWith('/pir_generico.png'));

// 2) Legacy duplicate keywords are presentation-cleaned without mutating real rules text.
assert.equal(stripDuplicatedLeadingKeywords('Amenaza. Tripular 2.',['menace']),'Tripular 2.');
assert.equal(stripDuplicatedLeadingKeywords('Vuela. Arrolla. Cuando ataque, robá una carta.',['flying','trample']),'Cuando ataque, robá una carta.');

// 3) Multi-ability rules are separate paragraphs; flavor remains last as a separate field.
let layout=buildCardTextLayout({text:'{1}, {T}: Adiviná 1. {4}, {T}: Robá una carta.',flavorText:'Flavor.',keywords:[]});
assert.equal(layout.paragraphs.length,2);
assert.match(layout.paragraphs[0].reminder,/primera carta/i);
assert.equal(layout.flavorText,'Flavor.');

// 4) Modal options get their own display rows.
layout=buildCardTextLayout({text:'Elegí uno — • Robás una carta. • Devolvé la criatura objetivo a la mano de su dueño.',flavorText:'',keywords:[]});
assert.equal(layout.paragraphs.length,3);
assert.equal(layout.paragraphs[1].kind,'mode-option');
assert.equal(layout.paragraphs[2].kind,'mode-option');

// 5) Ability words are distinct, italicizable metadata instead of bold pseudo-headings.
layout=buildCardTextLayout({text:'Landfall — Siempre que una Tierra entre bajo tu control, Adiviná 1.',flavorText:'',keywords:[]});
assert.equal(layout.paragraphs[0].abilityWord,'Landfall');
assert.match(layout.paragraphs[0].reminder,/biblioteca/i);

// 6) Reminder texts: Surveil, Proliferate, Crew, Ward and Infect.
layout=buildCardTextLayout({text:'Vigilá 2. Proliferá.',flavorText:'',keywords:[]});
assert.equal(layout.paragraphs.length,2);
assert.match(layout.paragraphs[0].reminder,/cementerio/i);
assert.match(layout.paragraphs[1].reminder,/contadores/i);
layout=buildCardTextLayout({text:'Tripular 3.',flavorText:'',keywords:['ward_2','infect']});
assert.match(layout.paragraphs[0].reminder,/fuerza total de 3/i);
assert.equal(layout.keywordReminders.length,2);
assert.match(layout.keywordReminders.find(x=>x.keyword==='ward_2').text,/pague \{2\}/i);
assert.match(layout.keywordReminders.find(x=>x.keyword==='infect').text,/-1\/\-1/i);

// 7) Pool content audit.
const cards=allCards();
assert.ok(cards.length>=643,'cumulative source must preserve the historical 643-card pool from 23.15.5.3');
const byId=new Map(cards.map(c=>[c.id,c]));
assert.ok(byId.get('crea_004')?.keywords?.includes('vigilance'),'Mozo de Bodegón 23.18.3 rebalance must be real metadata, not fake prose');
assert.match(byId.get('crea_004')?.text||'',/Vigilancia/i,'Mozo de Bodegón visible text must match the real keyword');
assert.equal(byId.get('art_015')?.text,'','Robotito de Chatarra atmospheric copy belongs only in flavor');
for(const pw of cards.filter(c=>String(c.id).startsWith('pw_'))){
  assert.equal(pw.legendary,true,`${pw.name}: Planeswalker legend status must be metadata`);
  assert.doesNotMatch(pw.text||'',/Planeswalker Legendario/i);
}
assert.equal(cards.filter(c=>/\bScry\b/i.test(c.text||'')).length,0,'visible rules text should use Adiviná');
assert.equal(cards.filter(c=>/\bSurveil\b/i.test(c.text||'')).length,0,'visible rules text should use Vigilá');
assert.equal(cards.filter(c=>/Prisa Repentina:|Efecto estático:/i.test(c.text||'')).length,0,'legacy pseudo-headings must be removed');

// The renderer is ready for Phyrexian-hybrid artwork, but Cost Engine 23.15.4 currently
// supports two-color hybrid and one-color Phyrexian as separate symbol families only.
// Fail closed so content cannot silently ship a pretty but unpayable {W/U/P} cost.
assert.equal(cards.filter(c=>/\{(?:W|U|B|R|G)\/(?:W|U|B|R|G)\/P\}/i.test(c.manaCost||'')).length,0,
  'Phyrexian-hybrid manaCost requires a Cost Engine extension before entering the pool');
assert.equal(cards.filter(c=>/\{P\}/i.test(c.manaCost||'')).length,0,
  '{P} is presentation/reminder-only until a generic Phyrexian payment rule exists');

const vehicles=cards.filter(c=>String(c.type||'').includes('Vehículo'));
assert.equal(vehicles.length,10);
for(const vehicle of vehicles){
  const crew=Number(vehicle.activatedAbility?.crewCost);
  assert.ok(crew>0,`${vehicle.name}: missing crewCost`);
  assert.equal(vehicle.text,`Tripular ${crew}.`,`${vehicle.name}: crew text must be canonical`);
  const vehicleLayout=buildCardTextLayout(vehicle);
  assert.match(vehicleLayout.paragraphs[0].reminder,new RegExp(`fuerza total de ${crew}`,'i'));
  assert.doesNotMatch(vehicleLayout.paragraphs[0].reminder,/Pagá\s*\{/i);
}

// 8) CSS/UI contract: no global bold rules, flavor is last-classed, ability words and reminders have explicit classes.
const ui=read('js/ui.js');
const css=read('css/style.css');
assert.match(ui,/card-text-box card-text-box-structured/);
assert.match(ui,/card-flavor-text/);
assert.match(ui,/card-rule-paragraph/);
assert.match(ui,/card-ability-word/);
assert.doesNotMatch(ui,/<strong>\$\{formattedText\}<\/strong>/);
assert.match(css,/\.card-flavor-text\s*\{[^}]*font-style:\s*italic/s);
assert.match(css,/\.card-rule-paragraph\s*\{[^}]*font-weight:\s*400/s);
assert.match(css,/\.card-ability-word\s*\{[^}]*font-style:\s*italic/s);

console.log('PASS test_card_text_mana_ui_23_15_5_3');
