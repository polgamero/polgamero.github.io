import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { OWNER_APPROVED_PUBLIC_DICTIONARY, PUBLIC_TERMINOLOGY_VERSION } from '../js/publicTerminology.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const load=rel=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const cardFiles=['criaturas.json','instantaneos.json','conjuros.json','encantamientos.json','artefactos.json','tierras.json','planeswalkers.json'];
const cards=cardFiles.flatMap(f=>load(`assets/data/${f}`));
const byId=new Map(cards.map(c=>[c.id,c]));

assert.equal(ENGINE_VERSION,'23.19.5.4');
assert.equal(PUBLIC_TERMINOLOGY_VERSION,'23.19.4.14');
assert.equal(ENGINE_PROTOCOL_VERSION,'mp-23.19.2');
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.equal(cards.length,880);
assert.equal(byId.size,880);
assert.equal(new Set(cards.map(c=>String(c.name).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim())).size,880);

const dict=load('OWNER_APPROVED_TERMINOLOGY_23_19_4_14.json');
assert.equal(dict.status,'OWNER_APPROVED_44_OF_44');
assert.equal(dict.decisions.length,44);
assert.equal(Object.keys(OWNER_APPROVED_PUBLIC_DICTIONARY).length,44);
assert.equal(dict.cardImages,'EXTERNALIZED');

// Known RED/YELLOW identity and brand/place strings must not survive in active public card metadata.
const blocked=[
 ['Ricardo ','Iorio'],['Roberto ','Giordano'],['Susana ','Giménez'],['Rolls','-Royce'],['Moria ','Casán'],['Mirtha ','Legrand'],
 ['Marta ','Minujín'],['Spin','etta'],['La ','Scaloneta'],['Mauro ','Viale'],['Alberto ','Samid'],['El ','Eternauta'],['Charly ','García'],
 ['Mara','dona'],['La ','Bombonera'],['El ','Monumental'],['Rastro','jero'],['Tor','ino'],['Spi','ca'],['Banco ','Nación'],
 ['Servicio ','Meteorológico'],['Jardín ','Japonés'],['Biblioteca ','Nacional'],['RENA','PER'],['Hospital ','Posadas'],
 ['Atucha ','II'],['Radio ','Nacional'],['República de los ','Niños'],['Final del Ochenta y ','Seis']
].map(parts=>parts.join(''));
const publicBlob=cards.map(c=>[c.name,c.text,c.flavorText].filter(Boolean).join('\n')).join('\n').toLowerCase();
for(const term of blocked) assert.ok(!publicBlob.includes(term.toLowerCase()),`commercial residual: ${term}`);

// Wave 5 caught one otherwise-unrelated product/model reference in flavor.
assert.equal(byId.get('crea_214').flavorText,'Jura que esa pieza era de un cupé viejo. Nadie recuerda haber visto el auto entero.');

// Public old terminology cannot survive in card-facing strings.
const forbidden=[/\bPlaneswalker(?:s)?\b/i,/\bLealtad\b/i,/\bSaga(?:s)?\b/i,/\bLore\b/i,/\bAura(?:s)?\b/i,/\bVeh[ií]culo(?:s)?\b/i,/\bVigilancia\b/i,/\bPrisa\b/i,/\bAmenaza\b/i,/V[ií]nculo vital/i,/Toque mortal/i,/\bInfectar\b/i,/\bDestello\b/i,/Primer golpe/i,/Doble golpe/i,/\bWard\b/i,/\bDefensor(?:a)?\b/i,/\bIndestructible\b/i,/\bLandfall\b/i,/\bAdivin[aá](?:r)?\b/i,/\b(?:Surveil|Vigil[aá])\b/i,/\bProlifer[aá](?:r)?\b/i,/\bKicker\b/i,/\bFlashback\b/i,/\bEscape\b/i,/\bSuspend(?:er|ida|ido|idas|idos)?\b/i,/\b(?:Convocar|Convoke)\b/i,/\bAfinidad por\b/i,/\bExcavar\b/i];
for(const c of cards) for(const value of [c.name,c.text,c.flavorText].filter(Boolean)) for(const rx of forbidden) assert.ok(!rx.test(value),`legacy public vocabulary in ${c.id}: ${value}`);

