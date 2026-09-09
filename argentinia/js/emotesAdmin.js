// 23.21.3 RC4 — editor Admin del catálogo autoritativo de emotes + detección de assets.
import {
  EMOTE_ANIMATIONS, EMOTE_CATALOG, EMOTE_FALLBACK_OPTIONS,
  applyEmoteCatalogSnapshot, emoteAssetCandidates, emoteAudioCandidates
} from './emoteCatalog.js';

function esc(value){ return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function nextId(rows){
  const used=new Set(rows.map(r=>r.id));
  for(let i=1;i<=999;i++){ const id=`emote_${String(i).padStart(3,'0')}`; if(!used.has(id)) return id; }
  return `emote_${Date.now().toString(36)}`;
}
function cloneRows(rows){ return (rows||[]).map(r=>({...r})); }
function explicitExt(value){ const m=String(value||'').trim().toLowerCase().match(/\.([a-z0-9]{2,5})$/); return m?.[1]||''; }
function candidateByExt(candidates, ext){ return candidates.find(url=>String(url).toLowerCase().endsWith(`.${ext}`))||null; }
async function probeUrl(url){
  if(!url) return null;
  try{
    const response=await fetch(url,{method:'HEAD',cache:'no-store',credentials:'same-origin'});
    return response.ok;
  }catch{return false;}
}
function fallbackSelectHtml(value){
  const current=String(value||'🙂');
  const options=[...EMOTE_FALLBACK_OPTIONS];
  if(!options.includes(current)) options.unshift(current);
  return `<select class="ae-fallback" data-f="fallback" aria-label="Emoji fallback">${options.map(e=>`<option value="${esc(e)}"${e===current?' selected':''}>${esc(e)}</option>`).join('')}</select>`;
}

export function mountAdminEmotesPane(root,{loadCatalog,saveCatalog,onApplied}={}){
  if(!root) return {load:async()=>{}};
  let rows=cloneRows(EMOTE_CATALOG), loading=false, saving=false, probeGeneration=0;
  const style=document.createElement('style'); style.textContent=`
    .admin-emotes-shell{max-width:1500px;margin:0 auto;padding:8px 4px 28px}.admin-emotes-toolbar{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:0 0 12px}.admin-emotes-note{font-size:12px;opacity:.78;line-height:1.4;max-width:980px}.admin-emotes-actions{display:flex;gap:8px;flex-wrap:wrap}.admin-emotes-table-wrap{overflow:auto;border:1px solid rgba(212,175,55,.28);border-radius:10px;background:rgba(0,0,0,.18)}.admin-emotes-table{width:100%;border-collapse:collapse;min-width:1530px}.admin-emotes-table th,.admin-emotes-table td{padding:7px;border-bottom:1px solid rgba(255,255,255,.08);vertical-align:middle}.admin-emotes-table th{position:sticky;top:0;background:#151810;color:#d4af37;font-size:11px;z-index:1}.admin-emotes-table input[type=text],.admin-emotes-table input[type=number],.admin-emotes-table select{box-sizing:border-box;width:100%;min-width:88px;background:#10140f;color:#eee;border:1px solid rgba(212,175,55,.28);border-radius:5px;padding:6px}.admin-emotes-table .ae-id{min-width:112px}.admin-emotes-table .ae-fallback{min-width:78px;font-size:20px;text-align:center}.admin-emotes-check{text-align:center;white-space:nowrap}.admin-emotes-preview{width:52px;height:52px;display:grid;place-items:center;font-size:30px}.admin-emotes-preview img{max-width:50px;max-height:50px;object-fit:contain}.admin-emotes-probe{text-align:center;font-size:16px;min-width:44px;white-space:nowrap}.admin-emotes-probe[data-state="ok"]{color:#9ee7a8}.admin-emotes-probe[data-state="missing"]{color:#ff9b9b}.admin-emotes-probe[data-state="na"]{opacity:.45}.admin-emotes-remove{border:1px solid rgba(220,80,80,.5);background:#241010;color:#ffb4b4;border-radius:6px;padding:6px 8px;cursor:pointer}.admin-emotes-status{min-height:20px;margin-top:10px;font-size:12px}.admin-emotes-status.error{color:#ff9b9b}.admin-emotes-status.ok{color:#9ee7a8}`;
  root.appendChild(style);
  const shell=document.createElement('div'); shell.className='admin-emotes-shell'; root.appendChild(shell);

  function rowFromTr(tr){
    const premium=tr.querySelector('[data-f="premium"]').checked;
    return {
      id:tr.querySelector('[data-f="id"]').value.trim(),
      label:tr.querySelector('[data-f="label"]').value.trim(),
      image:tr.querySelector('[data-f="image"]').value.trim(),
      audio:tr.querySelector('[data-f="audio"]').value.trim(),
      fallback:tr.querySelector('[data-f="fallback"]').value,
      animation:tr.querySelector('[data-f="animation"]').value,
      active:tr.querySelector('[data-f="active"]').checked,
      premium,
      pricePoints:premium?Number(tr.querySelector('[data-f="pricePoints"]').value):0
    };
  }
  function syncRows(){ rows=[...shell.querySelectorAll('tbody tr[data-row]')].map(rowFromTr); }
  function mountPreview(holder,row){
    holder.replaceChildren(); const urls=emoteAssetCandidates(row);
    const fallback=()=>{holder.textContent=row.fallback||'🙂';};
    fallback();
    if(!urls.length)return;
    void (async()=>{
      for(const url of urls){
        if(!await probeUrl(url)) continue;
        if(!holder.isConnected) return;
        const img=document.createElement('img'); img.alt=''; img.decoding='async'; img.onerror=fallback; img.src=url; holder.replaceChildren(img); return;
      }
    })();
  }
  function setProbe(cell,state){ if(!cell)return; cell.dataset.state=state===true?'ok':state===false?'missing':'na'; cell.textContent=state===true?'✅':state===false?'❌':'—'; }
  async function probeRow(tr,row,generation){
    const imageUrls=emoteAssetCandidates(row), audioUrls=emoteAudioCandidates(row);
    const imageExplicit=explicitExt(row.image), audioExplicit=explicitExt(row.audio);
    const checks=[
      ['webp', imageExplicit&&imageExplicit!=='webp'?null:candidateByExt(imageUrls,'webp')],
      ['gif',  imageExplicit&&imageExplicit!=='gif'?null:candidateByExt(imageUrls,'gif')],
      ['png',  imageExplicit&&imageExplicit!=='png'?null:candidateByExt(imageUrls,'png')],
      ['opus', audioExplicit&&audioExplicit!=='opus'?null:candidateByExt(audioUrls,'opus')],
      ['mp3',  audioExplicit&&audioExplicit!=='mp3'?null:candidateByExt(audioUrls,'mp3')]
    ];
    await Promise.all(checks.map(async([kind,url])=>{
      const result=url?await probeUrl(url):null;
      if(generation!==probeGeneration || !tr.isConnected) return;
      setProbe(tr.querySelector(`[data-probe="${kind}"]`),result);
    }));
  }
  function probeAll(){ const generation=++probeGeneration; shell.querySelectorAll('tbody tr[data-row]').forEach(tr=>void probeRow(tr,rowFromTr(tr),generation)); }
  function render(){
    shell.innerHTML=`<div class="admin-emotes-toolbar"><div><div class="admin-section-title">EMOTES</div><div class="admin-emotes-note">Catálogo autoritativo. Podés agregar nuevos IDs, editar nombre, imagen, audio, fallback, animación, activo, gratis/premium y precio. WEBP/GIF/PNG y OPUS/MP3 se prueban contra los assets publicados. El precio y la elegibilidad se vuelven a resolver en Functions al comprar o enviar.</div></div><div class="admin-emotes-actions"><button class="admin-save-btn" id="ae-reload">↻ Recargar</button><button class="admin-save-btn" id="ae-probe">🔎 Detectar assets</button><button class="admin-save-btn" id="ae-add">＋ Agregar emote</button><button class="admin-save-btn" id="ae-save">💾 Guardar catálogo</button></div></div><div class="admin-emotes-table-wrap"><table class="admin-emotes-table"><thead><tr><th>Preview</th><th>ID</th><th>Nombre</th><th>Imagen</th><th>WEBP</th><th>GIF</th><th>PNG</th><th>Audio</th><th>OPUS</th><th>MP3</th><th>Fallback</th><th>Animación</th><th>Activo</th><th>Premium</th><th>Precio Puntos</th><th></th></tr></thead><tbody>${rows.map((r,i)=>`<tr data-row="${i}"><td><div class="admin-emotes-preview"></div></td><td><input class="ae-id" data-f="id" type="text" value="${esc(r.id)}"></td><td><input data-f="label" type="text" value="${esc(r.label)}"></td><td><input data-f="image" type="text" value="${esc(r.image||r.id)}" placeholder="emote_013"></td><td class="admin-emotes-probe" data-probe="webp">…</td><td class="admin-emotes-probe" data-probe="gif">…</td><td class="admin-emotes-probe" data-probe="png">…</td><td><input data-f="audio" type="text" value="${esc(r.audio??r.id)}" placeholder="vacío = sin audio"></td><td class="admin-emotes-probe" data-probe="opus">…</td><td class="admin-emotes-probe" data-probe="mp3">…</td><td>${fallbackSelectHtml(r.fallback)}</td><td><select data-f="animation">${EMOTE_ANIMATIONS.map(a=>`<option value="${a}"${a===(r.animation||'pop')?' selected':''}>${a}</option>`).join('')}</select></td><td class="admin-emotes-check"><input data-f="active" type="checkbox"${r.active!==false?' checked':''}></td><td class="admin-emotes-check"><input data-f="premium" type="checkbox"${r.premium?' checked':''}></td><td><input data-f="pricePoints" type="number" min="0" max="100000" step="1" value="${Number(r.pricePoints)||0}"${r.premium?'':' disabled'}></td><td><button type="button" class="admin-emotes-remove" title="Eliminar">✕</button></td></tr>`).join('')}</tbody></table></div><div id="ae-status" class="admin-emotes-status"></div>`;
    shell.querySelectorAll('tbody tr[data-row]').forEach((tr,i)=>{
      mountPreview(tr.querySelector('.admin-emotes-preview'),rows[i]);
      const premium=tr.querySelector('[data-f="premium"]'), price=tr.querySelector('[data-f="pricePoints"]');
      premium.addEventListener('change',()=>{price.disabled=!premium.checked;if(!premium.checked)price.value='0';else if(Number(price.value)<1)price.value='250';});
      const refresh=()=>{const row=rowFromTr(tr);mountPreview(tr.querySelector('.admin-emotes-preview'),row);for(const c of tr.querySelectorAll('[data-probe]')){c.dataset.state='';c.textContent='…';}};
      for(const sel of tr.querySelectorAll('input[data-f="image"],input[data-f="audio"],select[data-f="fallback"]')) sel.addEventListener('input',refresh);
      tr.querySelector('.admin-emotes-remove').addEventListener('click',()=>{syncRows();rows.splice(i,1);render();});
    });
    shell.querySelector('#ae-add').addEventListener('click',()=>{syncRows();const id=nextId(rows);rows.push({id,label:'Nuevo emote',image:id,audio:id,fallback:'🙂',animation:'pop',active:true,premium:false,pricePoints:0});render();});
    shell.querySelector('#ae-reload').addEventListener('click',()=>void load(true));
    shell.querySelector('#ae-probe').addEventListener('click',probeAll);
    shell.querySelector('#ae-save').addEventListener('click',()=>void save());
    probeAll();
  }
  function status(text,kind=''){const el=shell.querySelector('#ae-status');if(el){el.textContent=text||'';el.className=`admin-emotes-status${kind?' '+kind:''}`;}}
  async function load(force=false){
    if(loading)return;loading=true;status('Cargando catálogo autoritativo…');
    try{const snap=await loadCatalog?.({force});if(snap?.items?.length){applyEmoteCatalogSnapshot(snap);rows=cloneRows(snap.items);}else rows=cloneRows(EMOTE_CATALOG);render();status(`Catálogo cargado · ${rows.length} emotes`,'ok');}
    catch(e){render();status(`No se pudo cargar: ${e?.message||e}`,'error');}
    finally{loading=false;}
  }
  async function save(){
    if(saving)return;syncRows();saving=true;const btn=shell.querySelector('#ae-save');if(btn)btn.disabled=true;status('Validando y guardando en servidor…');
    try{const snap=await saveCatalog?.(rows);if(!snap?.items?.length)throw new Error('EMOTE_CATALOG_SAVE_EMPTY');applyEmoteCatalogSnapshot(snap);rows=cloneRows(snap.items);render();status(`Guardado · ${rows.length} emotes · ${snap.catalogVersion||''}`,'ok');onApplied?.(snap);}
    catch(e){status(e?.message||String(e),'error');}
    finally{saving=false;const b=shell.querySelector('#ae-save');if(b)b.disabled=false;}
  }
  render();
  return {load};
}
