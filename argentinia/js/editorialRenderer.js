import { normalizeEditorial } from './editorialModel.js';
import { editorialFrame,editorialViewport } from './editorialFrames.js';
export function applyEditorialFrame(node,model,{pageIndex=0,viewport=editorialViewport(node.ownerDocument.defaultView),context='popup',availableWidth,availableHeight}={}){
  const win=node.ownerDocument.defaultView,frame=editorialFrame(model,pageIndex,viewport,context);
  const width=Math.min(frame.width,availableWidth??win.innerWidth-24),height=Math.min(frame.height,availableHeight??win.innerHeight-24);
  Object.assign(node.style,{width:Math.max(0,width)+'px',height:Math.max(0,height)+'px',maxWidth:Math.max(0,availableWidth??win.innerWidth-24)+'px',maxHeight:Math.max(0,availableHeight??win.innerHeight-24)+'px',boxSizing:'border-box'});
  node.dataset.viewport=viewport;node.dataset.frameWidth=frame.width;node.dataset.frameHeight=frame.height;return frame;
}

export function ensureEditorialStyles(doc=document) {
  if(doc.getElementById('arg-editorial-styles'))return;
  const style=doc.createElement('style');style.id='arg-editorial-styles';
  style.textContent=`.ed-surface{position:relative;isolation:isolate;container-type:inline-size;width:100%;aspect-ratio:16/9;overflow:hidden;background:#0c1811;color:#f4e8c7;box-sizing:border-box}.ed-surface[data-viewport=mobile]{aspect-ratio:4/3}.ed-background,.ed-shade{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.ed-background{object-fit:cover}.ed-block{position:absolute;box-sizing:border-box;min-width:0;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.3;font-family:system-ui,sans-serif}.ed-block p{margin:0}.ed-image{display:block;width:100%;height:100%}.ed-text{min-height:100%;box-sizing:border-box}.ed-block[data-panel=true]{padding:1.2%;border-radius:8px}.ed-editor .ed-block{cursor:move;outline:1px dashed #d4af3770;overflow:visible;touch-action:none}.ed-editor .ed-block[aria-selected=true]{outline:2px solid #f5d777}.ed-editor .ed-text{height:100%;overflow:hidden}.ed-editor .ed-text[contenteditable=true]{cursor:text;outline:2px solid #a7e4ff;user-select:text;overflow:auto}.ed-resize{position:absolute;width:14px;height:14px;padding:0!important;min-width:14px!important;min-height:14px!important;border:1px solid #ffe4a0!important;background:#2c351c!important;border-radius:2px!important;z-index:20;touch-action:none}.ed-resize[data-handle=nw]{left:0;top:0;cursor:nwse-resize}.ed-resize[data-handle=ne]{right:0;top:0;cursor:nesw-resize}.ed-resize[data-handle=sw]{left:0;bottom:0;cursor:nesw-resize}.ed-resize[data-handle=se]{right:0;bottom:0;cursor:nwse-resize}`;
  doc.head.append(style);
}
export function applyEditorialRect(node,block,viewport='desktop') {
  const r=viewport==='mobile'?block.mobile:block;
  Object.assign(node.style,{left:r.x+'%',top:r.y+'%',width:r.w+'%',height:r.h+'%'});
}
export function renderEditorialPage(container,presentation,{pageIndex=0,viewport='desktop',editable=false,selectedId=null,fill=false}={}) {
  const model=normalizeEditorial(presentation),page=model.pages[Math.min(model.pages.length-1,Math.max(0,pageIndex))];
  const doc=container.ownerDocument;ensureEditorialStyles(doc);
  const surface=doc.createElement('div');surface.className='ed-surface'+(editable?' ed-editor':'');surface.dataset.viewport=viewport;
  if(fill)Object.assign(surface.style,{height:'100%',minHeight:'0',aspectRatio:'auto'});
  surface.style.backgroundColor=page.background.color;surface.setAttribute('aria-label',page.name);
  if(page.background.image){const img=doc.createElement('img');img.className='ed-background';img.alt='';img.src=page.background.image;img.addEventListener('error',()=>img.remove(),{once:true});surface.append(img);}
  const shade=doc.createElement('div');shade.className='ed-shade';shade.style.background=`rgba(0,0,0,${page.background.shade})`;surface.append(shade);
  for(const block of page.blocks){
    const node=doc.createElement('div');node.className='ed-block';node.dataset.blockId=block.id;applyEditorialRect(node,block,viewport);node.style.opacity=block.opacity;
    if(editable){node.tabIndex=0;node.setAttribute('aria-selected',String(block.id===selectedId));node.setAttribute('aria-label',block.type==='text'?block.runs.map(r=>r.text).join('').slice(0,80):block.alt);}
    if(block.type==='image'){
      const img=doc.createElement('img');img.className='ed-image';img.draggable=false;img.alt=block.alt;img.src=block.src||'';img.style.objectFit=block.fit;
      if(block.src)node.append(img);else if(editable)node.textContent='Elegí una imagen';
    }else{
      node.style.fontSize=`${block.fontSize/(viewport==='mobile'?6.4:9.6)}cqw`;node.style.color=block.color;node.style.textAlign=block.align;
      node.dataset.panel=String(block.panel);if(block.panel)node.style.backgroundColor=block.background;
      const body=doc.createElement('div');body.className='ed-text';
      for(const run of block.runs){let child=doc.createTextNode(run.text);if(run.italic){const em=doc.createElement('em');em.append(child);child=em;}if(run.bold){const strong=doc.createElement('strong');strong.append(child);child=strong;}body.append(child);}
      node.append(body);
    }
    if(editable&&block.id===selectedId)for(const h of ['nw','ne','sw','se']){const handle=doc.createElement('button');handle.type='button';handle.className='ed-resize';handle.dataset.handle=h;handle.setAttribute('aria-label','Redimensionar '+h);node.append(handle);}
    surface.append(node);
  }
  container.replaceChildren(surface);return surface;
}

