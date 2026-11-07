// Presentation renewal only. Never grants inventory, casts, passes priority or
// publishes game state. Known opponent definitions are not injected into cardDb.
import {cardDb} from './cardLoader.js';
import {refreshDiscoveryCardsForPlay} from './firebaseClient.js';
import {isDiscoveryCard,isDiscoveryCardId} from './discoveryCards.js';
import {ownedCardCopies} from './discoveryPlayability.js';
import {applyArtLayoutToImage} from './artLayout.js';
import {applyCardTextLayoutToBox} from './textLayout.js';

let epoch=0,key='',pending=null,lastAttempt=0,lastSuccess=0,lastSignature='',retry=null,retries=0;
let trailing=null,queued=null;
let revealedOffer=null;
function scheduleRefresh(state,stack,force){
  const requestedEpoch=epoch,uid=state?.currentUser?.uid,matchId=state?.currentMatch?.matchId||'';
  clearTimeout(trailing);
  trailing=setTimeout(()=>{
    trailing=null;
    if(epoch===requestedEpoch&&state.currentUser?.uid===uid&&(state.currentMatch?.matchId||'')===matchId)void refreshDiscoveryPlayAssets(state,stack,{force});
  },Math.max(25,1500-(Date.now()-lastAttempt)));
}
export function trackDiscoveryRevealOffer(offer,node){
  revealedOffer=offer?.visibility==='reveal_candidates'&&node&&offer.candidates?.some(entry=>isDiscoveryCard(entry?.card)||isDiscoveryCardId(entry?.card?.id))?{offer,node}:null;
}
const publicZones=['localLands','rivalLands','localCombat','rivalCombat','localSupport','rivalSupport','localPlaneswalkers','rivalPlaneswalkers','localGraveyard','rivalGraveyard','localExile','rivalExile'];
function collect(value,out,seen=new WeakSet()){
  if(!value||typeof value!=='object'||seen.has(value))return;
  seen.add(value);
  if(value.faceDown===true||value.isFaceDown===true||value.hiddenFromOpponent===true)return;
  if((isDiscoveryCard(value)||isDiscoveryCardId(value.id))&&typeof value.type==='string')out.add(value);
  if(Array.isArray(value))for(const item of value)collect(item,out,seen);
  else for(const [name,item] of Object.entries(value))if(name!=='discoveryPresentation')collect(item,out,seen);
}
export function visibleDiscoveryCards(state,stack=[]){
  const out=new Set();for(const zone of publicZones)collect(state?.[zone],out);collect(stack,out);return [...out];
}
export function clearDiscoveryPlayAssets(){
  epoch++;key='';pending=null;lastAttempt=0;lastSuccess=0;lastSignature='';retries=0;revealedOffer=null;clearTimeout(retry);retry=null;
  clearTimeout(trailing);trailing=null;queued=null;
  if(typeof document!=='undefined')for(const node of document.querySelectorAll('[data-discovery-viewer-uid]')){
    const surface=node.closest('#deckbuilder-overlay,#encyclopedia-overlay,#mydecks-overlay,#workshop-overlay,#store-overlay,.deck-insights,.gy-modal-overlay,.private-zone-selection-overlay');
    if(surface)surface.remove();else node.remove();
  }
}
export async function refreshDiscoveryPlayAssets(state,stack=[],{force=false}={}){
  const uid=String(state?.currentUser?.uid||''),matchId=String(state?.currentMatch?.matchId||'');
  const currentKey=uid?uid+'|'+matchId:'';
  if(currentKey!==key){epoch++;key=currentKey;pending=null;lastAttempt=0;lastSuccess=0;lastSignature='';retries=0;clearTimeout(retry);retry=null;clearTimeout(trailing);trailing=null;queued=null;}
  if(!uid||!state?.userProfile)return false;
  const visible=visibleDiscoveryCards(state,stack);
  const offer=revealedOffer?.node?.isConnected?revealedOffer.offer:null;
  if(offer){const extra=new Set();collect(offer.candidates,extra);visible.push(...extra);}
  const revealOfferId=matchId&&offer?String(offer.requestId||''):'';
  const ownIds=[...new Set((state.userProfile.collection||[]).filter(id=>isDiscoveryCardId(id)))].sort();
  if(!ownIds.length&&(!matchId||!visible.length))return false;
  const revealCardIds=matchId?[...new Set(visible.filter(card=>ownedCardCopies(state.userProfile,card.id)>0).map(card=>card.id))].sort():[];
  const signature=JSON.stringify([ownIds,revealCardIds,visible.map(card=>card.id).sort(),revealOfferId]);
  const now=Date.now();if(pending){if(force||signature!==lastSignature)queued={state,stack,force:force||queued?.force===true};return pending;}
  if(!force&&signature===lastSignature&&now-lastSuccess<8*60*1000)return false;
  if(now-lastAttempt<1500){scheduleRefresh(state,stack,force);return false;}
  const requestEpoch=epoch;lastAttempt=now;lastSignature=signature;
  const stillCurrent=()=>epoch===requestEpoch&&state.currentUser?.uid===uid&&String(state.currentMatch?.matchId||'')===matchId;
  const task=(async()=>{
    try{
      const result=await refreshDiscoveryCardsForPlay({matchId,revealCardIds,revealOfferId});
      if(!stillCurrent())return false;
      const cards=[...(result?.ownedCards||[]),...(result?.matchCards||[])],byId=new Map(cards.map(card=>[card.id,card]));
      const instances=new Set(visible);collect(state.localHand,instances);collect(state.localDeck,instances);
      for(const card of instances){const next=byId.get(card.id);if(next&&!Object.isFrozen(card)){if(next.runtimeImageUrl)card.runtimeImageUrl=next.runtimeImageUrl;card.discoveryPresentation={artLayout:next.discoveryPresentation?.artLayout||null,textLayout:next.discoveryPresentation?.textLayout||null,assetReady:next.discoveryPresentation?.assetReady===true};}}
      if(typeof document!=='undefined'){
        for(const img of document.querySelectorAll('.card-art-image[data-card-art-id]')){
          const card=byId.get(img.dataset.cardArtId);if(!card)continue;
          if(card.runtimeImageUrl&&img.getAttribute('src')!==card.runtimeImageUrl){img.style.display='';img.src=card.runtimeImageUrl;}
          img.__argDiscoveryArtOverride=card.discoveryPresentation?.artLayout||{scale:1,x:0,y:0};
          applyArtLayoutToImage(img,img.dataset.cardArtId,img.__argDiscoveryArtOverride);
        }
        for(const box of document.querySelectorAll('.card-text-box[data-card-text-layout-id]')){
          const card=byId.get(box.dataset.cardTextLayoutId);if(!card)continue;
          box.__argDiscoveryTextOverride=card.discoveryPresentation?.textLayout||{};
          applyCardTextLayoutToBox(box,box.dataset.cardTextLayoutId,box.__argDiscoveryTextOverride);
        }
      }
      const waiting=Number(result?.pendingMatchCards)||0;
      if(waiting&&retries<3){retries++;clearTimeout(retry);retry=setTimeout(()=>{if(stillCurrent())void refreshDiscoveryPlayAssets(state,stack,{force:true});},1800);}
      else if(!waiting){lastSuccess=Date.now();retries=0;}
      else {lastSuccess=0;lastAttempt=Date.now()+13500;retries=0;}
      return true;
    }catch{return false;}
    finally{if(stillCurrent()&&pending===task){pending=null;const next=queued;queued=null;if(next)scheduleRefresh(next.state,next.stack,next.force);}}
  })();
  pending=task;return task;
}
