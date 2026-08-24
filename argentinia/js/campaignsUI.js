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
    .campaign-admin-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start}
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
    @media(max-width:760px){.campaign-admin-grid{grid-template-columns:1fr}.campaign-popup-content{padding:20px}.campaign-popup-title{font-size:23px}}
  `;
  document.head.appendChild(style);
}

function eventTypeOptions(selected = '') {
  return Object.entries(CAMPAIGN_EVENT_TYPES).map(([key, def]) => `<option value="${esc(key)}" ${selected===key?'selected':''}>${esc(gameText(def.labelKey))}</option>`).join('');
}

export function mountAdminCampaignsPane(root, { currentUser } = {}) {
  ensureCampaignStyles();
  if (!root) return;
  root.innerHTML = `
    <div class="admin-section">
      <div class="admin-section-title">${esc(gameText('admin.campaigns.title'))}</div>
      <div class="admin-debug-summary">${esc(gameText('admin.campaigns.subtitle'))}</div>
      <div class="campaign-admin-grid">
        <div class="campaign-form-card">
          <div class="admin-section-title">${esc(gameText('admin.campaigns.newAnnouncement'))}</div>
          <input type="hidden" data-ann-id>
          <div class="campaign-field"><label>${esc(gameText('admin.campaigns.announcement.title'))}</label><input data-ann-title maxlength="120"></div>
          <div class="campaign-field"><label>${esc(gameText('admin.campaigns.announcement.subtitle'))}</label><input data-ann-subtitle maxlength="240"></div>
          <div class="campaign-field"><label>${esc(gameText('admin.campaigns.announcement.paragraphs'))}</label><textarea data-ann-paragraphs rows="7"></textarea></div>
          <div class="campaign-field"><label>${esc(gameText('admin.campaigns.announcement.image'))}</label><input data-ann-image placeholder="evento_agosto.png"></div>
          <div class="campaign-image-preview" data-ann-preview></div>
          <div class="campaign-field"><label>${esc(gameText('admin.campaigns.start'))}</label><input type="datetime-local" data-ann-start></div>
          <div class="campaign-field"><label>${esc(gameText('admin.campaigns.endOptional'))}</label><input type="datetime-local" data-ann-end></div>
          <div class="campaign-checks">
            <label><input type="checkbox" data-ann-popup checked> ${esc(gameText('admin.campaigns.announcement.popup'))}</label>
            <label><input type="checkbox" data-ann-news checked> ${esc(gameText('admin.campaigns.announcement.news'))}</label>
            <label><input type="checkbox" data-ann-dismissible checked> ${esc(gameText('admin.campaigns.announcement.dismissible'))}</label>
          </div>
          <div class="campaign-actions"><button class="admin-save-btn" data-ann-save>${esc(gameText('admin.campaigns.saveAnnouncement'))}</button><button class="admin-save-btn" data-ann-cancel style="display:none">${esc(gameText('common.cancel'))}</button></div>
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

  function resetAnnouncement() {
    q('[data-ann-id]').value=''; q('[data-ann-title]').value=''; q('[data-ann-subtitle]').value=''; q('[data-ann-paragraphs]').value=''; q('[data-ann-image]').value='';
    q('[data-ann-start]').value=asDateInput(new Date()); q('[data-ann-end]').value=''; q('[data-ann-popup]').checked=true; q('[data-ann-news]').checked=true; q('[data-ann-dismissible]').checked=true;
    q('[data-ann-cancel]').style.display='none'; q('[data-ann-error]').textContent=''; refreshPreview();
  }
  function resetEvent() {
    q('[data-event-id]').value=''; q('[data-event-name]').value=''; q('[data-event-type]').value='pack_discount'; q('[data-event-value]').value='50'; q('[data-event-start]').value=asDateInput(new Date()); q('[data-event-end]').value=''; q('[data-event-cancel]').style.display='none'; q('[data-event-error]').textContent='';
  }
  resetAnnouncement(); resetEvent();

  let announcements=[]; let events=[]; let campaignNow=new Date();
  async function reload() {
    const table=q('[data-campaign-table]'); table.innerHTML=`<div class="admin-debug-empty">${esc(gameText('admin.campaigns.loading'))}</div>`;
    try {
      const loaded = await Promise.all([fetchAnnouncements(100), fetchCampaignEvents(100), fetchCampaignSnapshot()]);
      announcements=loaded[0]; events=loaded[1]; campaignNow=loaded[2]?.now || new Date();
      const rows = [
        ...announcements.map(a => ({ kind:'announcement', item:a, name:a.title, type:gameText('admin.campaigns.kind.announcement') })),
        ...events.map(e => ({ kind:'event', item:e, name:e.name, type:`${CAMPAIGN_EVENT_TYPES[e.type]?.labelKey ? gameText(CAMPAIGN_EVENT_TYPES[e.type].labelKey) : e.type} ${eventValueLabel(e)}` }))
      ].sort((a,b) => (b.item.startAt?.getTime?.()||0)-(a.item.startAt?.getTime?.()||0));
      if (!rows.length) { table.innerHTML=`<div class="admin-debug-empty">${esc(gameText('admin.campaigns.empty'))}</div>`; return; }
      table.innerHTML=`<table class="campaign-table"><thead><tr><th>${esc(gameText('admin.campaigns.col.kind'))}</th><th>${esc(gameText('admin.campaigns.col.name'))}</th><th>${esc(gameText('admin.campaigns.col.type'))}</th><th>${esc(gameText('admin.campaigns.col.start'))}</th><th>${esc(gameText('admin.campaigns.col.end'))}</th><th>${esc(gameText('admin.campaigns.col.status'))}</th><th>${esc(gameText('admin.campaigns.col.actions'))}</th></tr></thead><tbody>${rows.map(row=>`<tr data-kind="${row.kind}" data-id="${esc(row.item.id)}"><td><span class="campaign-kind">${esc(row.kind==='event'?gameText('admin.campaigns.kind.event'):gameText('admin.campaigns.kind.announcement'))}</span></td><td><strong>${esc(row.name)}</strong></td><td>${esc(row.type)}</td><td>${esc(formatDate(row.item.startAt))}</td><td>${esc(formatDate(row.item.endAt))}</td><td class="campaign-status-${campaignStatus(row.item,campaignNow)}">${esc(campaignStatus(row.item,campaignNow)==='active'?gameText('admin.campaigns.status.active'):campaignStatus(row.item,campaignNow)==='future'?gameText('admin.campaigns.status.future'):gameText('admin.campaigns.status.finalized'))}</td><td><button data-edit>✏️</button> <button data-finalize>⏹</button> <button data-delete>🗑️</button></td></tr>`).join('')}</tbody></table>`;
      table.querySelectorAll('[data-edit]').forEach(btn=>btn.addEventListener('click',()=>editRow(btn.closest('tr'))));
      table.querySelectorAll('[data-finalize]').forEach(btn=>btn.addEventListener('click',()=>finalizeRow(btn.closest('tr'))));
      table.querySelectorAll('[data-delete]').forEach(btn=>btn.addEventListener('click',()=>deleteRow(btn.closest('tr'))));
    } catch(error) { table.innerHTML=`<div class="admin-debug-empty">${esc(error?.message || gameText('admin.campaigns.error'))}</div>`; }
  }

  function editRow(tr) {
    const id=tr.dataset.id, kind=tr.dataset.kind;
    if (kind==='announcement') {
      const a=announcements.find(x=>x.id===id); if(!a)return;
      q('[data-ann-id]').value=id; q('[data-ann-title]').value=a.title||''; q('[data-ann-subtitle]').value=a.subtitle||''; q('[data-ann-paragraphs]').value=(a.paragraphs||[]).join('\n\n'); q('[data-ann-image]').value=a.imageFilename||'';
      q('[data-ann-start]').value=asDateInput(a.startAt); q('[data-ann-end]').value=asDateInput(a.endAt); q('[data-ann-popup]').checked=a.showPopup!==false; q('[data-ann-news]').checked=a.showInNews!==false; q('[data-ann-dismissible]').checked=a.dismissible!==false; q('[data-ann-cancel]').style.display='inline-block'; refreshPreview();
    } else {
      const e=events.find(x=>x.id===id); if(!e)return;
      q('[data-event-id]').value=id; q('[data-event-name]').value=e.name||''; q('[data-event-type]').value=e.type||'pack_discount'; q('[data-event-value]').value=e.value||1; q('[data-event-start]').value=asDateInput(e.startAt); q('[data-event-end]').value=asDateInput(e.endAt); q('[data-event-cancel]').style.display='inline-block';
    }
  }
  async function finalizeRow(tr) {
    if (!window.confirm(gameText('admin.campaigns.confirmFinalize'))) return;
    tr.querySelector('[data-finalize]').disabled=true;
    try { await (tr.dataset.kind==='announcement'?finalizeAnnouncement(tr.dataset.id):finalizeCampaignEvent(tr.dataset.id)); await reload(); } catch(e){alert(e.message||gameText('admin.campaigns.error'));}
  }
  async function deleteRow(tr) {
    if (!window.confirm(gameText('admin.campaigns.confirmDelete'))) return;
    try { await (tr.dataset.kind==='announcement'?deleteAnnouncement(tr.dataset.id):deleteCampaignEvent(tr.dataset.id)); await reload(); } catch(e){alert(e.message||gameText('admin.campaigns.error'));}
  }

  q('[data-ann-save]').addEventListener('click', async()=>{
    const box=q('[data-ann-error]'); box.textContent='';
    try {
      const payload={ title:q('[data-ann-title]').value, subtitle:q('[data-ann-subtitle]').value, paragraphs:q('[data-ann-paragraphs]').value, imageFilename:q('[data-ann-image]').value, startAt:dateFromInput(q('[data-ann-start]').value)||new Date(), endAt:dateFromInput(q('[data-ann-end]').value), showPopup:q('[data-ann-popup]').checked, showInNews:q('[data-ann-news]').checked, dismissible:q('[data-ann-dismissible]').checked };
      const id=q('[data-ann-id]').value;
      if(id) await updateAnnouncement(id,currentUser.uid,payload); else await saveAnnouncement(currentUser.uid,payload);
      resetAnnouncement(); await reload();
    } catch(e){box.textContent=e.message||gameText('admin.campaigns.error');}
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

export async function maybeShowAnnouncementPopup({ currentUser } = {}) {
  ensureCampaignStyles();
  if (document.querySelector('.campaign-popup-shell')) return false;
  let list=[]; let now=new Date();
  try { const loaded=await Promise.all([fetchAnnouncements(50), fetchCampaignSnapshot()]); list=loaded[0]; now=loaded[1]?.now || now; } catch { return false; }
  const candidates=list.filter(a=>campaignStatus(a,now)==='active' && a.showPopup && !a.finalizedAt);
  for (const ann of candidates) {
    let dismissed=false;
    if (currentUser?.uid) { try { dismissed=await isAnnouncementDismissed(currentUser.uid,ann.id); } catch {} }
    else { try { dismissed=localStorage.getItem(guestDismissKey(ann.id))==='1'; } catch {} }
    if (dismissed) continue;
    showAnnouncementPopup(ann,{currentUser}); return true;
  }
  return false;
}

function showAnnouncementPopup(ann,{currentUser}={}) {
  const shell=document.createElement('div'); shell.className='campaign-popup-shell';
  const imageUrl=announcementImageUrl(ann.imageFilename);
  shell.innerHTML=`<div class="campaign-popup-card">${imageUrl?`<img class="campaign-popup-bg" data-ann-bg src="${esc(imageUrl)}" alt="">`:''}<div class="campaign-popup-overlay"></div><div class="campaign-popup-content"><h2 class="campaign-popup-title">${esc(ann.title)}</h2>${ann.subtitle?`<div class="campaign-popup-subtitle">${esc(ann.subtitle)}</div>`:''}<div>${(ann.paragraphs||[]).map(p=>`<p class="campaign-popup-paragraph">${esc(p)}</p>`).join('')}</div><div class="campaign-popup-footer">${ann.dismissible?`<label class="campaign-popup-dismiss"><input type="checkbox" data-dismiss> ${esc(gameText('campaign.popup.dontShowAgain'))}</label>`:'<span></span>'}<button class="campaign-popup-close" data-close>${esc(gameText('campaign.popup.close'))}</button></div></div></div>`;
  const bg=shell.querySelector('[data-ann-bg]');
  if(bg) bg.addEventListener('error',()=>bg.remove(),{once:true});
  const close=async()=>{const checked=!!shell.querySelector('[data-dismiss]')?.checked;if(checked){if(currentUser?.uid){try{await dismissAnnouncement(currentUser.uid,ann.id);}catch{}}else{try{localStorage.setItem(guestDismissKey(ann.id),'1');}catch{}}}shell.remove();};
  shell.querySelector('[data-close]').addEventListener('click',()=>void close()); document.body.appendChild(shell);
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
