// 23.21.3 RC3 — editor Admin del catálogo autoritativo de emotes.
import { EMOTE_ANIMATIONS, EMOTE_CATALOG, applyEmoteCatalogSnapshot, emoteAssetCandidates } from './emoteCatalog.js';

function esc(value){ return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function nextId(rows){
  const used=new Set(rows.map(r=>r.id));
  for(let i=1;i<=999;i++){ const id=`emote_${String(i).padStart(3,'0')}`; if(!used.has(id)) return id; }
  return `emote_${Date.now().toString(36)}`;
}
function cloneRows(rows){ return (rows||[]).map(r=>({...r})); }

export function mountAdminEmotesPane(root,{loadCatalog,saveCatalog,onApplied}={}){
  if(!root) return {load:async()=>{}};
  let rows=cloneRows(EMOTE_CATALOG), loading=false, saving=false;
  const style=document.createElement('style'); style.textContent=`
    .admin-emotes-shell{max-width:1280px;margin:0 auto;padding:8px 4px 28px}.admin-emotes-toolbar{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:0 0 12px}.admin-emotes-note{font-size:12px;opacity:.78;line-height:1.4;max-width:820px}.admin-emotes-actions{display:flex;gap:8px;flex-wrap:wrap}.admin-emotes-table-wrap{overflow:auto;border:1px solid rgba(212,175,55,.28);border-radius:10px;background:rgba(0,0,0,.18)}.admin-emotes-table{width:100%;border-collapse:collapse;min-width:1160px}.admin-emotes-table th,.admin-emotes-table td{padding:7px;border-bottom:1px solid rgba(255,255,255,.08);vertical-align:middle}.admin-emotes-table th{position:sticky;top:0;background:#151810;color:#d4af37;font-size:11px;z-index:1}.admin-emotes-table input[type=text],.admin-emotes-table input[type=number],.admin-emotes-table select{box-sizing:border-box;width:100%;min-width:90px;background:#10140f;color:#eee;border:1px solid rgba(212,175,55,.28);border-radius:5px;padding:6px}.admin-emotes-table .ae-id{min-width:112px}.admin-emotes-table .ae-fallback{min-width:72px;text-align:center}.admin-emotes-check{text-align:center;white-space:nowrap}.admin-emotes-preview{width:46px;height:46px;display:grid;place-items:center;font-size:28px}.admin-emotes-preview img{max-width:44px;max-height:44px;object-fit:contain}.admin-emotes-remove{border:1px solid rgba(220,80,80,.5);background:#241010;color:#ffb4b4;border-radius:6px;padding:6px 8px;cursor:pointer}.admin-emotes-status{min-height:20px;margin-top:10px;font-size:12px}.admin-emotes-status.error{color:#ff9b9b}.admin-emotes-status.ok{color:#9ee7a8}`;
  root.appendChild(style);
  const shell=document.createElement('div'); shell.className='admin-emotes-shell'; root.appendChild(shell);

  function rowFromTr(tr){
    const premium=tr.querySelector('[data-f="premium"]').checked;
    return { id:tr.querySelector('[data-f="id"]').value.trim(), label:tr.querySelector('[data-f="label"]').value.trim(), image:tr.querySelector('[data-f="image"]').value.trim(), audio:tr.querySelector('[data-f="audio"]').value.trim(), fallback:tr.querySelector('[data-f="fallback"]').value.trim(), animation:tr.querySelector('[data-f="animation"]').value, active:tr.querySelector('[data-f="active"]').checked, premium, pricePoints:premium?Number(tr.querySelector('[data-f="pricePoints"]').value):0 };
  }
  function syncRows(){ rows=[...shell.querySelectorAll('tbody tr[data-row]')].map(rowFromTr); }
  function mountPreview(holder,row){
    holder.replaceChildren(); const urls=emoteAssetCandidates(row); let i=0;
    const fallback=()=>{holder.textContent=row.fallback||'🙂';};
    if(!urls.length){fallback();return;} const img=document.createElement('img'); img.alt=''; img.onerror=()=>{i++;if(i<urls.length)img.src=urls[i];else fallback();}; img.src=urls[0]; holder.appendChild(img);
  }
  function render(){
    shell.innerHTML=`<div class="admin-emotes-toolbar"><div><div class="admin-section-title">EMOTES</div><div class="admin-emotes-note">Catálogo autoritativo. Podés agregar nuevos IDs, activar/desactivar, definir asset de imagen/audio, fallback, animación y si cada emote es gratis o premium. El precio que cobra la Tienda se resuelve nuevamente en Functions al comprar.</div></div><div class="admin-emotes-actions"><button class="admin-save-btn" id="ae-reload">↻ Recargar</button><button class="admin-save-btn" id="ae-add">＋ Agregar emote</button><button class="admin-save-btn" id="ae-save">💾 Guardar catálogo</button></div></div><div class="admin-emotes-table-wrap"><table class="admin-emotes-table"><thead><tr><th>Preview</th><th>ID</th><th>Nombre</th><th>Imagen</th><th>Audio</th><th>Fallback</th><th>Animación</th><th>Activo</th><th>Premium</th><th>Precio Puntos</th><th></th></tr></thead><tbody>${rows.map((r,i)=>`<tr data-row="${i}"><td><div class="admin-emotes-preview"></div></td><td><input class="ae-id" data-f="id" type="text" value="${esc(r.id)}"></td><td><input data-f="label" type="text" value="${esc(r.label)}"></td><td><input data-f="image" type="text" value="${esc(r.image||r.id)}" placeholder="emote_013"></td><td><input data-f="audio" type="text" value="${esc(r.audio||'')}" placeholder="opcional"></td><td><input class="ae-fallback" data-f="fallback" type="text" value="${esc(r.fallback||'🙂')}"></td><td><select data-f="animation">${EMOTE_ANIMATIONS.map(a=>`<option value="${a}"${a===(r.animation||'pop')?' selected':''}>${a}</option>`).join('')}</select></td><td class="admin-emotes-check"><input data-f="active" type="checkbox"${r.active!==false?' checked':''}></td><td class="admin-emotes-check"><input data-f="premium" type="checkbox"${r.premium?' checked':''}></td><td><input data-f="pricePoints" type="number" min="0" max="100000" step="1" value="${Number(r.pricePoints)||0}"${r.premium?'':' disabled'}></td><td><button type="button" class="admin-emotes-remove" title="Eliminar">✕</button></td></tr>`).join('')}</tbody></table></div><div id="ae-status" class="admin-emotes-status"></div>`;
    shell.querySelectorAll('tbody tr[data-row]').forEach((tr,i)=>{
      mountPreview(tr.querySelector('.admin-emotes-preview'),rows[i]);
      const premium=tr.querySelector('[data-f="premium"]'), price=tr.querySelector('[data-f="pricePoints"]');
      premium.addEventListener('change',()=>{price.disabled=!premium.checked;if(!premium.checked)price.value='0';else if(Number(price.value)<1)price.value='250';});
      for(const sel of tr.querySelectorAll('input[data-f="image"],input[data-f="fallback"]')) sel.addEventListener('input',()=>{const row=rowFromTr(tr);mountPreview(tr.querySelector('.admin-emotes-preview'),row);});
      tr.querySelector('.admin-emotes-remove').addEventListener('click',()=>{syncRows();rows.splice(i,1);render();});
    });
    shell.querySelector('#ae-add').addEventListener('click',()=>{syncRows();rows.push({id:nextId(rows),label:'Nuevo emote',image:'',audio:'',fallback:'🙂',animation:'pop',active:true,premium:false,pricePoints:0});render();});
    shell.querySelector('#ae-reload').addEventListener('click',()=>void load(true));
    shell.querySelector('#ae-save').addEventListener('click',()=>void save());
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
