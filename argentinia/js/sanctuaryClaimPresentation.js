// A receipt and its optional presentation refresh have separate outcomes.
export async function settleSanctuaryClaimPresentation(result,{refresh,inject,onWarning=()=>{}}={}){
  if(result?.granted!==true||!result.cardId)throw new Error('SANCTUARY_CLAIM_RESULT_INVALID');
  const card=result.card;
  let warning=result.presentationWarning===true||(card?.discoveryPresentation?.assetReady===true&&!/^https:\/\//i.test(String(card.runtimeImageUrl||'')));
  if(card&&String(card.id)===String(result.cardId)&&String(card.acquisition?.type||'').toLowerCase()==='discovery'){
    try{inject?.(card);}catch{warning=true;}
  }
  // The receipt's authorized card is enough to reveal. Do not wait for another
  // network request and never turn a committed receipt into a rejected promise.
  if(typeof refresh==='function')void Promise.resolve().then(refresh).catch(()=>onWarning());
  if(warning)onWarning();
  return {...result,presentationWarning:warning};
}

export function showSanctuaryClaimFailure(overlay,message){
  if(!overlay?.isConnected)return;
  let notice=overlay.querySelector('[data-sanctuary-claim-error]');
  if(!notice){
    notice=document.createElement('div');notice.dataset.sanctuaryClaimError='true';notice.setAttribute('role','alert');
    Object.assign(notice.style,{position:'absolute',left:'max(12px,env(safe-area-inset-left))',right:'max(12px,env(safe-area-inset-right))',bottom:'max(12px,env(safe-area-inset-bottom))',zIndex:'100',background:'#231622',border:'2px solid #e4b071',borderRadius:'10px',padding:'10px 12px',color:'#fff0d4',font:'600 clamp(11px,2.8vmin,15px)/1.35 system-ui',boxSizing:'border-box',display:'flex',alignItems:'center',gap:'10px',maxHeight:'42%',overflow:'auto'});
    const text=document.createElement('span');text.dataset.sanctuaryClaimErrorMessage='';text.style.flex='1';
    const close=document.createElement('button');close.type='button';close.textContent='Entendido';close.style.minHeight='36px';close.addEventListener('click',()=>notice.remove());
    notice.append(text,close);overlay.append(notice);
  }
  notice.querySelector('[data-sanctuary-claim-error-message]').textContent=String(message||'No se pudo completar el descubrimiento.');
}
