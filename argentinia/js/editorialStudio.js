import { editorialId, editorialAsset, editorialFor, normalizeEditorial, normalizeRuns, formatEditorialRuns } from './editorialModel.js';
import { renderEditorialPage, applyEditorialRect, showEditorialPreview } from './editorialRenderer.js';
import { EDITORIAL_FORMATS,editorialFrame } from './editorialFrames.js';
import { showGameDialog } from './gameDialogs.js';

const clone=v=>JSON.parse(JSON.stringify(v));
const el=(tag,attrs={},value='')=>{const n=document.createElement(tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);n.textContent=value;return n;};
function studioStyles(){
  if(document.getElementById('ed-studio-styles'))return;
  const s=el('style',{id:'ed-studio-styles'});s.textContent=`.ed-studio{color:#eee4ca;font:14px/1.4 system-ui;margin-top:12px}.ed-toolbar,.ed-pages,.ed-inspector-row{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:8px 0}.ed-studio button,.ed-studio select{min-height:36px;padding:7px 10px;border:1px solid #b69a4c;border-radius:7px;background:#14251a;color:#f9e4a9;cursor:pointer;font:inherit}.ed-studio button:disabled{opacity:.45;cursor:default}.ed-studio button[aria-pressed=true]{background:#604c17;color:white}.ed-studio input,.ed-studio textarea{background:#0c1710;color:#f4e8c7;border:1px solid #71603a;border-radius:5px;padding:6px;box-sizing:border-box;max-width:100%;font:inherit}.ed-studio textarea{width:100%;min-height:120px}.ed-studio input[type=number]{width:72px}.ed-studio input[type=color]{width:48px;height:32px;padding:2px}.ed-studio label{display:inline-flex;gap:5px;align-items:center;flex-wrap:wrap}.ed-workspace{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:12px;align-items:start}.ed-board-wrap{padding:12px;background:#030905;border:1px solid #6e5d35;border-radius:9px;min-width:0;overflow:auto}.ed-board{width:100%;margin:auto}.ed-board[data-view=mobile]{max-width:640px}.ed-inspector{padding:12px;background:#0c1710;border:1px solid #54472a;border-radius:8px}.ed-layer{width:100%;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:3px 0}.ed-status{min-height:22px;color:#e9c76b}.ed-studio [hidden]{display:none!important}.ed-studio :focus-visible{outline:2px solid #a7e4ff;outline-offset:2px}@media(max-width:1000px){.ed-workspace{grid-template-columns:minmax(0,1fr)}.ed-inspector{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}}`;
  document.head.append(s);
}

