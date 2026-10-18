// js/campaignsUI.js — Entrega 23.13.58
// UI de Anuncios/Eventos + popup público. No contiene lógica económica.
// @game-text-surface strict

import {
  fetchAnnouncements, saveAnnouncement, updateAnnouncement, finalizeAnnouncement, deleteAnnouncement,
  isAnnouncementDismissed, dismissAnnouncement,
  fetchCampaignEvents, fetchCampaignSnapshot, createCampaignEvent, updateCampaignEvent, finalizeCampaignEvent, deleteCampaignEvent
} from './firebaseClient.js';
import { CAMPAIGN_EVENT_TYPES, campaignStatus, eventValueLabel } from './campaigns.js';
import { gameText } from './gameTexts.js';
import { mountEditorialStudio } from './editorialStudio.js';
import { editorialFor, editorialSummary, EDITORIAL_ZONES, EDITORIAL_TOUR_STEPS, isEditorialVisible } from './editorialModel.js';
import { defaultZoneTutorial, defaultStepTutorial } from './tutorialContent.js';
import { renderEditorialPage } from './editorialRenderer.js';
import { showGameDialog } from './gameDialogs.js';

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
}


function announcementImageUrl(filename) {
  const name = String(filename || '').trim();
  if (!/^[A-Za-z0-9._-]+\.png$/i.test(name)) return '';
  try {
    return new URL(`assets/images/ui/${encodeURIComponent(name)}`, document.baseURI).href;
  } catch {
    return `./assets/images/ui/${encodeURIComponent(name)}`;
  }
}

