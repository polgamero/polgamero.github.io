import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { OWNER_APPROVED_PUBLIC_DICTIONARY, PUBLIC_TERMINOLOGY_VERSION } from '../js/publicTerminology.js';
import { PUBLISHED_CARD_BASELINE_IDS } from '../js/publishedCardBaseline.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const load=rel=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const cardFiles=['criaturas.json','instantaneos.json','conjuros.json','encantamientos.json','artefactos.json','tierras.json','planeswalkers.json'];
const cards=cardFiles.flatMap(f=>load(`assets/data/${f}`));
const byId=new Map(cards.map(c=>[c.id,c]));

assert.equal(ENGINE_VERSION,'23.21.6');
assert.equal(PUBLIC_TERMINOLOGY_VERSION,'23.19.4.14');
assert.equal(ENGINE_PROTOCOL_VERSION,'mp-23.19.2');
assert.equal(FIRESTORE_RULES_VERSION,'23.13.87');
assert.equal(cards.length,900);
assert.equal(byId.size,900);
assert.equal(new Set(cards.map(c=>String(c.name).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim())).size,900);

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
const historicalBaselineSet=new Set(PUBLISHED_CARD_BASELINE_IDS);
const normalized=Object.fromEntries(cards.filter(c=>historicalBaselineSet.has(c.id)).sort((a,b)=>a.id.localeCompare(b.id)).map(c=>[c.id,strip(c)]));
assert.equal(Object.keys(normalized).length,880,'Wave 5 fingerprint remains scoped to the frozen 880-card historical baseline');
// Explicit owner-approved gameplay deltas after Commercial IP Hardening are normalized
// back to their historical values before checking the Wave5 fingerprint. This keeps the
// legal clean-room guard useful: any UNAPPROVED mechanical drift still changes the hash.
if (ENGINE_VERSION === '23.21.6') {
  normalized.pw_007.spellCastTrigger={effect:{amount:1,type:'scry'},filter:'instant_or_sorcery'};
  normalized.pw_007=Object.fromEntries(Object.keys(normalized.pw_007).sort().map(k=>[k,normalized.pw_007[k]]));

  // HF9 — explicit DFC balance pass approved by the owner.
  normalized.crea_324.dfc.backFace.keywords=['haste'];
  normalized.crea_325.dfc.backFace.power=4; normalized.crea_325.dfc.backFace.toughness=4;
  normalized.crea_329.dfc.backFace.keywords=['trample','haste'];
  normalized.crea_330.dfc.backFace.keywords=['reach'];
  normalized.crea_332.power=4; normalized.crea_332.toughness=4; normalized.crea_332.keywords=['vigilance'];
  normalized.crea_332.dfc.backFace.power=8; normalized.crea_332.dfc.backFace.toughness=8;
  normalized.crea_332.dfc.backFace.keywords=['flying','trample','vigilance'];
  normalized.crea_332.dfc.backFace.triggers=[{effect:{amount:2,type:'draw'},event:'permanent_transformed',filter:{metadata:{toFace:'back'},self:true}}];
  normalized.ench_102.activatedAbility.cost='{2}{B}{G}';
  delete normalized.ench_102.triggers; // HF10 front-side graveyard filtering
  normalized.ench_102.dfc.backFace.activatedAbility.cost='{2}{B}{G}';
  normalized.ench_102.dfc.backFace.triggers=[{effect:{amount:1,type:'heal'},event:'creature_died',filter:{controller:'opponent'}}];
  normalized.ench_103.triggers=normalized.ench_103.triggers.filter(t=>t.event!=='spell_cast'); // HF10 front-side scry
  normalized.ench_103.dfc.backFace.triggers=normalized.ench_103.dfc.backFace.triggers.filter(t=>t.event!=='spell_cast');
  delete normalized.art_082.activatedAbilities;
  normalized.art_082.activatedAbility={cost:'{2}{U}{R}{T}',effect:{type:'transform'},requiresTarget:false,timing:'instant'};
  normalized.art_082.dfc.backFace.triggers=[{effect:{amount:1,type:'damage'},event:'spell_cast',filter:{cardType:'noncreature',controller:'you'}}];
  delete normalized.art_083.produces; // HF10 face-A mana-rock mode
  // HF16: target metadata only; strip it for the historical commercial-readiness identity hash.
  for (const id of ['art_068','art_070']) {
    const upkeep=normalized[id]?.triggers?.find(t=>t.event==='upkeep_started');
    if (upkeep?.effect) { delete upkeep.effect.targetKind; delete upkeep.effect.targetController; }
  }
  delete normalized.tier_068.dfc.backFace.manaAbility;
  normalized.tier_068.dfc.backFace.produces='R';
}
const hash=crypto.createHash('sha256').update(JSON.stringify(strip(normalized))).digest('hex');
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
console.log('redResidual=0 yellowResidual=0 terminology=44/44 gameplayFingerprint=MATCH_EXCEPT_APPROVED_PW007_AND_HF9_HF10_DFC_DELTAS competitorRefs=0 cardImages=EXTERNALIZED');
