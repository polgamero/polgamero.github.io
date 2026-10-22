import {ART_LAYOUT_DEFAULT,ART_LAYOUT_SCHEMA_VERSION,normalizeArtLayout} from './artLayout.js';
import {TEXT_LAYOUT_DEFAULT,TEXT_LAYOUT_SCHEMA_VERSION,normalizeCardTextLayout} from './textLayout.js';
import {isDiscoveryCardId} from './discoveryCards.js';
export const BACKUP_FORMAT='argentinia-presentation-backup';
const record=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function presentationSpec(kind){
  if(kind==='art')return {documentId:'artLayouts',schemaVersion:ART_LAYOUT_SCHEMA_VERSION,defaults:ART_LAYOUT_DEFAULT,normalize:normalizeArtLayout,field:'artLayout'};
  if(kind==='text')return {documentId:'textLayouts',schemaVersion:TEXT_LAYOUT_SCHEMA_VERSION,defaults:TEXT_LAYOUT_DEFAULT,normalize:normalizeCardTextLayout,field:'textLayout'};
  throw Error('Tipo de respaldo desconocido.');
}
export function validatePresentationLayouts(kind,layouts,{privateScope=false}={}){
  if(!record(layouts)||Object.keys(layouts).length>10000)throw Error('Mapa de ajustes inválido.');
  const spec=presentationSpec(kind),result={};
  for(const [id,layout] of Object.entries(layouts)){
    if(!/^[A-Za-z0-9_-]{1,80}(?:::(?:evo1|evo2))?(?:::(?:front|back))?$/.test(id)||['__proto__','constructor','prototype'].includes(id))throw Error('Identificador de carta inválido: '+id);
    if(privateScope?!/^disc_\d{3}$/.test(id):isDiscoveryCardId(id))throw Error('Ámbito incorrecto para '+id);
    if(!record(layout)||!Object.keys(layout).length||Object.keys(layout).some(key=>!Object.hasOwn(spec.defaults,key)||typeof layout[key]!=='number'||!Number.isFinite(layout[key])))throw Error('Campos de ajuste inválidos: '+id);
    const clean=spec.normalize(layout);
    if(Object.entries(layout).some(([key,value])=>Math.abs(clean[key]-value)>.00051))throw Error('Ajuste fuera de rango: '+id);
    result[id]=clean;
  }
  return result;
}
export const samePresentation=(kind,a,b)=>JSON.stringify(presentationSpec(kind).normalize(a))===JSON.stringify(presentationSpec(kind).normalize(b));
export function planPresentationImport(kind,current,incoming){
  const plan={added:0,changed:0,unchanged:0,publicPatch:{},privatePatch:{},before:{publicLayouts:{...current.publicLayouts},privateLayouts:{...current.privateLayouts}}};
  const defaults=presentationSpec(kind).defaults;
  for(const [scope,patchKey] of [['publicLayouts','publicPatch'],['privateLayouts','privatePatch']])for(const [id,layout] of Object.entries(incoming[scope])){
    const old=current[scope][id];
    if(samePresentation(kind,old,layout)){plan.unchanged++;continue;}
    if(!old||samePresentation(kind,old,defaults))plan.added++;else plan.changed++;
    plan[patchKey][id]=layout;
    // Explicit defaults in the before-copy undo newly introduced adjustments.
    if(!old)plan.before[scope][id]={...defaults};
  }
  return plan;
}
function canonical(value){return record(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;}
async function digest(payload){
  if(!globalThis.crypto?.subtle)throw Error('Abrí Admin con HTTPS o localhost para verificar el respaldo.');
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(payload))));
  return [...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function buildPresentationBackup(kind,state,source='server'){
  const payload={format:BACKUP_FORMAT,formatVersion:1,kind,layoutSchemaVersion:presentationSpec(kind).schemaVersion,exportedAt:new Date().toISOString(),serial:Date.now()+'-'+crypto.randomUUID(),source,
    publicLayouts:validatePresentationLayouts(kind,state.publicLayouts),privateLayouts:validatePresentationLayouts(kind,state.privateLayouts,{privateScope:true})};
  return {...payload,sha256:await digest(payload)};
}
export async function parsePresentationBackup(text,kind){
  if(typeof text!=='string'||text.length>5*1024*1024)throw Error('El archivo supera 5 MB o está vacío.');
  const file=JSON.parse(text);
  const allowed=['format','formatVersion','kind','layoutSchemaVersion','exportedAt','serial','source','publicLayouts','privateLayouts','sha256'];
  if(!record(file)||Object.keys(file).some(key=>!allowed.includes(key))||file.format!==BACKUP_FORMAT||file.formatVersion!==1||file.kind!==kind||file.layoutSchemaVersion!==presentationSpec(kind).schemaVersion)throw Error('Este archivo no es un respaldo compatible de '+(kind==='art'?'imágenes':'textos')+'.');
  const {sha256,...payload}=file;
  if(typeof sha256!=='string'||sha256!==await digest(payload))throw Error('El respaldo está incompleto o fue modificado (SHA-256).');
  return {...file,publicLayouts:validatePresentationLayouts(kind,file.publicLayouts),privateLayouts:validatePresentationLayouts(kind,file.privateLayouts,{privateScope:true})};
}