function asDateInput(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dateFromInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function formatDate(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
}

function statusLabel(item) {
  const status = campaignStatus(item);
  return status === 'active' ? gameText('admin.campaigns.status.active')
    : status === 'future' ? gameText('admin.campaigns.status.future')
    : gameText('admin.campaigns.status.finalized');
}

function statusClass(item) {
  return `campaign-status-${campaignStatus(item)}`;
}

function ensureCampaignStyles() {
  if (document.getElementById('arg-campaign-styles')) return;
  const style = document.createElement('style');
  style.id = 'arg-campaign-styles';
  style.textContent = `
    .campaign-admin-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
    .campaign-popup-card[data-editorial=true]{width:min(960px,96vw)}
    .campaign-popup-card[data-editorial=true] .campaign-popup-content{padding:12px}
    .campaign-editorial-host{margin:0 -12px}
    .campaign-form-card{background:rgba(0,0,0,.18);border:1px solid rgba(212,175,55,.22);border-radius:12px;padding:14px}
    .campaign-field{display:flex;flex-direction:column;gap:5px;margin:8px 0;text-align:left}
    .campaign-field label{font-size:11px;color:#cfc9b6;font-weight:700}
    .campaign-field input,.campaign-field textarea,.campaign-field select{background:#111b14;color:#f3efe5;border:1px solid rgba(255,255,255,.18);border-radius:7px;padding:8px;box-sizing:border-box;width:100%}
    .campaign-checks{display:flex;gap:12px;flex-wrap:wrap;margin:10px 0;font-size:11px;color:#d9d5c8}
    .campaign-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
    .campaign-table{width:100%;border-collapse:collapse;font-size:11px}
    .campaign-table th,.campaign-table td{padding:7px 6px;border-bottom:1px solid rgba(255,255,255,.09);text-align:left;vertical-align:middle}
    .campaign-status-active{color:#7ee787;font-weight:900}.campaign-status-future{color:#79c0ff;font-weight:900}.campaign-status-finalized{color:#9b9b9b;font-weight:800}
    .campaign-kind{font-size:10px;border:1px solid rgba(255,255,255,.15);border-radius:999px;padding:2px 6px;white-space:nowrap}
    .campaign-image-preview{height:90px;border-radius:9px;background:#09120d;border:1px solid rgba(255,255,255,.12);margin-top:8px;display:none;overflow:hidden;position:relative}
    .campaign-image-preview img{display:block;width:100%;height:100%;object-fit:cover;object-position:center}
    .campaign-active-event-strip{border:1px solid rgba(212,175,55,.45);background:rgba(105,76,15,.24);border-radius:10px;padding:8px 10px;margin:8px 0;font-size:11px;color:#f4df9d}
    .campaign-popup-shell{position:fixed;inset:0;z-index:12000;background:rgba(0,0,0,.76);display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box}
    .campaign-popup-card{position:relative;width:min(720px,94vw);max-height:88vh;overflow:auto;border:1px solid rgba(212,175,55,.55);border-radius:18px;background:#09120d;color:#f7f1e2;box-shadow:0 24px 80px rgba(0,0,0,.72);isolation:isolate}
    .campaign-popup-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;z-index:0;pointer-events:none}
    .campaign-popup-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,9,6,.48),rgba(4,9,6,.88));z-index:1;pointer-events:none}
    .campaign-popup-content{position:relative;z-index:2;padding:28px}
    .campaign-popup-title{font-size:28px;font-weight:1000;color:#f5d777;margin:0 0 6px}
    .campaign-popup-subtitle{font-size:15px;color:#d8d3c4;margin-bottom:18px}
    .campaign-popup-paragraph{font-size:14px;line-height:1.55;margin:10px 0;color:#f3efe8;white-space:pre-wrap}
    .campaign-popup-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:22px}
    .campaign-popup-dismiss{display:flex;gap:7px;align-items:center;font-size:12px;color:#c9c5b8}
    .campaign-popup-close{border:1px solid rgba(212,175,55,.55);background:#18261c;color:#f7e7a8;border-radius:9px;padding:9px 18px;font-weight:900;cursor:pointer}
    .campaign-popup-carousel-head{display:flex;align-items:center;justify-content:flex-end;gap:9px;min-height:34px;margin:-8px 0 4px}
    .campaign-popup-nav{width:34px;height:34px;border-radius:999px;border:1px solid rgba(212,175,55,.52);background:rgba(9,18,13,.72);color:#f5d777;font-size:24px;line-height:1;cursor:pointer}
    .campaign-popup-counter{min-width:44px;text-align:center;color:#d7c47a;font-size:11px;font-weight:900;letter-spacing:.06em}
    .campaign-popup-dots{display:flex;align-items:center;justify-content:center;gap:9px;min-height:18px;margin:18px 0 2px}
    .campaign-popup-dot{width:9px;height:9px;padding:0;border-radius:999px;border:1px solid rgba(212,175,55,.8);background:rgba(212,175,55,.18);cursor:pointer;transition:transform .15s ease,background .15s ease,box-shadow .15s ease}
    .campaign-popup-dot.active{background:#d4af37;transform:scale(1.28);box-shadow:0 0 9px rgba(212,175,55,.55)}
    @media(max-width:760px){.campaign-admin-grid{grid-template-columns:1fr}.campaign-popup-content{padding:20px}.campaign-popup-title{font-size:23px}}
  `;
  document.head.appendChild(style);
}

function eventTypeOptions(selected = '') {
  return Object.entries(CAMPAIGN_EVENT_TYPES).map(([key, def]) => `<option value="${esc(key)}" ${selected===key?'selected':''}>${esc(gameText(def.labelKey))}</option>`).join('');
}
const mountedCampaignPanes=new WeakMap();

export function mountAdminCampaignsPane(root, { currentUser } = {}) {
  ensureCampaignStyles();
  if (!root) return;
  mountedCampaignPanes.get(root)?.();
  root.innerHTML = `
    <div class="admin-section">
      <div class="admin-section-title">${esc(gameText('admin.campaigns.title'))}</div>
      <div class="admin-debug-summary">${esc(gameText('admin.campaigns.subtitle'))}</div>
      <div class="campaign-admin-grid">
        <div class="campaign-form-card">
          <div class="admin-section-title">${esc(gameText('admin.campaigns.newAnnouncement'))}</div>
          <input type="hidden" data-ann-id>
          <div class="campaign-field"><label>${esc(gameText('editorial.kind'))}</label><select data-ann-kind><option value="announcement">${esc(gameText('editorial.announcement'))}</option><option value="event">${esc(gameText('editorial.event'))}</option><option value="tutorial">${esc(gameText('editorial.tutorial'))}</option></select></div>
          <div class="campaign-field" data-zone-field hidden><label>${esc(gameText('editorial.zone'))}</label><select data-ann-zone>${Object.entries(EDITORIAL_ZONES).map(([id,label])=>`<option value="${id}">${esc(label)}</option>`).join('')}</select></div>
          <div class="campaign-field" data-tutorial-step-field hidden><label>${esc(gameText('tutorial.editor.step'))}</label><select data-ann-step>${Object.entries(EDITORIAL_TOUR_STEPS).map(([id,label])=>`<option value="${id}">${esc(label)}</option>`).join('')}</select></div>
          <div class="campaign-actions" data-tutorial-template-field hidden><button type="button" class="admin-save-btn" data-tutorial-template>${esc(gameText('tutorial.editor.template'))}</button></div>
          <div class="campaign-field" data-link-field hidden><label>${esc(gameText('editorial.linkedEvent'))}</label><select data-ann-link><option value="">${esc(gameText('editorial.unlinked'))}</option></select></div>
          <div class="campaign-field"><label>${esc(gameText('admin.campaigns.announcement.title'))}</label><input data-ann-title maxlength="120"></div>
          <div class="campaign-field"><label>${esc(gameText('admin.campaigns.announcement.subtitle'))}</label><input data-ann-subtitle maxlength="240"></div>
          <div class="campaign-field" hidden><textarea data-ann-paragraphs rows="7"></textarea></div>
          <div class="campaign-field" hidden><input data-ann-image></div>
          <div class="campaign-image-preview" data-ann-preview></div>
          <div class="campaign-field"><label>${esc(gameText('admin.campaigns.start'))}</label><input type="datetime-local" data-ann-start></div>
          <div class="campaign-field"><label>${esc(gameText('admin.campaigns.endOptional'))}</label><input type="datetime-local" data-ann-end></div>
          <div class="campaign-checks">
            <label><input type="checkbox" data-ann-popup checked> ${esc(gameText('admin.campaigns.announcement.popup'))}</label>
            <label><input type="checkbox" data-ann-news checked> ${esc(gameText('admin.campaigns.announcement.news'))}</label>
            <label><input type="checkbox" data-ann-dismissible checked> ${esc(gameText('admin.campaigns.announcement.dismissible'))}</label>
          </div>
          <div data-editorial-root></div>
          <div class="campaign-actions"><button class="admin-save-btn" data-ann-save>${esc(gameText('admin.campaigns.saveAnnouncement'))}</button><button class="admin-save-btn" data-ann-cancel>${esc(gameText('editorial.new'))}</button></div>
          <div class="store-error-msg" data-ann-error></div>
        </div>
        <div class="campaign-form-card">
          <div class="admin-section-title">${esc(gameText('admin.campaigns.newEvent'))}</div>
          <input type="hidden" data-event-id>
          <div class="campaign-field"><label>${esc(gameText('admin.campaigns.event.name'))}</label><input data-event-name maxlength="120"></div>
          <div class="campaign-field"><label>${esc(gameText('admin.campaigns.event.type'))}</label><select data-event-type>${eventTypeOptions()}</select></div>
          <div class="campaign-field"><label>${esc(gameText('admin.campaigns.event.value'))}</label><input type="number" data-event-value value="50" step="1"></div>
          <div class="campaign-field"><label>${esc(gameText('admin.campaigns.start'))}</label><input type="datetime-local" data-event-start></div>
          <div class="campaign-field"><label>${esc(gameText('admin.campaigns.end'))}</label><input type="datetime-local" data-event-end></div>
          <div class="campaign-actions"><button class="admin-save-btn" data-event-save>${esc(gameText('admin.campaigns.saveEvent'))}</button><button class="admin-save-btn" data-event-cancel style="display:none">${esc(gameText('common.cancel'))}</button></div>
          <div class="store-error-msg" data-event-error></div>
        </div>
      </div>
      <div class="admin-section-title" style="margin-top:18px">${esc(gameText('admin.campaigns.tableTitle'))}</div>
      <div class="admin-debug-table-wrap" data-campaign-table><div class="admin-debug-empty">${esc(gameText('admin.campaigns.loading'))}</div></div>
    </div>`;

  const q = sel => root.querySelector(sel);
  function metadata(){return {id:q('[data-ann-id]').value,title:q('[data-ann-title]').value,subtitle:q('[data-ann-subtitle]').value,contentKind:q('[data-ann-kind]').value,tutorialZone:q('[data-ann-zone]').value,tutorialStep:q('[data-ann-step]').value,linkedEventId:q('[data-ann-link]').value,startAt:q('[data-ann-start]').value,endAt:q('[data-ann-end]').value,showPopup:q('[data-ann-popup]').checked,showInNews:q('[data-ann-news]').checked,dismissible:q('[data-ann-dismissible]').checked};}
  function setMetadata(a={}){
    for(const [sel,key] of [['id','id'],['title','title'],['subtitle','subtitle'],['kind','contentKind'],['zone','tutorialZone'],['step','tutorialStep'],['link','linkedEventId']])q(`[data-ann-${sel}]`).value=a[key]||(sel==='kind'?'announcement':sel==='zone'?'main':sel==='step'?'welcome':'');
    q('[data-ann-start]').value=asDateInput(a.startAt||new Date());q('[data-ann-end]').value=asDateInput(a.endAt);
    for(const [sel,key] of [['popup','showPopup'],['news','showInNews'],['dismissible','dismissible']])q(`[data-ann-${sel}]`).checked=a[key]!==false;
    updateKind();
    studio.markMetadataLoaded();
  }
  function updateKind(){const kind=q('[data-ann-kind]').value;q('[data-zone-field]').hidden=kind!=='tutorial';q('[data-link-field]').hidden=kind!=='event';q('[data-tutorial-step-field]').hidden=kind!=='tutorial'||q('[data-ann-zone]').value!=='main';q('[data-tutorial-template-field]').hidden=kind!=='tutorial';for(const name of ['popup','news']){q(`[data-ann-${name}]`).disabled=kind==='tutorial';if(kind==='tutorial')q(`[data-ann-${name}]`).checked=false;}q('[data-ann-dismissible]').disabled=kind==='tutorial';if(kind==='tutorial')q('[data-ann-dismissible]').checked=true;}
  const studio=mountEditorialStudio(q('[data-editorial-root]'),{draftKey:`argentinia:editorial:${currentUser?.uid||'admin'}`,readMetadata:metadata,restoreMetadata:setMetadata,onPreview:(ann,view)=>showAnnouncementCarousel([{...ann,id:'editor-preview',presentation:ann.presentation}],{currentUser:null,preview:true,previewViewport:view.viewport})});
  const observer=new MutationObserver(()=>{if(!root.isConnected){studio.destroy();observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});
  mountedCampaignPanes.set(root,()=>{studio.destroy();observer.disconnect();});
  q('[data-ann-kind]').addEventListener('change',updateKind);
  q('[data-ann-zone]').addEventListener('change',updateKind);
  q('[data-tutorial-template]').addEventListener('click',async()=>{const template=q('[data-ann-zone]').value==='main'?defaultStepTutorial(q('[data-ann-step]').value):defaultZoneTutorial(q('[data-ann-zone]').value);if(await studio.setAnnouncement(template))setMetadata({...template,id:'',startAt:new Date(),endAt:null,showPopup:false,showInNews:false});});
  const preview = q('[data-ann-preview]');
  const refreshPreview = () => {
    const url = announcementImageUrl(q('[data-ann-image]').value);
    if (!url) { preview.style.display='none'; preview.replaceChildren(); return; }
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.onload = () => { preview.style.display='block'; };
    img.onerror = () => { preview.style.display='none'; preview.replaceChildren(); };
    preview.replaceChildren(img);
    preview.style.display='none';
    img.src = url;
  };
  q('[data-ann-image]').addEventListener('input', refreshPreview);

  async function resetAnnouncement({force=false}={}) {
    if(!await studio.setAnnouncement({}, {force}))return;
    setMetadata();
    q('[data-ann-id]').value=''; q('[data-ann-title]').value=''; q('[data-ann-subtitle]').value=''; q('[data-ann-paragraphs]').value=''; q('[data-ann-image]').value='';
    q('[data-ann-start]').value=asDateInput(new Date()); q('[data-ann-end]').value=''; q('[data-ann-popup]').checked=true; q('[data-ann-news]').checked=true; q('[data-ann-dismissible]').checked=true;
    q('[data-ann-error]').textContent=''; refreshPreview();
  }
  function resetEvent() {
    q('[data-event-id]').value=''; q('[data-event-name]').value=''; q('[data-event-type]').value='pack_discount'; q('[data-event-value]').value='50'; q('[data-event-start]').value=asDateInput(new Date()); q('[data-event-end]').value=''; q('[data-event-cancel]').style.display='none'; q('[data-event-error]').textContent='';
  }
  void resetAnnouncement({force:true}); resetEvent();

  let announcements=[]; let events=[]; let campaignNow=new Date();
  q('[data-ann-link]').addEventListener('change',()=>{const event=events.find(e=>e.id===q('[data-ann-link]').value);if(event){q('[data-ann-start]').value=asDateInput(event.startAt);q('[data-ann-end]').value=asDateInput(event.endAt);}});
  async function reload() {
    const table=q('[data-campaign-table]'); table.innerHTML=`<div class="admin-debug-empty">${esc(gameText('admin.campaigns.loading'))}</div>`;
    try {
      const loaded = await Promise.all([fetchAnnouncements(100), fetchCampaignEvents(100), fetchCampaignSnapshot()]);
      announcements=loaded[0]; events=loaded[1]; campaignNow=loaded[2]?.now || new Date();
      const previousLink=q('[data-ann-link]').value;q('[data-ann-link]').replaceChildren(new Option('Sin vincular',''),...events.map(e=>new Option(e.name,e.id)));q('[data-ann-link]').value=previousLink;
      const rows = [
        ...announcements.map(a => ({ kind:'announcement', item:a, name:a.title, type:a.contentKind==='tutorial'?`Tutorial · ${EDITORIAL_ZONES[a.tutorialZone]||a.tutorialZone}`:a.contentKind==='event'?'Comunicación de evento':gameText('admin.campaigns.kind.announcement') })),
        ...events.map(e => ({ kind:'event', item:e, name:e.name, type:`${CAMPAIGN_EVENT_TYPES[e.type]?.labelKey ? gameText(CAMPAIGN_EVENT_TYPES[e.type].labelKey) : e.type} ${eventValueLabel(e)}` }))
      ].sort((a,b) => (b.item.startAt?.getTime?.()||0)-(a.item.startAt?.getTime?.()||0));
      if (!rows.length) { table.innerHTML=`<div class="admin-debug-empty">${esc(gameText('admin.campaigns.empty'))}</div>`; return; }
      table.innerHTML=`<table class="campaign-table"><thead><tr><th>${esc(gameText('admin.campaigns.col.kind'))}</th><th>${esc(gameText('admin.campaigns.col.name'))}</th><th>${esc(gameText('admin.campaigns.col.type'))}</th><th>${esc(gameText('admin.campaigns.col.start'))}</th><th>${esc(gameText('admin.campaigns.col.end'))}</th><th>${esc(gameText('admin.campaigns.col.status'))}</th><th>${esc(gameText('admin.campaigns.col.actions'))}</th></tr></thead><tbody>${rows.map(row=>`<tr data-kind="${row.kind}" data-id="${esc(row.item.id)}"><td><span class="campaign-kind">${esc(row.kind==='event'?gameText('admin.campaigns.kind.event'):gameText('admin.campaigns.kind.announcement'))}</span></td><td><strong>${esc(row.name)}</strong></td><td>${esc(row.type)}</td><td>${esc(formatDate(row.item.startAt))}</td><td>${esc(formatDate(row.item.endAt))}</td><td class="campaign-status-${campaignStatus(row.item,campaignNow)}">${esc(campaignStatus(row.item,campaignNow)==='active'?gameText('admin.campaigns.status.active'):campaignStatus(row.item,campaignNow)==='future'?gameText('admin.campaigns.status.future'):gameText('admin.campaigns.status.finalized'))}</td><td><button data-edit>✏️</button> <button data-finalize>⏹</button> <button data-delete>🗑️</button></td></tr>`).join('')}</tbody></table>`;
      table.querySelectorAll('[data-edit]').forEach(btn=>btn.addEventListener('click',()=>editRow(btn.closest('tr'))));
      table.querySelectorAll('[data-finalize]').forEach(btn=>btn.addEventListener('click',()=>finalizeRow(btn.closest('tr'))));
      table.querySelectorAll('[data-delete]').forEach(btn=>btn.addEventListener('click',()=>deleteRow(btn.closest('tr'))));
    } catch(error) { table.innerHTML=`<div class="admin-debug-empty">${esc(error?.message || gameText('admin.campaigns.error'))}</div>`; }
  }

  async function editRow(tr) {
    const id=tr.dataset.id, kind=tr.dataset.kind;
    if (kind==='announcement') {
      const a=announcements.find(x=>x.id===id); if(!a)return;
      if(!await studio.setAnnouncement(a))return;setMetadata(a);
      q('[data-ann-id]').value=id; q('[data-ann-title]').value=a.title||''; q('[data-ann-subtitle]').value=a.subtitle||''; q('[data-ann-paragraphs]').value=(a.paragraphs||[]).join('\n\n'); q('[data-ann-image]').value=a.imageFilename||'';
      q('[data-ann-start]').value=asDateInput(a.startAt); q('[data-ann-end]').value=asDateInput(a.endAt); q('[data-ann-popup]').checked=a.showPopup!==false; q('[data-ann-news]').checked=a.showInNews!==false; q('[data-ann-dismissible]').checked=a.dismissible!==false; q('[data-ann-cancel]').style.display='inline-block'; refreshPreview();
    } else {
      const e=events.find(x=>x.id===id); if(!e)return;
      q('[data-event-id]').value=id; q('[data-event-name]').value=e.name||''; q('[data-event-type]').value=e.type||'pack_discount'; q('[data-event-value]').value=e.value||1; q('[data-event-start]').value=asDateInput(e.startAt); q('[data-event-end]').value=asDateInput(e.endAt); q('[data-event-cancel]').style.display='inline-block';
    }
  }
  async function finalizeRow(tr) {
    if (!await showGameDialog(gameText('admin.campaigns.confirmFinalize'),{confirm:true,acceptLabel:'Finalizar'})) return;
    tr.querySelector('[data-finalize]').disabled=true;
    try { await (tr.dataset.kind==='announcement'?finalizeAnnouncement(tr.dataset.id):finalizeCampaignEvent(tr.dataset.id)); await reload(); } catch(e){void showGameDialog(e.message||gameText('admin.campaigns.error'));tr.querySelector('[data-finalize]').disabled=false;}
  }
  async function deleteRow(tr) {
    if (!await showGameDialog(gameText('admin.campaigns.confirmDelete'),{confirm:true,acceptLabel:'Eliminar'})) return;
    try { await (tr.dataset.kind==='announcement'?deleteAnnouncement(tr.dataset.id):deleteCampaignEvent(tr.dataset.id)); await reload(); } catch(e){void showGameDialog(e.message||gameText('admin.campaigns.error'));}
  }

  q('[data-ann-save]').addEventListener('click', async()=>{
    const box=q('[data-ann-error]'),save=q('[data-ann-save]');if(save.disabled)return;box.textContent='';save.disabled=true;
    try {
      const presentation=studio.getDocument(),meta=metadata();
      const payload={...meta,presentation,paragraphs:editorialSummary(presentation),imageFilename:'',startAt:dateFromInput(meta.startAt)||new Date(),endAt:dateFromInput(meta.endAt)};
      const id=q('[data-ann-id]').value;
      const savedId=id?await updateAnnouncement(id,currentUser.uid,payload):await saveAnnouncement(currentUser.uid,payload);
      if(metadata().id===id&&metadata().title===meta.title&&JSON.stringify(studio.getDocument())===JSON.stringify(presentation)){q('[data-ann-id]').value=savedId||id;studio.markPublished();}
      await reload();
      window.dispatchEvent(new CustomEvent('argentinia:editorial-published'));
    } catch(e){box.textContent=e.message||gameText('admin.campaigns.error');}finally{save.disabled=false;}
  });
  q('[data-event-save]').addEventListener('click', async()=>{
    const box=q('[data-event-error]'); box.textContent='';
    try {
      const payload={ name:q('[data-event-name]').value, type:q('[data-event-type]').value, value:Number(q('[data-event-value]').value), startAt:dateFromInput(q('[data-event-start]').value), endAt:dateFromInput(q('[data-event-end]').value) };
      const id=q('[data-event-id]').value;
      if(id) await updateCampaignEvent(id,payload); else await createCampaignEvent(currentUser.uid,payload);
      resetEvent(); await reload();
    } catch(e){box.textContent=e.message||gameText('admin.campaigns.error');}
  });
  q('[data-ann-cancel]').addEventListener('click',resetAnnouncement); q('[data-event-cancel]').addEventListener('click',resetEvent);
  q('[data-event-type]').addEventListener('change',()=>{const def=CAMPAIGN_EVENT_TYPES[q('[data-event-type]').value];if(def)q('[data-event-value]').value=def.defaultValue;});
  void reload();
}

function guestDismissKey(id) { return `argentinia:dismissed-announcement:${id}`; }

async function announcementDismissedForViewer(ann, currentUser) {
  if (!ann?.id) return true;
  if (currentUser?.uid) {
    try { return await isAnnouncementDismissed(currentUser.uid, ann.id); }
    catch { return false; }
  }
  try { return localStorage.getItem(guestDismissKey(ann.id)) === '1'; }
  catch { return false; }
}

export async function maybeShowAnnouncementPopup({ currentUser } = {}) {
  ensureCampaignStyles();
  if (document.querySelector('.campaign-popup-shell')) return false;
  let list=[]; let now=new Date();let snapshot=null;
  try {
    const loaded=await Promise.all([fetchAnnouncements(50), fetchCampaignSnapshot()]);
    list=loaded[0];snapshot=loaded[1]; now=loaded[1]?.now || now;
  } catch { return false; }
  const candidates=list.filter(a=>campaignStatus(a,now)==='active' && a.showPopup && !a.finalizedAt).filter(a=>isEditorialVisible(a,snapshot));
  if (!candidates.length) return false;
  const dismissed=await Promise.all(candidates.map(ann=>announcementDismissedForViewer(ann,currentUser)));
  const visible=candidates.filter((_,index)=>!dismissed[index]);
  if (!visible.length) return false;
  if (document.querySelector('.campaign-popup-shell')) return false;
  await showAnnouncementCarousel(visible,{currentUser});
  return true;
}

export function showAnnouncementCarousel(announcements,{currentUser,preview=false,previewViewport=null,isCurrent=()=>true,onDismissSelected=null}={}) {
  ensureCampaignStyles();
  return new Promise(resolveClosed => {
    const items=Array.isArray(announcements)?announcements.filter(Boolean):[];
    if(!items.length){resolveClosed(false);return;}
    const shell=document.createElement('div'); shell.className='campaign-popup-shell';
    shell.innerHTML=`<div class="campaign-popup-card" role="dialog" aria-modal="true">
      <img class="campaign-popup-bg" data-ann-bg alt="" hidden>
      <div class="campaign-popup-overlay"></div>
      <div class="campaign-popup-content">
        <div class="campaign-popup-carousel-head">
          <button class="campaign-popup-nav" type="button" data-prev aria-label="${esc(gameText('campaign.popup.previous'))}">‹</button>
          <div class="campaign-popup-counter" data-counter></div>
          <button class="campaign-popup-nav" type="button" data-next aria-label="${esc(gameText('campaign.popup.next'))}">›</button>
        </div>
        <h2 class="campaign-popup-title" data-title></h2>
        <div class="campaign-popup-subtitle" data-subtitle></div>
        <div data-paragraphs></div>
        <div class="campaign-editorial-host" data-editorial-host hidden></div>
        <div class="campaign-actions" data-editorial-pages hidden><button type="button" class="campaign-popup-close" data-page-prev>${esc(gameText('campaign.popup.previous'))}</button><span data-page-counter></span><button type="button" class="campaign-popup-close" data-page-next>${esc(gameText('campaign.popup.next'))}</button></div>
        <div class="campaign-popup-dots" data-dots></div>
        <div class="campaign-popup-footer">
          <div data-dismiss-slot></div>
          <button class="campaign-popup-close" data-close>${esc(gameText('campaign.popup.close'))}</button>
        </div>
      </div>
    </div>`;
    const selectedDismissals=new Map();
    let index=0;
    let pageIndex=0;
    let timer=null;
    let closed=false;
    let validityTimer=null;
    const card=shell.querySelector('.campaign-popup-card');
    if(preview&&previewViewport==='mobile')card.style.width='min(640px,96vw)';
    const bg=shell.querySelector('[data-ann-bg]');
    const title=shell.querySelector('[data-title]');
    const subtitle=shell.querySelector('[data-subtitle]');
    const paragraphs=shell.querySelector('[data-paragraphs]');
    const counter=shell.querySelector('[data-counter]');
    const dots=shell.querySelector('[data-dots]');
    const dismissSlot=shell.querySelector('[data-dismiss-slot]');
    const prev=shell.querySelector('[data-prev]');
    const next=shell.querySelector('[data-next]');
    const editorial=shell.querySelector('[data-editorial-host]'),pageControls=shell.querySelector('[data-editorial-pages]'),pagePrev=shell.querySelector('[data-page-prev]'),pageNext=shell.querySelector('[data-page-next]');
    const renderPage=()=>{
      const model=editorialFor(items[index]);pageIndex=Math.min(pageIndex,model.pages.length-1);
      const viewport=preview&&['desktop','mobile'].includes(previewViewport)?previewViewport:(window.innerWidth<760||document.documentElement.classList.contains('argentinia-mobile')?'mobile':'desktop');
      renderEditorialPage(editorial,model,{pageIndex,viewport});
      pageControls.hidden=model.pages.length<2;shell.querySelector('[data-page-counter]').textContent=`${pageIndex+1} / ${model.pages.length}`;pagePrev.disabled=pageIndex===0;pageNext.disabled=pageIndex===model.pages.length-1;
    };

    const stopTimer=()=>{if(timer){clearTimeout(timer);timer=null;}};
    const schedule=()=>{
      stopTimer();
      if(items[index]?.presentation)return;
      if(items.length>1 && !closed) timer=setTimeout(()=>{showIndex((index+1)%items.length,{auto:true});},9000);
    };
    const renderDots=()=>{
      dots.innerHTML=items.length>1?items.map((ann,i)=>`<button type="button" class="campaign-popup-dot${i===index?' active':''}" data-dot="${i}" aria-label="${esc(gameText('campaign.popup.position',{index:i+1,total:items.length}))}"></button>`).join(''):'';
      dots.querySelectorAll('[data-dot]').forEach(btn=>btn.addEventListener('click',()=>showIndex(Number(btn.dataset.dot))));
    };
    const showIndex=(nextIndex,{auto=false}={})=>{
      index=((Number(nextIndex)||0)%items.length+items.length)%items.length;
      pageIndex=0;
      const ann=items[index];
      const designed=!!ann.presentation;card.dataset.editorial=String(designed);editorial.hidden=!designed;pageControls.hidden=true;
      const imageUrl=announcementImageUrl(ann.imageFilename);
      if(imageUrl){bg.hidden=false;bg.src=imageUrl;}else{bg.hidden=true;bg.removeAttribute('src');}
      title.textContent=ann.title||'';
      title.hidden=designed;paragraphs.hidden=designed;
      subtitle.textContent=ann.subtitle||'';
      subtitle.hidden=designed||!ann.subtitle;
      paragraphs.innerHTML=(ann.paragraphs||[]).map(p=>`<p class="campaign-popup-paragraph">${esc(p)}</p>`).join('');
      if(designed){bg.hidden=true;renderPage();}else editorial.replaceChildren();
      counter.textContent=items.length>1?`${index+1} / ${items.length}`:'';
      prev.hidden=next.hidden=items.length<2;
      if(ann.dismissible){
        dismissSlot.innerHTML=`<label class="campaign-popup-dismiss"><input type="checkbox" data-dismiss ${selectedDismissals.get(ann.id)?'checked':''}> ${esc(gameText('campaign.popup.dontShowAgain'))}</label>`;
        dismissSlot.querySelector('[data-dismiss]')?.addEventListener('change',event=>selectedDismissals.set(ann.id,!!event.currentTarget.checked));
      }else dismissSlot.innerHTML='<span></span>';
      renderDots();
      if(!auto) schedule(); else schedule();
    };
    const close=async(cancelled=false)=>{
      if(closed)return;
      closed=true;stopTimer();
      clearInterval(validityTimer);
      document.removeEventListener('keydown',keydown,true);window.removeEventListener('resize',resize);
      const selected=cancelled?[]:items.filter(ann=>ann.dismissible && selectedDismissals.get(ann.id));
      if(!preview&&onDismissSelected)for(const ann of selected)onDismissSelected(ann);
      shell.remove();
      if(!cancelled&&previousFocus?.isConnected)previousFocus.focus?.();
      resolveClosed(!cancelled);
      if(preview||cancelled||onDismissSelected)return;
      await Promise.all(selected.map(async ann=>{
        if(currentUser?.uid){try{await dismissAnnouncement(currentUser.uid,ann.id);}catch{}}
        else{try{localStorage.setItem(guestDismissKey(ann.id),'1');}catch{}}
      }));
    };
    const previousFocus=document.activeElement;
    const keydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();void close();}if(event.key==='Tab'){const nodes=[...card.querySelectorAll('button:not(:disabled),input')].filter(n=>!n.closest('[hidden]')),i=nodes.indexOf(document.activeElement);event.preventDefault();nodes[(i+(event.shiftKey?nodes.length-1:1))%nodes.length]?.focus();}};
    const resize=()=>{if(items[index]?.presentation)renderPage();};
    document.addEventListener('keydown',keydown,true);window.addEventListener('resize',resize);
    pagePrev.addEventListener('click',()=>{if(pageIndex>0){pageIndex--;renderPage();}});pageNext.addEventListener('click',()=>{if(pageIndex<editorialFor(items[index]).pages.length-1){pageIndex++;renderPage();}});
    bg.addEventListener('error',()=>{bg.hidden=true;bg.removeAttribute('src');});
    prev.addEventListener('click',()=>showIndex(index-1));
    next.addEventListener('click',()=>showIndex(index+1));
    shell.querySelector('[data-close]').addEventListener('click',()=>{void close();if(previousFocus?.isConnected)previousFocus.focus?.();});
    card.addEventListener('mouseenter',stopTimer);
    card.addEventListener('mouseleave',schedule);
    card.addEventListener('focusin',stopTimer);
    card.addEventListener('focusout',schedule);
    document.body.appendChild(shell);
    showIndex(0);
    shell.querySelector('[data-close]').focus();
    validityTimer=setInterval(()=>{if(!isCurrent()||!shell.isConnected)void close(true);},250);
  });
}

export async function renderActiveEventsStrip(container) {
  if (!container) return;
  ensureCampaignStyles();
  try {
    const snapshot=await fetchCampaignSnapshot(); const active=snapshot.activeEvents || [];
    if(!active.length){container.innerHTML='';return;}
    container.innerHTML=`<div class="campaign-active-event-strip"><strong>${esc(gameText('campaign.active.title'))}</strong> ${active.map(e=>`${esc(e.name)} · ${esc(CAMPAIGN_EVENT_TYPES[e.type]?.labelKey ? gameText(CAMPAIGN_EVENT_TYPES[e.type].labelKey) : e.type)} ${esc(eventValueLabel(e))}`).join(' · ')}</div>`;
  } catch { container.innerHTML=''; }
}
