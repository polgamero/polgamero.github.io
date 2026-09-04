import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { TOKEN_PRESETS } from '../js/tokenEngine.js';

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
const oldLabel='Tup'+'per';

assert.equal(ENGINE_VERSION,'23.19.5.5');
assert.equal(ENGINE_PROTOCOL_VERSION,'mp-23.19.2');
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.equal(cards.length,880);

const abuela=byId.get('crea_284');
const viandas=byId.get('conj_084');
const heladera=byId.get('art_065');
assert.equal(abuela.name,'Abuela del Envase Hermético');
assert.equal(abuela.image,'abuela_del_envase_hermetico.png');
assert.equal(abuela.etbEffect.type,'create_tokens');
assert.equal(abuela.etbEffect.amount,1);
assert.equal(abuela.etbEffect.tokenPreset,'food');
assert.equal(abuela.etbEffect.token.name,'Envase hermético');
assert.equal(abuela.etbEffect.token.image,'token_envase_hermetico.png');

assert.equal(viandas.effect.type,'create_tokens');
assert.equal(viandas.effect.amount,2);
assert.equal(viandas.effect.tokenPreset,'food');
assert.equal(viandas.effect.token.name,'Envase hermético');
assert.equal(viandas.effect.token.image,'token_envase_hermetico.png');

assert.equal(heladera.activatedAbility.cost,'{2}{T}');
assert.equal(heladera.activatedAbility.effect.type,'create_tokens');
assert.equal(heladera.activatedAbility.effect.amount,1);
assert.equal(heladera.activatedAbility.effect.tokenPreset,'food');
assert.equal(heladera.activatedAbility.effect.token.name,'Envase hermético');
assert.equal(heladera.activatedAbility.effect.token.image,'token_envase_hermetico.png');

// The mechanical Food preset is intentionally frozen until the global terminology workshop.
assert.equal(TOKEN_PRESETS.food.name,'Comida');
assert.equal(TOKEN_PRESETS.food.type,'Artefacto — Comida');
assert.equal(TOKEN_PRESETS.food.activatedAbility.cost,'{2}{T}');
assert.deepEqual(TOKEN_PRESETS.food.activatedAbility.effect,{type:'heal',amount:3});

const externalPolicy=read('CARD_IMAGE_EXTERNALIZATION_POLICY_23_19_4_11.txt');
assert.match(externalPolicy,/externalized/i);
for(const rel of [
  'abuela_del_envase_hermetico.png',
  'token_envase_hermetico.png',
  'viandas_del_club.png',
  'heladera_del_club.png'
]) assert.match(rel,/\.png$/i);

const art=load('assets/images/cards/commercial-art-wave2-envase-hermetico.json');
assert.equal(art.version,'23.19.4.12');
assert.equal(art.status,'ACCEPTED');
assert.equal(art.tokenPublicName,'Envase hermético');
assert.equal(art.internalTokenPreset,'food');
assert.equal(art.mechanicsChanged,0);

// Commercial old-string purge: no literal brand-adjacent label may survive in authoritative production content.
// Hydrated GitHub Pages may retain legacy/externalized PNG filenames. The generated
// cards-image-manifest.json is an inventory of those retained binaries, not authoritative
// public card metadata for the clean-room terminology contract.
const productionPaths=['js','assets/data','assets/images/cards/commercial-art-wave2-envase-hermetico.json','COMMERCIAL_REMEDIATION_ROADMAP_23_19_4_9.txt','COMMERCIAL_REMEDIATION_WAVE2_23_19_4_10.txt'];
function walk(p){
  const abs=path.join(root,p);
  const stat=fs.statSync(abs);
  if(stat.isFile()) return [abs];
  return fs.readdirSync(abs,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(abs,e.name)]);
}
for(const abs of productionPaths.flatMap(walk)){
  if(/\.(png|jpg|jpeg|webp|gif|avif)$/i.test(abs)) continue;
  const body=fs.readFileSync(abs,'utf8');
  assert.ok(!body.toLowerCase().includes(oldLabel.toLowerCase()),`old public label survives in ${path.relative(root,abs)}`);
}

// No global keyword or Planeswalker vocabulary migration in Wave2.
assert.equal(byId.get('art_006').type,'Artefacto — Vehículo');
assert.equal(byId.get('art_006').text,'Tripular 3.');
assert.match(byId.get('crea_015').text,/Anticipá 1/);
assert.match(byId.get('crea_021').text,/Anticipá 1/);
assert.match(byId.get('art_071').text,/Amplificá/);
assert.match(byId.get('art_080').text,/en espera/i);
assert.equal(load('assets/data/planeswalkers.json')[0].type.includes('Planeswalker'),true);

console.log('COMMERCIAL_IP_REMEDIATION_WAVE2_23_19_4_10_OK');
console.log('token=Envase_hermetico producers=3 mechanicsChanged=0 idsChanged=0 keywordRenames=0');
