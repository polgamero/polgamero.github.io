// Owned play is separate from public publication and acquisition pools.
// No catalogue, grant, backend access or global enable switch lives here.
import {isDiscoveryCard,isDiscoveryCardId} from './discoveryCards.js';
import {parseCardVariantId} from './cardVariant.js';

export function ownedCardCopies(profile,id){
  return (Array.isArray(profile?.collection)?profile.collection:[]).reduce((n,value)=>n+(value===id?1:0),0);
}
export function isOwnedDiscoveryPlayable(card,profile,authorizedIds){
  return isDiscoveryCard(card)&&isDiscoveryCardId(card.id)&&authorizedIds?.has(String(card.id))===true&&ownedCardCopies(profile,card.id)>0;
}
export function printedCardCategory(card){
  const type=String(card?.type||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return [['criaturas','criatura'],['instantaneos','instantaneo'],['conjuros','conjuro'],['encantamientos','encantamiento'],['artefactos','artefacto'],['planeswalkers','planeswalker'],['planeswalkers','semidios'],['tierras','tierra']].find(([,word])=>type.includes(word))?.[0]||null;
}
export function ownedDiscoveryDeckIds(cardIds,profile,{getCard,authorizedIds,maxCopies=4}={}){
  const selected=[],counts=new Map();
  for(const raw of cardIds||[]){
    const variant=parseCardVariantId(raw),card=variant.valid?getCard?.(variant.baseId):null;
    if(!isDiscoveryCardId(variant.baseId)&&!isDiscoveryCard(card)&&!/^disc_\d/.test(String(raw)))continue;
    if(!variant.valid||!isOwnedDiscoveryPlayable(card,profile,authorizedIds)){
      const error=new Error('No se pudo verificar la carta descubrible y su propiedad. Volvé a cargar tu colección antes de jugar.');
      error.code='DISCOVERY_PLAY_OWNERSHIP_REQUIRED';throw error;
    }
    if(variant.evolutionStage>0){const error=new Error('Las cartas descubribles no pueden evolucionar.');error.code='DISCOVERY_EVOLUTION_FORBIDDEN';throw error;}
    counts.set(variant.baseId,(counts.get(variant.baseId)||0)+1);selected.push(raw);
  }
  for(const [id,count] of counts){
    if(count>maxCopies||count>ownedCardCopies(profile,id)){
      const error=new Error('El mazo excede las copias descubribles que poseés o el límite de copias.');
      error.code='DISCOVERY_PLAY_COPY_LIMIT';throw error;
    }
  }
  return selected;
}

// A revealed card includes its real game rules/art, never the Admin's notes,
// private clue mapping or Storage object/upload metadata. Leave other cards alone.
export function discoveryCardForPlay(card){
  if(!card||(!isDiscoveryCard(card)&&!isDiscoveryCardId(card.id)))return card;
  const out={...card};
  for(const key of ['adminNote','adminNotes','publicClue','canonicalClue','gtin','barcode','referenceBucket','bucketMapping'])delete out[key];
  if(card.discovery)out.discovery={number:card.discovery.number??null,affinity:card.discovery.affinity??null};
  if(card.discoveryPresentation){
    const p=card.discoveryPresentation;
    out.discoveryPresentation={artLayout:p.artLayout||null,textLayout:p.textLayout||null,assetReady:p.assetReady===true};
  }
  return out;
}
export function discoverySafePublicValue(value,seen=new WeakMap()){
  if(!value||typeof value!=='object')return value;
  if(seen.has(value))return seen.get(value);
  if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)return value;
  const source=Array.isArray(value)?value:discoveryCardForPlay(value),out=Array.isArray(source)?[]:{};
  seen.set(value,out);
  for(const [key,item] of Object.entries(source))out[key]=discoverySafePublicValue(item,seen);
  return out;
}
