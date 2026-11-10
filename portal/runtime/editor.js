import {mergeArticlePresets} from './articlePresets.js';
import {planArticleRevision,revisedEdition} from './articleRevisionBatch.js';
import {portalServices} from './firebasePortal.js';
import {normalizeArticle,newArticle,fromLegacy,editorialId,articleMedia,formatEditorialRuns,editParagraph} from './articleModel.js';
import {renderArticle} from './articleRenderer.js';
import {prepareImage,mediaCache} from './mediaClient.js';
import {deployedRelease,publicationLabel} from './publicationStatus.js';
import {showGameDialog} from './vendor/gameDialogs.js';
const clone=v=>structuredClone(v);
const el=(tag,attrs={},text='')=>{const n=document.createElement(tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));n.textContent=text;return n;};
const button=(label,fn,attrs={})=>{const b=el('button',{type:'button',...attrs},label);b.addEventListener('click',fn);return b;};
const uid=prefix=>prefix+'-'+editorialId().toLowerCase();
const configURL=new URL('../portal-config.json',import.meta.url);

export async function mountEditor(root,{services=portalServices,embedded=false}={}){
  const login=root.querySelector('[data-editor-login]'),content=root.querySelector('[data-editor-workspace]'),status=root.querySelector('[data-editor-status]');
  const list=root.querySelector('[data-editor-list]'),form=root.querySelector('[data-editor-form]'),preview=root.querySelector('[data-editor-preview]'),toolbar=root.querySelector('[data-editor-toolbar]');
  let api=null,user=null,article=null,head=null,dirty=false,busy=false,epoch=0,active=false,local=false,publisher=false,batchPublisher=false,stopAuth=null;
  let pendingOperation=null,queued=null,live=null;
  const media=mediaCache(data=>api.action(data));
  const say=text=>{status.textContent=text;};
  const localHeads=new Map();
  const validity=()=>active&&!!user&&!busy;
  const backupKey=()=>`argentinia.portal.draft.v2.${user?.uid||'local'}`;
  function markDirty(){dirty=true;pendingOperation=null;try{const valid=normalizeArticle(article);localStorage.setItem(backupKey(),JSON.stringify({article:valid,savedAt:new Date().toISOString()}));}catch{}say(local?'Cambios en modo local. No se guardaron en el servidor.':'Cambios sin guardar en el servidor.');renderToolbar();}
  function field(parent,label,value,change,{area=false,type='text',max=1000,name=''}={}){
    const wrap=el('label',{class:'editor-field'}),caption=el('span',{},label),input=el(area?'textarea':'input',area?{rows:4,maxlength:max}:{type,maxlength:max});input.value=value??'';if(name)input.dataset.field=name;
    input.addEventListener('input',()=>{change(input.value);markDirty();});wrap.append(caption,input);parent.append(wrap);return input;
  }
  function pendingId(action,payload){const fingerprint=JSON.stringify({action,payload});if(pendingOperation?.fingerprint!==fingerprint)pendingOperation={fingerprint,id:editorialId().toLowerCase()};return pendingOperation.id;}
  function validateSiteContent(data){
    const kinds=data.tags.filter(t=>t.startsWith('sitio:'));
    const expected=data.id==='portada-argentinia'?'sitio:portada':data.id==='matito-la-ronda-y-sus-evoluciones'?'sitio:matito':null;
    if(kinds.length>1||(kinds.length&&kinds[0]!==expected)||(expected&&kinds[0]!==expected))throw Error('Para editar la portada o Matito, abrí su entrada del contenido inicial.');
    const cards=new Set((api.gameCards||[]).map(c=>c.id));
    const associated=data.tags.filter(t=>t.startsWith('carta:'));
    const featured=data.tags.filter(t=>t.startsWith('destacada:'));
    if(associated.length>1||featured.length>6||featured.length&&expected!=='sitio:portada'||[...associated.map(t=>t.slice(6)),...featured.map(t=>t.slice(10))].some(id=>!cards.has(id)))throw Error('Revisá las cartas asociadas y destacadas de la entrada.');
    return data;
  }
  async function locked(task){if(busy||!active)return;const identity=user?.uid,serial=epoch;busy=true;root.setAttribute('aria-busy','true');renderToolbar();try{await task(()=>active&&identity===user?.uid&&serial===epoch);}catch(e){if(identity===user?.uid&&serial===epoch)say(e.message||'No se pudo completar la operación.');}finally{busy=false;root.setAttribute('aria-busy','false');renderToolbar();}}
  async function discard(){if(!dirty)return true;return showGameDialog('Hay cambios que todavía no guardaste. ¿Querés cambiar de entrada?',{title:'Cambios sin guardar',confirm:true,acceptLabel:'Cambiar de entrada',valid:()=>active});}
  async function loadMedia(a){await Promise.all(articleMedia(a).map(id=>media.load(id)));}
  async function listArticles(){if(local){list.replaceChildren(...[...localHeads.values()].map(a=>button(a.article.title,()=>open(a.article.id),{'data-open-article':a.article.id})));return;}
    const identity=user?.uid,serial=epoch;const {heads}=await api.action({action:'list'});if(!active||identity!==user?.uid||serial!==epoch)return;list.replaceChildren();if(!heads.length)list.append(el('p',{},'Todavía no hay entradas guardadas.'));heads.forEach(h=>{const b=button(h.title,()=>open(h.id),{'data-open-article':h.id});b.append(el('small',{},`Revisión ${h.revision}${h.desiredRevision?' · solicitada '+h.desiredRevision:''}`));list.append(b);});}
  async function open(id){if(busy||!await discard())return;await locked(async valid=>{const saved=local?localHeads.get(id):await api.action({action:'get',articleId:id});if(!valid())return;const next=normalizeArticle(saved.article);await loadMedia(next);if(!valid())return;article=next;head=saved.head;dirty=false;pendingOperation=null;epoch++;render();say(local?'Entrada cargada en modo local.':'Revisión '+head.revision+' cargada desde el servidor.');});}
  async function save(){if(!article)return;await locked(async valid=>{
    const data=validateSiteContent(normalizeArticle(article));const requestId=pendingId('save',{data,expectedRevision:head?.revision||0});
    if(local){head={id:data.id,title:data.title,revision:(head?.revision||0)+1};localHeads.set(data.id,{article:clone(data),head:clone(head)});dirty=false;pendingOperation=null;await listArticles();render();say('Guardado sólo en la sesión local de diseño. No se guardó ni publicó en el servidor.');return;}
    const saved=await api.action({action:'save',requestId,article:data,expectedRevision:head?.revision||0});if(!valid())return;
    head=saved.head;article=saved.article;dirty=false;pendingOperation=null;await listArticles();render();say('Borrador guardado en el servidor · revisión '+head.revision+'.');
  });}
  async function refreshPublication(){if(local||!head)return;const identity=user?.uid;const result=await api.action({action:'status'}),receipt=await deployedRelease(api.config.publicationStatusPath).catch(()=>null);if(identity!==user?.uid||!active)return;queued=result;live=receipt;publisher=result.publisherConfigured;say(publicationLabel(head,queued,live));renderToolbar();}
  async function publish(remove=false){
    if(local||!head||dirty||busy)return;
    try{validateSiteContent(normalizeArticle(article,{publish:!remove}));}catch(e){say(e.message);return;}
    if(!await showGameDialog(remove?'¿Retirar esta entrada de la próxima edición pública? La versión actual seguirá visible hasta que Pages termine.':'¿Solicitar la publicación de esta revisión? Se enviará al workflow de Pages y esperaremos su edición pública.',{title:remove?'Retirar entrada':'Publicar entrada',confirm:true,acceptLabel:remove?'Solicitar retiro':'Solicitar publicación',valid:validity}))return;
    await locked(async valid=>{const action=remove?'unpublish':'publish',payload={articleId:article.id,expectedRevision:head.revision},requestId=pendingId(action,payload),result=await api.action({action,requestId,...payload});if(!valid())return;head={...head,desiredRevision:remove?null:head.revision,everPublished:head.everPublished||!remove};pendingOperation=null;await listArticles();queued={desiredRelease:result.releaseId,dispatch:result.dispatch};say(publicationLabel(head,queued,live));renderToolbar();});
  }
  async function history(){if(local||!head)return;await locked(async valid=>{const data=await api.action({action:'history',articleId:article.id});if(!valid())return;const box=root.querySelector('[data-editor-history]');box.replaceChildren(el('h3',{},'Revisiones guardadas'));
    for(const r of data.revisions)box.append(button(`Cargar revisión ${r.revision} · ${r.createdAt}`,async()=>{if(busy||!await discard())return;await locked(async current=>{const old=await api.action({action:'get',articleId:article.id,revision:r.revision});await loadMedia(old.article);if(!current())return;article=normalizeArticle(old.article);head=old.head;dirty=true;pendingOperation=null;epoch++;render();say('Revisión anterior recuperada para editar. Guardala para crear una revisión nueva; la edición pública no cambió.');});}));
    box.append(el('p',{},`Se muestran las últimas ${data.revisions.length} de ${data.total} revisiones. Las anteriores se conservan en el servidor.`));
  });}
  async function preparedArticles(){
    const response=await fetch(new URL('../editorial/article-presets.json',import.meta.url),{cache:'no-store'});
    if(!response.ok)throw Error('No se pudo cargar la edición preparada. Reintentá antes de importar o publicar.');
    return response.json();
  }
  async function initialArticles(){
    const prepared=await preparedArticles();
    const remote=local?[]:(await api.action({action:'seeds'})).articles;
    return mergeArticlePresets(remote,prepared);
  }
  async function importSeeds(){if(busy||!await discard())return;if(!await showGameDialog('Se crearán borradores con el contenido inicial que todavía no estén guardados. No se publicará nada.',{title:'Artículos iniciales',confirm:true,acceptLabel:'Crear borradores',valid:()=>active}))return;
    await locked(async valid=>{const seeds=await initialArticles();const heads=local?{heads:[...localHeads.values()].map(v=>v.head)}:await api.action({action:'list'});const ids=new Set(heads.heads.map(h=>h.id));let created=0;
      for(const raw of seeds){if(!valid())return;const data=fromLegacy(raw);if(ids.has(data.id))continue;if(local){localHeads.set(data.id,{article:data,head:{id:data.id,title:data.title,revision:1}});}else await api.action({action:'save',requestId:editorialId().toLowerCase(),article:data,expectedRevision:0});created++;}
      if(!valid())return;await listArticles();say(`${created} borradores iniciales creados${local?' en esta sesión local':' en el servidor'}. No se publicaron.`);
    });}
  async function publishInitialEdition(){
    if(local||!batchPublisher||busy||!await discard())return;
    await locked(async valid=>{
      const seeds=await initialArticles();
      const {heads}=await api.action({action:'list'}),byId=new Map(heads.map(head=>[head.id,head]));
      const plan=[];
      for(const raw of seeds){
        if(!valid())return;
        const existing=byId.has(raw.id)?await api.action({action:'get',articleId:raw.id}):null;
        const data=validateSiteContent(normalizeArticle(existing?.article||fromLegacy(raw),{publish:true}));
        plan.push({article:data,head:existing?.head||null});
      }
      if(!valid())return;
      if(plan.every(({head})=>head&&head.desiredRevision===head.revision)){
        await checkBatchPublication(plan,valid);
        return;
      }
      const description=plan.map(({article,head})=>`• ${article.title} · ${head?`revisión ${head.revision}`:'entrada nueva'}`).join('\n');
      const confirmed=await showGameDialog(
        'Se solicitará una publicación para toda la edición. Los borradores existentes se conservarán.\n\n'+description,
        {title:'Publicar edición inicial',confirm:true,acceptLabel:'Solicitar publicación',valid}
      );
      if(!confirmed||!valid())return;
      for(const item of plan){
        if(!valid())return;
        if(item.head)continue;
        const saved=await api.action({action:'save',requestId:editorialId().toLowerCase(),article:item.article,expectedRevision:0});
        item.head=saved.head;
      }
      if(!valid())return;
      await listArticles();
      if(valid())await sendBatchPublication(plan,valid);
    });
  }
  async function prepareRevisionBatch(valid){
    const edition=revisedEdition(await preparedArticles());
    const plan=[];
    for(const revision of edition){
      if(!valid())return [];
      let saved;
      try{
        saved=await api.action({action:'get',articleId:revision.id});
      }catch(error){
        if(error.code!=='NOT_FOUND')throw error;
      }
      const item=planArticleRevision(revision,saved);
      validateSiteContent(item.article);
      plan.push(item);
    }
    return plan;
  }
  async function saveRevisionBatch(){
    if(local||busy||!await discard())return;
    await locked(async valid=>{
      say('Buscando las 19 entradas de la revisión editorial…');
      const plan=await prepareRevisionBatch(valid);
      if(!valid())return;
      const pending=plan.filter(item=>item.changed);
      if(!pending.length){say('Las 19 entradas de esta edición ya están guardadas.');return;}
      const list=pending.map(({article,head})=>`• ${article.title} · ${head?`revisión actual ${head.revision}`:'entrada nueva'}`).join('\n');
      const confirmed=await showGameDialog(
        `Se guardarán ${pending.length} entradas como borradores. Las revisiones anteriores quedan en el historial. Se conservan la portada, las etiquetas y las imágenes. Las imágenes del cuerpo quedan al final del texto nuevo.\n\n${list}`,
        {title:'Guardar revisión editorial',confirm:true,acceptLabel:'Guardar lote',valid}
      );
      if(!confirmed||!valid()){if(valid())say('Guardado cancelado.');return;}
      article=null;head=null;dirty=false;pendingOperation=null;
      form.replaceChildren();preview.replaceChildren();root.querySelector('[data-editor-history]').replaceChildren();
      let completed=0;
      try{
        for(const item of pending){
          if(!valid())return;
          await api.action({action:'save',requestId:editorialId().toLowerCase(),article:item.article,expectedRevision:item.head?.revision??0});
          if(!valid())return;
          completed++;
          say(`Borradores guardados en este intento: ${completed} de ${pending.length}.`);
        }
        await listArticles();
        if(valid())say('Las 19 entradas están guardadas. Podés revisarlas y solicitar la publicación del lote.');
      }catch(error){
        if(!valid())return;
        await listArticles().catch(()=>{});
        throw Error(`Guardado interrumpido. El servidor confirmó ${completed} de ${pending.length} entradas en este intento. ${error.message}`);
      }
    });
  }
  async function checkBatchPublication(plan,valid){
    const [state,receipt]=await Promise.all([
      api.action({action:'status'}),
      deployedRelease(api.config.publicationStatusPath).catch(()=>null)
    ]);
    if(!valid())return;
    queued=state;
    const visible=plan.every(item=>receipt?.articles.some(entry=>entry.id===item.article.id&&entry.revision===item.head.revision));
    const dispatch=state.dispatch;
    const failed=dispatch?.state==='failed'||(dispatch?.workflowStatus==='completed'&&dispatch.conclusion&&dispatch.conclusion!=='success');
    if(visible)say(`Las ${plan.length} revisiones ya aparecen en la edición pública.`);
    else if(failed)say('Falló la publicación. Podés reintentar el envío a Pages.');
    else say('Pages todavía no confirma la edición solicitada.');
  }
  async function sendBatchPublication(plan,valid){
    const payload={entries:plan.map(({article,head})=>({articleId:article.id,expectedRevision:head.revision}))};
    const result=await api.action({action:'publishBatch',requestId:pendingId('publishBatch',payload),...payload});
    if(!valid())return;
    pendingOperation=null;
    queued={desiredRelease:result.releaseId,dispatch:result.dispatch};
    if(payload.entries.some(entry=>entry.articleId===head?.id&&entry.expectedRevision===head.revision)){
      head={...head,desiredRevision:head.revision,everPublished:true};
    }
    if(result.dispatch.state==='failed')say('La edición quedó registrada. Podés reintentar el envío a Pages.');
    else if(result.dispatch.state==='superseded')say('Hay una edición más nueva. Consultá la publicación del lote.');
    else say('Se solicitó una publicación para todo el lote. Pages todavía debe confirmar la edición pública.');
  }
  async function publishRevisionBatch(){
    if(local||!batchPublisher||busy||!await discard())return;
    await locked(async valid=>{
      say('Comprobando los borradores de la revisión editorial…');
      const plan=await prepareRevisionBatch(valid);
      if(!valid())return;
      const changed=plan.find(item=>!item.head||item.changed);
      if(changed)throw Error(`«${changed.article.title}» difiere de la edición preparada. Compará el borrador o usá Guardar revisión editorial.`);
      if(plan.every(({head})=>head.desiredRevision===head.revision)){
        await checkBatchPublication(plan,valid);
        return;
      }
      for(const {article} of plan)normalizeArticle(article,{publish:true});
      const description=plan.map(({article,head})=>`• ${article.title} · revisión ${head.revision}`).join('\n');
      const confirmed=await showGameDialog(
        `Se solicitará una publicación para las ${plan.length} entradas guardadas.\n\n${description}`,
        {title:'Publicar revisión editorial',confirm:true,acceptLabel:'Solicitar publicación del lote',valid}
      );
      if(!confirmed||!valid()){if(valid())say('Publicación cancelada.');return;}
      await sendBatchPublication(plan,valid);
    });
  }
  async function addImage(target){
    if(busy)return;const upload=el('input',{type:'file',accept:'image/png,image/jpeg,image/webp','aria-label':'Subir imagen'});
    upload.addEventListener('change',async()=>{const file=upload.files?.[0];if(!file)return;const serial=epoch,model=article;await locked(async valid=>{say('Preparando y guardando imagen…');const prepared=await prepareImage(file);if(!valid()||serial!==epoch||model!==article)return;const result=local?{media:{id:prepared.id}}:await api.action({action:'upload',requestId:pendingId('upload',{id:prepared.id}),base64:prepared.base64});if(!valid()||serial!==epoch||model!==article)return;media.set(result.media.id,prepared.blob);target(result.media.id);pendingOperation=null;markDirty();render();say(local?'Imagen incorporada a la sesión local.':'Imagen guardada en la biblioteca privada. Completá descripción, crédito y derechos; después guardá la entrada.');});},{once:true});upload.click();
  }
  async function chooseMedia(target){if(busy)return;await locked(async valid=>{const data=local?{media:[]}:await api.action({action:'mediaList'});if(!valid())return;const box=root.querySelector('[data-editor-library]');box.replaceChildren(el('h3',{},'Biblioteca privada'));
    if(!data.media.length)box.append(el('p',{},'Todavía no hay imágenes guardadas en la biblioteca.'));
    data.media.forEach(m=>box.append(button(`${m.id.slice(0,12)} · ${m.width} × ${m.height}`,async()=>{if(busy)return;await locked(async current=>{await media.load(m.id);if(!current())return;target(m.id);markDirty();render();box.replaceChildren();});})));
  });}
  function imageFields(parent,image,{remove,label='Imagen'}={}){
    const box=el('fieldset',{class:'editor-image-fields'});box.append(el('legend',{},label));const url=media.url(image.mediaId);if(url)box.append(el('img',{src:url,alt:image.alt||'Vista previa de la imagen',class:'editor-thumb'}));
    for(const [key,name,max] of [['alt','Descripción para lectores de pantalla',300],['caption','Epígrafe',600],['credit','Crédito',300],['rights','Derechos o licencia',500]])field(box,name,image[key],v=>image[key]=v,{max,name:'image-'+key});
    box.append(button('Reemplazar imagen',()=>addImage(id=>image.mediaId=id)),button('Elegir de la biblioteca',()=>chooseMedia(id=>image.mediaId=id)),button('Quitar imagen',()=>{remove();markDirty();render();}));parent.append(box);
  }
  function sectionEditor(parent,s,index){
    const box=el('fieldset',{class:'editor-section','data-section':index});box.append(el('legend',{},'Sección '+(index+1)));field(box,'Título de sección',s.title,v=>s.title=v,{max:200});field(box,'Ancla de sección',s.id,v=>s.id=v,{max:80});
    s.blocks.forEach((b,i)=>{
      const block=el('div',{class:'editor-block','data-block':i});
      if(b.type==='paragraph'){
        const area=field(block,'Párrafo',b.text,v=>{b.runs=editParagraph(b.runs||[{text:b.text,bold:false,italic:false}],v);b.text=v;},{area:true,max:12000,name:'paragraph'});const formats=el('div',{class:'editor-actions'});
        for(const [mark,label]of [['bold','Negrita'],['italic','Cursiva']]){const control=button(label,()=>{b.runs=formatEditorialRuns(b.runs||[{text:b.text,bold:false,italic:false}],area.selectionStart,area.selectionEnd,mark);markDirty();},{'data-format':mark});control.addEventListener('pointerdown',e=>e.preventDefault());formats.append(control);}block.append(formats);
        const refs=el('fieldset');refs.append(el('legend',{},'Fuentes de este párrafo'));for(const source of article.sources){const label=el('label'),input=el('input',{type:'checkbox'});input.checked=(b.sources||[]).includes(source.id);input.addEventListener('change',()=>{b.sources=input.checked?[...new Set([...(b.sources||[]),source.id])]:(b.sources||[]).filter(id=>id!==source.id);markDirty();});label.append(input,document.createTextNode(source.title||source.id));refs.append(label);}block.append(refs);
      }else if(b.type==='list')field(block,'Lista · un elemento por línea',b.items.join('\n'),v=>b.items=v.split('\n').filter(t=>t.trim()),{area:true,max:20000});
      else imageFields(block,b,{remove:()=>s.blocks.splice(i,1)});
      const controls=el('div',{class:'editor-actions'});controls.append(button('Subir bloque',()=>{if(i>0){[s.blocks[i-1],s.blocks[i]]=[s.blocks[i],s.blocks[i-1]];markDirty();render();}}),button('Bajar bloque',()=>{if(i<s.blocks.length-1){[s.blocks[i+1],s.blocks[i]]=[s.blocks[i],s.blocks[i+1]];markDirty();render();}}));
      if(b.type!=='image')controls.append(button('Eliminar bloque',()=>{if(s.blocks.length<2){say('La sección necesita al menos un bloque.');return;}s.blocks.splice(i,1);markDirty();render();}));block.append(controls);box.append(block);
    });
    box.append(button('+ Párrafo',()=>{s.blocks.push({type:'paragraph',text:'',runs:[{text:'',bold:false,italic:false}],sources:[]});markDirty();render();}),button('+ Lista',()=>{s.blocks.push({type:'list',items:['Primer elemento']});markDirty();render();}),button('+ Imagen',()=>addImage(id=>s.blocks.push({type:'image',mediaId:id,alt:'',caption:'',credit:'',rights:''}))),button('Eliminar sección',async()=>{if(article.sections.length<2){say('La entrada necesita al menos una sección.');return;}if(await showGameDialog('¿Eliminar esta sección y sus bloques?',{confirm:true,title:'Eliminar sección',acceptLabel:'Eliminar',valid:validity})){article.sections.splice(index,1);markDirty();render();}}));parent.append(box);
  }
  function render(){
    if(!article)return;form.replaceChildren();preview.replaceChildren();root.querySelector('[data-editor-history]').replaceChildren();
    const meta=el('fieldset');meta.append(el('legend',{},'La entrada'));
    const kind=el('select',{'aria-label':'Contenido del sitio'});for(const [value,label]of [['leyenda','Artículo de leyenda'],['portada','Portada del juego'],['matito','Historia de Matito']]){const o=el('option',{value},label);o.disabled=value==='portada'&&article.id!=='portada-argentinia'||value==='matito'&&article.id!=='matito-la-ronda-y-sus-evoluciones';kind.append(o);}kind.value=article.tags.includes('sitio:portada')?'portada':article.tags.includes('sitio:matito')?'matito':'leyenda';kind.addEventListener('change',()=>{article.tags=article.tags.filter(t=>!t.startsWith('sitio:'));if(kind.value!=='leyenda')article.tags.push('sitio:'+kind.value);markDirty();render();});meta.append(el('label',{},'Contenido del sitio'),kind);
    const cardSelect=el('select',{'aria-label':'Carta asociada'});cardSelect.append(el('option',{value:''},'Sin carta asociada'));for(const card of api.gameCards||[])cardSelect.append(el('option',{value:card.id},card.name));cardSelect.value=article.tags.find(t=>t.startsWith('carta:'))?.slice(6)||'';cardSelect.addEventListener('change',()=>{article.tags=article.tags.filter(t=>!t.startsWith('carta:'));if(cardSelect.value)article.tags.push('carta:'+cardSelect.value);markDirty();});meta.append(el('label',{},'Carta asociada del juego'),cardSelect);
    if(kind.value==='portada'){
      const featured=el('fieldset');featured.append(el('legend',{},'Cartas destacadas · hasta seis'));
      const select=el('select',{multiple:'',size:8,'aria-label':'Cartas destacadas de la portada'});
      const selected=new Set(article.tags.filter(t=>t.startsWith('destacada:')).map(t=>t.slice(10)));
      for(const card of api.gameCards||[]){const option=el('option',{value:card.id},card.name);option.selected=selected.has(card.id);select.append(option);}
      select.addEventListener('change',()=>{
        const choices=[...select.selectedOptions].map(o=>o.value),other=article.tags.filter(t=>!t.startsWith('destacada:'));
        if(choices.length>6||choices.length+other.length>8){for(const o of select.options)o.selected=selected.has(o.value);say('Elegí hasta seis cartas; la entrada admite ocho etiquetas en total.');return;}
        selected.clear();choices.forEach(id=>selected.add(id));article.tags=[...other,...choices.map(id=>'destacada:'+id)];markDirty();
      });featured.append(select);meta.append(featured);
    }
    for(const [key,label,max]of [['title','Título',160],['slug','URL estable',120],['excerpt','Extracto',340],['author','Firma pública',160],['region','Región',100]]){const n=field(meta,label,article[key],v=>article[key]=v,{max,area:key==='excerpt',name:key});if(key==='slug'&&head?.everPublished)n.disabled=true;}
    field(meta,'Fecha de preparación',article.preparedOn,v=>article.preparedOn=v,{type:'date',name:'preparedOn'});field(meta,'Etiquetas · separadas por coma',article.tags.filter(t=>! /^(sitio|carta|destacada):/.test(t)).join(', '),v=>article.tags=[...article.tags.filter(t=>/^(sitio|carta|destacada):/.test(t)),...v.split(',').map(t=>t.trim()).filter(t=>t&&! /^(sitio|carta|destacada):/.test(t))],{max:400});form.append(meta);
    const cover=el('fieldset');cover.append(el('legend',{},'Portada'));if(article.cover)imageFields(cover,article.cover,{remove:()=>article.cover=null,label:'Imagen de portada'});else cover.append(button('Subir portada',()=>addImage(id=>article.cover={mediaId:id,alt:'',caption:'',credit:'',rights:''})),button('Elegir portada de biblioteca',()=>chooseMedia(id=>{article.cover={mediaId:id,alt:'',caption:'',credit:'',rights:''};})));form.append(cover);
    const sourceBox=el('fieldset');sourceBox.append(el('legend',{},'Fuentes y lecturas'));article.sources.forEach((s,i)=>{const item=el('div',{class:'editor-source'});for(const [key,label,max]of [['title','Referencia',500],['url','URL HTTPS',1500],['note','Contexto de uso',600]])field(item,label,s[key],v=>s[key]=v,{max,area:key==='note'});field(item,'Consultada el',s.accessedOn,v=>s.accessedOn=v,{type:'date'});item.append(button('Eliminar fuente',()=>{article.sections.forEach(section=>section.blocks.forEach(b=>{if(b.type==='paragraph')b.sources=(b.sources||[]).filter(id=>id!==s.id);}));article.sources.splice(i,1);markDirty();render();}));sourceBox.append(item);});sourceBox.append(button('+ Fuente',()=>{article.sources.push({id:uid('fuente'),title:'',url:'',note:'',accessedOn:article.preparedOn});markDirty();render();}));form.append(sourceBox);
    article.sections.forEach((s,i)=>sectionEditor(form,s,i));form.append(button('+ Sección',()=>{article.sections.push({id:uid('seccion'),title:'Nueva sección',blocks:[{type:'paragraph',text:''}]});markDirty();render();}));renderToolbar();
  }
  function renderToolbar(){
    toolbar.replaceChildren();if(!active)return;
    toolbar.append(button('Nueva entrada',async()=>{if(busy||!await discard())return;article=newArticle();head=null;dirty=true;epoch++;pendingOperation=null;render();say(local?'Nueva entrada en modo local.':'Nueva entrada sin guardar.');},{'data-editor-new':''}),button('Cargar artículos iniciales',importSeeds,{'data-editor-seed':''}));
    if(!local){
      toolbar.append(button('Guardar revisión editorial',saveRevisionBatch,{'data-editor-revision-batch-save':''}));
      if(batchPublisher)toolbar.append(
        button('Publicar edición inicial',publishInitialEdition,{'data-editor-initial-publish':''}),
        button('Publicar revisión editorial',publishRevisionBatch,{'data-editor-revision-batch-publish':''})
      );
    }
    if(article){toolbar.append(button(local?'Guardar en esta sesión':'Guardar borrador',save,{'data-editor-save':''}),button('Vista previa',()=>{try{preview.innerHTML=renderArticle(article,{gameCards:api?.gameCards||[],mediaUrl:id=>media.url(id)});preview.hidden=false;preview.scrollIntoView({block:'start',behavior:'auto'});say('Vista previa del contenido. No cambia la edición pública.');}catch(e){say(e.message);}},{'data-editor-show-preview':''}),button('Revisiones anteriores',history,{'data-editor-history-button':''}));
      if(!local){const pub=button('Publicar',()=>publish(false),{'data-editor-publish':''});pub.disabled=!head||dirty||!publisher;const remove=button('Retirar de la edición pública',()=>publish(true),{'data-editor-unpublish':''});remove.disabled=!head||!head.desiredRevision||dirty||!publisher;toolbar.append(pub,remove,button('Consultar publicación',()=>locked(refreshPublication),{'data-editor-refresh':''}));}
    }
    const dispatch=queued?.dispatch;
    if(!local&&publisher&&queued?.desiredRelease&&(dispatch?.state==='failed'||(dispatch?.workflowStatus==='completed'&&dispatch.conclusion&&dispatch.conclusion!=='success'))){
      toolbar.append(button('Reintentar envío a Pages',()=>locked(async valid=>{
        const result=await api.action({action:'retryPublication',releaseId:queued.desiredRelease});
        if(!valid())return;
        queued={desiredRelease:result.releaseId,dispatch:result.dispatch};
        if(head)say(publicationLabel(head,queued,live));
        else say(result.dispatch.state==='failed'?'Falló el reintento de envío a Pages.':result.dispatch.state==='superseded'?'Hay una edición más nueva. Consultá la publicación del lote.':'Envío solicitado. Consultá la edición pública desde Publicar revisión editorial.');
      })));
    }
    if(!local&&!embedded)toolbar.append(button('Salir',async()=>{if(!await discard())return;await api.signOut();}));
    for(const b of toolbar.querySelectorAll('button'))if(busy)b.disabled=true;
    // Busy editing is frozen, so a response cannot overwrite later typing or selection.
    form.inert=busy;list.inert=busy;
  }
  async function activate(service,identity,isLocal=false){
    api=service;user=identity;local=isLocal;active=true;publisher=false;batchPublisher=false;article=null;head=null;dirty=false;queued=null;live=null;epoch++;media.clear();content.hidden=false;form.replaceChildren();preview.replaceChildren();login.hidden=true;
    const serial=epoch;
    if(!local){const permissions=await api.action({action:'permissions'});if(!active||identity.uid!==user?.uid||serial!==epoch)return;publisher=permissions.publisherConfigured;batchPublisher=publisher&&permissions.supportsBatchPublication===true;}
    api.gameCards??=await fetch(new URL('../editorial/game-cards.json',import.meta.url)).then(r=>r.ok?r.json():[]).catch(()=>[]);
    await listArticles();if(!active||identity.uid!==user?.uid||serial!==epoch)return;renderToolbar();say(local?'Modo local de diseño: nada se guarda remotamente ni se publica.':publisher?'Editor conectado. Elegí una entrada o creá una nueva.':'Editor conectado. Guardado disponible; publicación todavía sin configurar.');
    try{const backup=JSON.parse(localStorage.getItem(backupKey())||'null');if(backup?.article){const recovery=button('Recuperar copia de este navegador',async()=>{if(busy||!await discard())return;await locked(async valid=>{const data=normalizeArticle(backup.article);let saved=null;if(!local){try{saved=await api.action({action:'get',articleId:data.id});}catch(e){if(e.code!=='NOT_FOUND')throw e;}await loadMedia(data);}if(!valid())return;head=saved?.head||null;article=data;dirty=true;epoch++;render();say('Copia recuperada. Guardala en el servidor para conservarla entre dispositivos.');});});root.querySelector('[data-editor-recovery]').replaceChildren(recovery);}}catch{}
  }
  async function localMode(){await activate({action:async()=>{throw Error('Modo local: esta imagen no está en la sesión.');},config:{publicationStatusPath:'/editorial/release.json'}},{uid:'local-design'},true);}
  const localHost=['127.0.0.1','localhost',''].includes(location.hostname);
  if(localHost&&!embedded)login.append(button('Revisar el editor en modo local',localMode,{'data-editor-local':''}));
  const signIn=login.querySelector('[data-editor-signin]');
  try{const embeddedService=embedded?await services():null;const config=embeddedService?.config||await fetch(configURL,{cache:'no-store'}).then(r=>r.json());if(!config.backendEnabled){if(signIn)signIn.disabled=true;say('Preview privada: el servicio editorial todavía no se desplegó. Podés revisar el diseño en modo local.');}else{
    const service=embeddedService||await services();if(!embedded)signIn?.addEventListener('click',()=>service.signIn().catch(e=>say(e.message)));else login.replaceChildren();stopAuth=service.onAuth(async identity=>{
      if(identity?.uid===user?.uid&&active)return;
      const priorUid=user?.uid;if(priorUid&&priorUid!==identity?.uid)try{localStorage.removeItem(`argentinia.portal.draft.v2.${priorUid}`);}catch{}
      login.querySelector('[data-editor-change-account]')?.remove();
      active=false;epoch++;media.clear();article=null;head=null;dirty=false;form.replaceChildren();preview.replaceChildren();list.replaceChildren();toolbar.replaceChildren();root.querySelector('[data-editor-recovery]').replaceChildren();root.querySelector('[data-editor-library]').replaceChildren();root.querySelector('[data-editor-history]').replaceChildren();content.hidden=true;login.hidden=false;user=identity;
      if(!identity){say('Ingresá con la cuenta administradora del juego.');return;}
      const attempt=epoch+1;try{await activate(service,identity);}catch(e){if(identity.uid!==user?.uid||epoch!==attempt)return;active=false;content.hidden=true;login.hidden=false;say(e.message);if(!embedded)login.append(button('Salir de esta cuenta',()=>service.signOut().catch(error=>say(error.message)),{'data-editor-change-account':''}));}
    });
  }}catch(e){say('No se pudo conectar el editor: '+e.message);}
  const guard=async event=>{const a=event.target.closest('a[href]');if(!dirty||!a||a.getAttribute('href').startsWith('#')||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey)return;event.preventDefault();if(await showGameDialog('Hay cambios sin guardar. ¿Querés salir del editor?',{title:'Salir del editor',confirm:true,acceptLabel:'Salir',valid:()=>active}))location.assign(a.href);};
  document.addEventListener('click',guard);
  return {canLeave:async()=>!busy&&await discard(),destroy(){active=false;epoch++;media.clear();stopAuth?.();document.removeEventListener('click',guard);root.replaceChildren();},get state(){return {article,head,dirty,busy,local};}};
}
const root=document.querySelector('[data-editor]');if(root?.hasAttribute('data-editor-standalone'))mountEditor(root);