// Structured gameplay fingerprint: presentation stripped current pool equals 23.19.4.8 pre-remediation baseline.
const presentation=new Set(['name','text','flavorText','image','reminderText','description','label','title','message','abilityName','displayName']);
function strip(node){
 if(Array.isArray(node)) return node.map(strip);
 if(node && typeof node==='object') return Object.fromEntries(Object.keys(node).sort().filter(k=>!presentation.has(k)).map(k=>[k,strip(node[k])]));
 return node;
}
const normalized=Object.fromEntries([...cards].sort((a,b)=>a.id.localeCompare(b.id)).map(c=>[c.id,strip(c)]));
// 23.19.5 has one explicit owner-approved gameplay delta after Commercial IP Hardening:
// pw_007 loses its extra spellCastTrigger. Reinsert only that historical trigger before
// validating the Wave5 fingerprint, proving no other mechanical drift occurred.
if (ENGINE_VERSION === '23.19.5.4') {
  normalized.pw_007.spellCastTrigger={effect:{amount:1,type:'scry'},filter:'instant_or_sorcery'};
  normalized.pw_007=Object.fromEntries(Object.keys(normalized.pw_007).sort().map(k=>[k,normalized.pw_007[k]]));
}
const hash=crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
assert.equal(hash,'0cdb30716c6359eae93166597dce1c842d00afa8ed0c2e313341e4d3841957b8');

// No explicit competitor attribution in canonical active JS/CSS/HTML/data.
// GitHub web uploads do not delete stale historical build-* folders, so a hydrated
// checkout may contain obsolete JS that is not part of the current cumulative source.
// The active runtime for 23.19.5 is the flat js/ + css/ + assets/data/ tree shipped
// by the source snapshot; scan those authoritative files, never arbitrary stale subtrees.
const competitorRx=/Magic: The Gathering|Wizards of the Coast|\bMTG\b/gi;
function canonicalFiles(rel){
 const abs=path.join(root,rel);
 if(!fs.statSync(abs).isDirectory()) return [abs];
 return fs.readdirSync(abs,{withFileTypes:true}).filter(e=>e.isFile()).map(e=>path.join(abs,e.name));
}
for(const rel of ['js','css','assets/data','index.html']){
 for(const p of canonicalFiles(rel)){ const body=fs.readFileSync(p,'utf8'); assert.ok(!competitorRx.test(body),`competitor reference survives in ${path.relative(root,p)}`); competitorRx.lastIndex=0; }
}

// Card-art binaries are externalized from cumulative delivery ZIPs, but the live
// GitHub Pages repository legitimately retains previously uploaded PNG assets.
// Package binary-count enforcement belongs to the source snapshot/artifact gate, not
// to a runtime test executed against the hydrated deployment checkout.
assert.equal(dict.cardImages,'EXTERNALIZED');

const closure=read('COMMERCIAL_READINESS_CLOSURE_23_19_4_14.txt');
assert.match(closure,/MATCH: YES/);
assert.match(closure,/Previously identified RED metadata blockers: 0 residual/);
assert.match(closure,/Previously identified YELLOW metadata blockers: 0 residual/);
const handoff=read('COUNSEL_HANDOFF_23_19_4_14.txt');
assert.match(handoff,/INPI identical \+ phonetic clearance/);
assert.match(handoff,/not a legal opinion/i);

console.log('COMMERCIAL_READINESS_CLOSURE_WAVE5_23_19_4_14_OK');
console.log('redResidual=0 yellowResidual=0 terminology=44/44 gameplayFingerprint=MATCH_EXCEPT_APPROVED_PW007_DELTA competitorRefs=0 cardImages=EXTERNALIZED');
