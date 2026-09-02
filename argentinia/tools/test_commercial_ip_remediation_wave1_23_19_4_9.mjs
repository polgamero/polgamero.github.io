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
const expectedNames={
  crea_030:'Metalero de las Sierras',
  crea_033:'Estilista del Futuro',
  crea_032:'Conductora del Living Dorado',
  art_006:'Limusina del Magnate',
  crea_029:'La Diva Magnética',
  crea_023:'Anfitriona del Banquete Eterno',
  inst_011:'Jugada Prohibida',
  crea_026:'Artista de la Instalación Imposible',
  crea_027:'Poeta del Rock Celeste',
  ench_004:'El Equipo de los Once Sueños',
  inst_017:'Cronista de Último Momento',
  crea_015:'Magnate del Show Infinito',
  crea_031:'Rey del Frigorífico',
  crea_021:'Caminante del Fin del Mundo',
  crea_014:'Ídolo del Potrero Imposible',
  crea_028:'Pianista del Apagón Eterno'
};

assert.equal(ENGINE_VERSION,'23.19.5.1');
assert.equal(ENGINE_PROTOCOL_VERSION,'mp-23.19.2');
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.equal(cards.length,880);
assert.equal(Object.keys(expectedNames).length,16);
for(const [id,name] of Object.entries(expectedNames)){
  const card=byId.get(id);
  assert.ok(card,`missing ${id}`);
  assert.equal(card.name,name,`${id} public identity`);
}
// Mechanical fingerprints: Wave 1 is content-only, not a rebalance.
assert.deepEqual(byId.get('crea_030').attackTrigger,{type:'damage',amount:1});
assert.deepEqual(byId.get('crea_031').activatedAbility.effect,{type:'fight'});
assert.deepEqual(byId.get('crea_032').etbEffect,{type:'discard',amount:1});
assert.deepEqual(byId.get('crea_033').etbEffect,{type:'draw_and_lose_life',amount:1,lifeLoss:1});
assert.deepEqual(byId.get('ench_004').upkeepTrigger,{type:'draw',amount:1});
assert.deepEqual(byId.get('inst_011').effect,{type:'damage',amount:4});
assert.deepEqual(byId.get('inst_017').effect,{type:'fight'});
assert.equal(byId.get('art_006').activatedAbility.crewCost,3);
assert.deepEqual(byId.get('art_006').activatedAbility.effect,{type:'crew_vehicle'});
assert.deepEqual(byId.get('crea_015').attackTrigger,{type:'scry',amount:1});
assert.deepEqual(byId.get('crea_021').anyCreatureDiesTrigger,{type:'scry',amount:1});
assert.deepEqual(byId.get('crea_026').anyCreatureDiesTrigger,{type:'drain',amount:1});
assert.deepEqual(byId.get('crea_027').combatDamageTrigger,{type:'heal',amount:1});
assert.deepEqual(byId.get('crea_028').blockTrigger,{type:'heal',amount:2});
assert.deepEqual(byId.get('crea_029').etbEffect,{type:'discard',amount:1});
assert.deepEqual(byId.get('crea_014').attackTrigger,{type:'damage',amount:2});

// Art cannot be silently cosmetically renamed: the RC explicitly blocks promotion until 16 clean-room PNGs exist.
const art=load('assets/images/cards/commercial-art-wave1-required.json');
assert.equal(art.waveVersion,'23.19.4.9');
assert.equal(art.acceptedInVersion,'23.19.4.12');
assert.equal(art.status,'ART_ACCEPTED');
assert.equal(art.required.length,16);
for (const row of art.required) {
  assert.equal(row.width,1448);
  assert.equal(row.height,1086);
  assert.match(row.image,/\.(png|jpg|jpeg|webp|gif|avif)$/i);
}
const externalPolicy=read('CARD_IMAGE_EXTERNALIZATION_POLICY_23_19_4_11.txt');
assert.match(externalPolicy,/externalized/i);


const roadmap=read('COMMERCIAL_REMEDIATION_ROADMAP_23_19_4_9.txt');
assert.ok(roadmap.includes('Wave 2: Envase hermético migration COMPLETE.'));
assert.ok(roadmap.includes('Planeswalker direction: Semidiós'));
assert.ok(roadmap.includes('Creencia is a candidate, NOT final'));
assert.ok(roadmap.includes('No keyword rename is approved yet'));

console.log('COMMERCIAL_IP_REMEDIATION_WAVE1_23_19_4_9_OK');
console.log('redIdentities=16 mechanicsChanged=0 idsChanged=0 artStatus=ART_ACCEPTED');
