// Existing Admin session + existing immutable editorial CMS. No second login.
import {preloadFirebaseClient} from './firebaseClient.js';
export function mountSiteEditorialAdmin(root){
  let editor=null,alive=true;
  root.textContent='Abriendo Sitio Editorial…';
  const ready=(async()=>{
    const client=await preloadFirebaseClient(),auth=client.auth;
    const {getFunctions,httpsCallable}=await import('https://www.gstatic.com/firebasejs/12.16.0/firebase-functions.js');
    for(const [id,href] of [['site-editorial-css','/stage2.css']]){
      if(!document.getElementById(id)){const link=document.createElement('link');link.id=id;link.rel='stylesheet';link.href=href;document.head.append(link);}
    }
    const [response,module]=await Promise.all([fetch('/editorial-admin.html',{cache:'no-store'}),import('/runtime/editor.js')]);
    if(!response.ok)throw Error('No se pudo cargar Sitio Editorial. Actualizá el sitio y reintentá.');
    const html=await response.text();if(!alive||!root.isConnected)return;
    // Trusted same-origin template from the Pages build, never CMS HTML.
    const fragment=new DOMParser().parseFromString(html,'text/html').querySelector('[data-editor]');
    if(!fragment)throw Error('La plantilla editorial está incompleta.');fragment.querySelector('[data-editor-login]')?.setAttribute('hidden','');root.replaceChildren(fragment);
    const call=httpsCallable(getFunctions(auth.app,'southamerica-east1'),'editorialAdmin');
    const config={backendEnabled:true,publicationStatusPath:'/editorial/release.json'};
    const service={config,auth,onAuth:client.onAuthChange,action:async data=>{try{return(await call(data)).data;}catch(error){const failure=new Error(error.details?.message||error.message);failure.code=error.details?.editorialCode||error.code;throw failure;}}};
    editor=await module.mountEditor(fragment,{embedded:true,services:async()=>service});
    if(!alive)editor?.destroy();
  })().catch(error=>{if(alive)root.textContent=error.message;});
  const observer=new MutationObserver(()=>{if(!root.isConnected)controller.destroy();});
  observer.observe(document.body,{childList:true,subtree:true});
  const controller={async canLeave(){await ready;return editor?editor.canLeave():true;},destroy(){if(!alive)return;alive=false;observer.disconnect();editor?.destroy();}};
  return controller;
}
