// 23.21.3 RC3 — catálogo visual dinámico de emotes multiplayer.
// El servidor es la autoridad de active/premium/precio. Este módulo conserva únicamente
// un fallback bundled para arranque/offline y aplica snapshots provenientes de Functions.

export const EMOTE_ASSET_BASE = './assets/images/emotes';
export const EMOTE_AUDIO_BASE = './assets/sounds/sfx/emotes';
export const EMOTE_CATALOG_MAX = 128;
export const EMOTE_ANIMATIONS = Object.freeze(['none','pop','bounce','shake','float','pulse']);

const DEFAULTS = [
  { id:'emote_001', label:'Mate',       image:'emote_001', audio:'', fallback:'🧉', premium:false, pricePoints:0,   animation:'pop',    active:true },
  { id:'emote_002', label:'Aplausos',   image:'emote_002', audio:'', fallback:'👏', premium:false, pricePoints:0,   animation:'bounce', active:true },
  { id:'emote_003', label:'Risa',       image:'emote_003', audio:'', fallback:'😂', premium:false, pricePoints:0,   animation:'shake',  active:true },
  { id:'emote_004', label:'Sorpresa',   image:'emote_004', audio:'', fallback:'😱', premium:false, pricePoints:0,   animation:'pop',    active:true },
  { id:'emote_005', label:'Enojo',      image:'emote_005', audio:'', fallback:'😤', premium:false, pricePoints:0,   animation:'shake',  active:true },
  { id:'emote_006', label:'Desafío',    image:'emote_006', audio:'', fallback:'😏', premium:false, pricePoints:0,   animation:'float',  active:true },
  { id:'emote_007', label:'Fuego',      image:'emote_007', audio:'', fallback:'🔥', premium:true,  pricePoints:250, animation:'pulse',  active:true },
  { id:'emote_008', label:'Corona',     image:'emote_008', audio:'', fallback:'👑', premium:true,  pricePoints:350, animation:'float',  active:true },
  { id:'emote_009', label:'Calavera',   image:'emote_009', audio:'', fallback:'💀', premium:true,  pricePoints:350, animation:'shake',  active:true },
  { id:'emote_010', label:'Rayos',      image:'emote_010', audio:'', fallback:'⚡', premium:true,  pricePoints:400, animation:'pulse',  active:true },
  { id:'emote_011', label:'Fantasma',   image:'emote_011', audio:'', fallback:'👻', premium:true,  pricePoints:450, animation:'float',  active:true },
  { id:'emote_012', label:'Trofeo',     image:'emote_012', audio:'', fallback:'🏆', premium:true,  pricePoints:500, animation:'bounce', active:true }
];

function freezeRows(rows){ return Object.freeze(rows.map(row=>Object.freeze({...row}))); }
export let EMOTE_CATALOG_VERSION = '23.21.3-defaults';
export let EMOTE_CATALOG = freezeRows(DEFAULTS);
let BY_ID = new Map(EMOTE_CATALOG.map(row=>[row.id,row]));

function safeId(value){ return String(value||'').trim().replace(/[^A-Za-z0-9_-]/g,'').slice(0,64); }
function safeAsset(value){ const raw=String(value||'').trim().slice(0,120); return /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(raw)&&!raw.includes('..')?raw:''; }
function normalizeRow(raw={}){
  const id=safeId(raw.id); if(!id) return null;
  const premium=raw.premium===true;
  const animation=EMOTE_ANIMATIONS.includes(String(raw.animation||'pop').toLowerCase())?String(raw.animation||'pop').toLowerCase():'pop';
  return {
    id,
    label:String(raw.label||raw.name||id).trim().slice(0,40)||id,
    image:safeAsset(raw.image)||id,
    audio:safeAsset(raw.audio),
    fallback:String(raw.fallback||'🙂').trim().slice(0,16)||'🙂',
    animation,
    active:raw.active!==false,
    premium,
    pricePoints:premium?Math.max(1,Math.min(100000,Math.floor(Number(raw.pricePoints)||0))):0
  };
}

export function applyEmoteCatalogSnapshot(snapshot){
  const rawItems=Array.isArray(snapshot?.items)?snapshot.items:[];
  const seen=new Set(); const rows=[];
  for(const raw of rawItems.slice(0,EMOTE_CATALOG_MAX)){
    const row=normalizeRow(raw); if(!row||seen.has(row.id)) continue; seen.add(row.id); rows.push(row);
  }
  if(!rows.length) return false;
  EMOTE_CATALOG=freezeRows(rows); BY_ID=new Map(EMOTE_CATALOG.map(row=>[row.id,row]));
  EMOTE_CATALOG_VERSION=String(snapshot?.catalogVersion||'23.21.3-authority').slice(0,96);
  return true;
}

export function resetEmoteCatalogDefaults(){ EMOTE_CATALOG=freezeRows(DEFAULTS); BY_ID=new Map(EMOTE_CATALOG.map(row=>[row.id,row])); EMOTE_CATALOG_VERSION='23.21.3-defaults'; }
export function getEmoteDefinition(id){ return BY_ID.get(String(id||''))||null; }
export function freeEmoteIds(){ return EMOTE_CATALOG.filter(e=>e.active&&!e.premium).map(e=>e.id); }
export function normalizeOwnedEmoteIds(profile=null){
  const raw=profile?.cosmetics?.emotes; const owned=new Set(Array.isArray(raw)?raw.map(String):[]);
  for(const id of freeEmoteIds()) owned.add(id); return owned;
}
function candidateUrls(base, asset, extensions){
  const safe=safeAsset(asset); if(!safe) return [];
  if(/\.[A-Za-z0-9]{2,5}$/.test(safe)) return [`${base}/${safe}`];
  return extensions.map(ext=>`${base}/${safe}.${ext}`);
}
export function emoteAssetCandidates(defOrId){
  const def=typeof defOrId==='object'?defOrId:getEmoteDefinition(defOrId);
  const asset=def?.image||safeId(defOrId); return candidateUrls(EMOTE_ASSET_BASE,asset,['webp','gif','png']);
}
export function emoteAudioCandidates(defOrId){
  const def=typeof defOrId==='object'?defOrId:getEmoteDefinition(defOrId); return candidateUrls(EMOTE_AUDIO_BASE,def?.audio,['opus','mp3','wav']);
}
