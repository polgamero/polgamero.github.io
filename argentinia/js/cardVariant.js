// Flasheras Stage26 — canonical physical-variant identity helpers for browser/runtime.
export const ENHANCED_CARD_SUFFIX = '::enhanced';
export const EVOLUTION_STAGE1_SUFFIX = '::evo1';
export const EVOLUTION_STAGE2_SUFFIX = '::evo2';
export const FLASHERA_CARD_SUFFIX = '::flashera';
export const CARD_VARIANT_STATES = Object.freeze(['base','enhanced','evo1','evo2']);
const BASE_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const clean = value => String(value || '').trim();

export function cardVariantId(baseId,{state='base',flashera=false}={}){
  const base=clean(baseId); const normalizedState=state==null?'base':String(state);
  if(!CARD_VARIANT_STATES.includes(normalizedState)||!base||!BASE_ID_RE.test(base)||base.includes('::')) return '';
  const stateSuffix=normalizedState==='enhanced'?ENHANCED_CARD_SUFFIX:normalizedState==='evo1'?EVOLUTION_STAGE1_SUFFIX:normalizedState==='evo2'?EVOLUTION_STAGE2_SUFFIX:'';
  return `${base}${stateSuffix}${flashera?FLASHERA_CARD_SUFFIX:''}`;
}
export function parseCardVariantId(rawId){
  const originalId=clean(rawId); if(!originalId)return{valid:false,id:'',canonicalId:'',baseId:'',state:'base',variant:'base',flashera:false,evolutionStage:0};
  let work=originalId,flashera=false;
  if(work.endsWith(FLASHERA_CARD_SUFFIX)){flashera=true;work=work.slice(0,-FLASHERA_CARD_SUFFIX.length);}
  let state='base',evolutionStage=0;
  if(work.endsWith(ENHANCED_CARD_SUFFIX)){state='enhanced';work=work.slice(0,-ENHANCED_CARD_SUFFIX.length);}
  else if(work.endsWith(EVOLUTION_STAGE2_SUFFIX)){state='evo2';evolutionStage=2;work=work.slice(0,-EVOLUTION_STAGE2_SUFFIX.length);}
  else if(work.endsWith(EVOLUTION_STAGE1_SUFFIX)){state='evo1';evolutionStage=1;work=work.slice(0,-EVOLUTION_STAGE1_SUFFIX.length);}
  const baseId=clean(work),canonicalId=cardVariantId(baseId,{state,flashera});
  const valid=!!canonicalId&&!baseId.includes('::')&&canonicalId===originalId;
  return{valid,id:valid?canonicalId:originalId,canonicalId:valid?canonicalId:'',baseId:valid?baseId:'',state:valid?state:'base',variant:valid?state:'base',flashera:valid?flashera:false,evolutionStage:valid?evolutionStage:0};
}
export function stateVariantId(rawId){const p=parseCardVariantId(rawId);return p.valid?cardVariantId(p.baseId,{state:p.state,flashera:false}):'';}
export function flasheraVariantId(rawId){const p=parseCardVariantId(rawId);return p.valid?cardVariantId(p.baseId,{state:p.state,flashera:true}):'';}
export function isFlasheraVariantId(rawId){return parseCardVariantId(rawId).flashera===true;}
