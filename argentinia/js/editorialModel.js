// Versioned editorial documents. Data only: no HTML, CSS, scripts or remote uploads.
export const EDITORIAL_VERSION = 1;
export const EDITORIAL_MAX_BYTES = 700000;
export const EDITORIAL_ZONES = Object.freeze({main:'Menú principal',sanctuary:'Santuario',decks:'Mis mazos',chest:'Mi cofre',workshop:'Mi taller',encyclopedia:'Enciclopedia',store:'Tienda',market:'Mercado de pases',tournament:'Torneo',multiplayer:'Multijugador',achievements:'Mis logros'});
export const EDITORIAL_TOUR_STEPS=Object.freeze({welcome:'Bienvenida',profile:'Perfil',wallet:'Monedas',support:'Soporte',options:'Opciones',play:'Partida simple',tournament:'Torneo',multiplayer:'Multijugador',today:'Hoy en Argentinia',news:'Noticias',manual:'Cómo jugar',decks:'Mis mazos',chest:'Mi cofre',workshop:'Mi taller',encyclopedia:'Enciclopedia',store:'Tienda',market:'Mercado de pases',ranking:'Ranking global'});
export const editorialId = () => globalThis.crypto?.randomUUID?.() || `ed_${Date.now()}_${Math.random().toString(36).slice(2)}`;
export const isEditorialVisible=(ann,snapshot)=>ann?.contentKind!=='tutorial'&&(!ann?.linkedEventId||snapshot?.activeEvents?.some(e=>e.id===ann.linkedEventId));
const number=(v,f,min,max)=>Math.min(max,Math.max(min,Number.isFinite(Number(v))?Number(v):f));
const color=(v,f)=>/^#[a-f\d]{6}$/i.test(String(v))?String(v):f;
const text=(v,max)=>String(v??'').slice(0,max);
export function editorialAsset(value) {
  const v=String(value||'').trim();
  if(/^data:image\/(?:png|jpeg|webp);base64,[a-z\d+/=]+$/i.test(v)&&v.length<=350000)return v;
  if(/^\.\/assets\/images\/(?:ui|menu|tutorials)\/[a-z\d_ .-]+\.(?:png|jpg|jpeg|webp)$/i.test(v)&&!v.includes('..'))return v;
  return '';
}
function rect(v={},base={x:8,y:12,w:84,h:24}) {
  const x=number(v.x,base.x,0,95),y=number(v.y,base.y,0,95);
  return {x,y,w:number(v.w,base.w,5,100-x),h:number(v.h,base.h,5,100-y)};
}
export function normalizeRuns(runs=[]) {
  const out=[];let budget=12000;
  for(const r of (Array.isArray(runs)?runs:[]).slice(0,128)) {
    const value=text(r?.text,budget);budget-=value.length;if(!value)continue;
    const run={text:value,bold:r.bold===true,italic:r.italic===true};
    const prev=out.at(-1);
    if(prev&&prev.bold===run.bold&&prev.italic===run.italic)prev.text+=run.text;else out.push(run);
  }
  return out.length?out:[{text:'',bold:false,italic:false}];
}
export function normalizeEditorial(value) {
  if(!value||value.version!==EDITORIAL_VERSION||!Array.isArray(value.pages)||!value.pages.length)throw Error('El diseño editorial no tiene un formato compatible.');
  const pageIds=new Set(),blockIds=new Set();
  const pages=value.pages.slice(0,8).map(p=>{
    let id=text(p.id,80)||editorialId();if(pageIds.has(id))id=editorialId();pageIds.add(id);
    return {id,name:text(p.name||'Página',80),background:{color:color(p.background?.color,'#0c1811'),image:editorialAsset(p.background?.image),shade:number(p.background?.shade,.35,0,.85)},blocks:(Array.isArray(p.blocks)?p.blocks:[]).slice(0,40).map(b=>{
      let blockId=text(b.id,80)||editorialId();if(blockIds.has(blockId))blockId=editorialId();blockIds.add(blockId);
      const type=b.type==='image'?'image':'text';
      const base={id:blockId,type,...rect(b),mobile:rect(b.mobile||b),opacity:number(b.opacity,1,.1,1)};
      return type==='image'?{...base,src:editorialAsset(b.src),alt:text(b.alt||'Ilustración',200),fit:b.fit==='cover'?'cover':'contain'}:
        {...base,runs:normalizeRuns(b.runs),fontSize:number(b.fontSize,28,12,96),color:color(b.color,'#f4e8c7'),align:['left','center','right'].includes(b.align)?b.align:'left',background:color(b.background,'#0c1811'),panel:b.panel===true};
    })};
  });
  const result={version:EDITORIAL_VERSION,pages};
  if(new TextEncoder().encode(JSON.stringify(result)).length>EDITORIAL_MAX_BYTES)throw Error('El diseño supera 700 KB. Reducí las imágenes o la cantidad de páginas.');
  return result;
}
export function legacyEditorial(ann={}) {
  const blocks=[];
  const add=(s,y,h,size,bold=false)=>{if(s)blocks.push({id:editorialId(),type:'text',x:7,y,w:86,h,fontSize:size,runs:[{text:String(s),bold}],color:bold?'#f5d777':'#f4e8c7'});};
  add(ann.title||'Bienvenido a Argentinia',8,18,38,true);
  add(ann.subtitle||'',28,12,23);
  add((ann.paragraphs||[ann.text||'Creá tu anuncio con texto e imágenes.']).join('\n\n'),43,49,24);
  return normalizeEditorial({version:1,pages:[{id:editorialId(),name:'Página 1',background:{color:'#0c1811',image:ann.imageFilename?`./assets/images/ui/${ann.imageFilename}`:'',shade:.5},blocks}]});
}
export function editorialFor(ann={}) {
  try{return ann.presentation?normalizeEditorial(ann.presentation):legacyEditorial(ann);}catch{return legacyEditorial(ann);}
}
export function editorialSummary(presentation) {
  let remaining=6000;
  return normalizeEditorial(presentation).pages.flatMap(p=>p.blocks.filter(b=>b.type==='text').map(b=>b.runs.map(r=>r.text).join(''))).filter(Boolean).map(value=>{const result=value.slice(0,remaining);remaining-=result.length;return result;}).filter(Boolean);
}
export function formatEditorialRuns(runs,start,end,mark) {
  const safe=normalizeRuns(runs),length=safe.reduce((n,r)=>n+r.text.length,0);
  start=Math.max(0,Math.min(length,start));end=Math.max(start,Math.min(length,end));
  if(start===end){start=0;end=length;}
  let offset=0;const selected=safe.filter(r=>{const hit=offset<end&&offset+r.text.length>start;offset+=r.text.length;return hit;});
  const enabled=!selected.every(r=>r[mark]);offset=0;const out=[];
  for(const r of safe){const from=Math.max(0,start-offset),to=Math.min(r.text.length,end-offset);
    if(from<to){if(from)out.push({...r,text:r.text.slice(0,from)});out.push({...r,text:r.text.slice(from,to),[mark]:enabled});if(to<r.text.length)out.push({...r,text:r.text.slice(to)});}
    else out.push(r);offset+=r.text.length;
  }
  return normalizeRuns(out);
}
