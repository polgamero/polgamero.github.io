import {validateDiscoveryAdminPng,describeDiscoveryUploadError,discoveryUploadError} from './discoveryArtUpload.js';

const PROGRESS={validate:'Validando el PNG…',authorize:'Solicitando autorización privada…',transfer:'Transfiriendo la imagen…',finalize:'Confirmando el vínculo con la carta…',refresh:'Actualizando la vista…',display:'Cargando el arte nuevo…'};

// The final preview must be decoded from the authorized server URL, not the local file.
export async function waitForDiscoveryArtImage(image,{timeoutMs=30000}={}){
  const failure=()=>Object.assign(new Error('No se pudo mostrar el arte guardado.'),{stage:'display',code:'DISCOVERY_ART_PREVIEW_FAILED'});
  if(!image)throw failure();
  await new Promise((resolve,reject)=>{
    let timer;
    const finish=ok=>{clearTimeout(timer);image.removeEventListener('load',loaded);image.removeEventListener('error',failed);ok?resolve():reject(failure());};
    const loaded=()=>finish(image.naturalWidth>0),failed=()=>finish(false);
    image.addEventListener('load',loaded,{once:true});image.addEventListener('error',failed,{once:true});
    timer=setTimeout(failed,timeoutMs);
    image.loading='eager';
    if(image.complete)queueMicrotask(loaded);
  });
  try{if(typeof image.decode==='function')await image.decode();}catch{throw failure();}
}

export function mountDiscoveryArtUploadControl(slot,card,{upload,onSaved}){
  const button=document.createElement('button');
  button.type='button';button.className='encyclopedia-discovery-upload-btn';button.textContent='🖼️';
  button.title='Subir o reemplazar PNG privado horizontal (hasta 12 MiB)';
  // A normal-flow row below the card stays independent of zoom and of PISTA's
  // expanded touch target. Do not solve intersecting controls through z-index.
  Object.assign(button.style,{position:'relative',top:'auto',left:'auto',right:'auto',bottom:'auto',marginTop:'8px'});
  button.setAttribute('aria-label',`Subir arte privado de ${card.name}`);
  const input=document.createElement('input');input.type='file';input.accept='image/png,.png';input.hidden=true;
  const status=document.createElement('div');status.dataset.discoveryUploadStatus='';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
  Object.assign(status.style,{font:'600 clamp(10px,4cqw,13px)/1.3 system-ui',color:'#30203e',overflowWrap:'anywhere',maxWidth:'100%',marginTop:'4px'});
  let busy=false;
  button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(!busy)input.click();});
  input.addEventListener('change',async()=>{
    const file=input.files?.[0];input.value='';if(!file||busy)return;
    busy=true;button.disabled=true;
    status.textContent=PROGRESS.validate;button.textContent='🖼️';
    const art=slot.querySelector(':scope > .card .card-art');
    const spinner=document.createElement('div');spinner.dataset.discoveryArtSpinner='';spinner.setAttribute('aria-hidden','true');
    Object.assign(spinner.style,{position:'absolute',inset:'0',zIndex:'20',display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(23,16,32,.86)',pointerEvents:'none'});
    const ring=document.createElement('span');Object.assign(ring.style,{width:'min(32px,45%)',aspectRatio:'1',border:'3px solid #d6afff',borderTopColor:'transparent',borderRadius:'50%',boxSizing:'border-box'});spinner.append(ring);
    art?.setAttribute('aria-busy','true');art?.append(spinner);
    const animation=matchMedia('(prefers-reduced-motion: reduce)').matches?null:ring.animate?.([{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}],{duration:850,iterations:Infinity});
    const previousFocus=document.activeElement;
    const overlay=document.createElement('div');overlay.dataset.discoveryUploadDialog='';
    Object.assign(overlay.style,{position:'fixed',inset:'0',zIndex:'10100',background:'rgba(0,0,0,.8)',display:'flex',alignItems:'center',justifyContent:'center',padding:'12px',boxSizing:'border-box'});
    const panel=document.createElement('section');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Carga de arte privado Discovery');panel.tabIndex=-1;
    Object.assign(panel.style,{width:'min(600px,96vw)',maxHeight:'90vh',overflow:'auto',padding:'20px',boxSizing:'border-box',border:'2px solid #c186ff',borderRadius:'14px',background:'#171020',color:'#eee3ca',font:'16px/1.45 system-ui'});
    const title=document.createElement('h2');title.textContent='Arte privado Discovery';title.style.margin='0 0 10px';
    const requirements=document.createElement('p');requirements.textContent='PNG horizontal, hasta 12 MiB. El encuadre se ajusta después con el lápiz.';
    const message=document.createElement('p');message.setAttribute('role','status');message.setAttribute('aria-live','polite');message.textContent=PROGRESS.validate;
    const detail=document.createElement('p');Object.assign(detail.style,{fontSize:'13px',overflowWrap:'anywhere',color:'#e0bf70'});
    const close=document.createElement('button');close.type='button';close.textContent='Cerrar';close.disabled=true;
    Object.assign(close.style,{minHeight:'42px',padding:'8px 24px',borderRadius:'8px',background:'#34233e',border:'1px solid #c186ff',color:'#fff',font:'inherit',cursor:'pointer'});
    const dismiss=()=>{if(busy)return;overlay.remove();if(previousFocus?.isConnected)previousFocus.focus();};
    close.addEventListener('click',dismiss);
    overlay.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismiss();}
      if(event.key==='Tab'){event.preventDefault();(close.disabled?panel:close).focus();}
    });
    panel.append(title,requirements,message,detail,close);overlay.append(panel);
    const showNotice=()=>{document.body.append(overlay);panel.focus();};
    let stage='validate';
    try{
      await validateDiscoveryAdminPng(file);
      stage='authorize';message.textContent=PROGRESS.authorize;
      const result=await upload(card.id,file,{onProgress:next=>{stage=next;status.textContent=message.textContent=PROGRESS[next]||PROGRESS.validate;}});
      let refreshWarning=result?.refreshWarning===true;
      let previewWarning=false;
      if(!refreshWarning){
        stage='display';status.textContent=PROGRESS.display;
        try{await onSaved?.(result);}catch{previewWarning=true;detail.textContent='Etapa: display · Código: DISCOVERY_ART_PREVIEW_FAILED';}
      }
      status.textContent=message.textContent=previewWarning?'El arte quedó guardado, pero no se pudo cargar la imagen en pantalla. Cerrá y volvé a abrir la enciclopedia para comprobarlo.':refreshWarning?'El arte quedó guardado, pero no se pudo actualizar la vista. Cerrá y volvé a abrir la enciclopedia para comprobarlo.':'✅ Arte privado actualizado. La imagen quedó vinculada a la carta.';
      button.textContent=(refreshWarning||previewWarning)?'⚠️':'✅';
      if(refreshWarning||previewWarning)showNotice();
    }catch(error){
      const display=describeDiscoveryUploadError(error?.stage?error:discoveryUploadError(stage,error));message.setAttribute('role','alert');message.textContent=display.message;detail.textContent=display.diagnostic;
      button.textContent='⚠️';
      status.textContent='No se pudo completar la carga. Revisá el mensaje en pantalla.';showNotice();
      // Never forward a signed URL, private object path or raw SDK payload to shared telemetry.
    }finally{busy=false;close.disabled=false;animation?.cancel();spinner.remove();art?.removeAttribute('aria-busy');if(button.isConnected)button.disabled=false;if(overlay.isConnected)close.focus();}
  });
  slot.append(button,input,status);
  return {button,input};
}
