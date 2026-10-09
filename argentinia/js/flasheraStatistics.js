// Stage39: summary of server-owned profiles available exclusively in Admin views.
import { reconcileFlasheraCopies } from './flasheraContract.js';
import { parseCardVariantId } from './cardVariant.js';
const n=value=>Math.max(0,Math.floor(Number(value)||0));
export function flasheraPlayerSnapshot(profile={}){
  let owned=0; const unique=new Set();
  for(const [stateId,qtyRaw] of Object.entries(reconcileFlasheraCopies(profile))){
    const parsed=parseCardVariantId(stateId),qty=n(qtyRaw);
    if(parsed.valid&&qty){owned+=qty;unique.add(parsed.baseId);}
  }
  return {flasherasOwned:owned,uniqueFlasheras:unique.size};
}
export function flasheraCommunitySnapshot(profiles=[]){
  const cards=new Map(),players=new Set();let total=0;
  for(const p of profiles){
    if(!p || typeof p!=='object')continue;
    const uid=String(p.uid||p.id||'');
    const copies=reconcileFlasheraCopies(p);let playerOwned=0;
    for(const [id,raw] of Object.entries(copies)){
      const parsed=parseCardVariantId(id),qty=n(raw);
      if(!parsed.valid||!qty)continue;
      playerOwned+=qty;total+=qty;cards.set(parsed.baseId,(cards.get(parsed.baseId)||0)+qty);
    }
    if(playerOwned&&uid)players.add(uid);
  }
  const top=[...cards].map(([cardId,copies])=>({cardId,copies})).sort((a,b)=>b.copies-a.copies||a.cardId.localeCompare(b.cardId)).slice(0,10);
  return {flasherasInCirculation:total,playersWithFlasheras:players.size,communityUniqueFlasheras:cards.size,top};
}