// Same page renderer and frame for publication and editor preview. No persistence here.
export function showEditorialPreview(announcement,{onClose=()=>{},parent=document.body}={}) {
  const doc=parent.ownerDocument,previous=doc.activeElement;ensureEditorialStyles(doc);
  const shell=doc.createElement('div');shell.className='ed-preview-shell';shell.style.cssText='position:fixed;inset:0;z-index:12050;background:#000c;display:grid;place-items:center;padding:12px;box-sizing:border-box';
  const card=doc.createElement('section');card.style.cssText='width:min(960px,96vw);max-height:94dvh;overflow:auto;background:#0c1811;border:2px solid #d4af37;border-radius:14px;color:#f4e8c7';card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-label',announcement.title||'Vista previa');
  const stage=doc.createElement('div'),footer=doc.createElement('div');footer.style.cssText='display:flex;align-items:center;justify-content:center;gap:14px;padding:12px;flex-wrap:wrap';
  const model=normalizeEditorial(announcement.presentation);let page=0,closed=false;
  const button=(label,click)=>{const b=doc.createElement('button');b.type='button';b.textContent=label;b.style.cssText='min-height:44px;border:1px solid #d4af37;border-radius:8px;background:#1b2b1f;color:#f4e8c7;padding:8px 16px;cursor:pointer';b.addEventListener('click',click);return b;};
  const counter=doc.createElement('span');
  card.style.display='flex';card.style.flexDirection='column';card.style.overflow='hidden';stage.style.cssText='flex:1;min-height:0';footer.style.flexShrink='0';
  const update=()=>{const viewport=editorialViewport(doc.defaultView);applyEditorialFrame(card,model,{pageIndex:page,viewport});renderEditorialPage(stage,model,{pageIndex:page,viewport,fill:true});prev.hidden=next.hidden=counter.hidden=model.pages.length<2;counter.textContent=`${page+1} / ${model.pages.length}`;prev.disabled=page===0;next.disabled=page===model.pages.length-1;};
  const close=()=>{if(closed)return;closed=true;shell.remove();doc.removeEventListener('keydown',key,true);doc.defaultView.removeEventListener('resize',update);previous?.isConnected&&previous.focus?.();onClose();};
  const prev=button('← Anterior',()=>{page--;update();}),next=button('Siguiente →',()=>{page++;update();}),end=button('Cerrar',close);
  footer.append(prev,counter,next,end);card.append(stage,footer);shell.append(card);
  const key=e=>{if(e.key==='Escape'){e.stopPropagation();e.preventDefault();close();}if(e.key==='Tab'){const nodes=[...card.querySelectorAll('button:not(:disabled)')],i=nodes.indexOf(doc.activeElement);e.preventDefault();nodes[(i+(e.shiftKey?nodes.length-1:1))%nodes.length]?.focus();}};
  shell.addEventListener('click',e=>{if(e.target===shell)close();});doc.addEventListener('keydown',key,true);doc.defaultView.addEventListener('resize',update);parent.append(shell);update();end.focus();return {close};
}