// No remote writes. Publication belongs to the existing Admin announcement adapter.
export function mountEditorialStudio(root,{draftKey='argentinia:editorial:guest',onChange=()=>{},onPreview=null,showPreviewButton=true,readMetadata=()=>({}),restoreMetadata=()=>{}}={}){
  studioStyles();let model=editorialFor(),pageIndex=0,selected=null,viewport='desktop',frameContext='popup',undo=[],redo=[],lastSaved=null,dirty=false,destroyed=false,generation=0,selection={start:0,end:0};
  const abort=new AbortController();const listen=(n,type,fn)=>n.addEventListener(type,fn,n===board?{signal:abort.signal}:undefined);
  const toolbar=el('div',{class:'ed-toolbar'}),pages=el('div',{class:'ed-pages'}),workspace=el('div',{class:'ed-workspace'}),boardWrap=el('div',{class:'ed-board-wrap'}),board=el('div',{class:'ed-board','data-view':viewport}),inspector=el('div',{class:'ed-inspector'}),status=el('div',{class:'ed-status',role:'status'});
  root.classList.add('ed-studio');root.replaceChildren(toolbar,pages,workspace,status);boardWrap.append(board);workspace.append(boardWrap,inspector);
  let savedMetadata=JSON.stringify(readMetadata());
  const hasUnsaved=()=>dirty||JSON.stringify(readMetadata())!==savedMetadata;
  let unbindGesture=null;
  const say=s=>status.textContent=s;
  const getPage=()=>model.pages[pageIndex],getBlock=()=>getPage().blocks.find(b=>b.id===selected);
  const snapshot=()=>JSON.stringify(model);
  const change=(before)=>{model=normalizeEditorial(model);if(snapshot()===before)return;undo.push(before);if(undo.length>40)undo.shift();redo=[];dirty=true;generation++;onChange();say('Cambios sin publicar.');};
  const mutate=fn=>{const before=snapshot();try{fn();change(before);render();return true;}catch(e){model=JSON.parse(before);render();say(e.message);return false;}};
  const button=(label,fn,attrs={})=>{const b=el('button',{type:'button',...attrs},label);listen(b,'click',fn);return b;};
  const setField=(parent,label,node)=>{const wrap=el('label');wrap.append(document.createTextNode(label+' '),node);parent.append(wrap);return node;};
  const input=(type,value,onInput,attrs={})=>{const n=el('input',{type,...attrs});n.value=value;listen(n,'change',()=>onInput(n.value,n));return n;};
  const saveDraft=()=>{try{const data={version:1,presentation:normalizeEditorial(model),metadata:readMetadata(),savedAt:new Date().toISOString()};localStorage.setItem(draftKey,JSON.stringify(data));lastSaved=snapshot();savedMetadata=JSON.stringify(readMetadata());dirty=false;say('Borrador guardado en este navegador. No está publicado.');}catch(e){say('No se pudo guardar el borrador: '+e.message);}renderToolbar();};
  const loadDraft=async()=>{try{const raw=localStorage.getItem(draftKey);if(!raw){say('No hay un borrador guardado.');return;}const data=JSON.parse(raw);const next=normalizeEditorial(data.presentation);if(dirty&&!await confirmDiscard())return;restoreMetadata(data.metadata||{});model=next;pageIndex=0;selected=null;undo=[];redo=[];generation++;dirty=false;lastSaved=snapshot();savedMetadata=JSON.stringify(readMetadata());render();say('Borrador recuperado. Aún no está publicado.');}catch(e){say('No se pudo recuperar el borrador: '+e.message);}};
  const confirmDiscard=()=>showGameDialog('Hay cambios sin publicar. ¿Querés descartarlos?',{confirm:true,title:'Cambiar diseño',acceptLabel:'Descartar cambios'});
  const addBlock=type=>mutate(()=>{if(getPage().blocks.length>=40)throw Error('Máximo de 40 bloques por página.');const b={id:editorialId(),type,x:10,y:20,w:60,h:30,mobile:{x:8,y:18,w:84,h:35}};if(type==='text')Object.assign(b,{runs:[{text:'Escribí tu texto',bold:false,italic:false}],fontSize:28,color:'#f4e8c7'});else Object.assign(b,{src:'',alt:'Ilustración',fit:'contain'});getPage().blocks.push(b);selected=b.id;});
  function renderToolbar(){
    toolbar.replaceChildren(button('+ Texto',()=>addBlock('text'),{'data-ed-add':'text'}),button('+ Imagen',()=>addBlock('image'),{'data-ed-add':'image'}),button('Deshacer',()=>{if(!undo.length)return;redo.push(snapshot());model=JSON.parse(undo.pop());dirty=true;generation++;render();onChange();},{'data-ed-undo':''}),button('Rehacer',()=>{if(!redo.length)return;undo.push(snapshot());model=JSON.parse(redo.pop());dirty=true;generation++;render();onChange();},{'data-ed-redo':''}));
    toolbar.querySelector('[data-ed-undo]').disabled=!undo.length;toolbar.querySelector('[data-ed-redo]').disabled=!redo.length;
    for(const [key,label] of [['desktop','Desktop'],['notebook','Notebook'],['mobile','Mobile']])toolbar.append(button(label,()=>{viewport=key;render();},{'data-ed-viewport':key,'aria-pressed':String(viewport===key)}));
    if(showPreviewButton)toolbar.append(button('Vista previa',()=>{const ann={...readMetadata(),presentation:normalizeEditorial(model)};(onPreview||showEditorialPreview)(ann,{viewport});},{'data-ed-preview':''}));
    toolbar.append(button('Guardar borrador',saveDraft,{'data-ed-draft':'save'}),button('Recuperar borrador',loadDraft,{'data-ed-draft':'load'}));
  }
  function renderPages(){
    pages.replaceChildren();model.pages.forEach((p,i)=>pages.append(button(p.name,()=>{pageIndex=i;selected=null;render();},{'aria-pressed':String(i===pageIndex),'data-ed-page':i})));
    const add=button('+ Página',()=>mutate(()=>{const next=clone(editorialFor({title:'Nueva página',paragraphs:['Agregá el contenido.']}).pages[0]);model.pages.push(next);pageIndex=model.pages.length-1;selected=null;}),{'data-ed-page-add':''});add.disabled=model.pages.length>=8;pages.append(add);
    pages.append(button('Duplicar página',()=>mutate(()=>{const p=clone(getPage());p.id=editorialId();p.name+=' · copia';p.blocks.forEach(b=>b.id=editorialId());model.pages.splice(pageIndex+1,0,p);pageIndex++;selected=null;}),{'data-ed-page-copy':''}),button('Eliminar página',async()=>{if(model.pages.length<2)return;if(await showGameDialog('¿Eliminar esta página?',{confirm:true,acceptLabel:'Eliminar'}))mutate(()=>{model.pages.splice(pageIndex,1);pageIndex=Math.min(pageIndex,model.pages.length-1);selected=null;});},{'data-ed-page-remove':''}));
    pages.querySelector('[data-ed-page-copy]').disabled=model.pages.length>=8;pages.querySelector('[data-ed-page-remove]').disabled=model.pages.length<2;
  }
  function assetPicker(parent,current,set,caption){
    const row=el('div',{class:'ed-inspector-row'}),path=input('text',current?.startsWith('data:')?'':current,v=>{const src=editorialAsset(v);if(v&&!src){say('Usá una ruta ./assets/images/ a un PNG/JPG/WebP del juego, por ejemplo ./assets/images/matito/imagen.png.');return;}mutate(()=>set(src));},{placeholder:'./assets/images/matito/imagen.png','aria-label':caption+' · archivo del juego'});
    row.append(path);const file=input('file','',()=>{}, {accept:'image/png,image/jpeg,image/webp','aria-label':caption+' · importar imagen'});
    listen(file,'change',async()=>{
      const chosen=file.files?.[0];if(!chosen)return;const epoch=generation,pageId=getPage().id,blockId=selected;
      try{if(chosen.size>12000000||!['image/png','image/jpeg','image/webp'].includes(chosen.type))throw Error('Elegí un PNG, JPG o WebP de hasta 12 MB.');
        const bitmap=await createImageBitmap(chosen);try{
          const ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
          let data=canvas.toDataURL('image/webp',.82);if(data.length>350000)data=canvas.toDataURL('image/webp',.5);if(data.length>350000)throw Error('La imagen sigue siendo demasiado grande. Usá una versión más pequeña.');
          if(destroyed||generation!==epoch||getPage().id!==pageId||selected!==blockId){say('La selección cambió; volvé a importar la imagen.');return;}if(mutate(()=>set(data)))say('Imagen incorporada al diseño. Se publicará junto con el anuncio.');
        }finally{bitmap.close();}
      }catch(e){say(e.message);}finally{file.value='';}
    });row.append(file,button('Quitar',()=>mutate(()=>set(''))));parent.append(row);
  }
  function renderInspector(){
    inspector.replaceChildren();const page=getPage(),block=getBlock();
    const sizes=el('fieldset',{'data-ed-frame-sizes':''});sizes.append(el('legend',{},'Tamaño del contenedor · píxeles'));
    sizes.append(el('p',{},'Incluye contenido y botones. Se limita a la pantalla disponible. Cada página puede tener sus propios tamaños.'));
    for(const format of EDITORIAL_FORMATS){
      const row=el('div',{class:'ed-inspector-row'}),size=editorialFrame(model,pageIndex,format,frameContext);row.append(el('strong',{},format==='desktop'?'Desktop':format==='notebook'?'Notebook':'Mobile'));
      for(const [key,label,max] of [['width','Ancho',1920],['height','Alto',1080]])setField(row,label,input('number',size[key],value=>mutate(()=>{page.frames||={};page.frames[format]={...size,[key]:Number(value)};}),{min:180,max,step:1,'data-ed-frame':key,'data-ed-frame-format':format,'aria-label':label+' del contenedor '+format}));
      sizes.append(row);
    }
    sizes.append(button('Restaurar tamaños de esta página',()=>mutate(()=>{delete page.frames;}),{'data-ed-frame-reset':''}));inspector.append(sizes);
    const pageBox=el('div');pageBox.append(el('strong',{},'Página y fondo'));
    setField(pageBox,'Nombre',input('text',page.name,v=>mutate(()=>page.name=v),{'aria-label':'Nombre de página',maxlength:80}));
    setField(pageBox,'Color',input('color',page.background.color,v=>mutate(()=>page.background.color=v),{'aria-label':'Color de fondo'}));
    setField(pageBox,'Oscurecer',input('range',page.background.shade,v=>mutate(()=>page.background.shade=Number(v)),{min:0,max:.85,step:.05,'aria-label':'Oscurecer fondo'}));
    assetPicker(pageBox,page.background.image,v=>page.background.image=v,'Fondo');inspector.append(pageBox);
    const layerBox=el('div');layerBox.append(el('strong',{},'Capas · última al frente'));
    for(const b of page.blocks)layerBox.append(button((b.type==='text'?b.runs.map(r=>r.text).join(''):b.alt)||'Bloque vacío',()=>{selected=b.id;render();},{class:'ed-layer','data-ed-layer':b.id,'aria-pressed':String(selected===b.id)}));inspector.append(layerBox);
    if(!block){inspector.append(el('p',{},'Seleccioná un bloque para moverlo, redimensionarlo o editarlo. Doble clic sobre el texto para escribir.'));return;}
    const box=el('div');box.append(el('strong',{},block.type==='text'?'Texto seleccionado':'Imagen seleccionada'));
    const bounds=viewport==='mobile'?block.mobile:block;
    for(const [k,label] of [['x','X'],['y','Y'],['w','Ancho %'],['h','Alto %']])setField(box,label,input('number',Math.round(bounds[k]*10)/10,v=>mutate(()=>bounds[k]=Number(v)),{min:k==='w'||k==='h'?5:0,max:100,step:1,'data-ed-rect':k,'aria-label':label}));
    if(block.type==='text'){
      const area=el('textarea',{'aria-label':'Texto del bloque','data-ed-text':''});area.value=block.runs.map(r=>r.text).join('');
      listen(area,'select',()=>selection={start:area.selectionStart,end:area.selectionEnd});listen(area,'keyup',()=>selection={start:area.selectionStart,end:area.selectionEnd});
      listen(area,'change',()=>mutate(()=>block.runs=[{text:area.value,bold:block.runs.every(r=>r.bold),italic:block.runs.every(r=>r.italic)}]));box.append(area);
      const formats=el('div',{class:'ed-inspector-row'});
      for(const [key,label] of [['bold','Negrita'],['italic','Cursiva']]){const format=button(label,()=>mutate(()=>{if(area.value!==block.runs.map(r=>r.text).join(''))block.runs=[{text:area.value,bold:false,italic:false}];block.runs=formatEditorialRuns(block.runs,area.selectionStart,area.selectionEnd,key);}),{'data-ed-format':key});listen(format,'pointerdown',event=>event.preventDefault());formats.append(format);}box.append(formats);
      setField(box,'Tamaño',input('number',block.fontSize,v=>mutate(()=>block.fontSize=Number(v)),{min:12,max:96,'aria-label':'Tamaño del texto'}));
      setField(box,'Color',input('color',block.color,v=>mutate(()=>block.color=v),{'aria-label':'Color del texto'}));
      const alignment=el('select',{'aria-label':'Alineación'});for(const [k,label] of [['left','Izquierda'],['center','Centro'],['right','Derecha']])alignment.append(el('option',{value:k},label));alignment.value=block.align;listen(alignment,'change',()=>mutate(()=>block.align=alignment.value));box.append(alignment);
      const panel=input('checkbox','',(_,n)=>mutate(()=>block.panel=n.checked),{'aria-label':'Panel del texto'});panel.checked=block.panel;setField(box,'Panel de fondo',panel);setField(box,'Color del panel',input('color',block.background,v=>mutate(()=>block.background=v),{'aria-label':'Color del panel'}));
    }else{
      assetPicker(box,block.src,v=>block.src=v,'Imagen');setField(box,'Descripción',input('text',block.alt,v=>mutate(()=>block.alt=v),{'aria-label':'Descripción de imagen',maxlength:200}));
      box.append(button(block.fit==='cover'?'Recortar → Contener':'Contener → Recortar',()=>mutate(()=>block.fit=block.fit==='cover'?'contain':'cover')));
    }
    const actions=el('div',{class:'ed-inspector-row'});
    actions.append(button('Atrás',()=>mutate(()=>{const i=page.blocks.indexOf(block);if(i>0)[page.blocks[i-1],page.blocks[i]]=[block,page.blocks[i-1]];})),button('Adelante',()=>mutate(()=>{const i=page.blocks.indexOf(block);if(i<page.blocks.length-1)[page.blocks[i+1],page.blocks[i]]=[block,page.blocks[i+1]];})),button('Centrar',()=>mutate(()=>bounds.x=(100-bounds.w)/2)),button('Duplicar',()=>mutate(()=>{if(page.blocks.length>=40)return;const copy=clone(block);copy.id=editorialId();page.blocks.push(copy);selected=copy.id;})),button('Eliminar bloque',()=>mutate(()=>{page.blocks=page.blocks.filter(b=>b.id!==selected);selected=null;}),{'data-ed-delete':''}));box.append(actions);inspector.append(box);
  }
  function render(){if(destroyed)return;unbindGesture?.();unbindGesture=null;pageIndex=Math.min(pageIndex,model.pages.length-1);if(!getBlock())selected=null;board.dataset.view=viewport;const frame=editorialFrame(model,pageIndex,viewport,frameContext);const chrome=frameContext==='guide'?140:66;board.style.aspectRatio=`${Math.max(100,frame.width-32)}/${Math.max(60,frame.height-chrome)}`;renderEditorialPage(board,model,{pageIndex,viewport,editable:true,selectedId:selected,fill:true});renderToolbar();renderPages();renderInspector();}
  listen(board,'pointerdown',event=>{
    if(event.button!==0||event.target.closest('[contenteditable=true]'))return;
    const node=event.target.closest('[data-block-id]');if(!node){selected=null;render();return;}
    const id=node.dataset.blockId,handle=event.target.closest('[data-handle]')?.dataset.handle;
    if(selected!==id){selected=id;render();}
    const target=board.querySelector(`[data-block-id="${CSS.escape(id)}"]`),block=getBlock(),bounds=viewport==='mobile'?block.mobile:block,initial=clone(bounds),before=snapshot(),r=board.querySelector('.ed-surface').getBoundingClientRect(),x=event.clientX,y=event.clientY;
    event.preventDefault();target.setPointerCapture(event.pointerId);let changed=false;
    const move=e=>{const dx=(e.clientX-x)/r.width*100,dy=(e.clientY-y)/r.height*100;let next={...initial};
      if(!handle){next.x=Math.max(0,Math.min(100-next.w,initial.x+dx));next.y=Math.max(0,Math.min(100-next.h,initial.y+dy));}
      else {if(handle.includes('e'))next.w=Math.max(5,Math.min(100-initial.x,initial.w+dx));if(handle.includes('s'))next.h=Math.max(5,Math.min(100-initial.y,initial.h+dy));if(handle.includes('w')){next.x=Math.max(0,Math.min(initial.x+initial.w-5,initial.x+dx));next.w=initial.w+initial.x-next.x;}if(handle.includes('n')){next.y=Math.max(0,Math.min(initial.y+initial.h-5,initial.y+dy));next.h=initial.h+initial.y-next.y;}}
      Object.assign(bounds,next);applyEditorialRect(target,block,viewport);changed=true;
    };
    const done=e=>{target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',done);target.removeEventListener('pointercancel',cancel);unbindGesture=null;if(e&&changed){change(before);render();}};
    const cancel=()=>{Object.assign(bounds,initial);applyEditorialRect(target,block,viewport);done();};
    unbindGesture=cancel;target.addEventListener('pointermove',move);target.addEventListener('pointerup',done);target.addEventListener('pointercancel',cancel);
  });
  listen(board,'dblclick',event=>{
    const body=event.target.closest('.ed-text');if(!body)return;const block=getBlock();if(!block)return;body.contentEditable='true';body.focus();
    const before=snapshot();const finish=()=>{if(destroyed||!body.isConnected)return;const runs=[];
      const read=(node,bold=false,italic=false)=>{if(node.nodeType===3)runs.push({text:node.textContent,bold,italic});else if(node.nodeType===1){if(node.tagName==='BR')runs.push({text:'\n',bold,italic});else{for(const c of node.childNodes)read(c,bold||['B','STRONG'].includes(node.tagName),italic||['I','EM'].includes(node.tagName));if(['DIV','P'].includes(node.tagName)&&node.nextSibling)runs.push({text:'\n',bold,italic});}}};for(const c of body.childNodes)read(c);block.runs=normalizeRuns(runs);change(before);render();};
    body.addEventListener('blur',finish,{once:true});body.addEventListener('paste',e=>{e.preventDefault();const value=e.clipboardData.getData('text/plain');const sel=window.getSelection();if(sel.rangeCount){const range=sel.getRangeAt(0);range.deleteContents();const node=document.createTextNode(value);range.insertNode(node);range.setStartAfter(node);range.collapse(true);sel.removeAllRanges();sel.addRange(range);}});
  });
  listen(board,'keydown',e=>{if(e.target.closest('[contenteditable=true]')||!getBlock())return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();mutate(()=>{const r=viewport==='mobile'?getBlock().mobile:getBlock(),amount=e.shiftKey?5:1;if(e.key==='ArrowLeft')r.x-=amount;if(e.key==='ArrowRight')r.x+=amount;if(e.key==='ArrowUp')r.y-=amount;if(e.key==='ArrowDown')r.y+=amount;});}});
  render();
  return {
    getDocument:()=>normalizeEditorial(model),
    async setAnnouncement(ann={}, {force=false}={}){if(!force&&hasUnsaved()&&!await confirmDiscard())return false;unbindGesture?.();frameContext=ann.contentKind==='tutorial'&&ann.tutorialZone==='main'?'guide':'popup';model=editorialFor(ann);pageIndex=0;selected=null;undo=[];redo=[];dirty=false;generation++;render();say('Diseño cargado. Publicar requiere el botón de publicación.');return true;},
    markMetadataLoaded(){savedMetadata=JSON.stringify(readMetadata());},
    markPublished(){dirty=false;lastSaved=snapshot();savedMetadata=JSON.stringify(readMetadata());say('Diseño publicado.');},
    hasUnsavedChanges:hasUnsaved,
    destroy(){destroyed=true;unbindGesture?.();abort.abort();root.replaceChildren();}
  };
}
