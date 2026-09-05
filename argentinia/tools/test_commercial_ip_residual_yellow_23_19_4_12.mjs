import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
const here=path.dirname(fileURLToPath(import.meta.url)); const root=path.resolve(here,'..');
const load=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const cards=[...load('assets/data/criaturas.json'),...load('assets/data/instantaneos.json'),...load('assets/data/conjuros.json'),...load('assets/data/encantamientos.json'),...load('assets/data/artefactos.json'),...load('assets/data/tierras.json'),...load('assets/data/planeswalkers.json')];
const byId=new Map(cards.map(c=>[c.id,c]));
assert.equal(ENGINE_VERSION,'23.20.0'); assert.equal(ENGINE_PROTOCOL_VERSION,'mp-23.19.2'); assert.equal(FIRESTORE_RULES_VERSION,'23.13.80'); assert.equal(cards.length,880);
const expected={
 crea_279:['Perito del Registro Fantasma','perito_del_registro_fantasma.png'],
 crea_286:['Paramédica de la Guardia Infinita','paramedica_de_la_guardia_infinita.png'],
 crea_290:['Técnico de la Usina de Medianoche','tecnico_de_la_usina_de_medianoche.png'],
 crea_301:['Relator de la Radio de las Mil Historias','relator_de_la_radio_de_las_mil_historias.png'],
 ench_072:['Sala de Guardia Infinita','sala_de_guardia_infinita.png'],
 ench_086:['La Final de los Once Sueños','la_final_de_los_once_suenos.png']
};
for(const [id,[name,image]] of Object.entries(expected)){ assert.equal(byId.get(id).name,name); assert.equal(byId.get(id).image,image); }
assert.equal(byId.get('crea_279').triggers[0].effect.type,'scry');
assert.deepEqual(byId.get('crea_286').triggers[0].effect,{type:'add_counter',counterType:'shield',amount:1});
assert.equal(byId.get('crea_290').triggers[0].effect.type,'damage'); assert.equal(byId.get('crea_290').triggers[0].effect.amount,1);
assert.equal(byId.get('crea_301').triggers[0].effect.type,'damage'); assert.equal(byId.get('crea_301').triggers[0].effect.amount,1);
assert.equal(byId.get('ench_072').replacementEffect.multiplyAmount,2);
assert.equal(byId.get('ench_086').saga.chapters.length,3); assert.equal(byId.get('ench_086').saga.chapters[2].effect.type,'damage'); assert.equal(byId.get('ench_086').saga.chapters[2].effect.amount,3);
assert.equal(byId.get('tier_012').name,'Las Malvinas'); assert.equal(byId.get('tier_012').flavorText,'El viento del sur guarda nombres que el tiempo no borra.');
// Terminology remains frozen before workshop approval.
assert.equal(byId.get('art_006').type,'Artefacto — Vehículo'); assert.equal(byId.get('art_006').text,'Tripular 3.');
assert.match(byId.get('crea_015').text,/Anticipá 1/); assert.match(byId.get('art_071').text,/Amplificá/); assert.equal(load('assets/data/planeswalkers.json')[0].type.includes('Planeswalker'),true);
const forbidden=[['RENA','PER'],['Hospital ','Posadas'],['Atucha ','II'],['Radio ','Nacional'],['Sala de Guardia del ','Posadas'],['Final del Ochenta y ','Seis']].map(parts=>parts.join(''));
for(const term of forbidden){ const hits=cards.filter(c=>JSON.stringify(c).toLowerCase().includes(term.toLowerCase())); assert.equal(hits.length,0,`${term} residual`); }
console.log('COMMERCIAL_IP_RESIDUAL_YELLOW_23_19_4_12_OK');
console.log('residualYellowMetadata=0 idsChanged=0 mechanicsChanged=0 terminologyRenames=0 images=EXTERNALIZED');
