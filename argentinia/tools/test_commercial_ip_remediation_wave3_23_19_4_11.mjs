import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const load=(p)=>JSON.parse(read(p));
const cards=[
  ...load('assets/data/criaturas.json'),
  ...load('assets/data/instantaneos.json'),
  ...load('assets/data/conjuros.json'),
  ...load('assets/data/encantamientos.json'),
  ...load('assets/data/artefactos.json'),
  ...load('assets/data/tierras.json'),
  ...load('assets/data/planeswalkers.json')
];
const byId=new Map(cards.map(card=>[card.id,card]));

assert.equal(ENGINE_VERSION,'23.19.5.1');
assert.equal(ENGINE_PROTOCOL_VERSION,'mp-23.19.2');
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.equal(cards.length,880);

const expected={
  art_071:['Tablero Sinóptico de la Central Fantasma','tablero_sinoptico_de_la_central_fantasma.png'],
  art_056:['Loto del Jardín Oriental','loto_del_jardin_oriental.png'],
  art_053:['Radio Portátil Poseída','radio_portatil_poseida.png'],
  art_041:['Camioneta del Correo Fantasma','camioneta_del_correo_fantasma.png'],
  art_049:['Cupé de la Ruta de los Espectros','cupe_de_la_ruta_de_los_espectros.png'],
  tier_004:['Coloso de la Avenida','coloso_de_la_avenida.png'],
  crea_323:['Cadete del Observatorio Meteorológico','cadete_del_observatorio_meteorologico.png'],
  art_080:['Cronómetro de la Bóveda Dorada','cronometro_de_la_boveda_dorada.png'],
  tier_001:['Templo de la Ribera','templo_de_la_ribera.png'],
  tier_015:['Biblioteca de la República Invisible','biblioteca_de_la_republica_invisible.png'],
  crea_292:['Jardinera de la Ciudad en Miniatura','jardinera_de_la_ciudad_en_miniatura.png']
};
for(const [id,[name,image]] of Object.entries(expected)){
  const card=byId.get(id);
  assert.ok(card,`missing ${id}`);
  assert.equal(card.name,name,`${id} name`);
  assert.equal(card.image,image,`${id} image ref`);
}

// Mechanical fingerprints unchanged
assert.match(byId.get('art_041').type,/Vehículo/);
assert.equal(byId.get('art_041').text,'Tripular 3.');
assert.match(byId.get('art_049').type,/Vehículo/);
assert.equal(byId.get('art_049').text,'Tripular 2.');
assert.equal(byId.get('art_053').text,'{1}, sacrificá un Artefacto: el rival pierde 1 Punto de Vida y vos ganás 1.');
assert.equal(byId.get('art_056').text,'{T}, sacrificá Loto del Jardín Oriental: agregá tres manás de un color a elección.');
assert.match(byId.get('art_071').text,/Amplificá/);
assert.match(byId.get('art_080').text,/en espera/i);
assert.equal(byId.get('crea_292').power,2);
assert.equal(byId.get('crea_292').toughness,2);
assert.equal(byId.get('crea_323').activatedAbility.cost,'{2}{U}');
assert.equal(byId.get('crea_323').dfc.backFace.name,'Oráculo de la Sudestada');
assert.equal(byId.get('tier_001').text,'{T}: Agrega {W}.');
assert.equal(byId.get('tier_004').text,'{T}: Agrega {U}.');
assert.equal(byId.get('tier_015').text,'Biblioteca de la República Invisible entra al campo de batalla girada. {T}: Agregá {U}. {T}: Robás una carta y perdés 1 Punto de Vida.');
assert.equal(byId.get('tier_012').name,'Las Malvinas');

// No terminology workshop bleed-in yet
assert.equal(byId.get('art_006').type,'Artefacto — Vehículo');
assert.equal(byId.get('art_006').text,'Tripular 3.');
assert.match(byId.get('crea_015').text,/Anticipá 1/);
assert.match(byId.get('art_071').text,/Amplificá/);
assert.equal(load('assets/data/planeswalkers.json')[0].type.includes('Planeswalker'),true);

const roadmap=read('COMMERCIAL_REMEDIATION_ROADMAP_23_19_4_9.txt');
assert.ok(roadmap.includes('Wave 3: Venues + institutions genericization COMPLETE in 23.19.4.11.'));
assert.ok(roadmap.includes('Card image binaries are now EXTERNALIZED from deliverables'));
const wave3=read('COMMERCIAL_REMEDIATION_WAVE3_23_19_4_11.txt');
assert.ok(wave3.includes('STATUS: RELEASED'));
assert.ok(wave3.includes('tier_012 Las Malvinas remains unchanged in this wave.'));
const policy=read('CARD_IMAGE_EXTERNALIZATION_POLICY_23_19_4_11.txt');
assert.match(policy,/not shipped in deliverables/i);

console.log('COMMERCIAL_IP_REMEDIATION_WAVE3_23_19_4_11_OK');
console.log('yellowResolved=11 idsChanged=0 mechanicsChanged=0 terminologyRenames=0 cardImages=EXTERNALIZED');
