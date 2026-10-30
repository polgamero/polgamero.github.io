import {normalizeRuns, formatEditorialRuns, editorialId} from './vendor/editorialModel.js';
export {formatEditorialRuns, editorialId};
export const ARTICLE_VERSION=2, ARTICLE_MAX_BYTES=180000, MEDIA_MAX_BYTES=350000;
const slugPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const mediaPattern=/^[a-f0-9]{64}$/;
export class EditorialError extends Error {constructor(code,message=code){super(message);this.code=code;}}
export function canonicalJSON(value){return JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);}
export function fail(code,message){throw new EditorialError(code,message);}
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)!==Array.prototype;
function keys(v,allowed,required=allowed){if(!object(v)||Object.keys(v).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(v,k)))fail('INVALID_DOCUMENT','El documento contiene campos desconocidos o incompletos.');}
function string(v,max,name,{empty=false}={}){if(typeof v!=='string'||v.length>max||(!empty&&!v.trim()))fail('INVALID_DOCUMENT',`Revisá ${name}.`);return v;}
function array(v,max,name,min=0){if(!Array.isArray(v)||v.length>max||v.length<min)fail('INVALID_DOCUMENT',`Revisá ${name}.`);return v;}
export function slug(v,max=120){string(v,max,'la URL');if(!slugPattern.test(v))fail('INVALID_SLUG','La URL admite letras minúsculas, números y guiones.');return v;}
export function isoDate(v){const d=typeof v==='string'?new Date(v+'T00:00:00Z'):null;if(!d||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v)fail('INVALID_DATE','Revisá la fecha.');return v;}
export function httpsUrl(v){string(v,1500,'la fuente');let u;try{u=new URL(v);}catch{fail('INVALID_URL','La fuente necesita una URL HTTPS completa.');}if(u.protocol!=='https:'||!u.hostname||u.username||u.password||/[\u0000-\u0020\\]/.test(v))fail('INVALID_URL','La fuente necesita una URL HTTPS sin credenciales.');return v;}
function image(v,type=true){keys(v,type?['type','mediaId','alt','caption','credit','rights']:['mediaId','alt','caption','credit','rights']);if(!mediaPattern.test(v.mediaId))fail('INVALID_MEDIA','La imagen no tiene una referencia válida.');return {...(type?{type:'image'}:{}),mediaId:v.mediaId,alt:string(v.alt,300,'la descripción de imagen',{empty:true}),caption:string(v.caption,600,'el epígrafe',{empty:true}),credit:string(v.credit,300,'el crédito',{empty:true}),rights:string(v.rights,500,'los derechos',{empty:true})};}
export function normalizeArticle(raw,{publish=false}={}){
  keys(raw,['version','id','slug','title','excerpt','author','preparedOn','region','tags','sources','sections','cover']);
  if(raw.version!==ARTICLE_VERSION)fail('INVALID_VERSION','El artículo usa otra versión de formato.');
  const result={version:ARTICLE_VERSION,id:slug(raw.id,80),slug:slug(raw.slug),title:string(raw.title,160,'el título'),excerpt:string(raw.excerpt,340,'el extracto',{empty:!publish}),author:string(raw.author,160,'la autoría'),preparedOn:isoDate(raw.preparedOn),region:string(raw.region,100,'la región',{empty:!publish}),tags:array(raw.tags,8,'las etiquetas').map(t=>string(t,50,'la etiqueta')),sources:[],sections:[],cover:raw.cover===null?null:image(raw.cover,false)};
  if(new Set(result.tags).size!==result.tags.length)fail('INVALID_DOCUMENT','Hay etiquetas repetidas.');
  const sourceIds=new Set();
  for(const s of array(raw.sources,40,'las fuentes',publish?1:0)){
    keys(s,['id','title','url','accessedOn','note']);const id=slug(s.id,80);if(sourceIds.has(id))fail('DUPLICATE_ID','Hay fuentes repetidas.');sourceIds.add(id);
    result.sources.push({id,title:string(s.title,500,'el título de la fuente',{empty:!publish}),url:publish?httpsUrl(s.url):string(s.url,1500,'la fuente',{empty:true}),accessedOn:isoDate(s.accessedOn),note:string(s.note,600,'la nota de la fuente',{empty:true})});
  }
  const sectionIds=new Set();let prose=0;
  for(const s of array(raw.sections,40,'las secciones',1)){
    keys(s,['id','title','blocks']);const id=slug(s.id,80);if(sectionIds.has(id)||['contenido','fuentes','related-title'].includes(id)||id.startsWith('fuente-'))fail('DUPLICATE_ID','Hay identificadores de sección repetidos o reservados.');sectionIds.add(id);
    const section={id,title:string(s.title,200,'el título de sección'),blocks:[]};
    for(const b of array(s.blocks,40,'los bloques',1)){
      if(b?.type==='paragraph'){
        keys(b,['type','text','runs','sources'],['type','text']);const text=string(b.text,12000,'el párrafo',{empty:true});const runs=normalizeRuns(b.runs??[{text,bold:false,italic:false}]);
        if(runs.map(r=>r.text).join('')!==text)fail('INVALID_RUNS','El formato y el texto del párrafo no coinciden.');
        const sources=array(b.sources??[],40,'las referencias');if(sources.some(id=>!sourceIds.has(id))||new Set(sources).size!==sources.length)fail('UNKNOWN_SOURCE','Hay referencias a fuentes inexistentes o repetidas.');
        section.blocks.push({type:'paragraph',text,runs,sources:[...sources]});prose+=text.trim().length;
      }else if(b?.type==='list'){
        keys(b,['type','items']);const items=array(b.items,30,'la lista',1).map(t=>string(t,2000,'el elemento de lista'));section.blocks.push({type:'list',items});prose+=items.join('').length;
      }else if(b?.type==='image')section.blocks.push(image(b));
      else fail('INVALID_BLOCK','El bloque no tiene un formato compatible.');
    }
    result.sections.push(section);
  }
  const images=[...(result.cover?[result.cover]:[]),...result.sections.flatMap(s=>s.blocks.filter(b=>b.type==='image'))];
  if(images.length>20)fail('TOO_MANY_IMAGES','Usá hasta 20 imágenes por artículo.');
  if(publish&&(prose<80||result.title.trim().length<5||result.excerpt.trim().length<20))fail('INCOMPLETE_ARTICLE','Completá título, extracto y contenido antes de publicar.');
  if(publish&&images.some(i=>!i.alt.trim()||!i.credit.trim()||!i.rights.trim()))fail('INCOMPLETE_MEDIA','Cada imagen necesita descripción, crédito y derechos.');
  if(new TextEncoder().encode(JSON.stringify(result)).length>ARTICLE_MAX_BYTES)fail('DOCUMENT_TOO_LARGE','El texto supera el tamaño permitido.');
  return result;
}
export function articleMedia(article){return [...new Set([...(article.cover?[article.cover.mediaId]:[]),...article.sections.flatMap(s=>s.blocks.filter(b=>b.type==='image').map(b=>b.mediaId))])];}
export function editParagraph(runs,next){
  const original=normalizeRuns(runs),before=original.map(r=>r.text).join('');let start=0,end=0;
  while(start<before.length&&start<next.length&&before[start]===next[start])start++;
  while(end<before.length-start&&end<next.length-start&&before[before.length-1-end]===next[next.length-1-end])end++;
  const slice=(from,to)=>{let offset=0;return original.flatMap(r=>{const a=Math.max(0,from-offset),b=Math.min(r.text.length,to-offset);offset+=r.text.length;return b>a?[{...r,text:r.text.slice(a,b)}]:[];});};
  let offset=0,mark=original[0];for(const r of original){if(offset>=start)break;mark=r;offset+=r.text.length;}
  const inserted=next.slice(start,next.length-end);return normalizeRuns([...slice(0,start),...(inserted?[{text:inserted,bold:mark?.bold===true,italic:mark?.italic===true}]:[]),...slice(before.length-end,before.length)]);
}
export function fromLegacy(raw){const {status,...v}=raw;return normalizeArticle({...v,version:2,cover:null});}
export function newArticle(){const id=editorialId().toLowerCase(),d=new Date(),today=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');return normalizeArticle({version:2,id,slug:'entrada-'+id.slice(0,8),title:'Nueva entrada',excerpt:'',author:'ARGENTINIA — Magia y Leyenda',preparedOn:today,region:'',tags:[],sources:[],sections:[{id:'inicio',title:'Para empezar',blocks:[{type:'paragraph',text:''}]}],cover:null});}
