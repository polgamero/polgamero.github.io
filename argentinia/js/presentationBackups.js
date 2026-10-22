import {fetchAdminPresentationBackupState,saveAdminPresentationLayoutsPatch,saveAdminPrivatePresentationPatch} from './firebaseClient.js';
import {buildPresentationBackup,parsePresentationBackup,planPresentationImport,presentationSpec,samePresentation} from './presentationBackupModel.js';
import {ensureArtLayoutsLoaded,injectPrivateDiscoveryArtLayouts,ART_LAYOUT_CACHE_KEY,ART_LAYOUT_BACKUP_KEY} from './artLayout.js';
import {ensureCardTextLayoutsLoaded,injectPrivateDiscoveryTextLayouts,TEXT_LAYOUT_CACHE_KEY,TEXT_LAYOUT_BACKUP_KEY} from './textLayout.js';

const dbName='argentinia.presentationBackups.v1';
async function store(action){
  const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(dbName,1);request.onupgradeneeded=()=>request.result.createObjectStore('backups',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction('backups','readwrite'),table=tx.objectStore('backups');let value;
    action(table,next=>{value=next;});tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(tx.error||Error('No se pudo guardar la copia interna.'));
  });}finally{db.close();}
}
async function saveLocal(uid,file){
  await store((table,done)=>{
    table.put({id:file.serial,uid,kind:file.kind,createdAt:file.exportedAt,file});
    const request=table.getAll();request.onsuccess=()=>{
      const rows=request.result.filter(row=>row.uid===uid&&row.kind===file.kind).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
      for(const row of rows.slice(5))table.delete(row.id);done(file);
    };
  });
}
async function latestLocal(uid,kind){return store((table,done)=>{const request=table.getAll();request.onsuccess=()=>done(request.result.filter(row=>row.uid===uid&&row.kind===kind).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]?.file||null);});}
export function downloadPresentationBackup(file){
  const url=URL.createObjectURL(new Blob([JSON.stringify(file,null,2)+'\n'],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=`ARG_${file.kind==='art'?'IMAGENES':'TEXTOS'}_${String(file.serial).replace(/[^A-Za-z0-9_-]/g,'_')}.json`;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);return link.download;
}
const element=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
export function mountPresentationBackups(root,{uid}){
  let busy=false;root.replaceChildren();
  root.append(element('h2','Respaldo de ajustes de cartas'),element('p','Exportá imágenes y textos por separado. Los archivos guardan encuadres y tamaños, también por cara y evolución; no contienen las imágenes originales ni cambian las reglas de las cartas. Al importar se combinan los ajustes del archivo y se conservan los demás.'));
  root.append(element('p','Las cinco copias internas más recientes de cada tipo quedan en este navegador. Descargá los JSON para conservarlos aunque borres los datos del sitio.'));
  for(const kind of ['art','text']){
    const spec=presentationSpec(kind),section=element('section');section.className='admin-section';section.dataset.backupKind=kind;
    section.append(element('h3',kind==='art'?'Encuadres de imágenes':'Ajustes de textos'));
    const privateLabel=element('label'),includePrivate=element('input');includePrivate.type='checkbox';privateLabel.append(includePrivate,document.createTextNode(' Incluir ajustes de Descubribles (archivo privado)'));section.append(privateLabel);
    const controls=element('div');controls.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin:12px 0';
    const recovery=element('details'),recoveryControls=element('div');recovery.append(element('summary','Copias internas y recuperación'),recoveryControls);recoveryControls.style.cssText=controls.style.cssText;
    const makeButton=(label,fn,target=controls)=>{const button=element('button',label);button.type='button';button.className='admin-save-btn admin-debug-refresh';button.style.minHeight='44px';button.addEventListener('click',()=>void run(fn));target.append(button);return button;};
    const status=element('p');status.setAttribute('role','status');status.dataset.backupStatus=kind;
    const preview=element('div');preview.hidden=true;preview.dataset.backupPreview=kind;
    async function run(fn){
      if(busy)return;busy=true;const inputs=[...root.querySelectorAll('button,input')];const disabled=inputs.map(input=>input.disabled);inputs.forEach(input=>{input.disabled=true;});
      try{await fn();}catch(error){status.textContent='No se completó: '+(error?.message||error);}
      finally{inputs.forEach((input,i)=>{input.disabled=disabled[i];});busy=false;}
    }
    makeButton('Exportar '+(kind==='art'?'imágenes':'textos'),async()=>{
      status.textContent='Leyendo los ajustes actuales del servidor…';
      const state=await fetchAdminPresentationBackupState(kind,{includePrivate:includePrivate.checked});
      if(!state.publicExists&&!Object.keys(state.privateLayouts).length)throw Error('No existe el documento del servidor. Podés exportar una copia local recuperable.');
      const file=await buildPresentationBackup(kind,state);const name=downloadPresentationBackup(file);
      try{await saveLocal(uid,file);}catch(error){status.textContent=`Archivo descargado: ${name}. No se pudo guardar además la copia interna.`;return;}
      status.textContent=`Respaldo descargado: ${name}. Públicos: ${Object.keys(file.publicLayouts).length}; privados: ${Object.keys(file.privateLayouts).length}.`;
    });
    const picker=element('input');picker.type='file';picker.accept='.json,application/json';picker.hidden=true;picker.dataset.backupFile=kind;
    makeButton('Importar '+(kind==='art'?'imágenes':'textos'),async()=>{picker.disabled=false;picker.value='';picker.click();});
    makeButton('Descargar última copia interna',async()=>{const file=await latestLocal(uid,kind);if(!file)throw Error('Todavía no hay una copia interna de este tipo.');status.textContent='Copia descargada: '+downloadPresentationBackup(file);},recoveryControls);
    makeButton('Rescatar caché local',async()=>{
      const cacheKey=kind==='art'?ART_LAYOUT_CACHE_KEY:TEXT_LAYOUT_CACHE_KEY,backupKey=kind==='art'?ART_LAYOUT_BACKUP_KEY:TEXT_LAYOUT_BACKUP_KEY;
      const candidates=[backupKey,cacheKey].map(key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}).filter(value=>value?.layouts&&Object.keys(value.layouts).length);
      if(!candidates.length)throw Error('No quedan ajustes en la caché ni en su copia previa.');
      const file=await buildPresentationBackup(kind,{publicLayouts:candidates[0].layouts,privateLayouts:{}},'local-recovery');
      const name=downloadPresentationBackup(file);await saveLocal(uid,file);status.textContent='Copia local recuperable descargada: '+name+'. Revisala antes de importarla; puede ser anterior al servidor.';
    },recoveryControls);
    picker.addEventListener('change',()=>void run(async()=>{
      preview.hidden=true;preview.replaceChildren();
      const selected=picker.files?.[0];if(!selected)return;
      if(selected.size>5*1024*1024)throw Error('El archivo supera 5 MB.');
      const incoming=await parsePresentationBackup(await selected.text(),kind),hasPrivate=Object.keys(incoming.privateLayouts).length>0;
      const current=await fetchAdminPresentationBackupState(kind,{includePrivate:hasPrivate});
      const plan=planPresentationImport(kind,current,incoming);
      preview.append(element('p',`Archivo ${selected.name}. Agrega ${plan.added}, modifica ${plan.changed}, conserva ${plan.unchanged} iguales. Los ajustes ausentes del archivo se mantienen.`));
      const changes=[...Object.entries(plan.publicPatch).map(([id,next])=>({id,next,old:current.publicLayouts[id]})),...Object.entries(plan.privatePatch).map(([id,next])=>({id,next,old:current.privateLayouts[id]}))];
      const list=element('ul');list.style.cssText='max-height:260px;overflow:auto;overflow-wrap:anywhere';let shown=0;
      const more=element('button','Ver más cambios');more.type='button';more.className='admin-save-btn';
      const reveal=()=>{const end=Math.min(shown+20,changes.length);for(const change of changes.slice(shown,end))list.append(element('li',`${change.id}: ${JSON.stringify(spec.normalize(change.old))} → ${JSON.stringify(change.next)}`));shown=end;more.hidden=shown>=changes.length;};
      more.addEventListener('click',reveal);reveal();preview.append(list,more);
      const apply=element('button','Guardar copia previa y aplicar importación');apply.type='button';apply.className='admin-save-btn';apply.dataset.backupApply=kind;apply.disabled=!plan.added&&!plan.changed;
      const cancel=element('button','Cancelar');cancel.type='button';cancel.className='admin-save-btn';cancel.addEventListener('click',()=>{preview.hidden=true;preview.replaceChildren();});preview.append(apply,cancel);preview.hidden=false;
      status.textContent='Archivo validado. Todavía no se modificó ningún ajuste.';
      apply.addEventListener('click',()=>void run(async()=>{
        let publicDone=0,beforeSaved=false;const privateDone=[];
        try{
          const fresh=await fetchAdminPresentationBackupState(kind,{includePrivate:hasPrivate});
          for(const scope of ['publicLayouts','privateLayouts'])for(const id of Object.keys(incoming[scope]))if(!samePresentation(kind,fresh[scope][id],current[scope][id]))throw Error('Hubo otra edición desde la vista previa. Volvé a seleccionar el archivo.');
          const verified=planPresentationImport(kind,fresh,incoming),before=await buildPresentationBackup(kind,verified.before,'pre-import');
          await saveLocal(uid,before);beforeSaved=true;const beforeName=downloadPresentationBackup(before);
          if(!root.isConnected)throw Error('El panel se cerró antes de aplicar.');
          if(Object.keys(verified.publicPatch).length){await saveAdminPresentationLayoutsPatch({kind,layouts:verified.publicPatch,expected:fresh.publicLayouts,allowCreate:true});publicDone=Object.keys(verified.publicPatch).length;}
          for(const [id,layout] of Object.entries(verified.privatePatch)){
            if(!root.isConnected)throw Error('El panel se cerró.');
            status.textContent=`Restaurando ajustes privados: ${privateDone.length}/${Object.keys(verified.privatePatch).length}…`;
            await saveAdminPrivatePresentationPatch(kind,id,layout);privateDone.push(id);
          }
          const final=await fetchAdminPresentationBackupState(kind,{includePrivate:hasPrivate});
          if(final.publicExists)await(kind==='art'?ensureArtLayoutsLoaded:ensureCardTextLayoutsLoaded)({force:true});
          if(hasPrivate)(kind==='art'?injectPrivateDiscoveryArtLayouts:injectPrivateDiscoveryTextLayouts)(Object.entries(final.privateLayouts).map(([id,layout])=>({id,discoveryPresentation:{[spec.field]:layout}})));
          preview.hidden=true;preview.replaceChildren();window.dispatchEvent(new CustomEvent('argentinia:presentation-layouts-changed'));
          status.textContent=`Importación aplicada: ${publicDone} ajustes públicos y ${privateDone.length} privados. Copia previa: ${beforeName}.`;
        }catch(error){
          throw Error(`${error?.message||error} Confirmados: ${publicDone} públicos; privados: ${privateDone.join(', ')||'ninguno'}.${beforeSaved?' La copia previa queda en el navegador.':''} Si hubo una interrupción, volvé a importar el mismo archivo para revisar lo que falta.`);
        }
      }));
    }));
    section.append(controls,recovery,picker,preview,status);root.append(section);
  }
  return {destroy:()=>root.replaceChildren()};
}
