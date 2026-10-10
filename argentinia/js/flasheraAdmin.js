// Flasheras Stage27 — Admin authority UI. Real acquisition remains locked OFF.
import { adminGetFlasheraStatus, adminGetFlasheraAnalytics, adminSaveFlasheraConfig, adminAdjustFlasheraDebug, fetchAllUserProfiles } from './firebaseClient.js';
import { cardDb } from './cardLoader.js';
import { DEFAULT_FLASHERA_SETTINGS, normalizeFlasheraSettings } from './flasheraContract.js';
import { cardVariantId } from './cardVariant.js';
import { flasheraCommunitySnapshot } from './flasheraStatistics.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const pct=bps=>(Math.max(0,Math.min(10000,Number(bps)||0))/100).toFixed(2);
const bps=value=>Math.max(0,Math.min(10000,Math.round((Number(value)||0)*100)));

function injectStyles(){if(document.getElementById('admin-flashera-stage27-styles'))return;const style=document.createElement('style');style.id='admin-flashera-stage27-styles';style.textContent=`
.admin-flashera-grid{display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:10px 18px}.admin-flashera-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid rgba(176,106,212,.12)}.admin-flashera-row label{color:#d8c4e8;font-size:13px}.admin-flashera-row input,.admin-flashera-row select{width:130px}.admin-flashera-note{color:#a995b9;font-size:11px;line-height:1.55;margin:8px 0 14px}.admin-flashera-lock{color:#f0c86b;font-weight:700}.admin-flashera-debug-grid{display:grid;grid-template-columns:1.4fr 1fr .8fr;gap:10px}.admin-flashera-debug-grid .admin-field-input{width:100%;text-align:left}.admin-flashera-card-suggest{font-size:10px;color:#8f7aa0;margin-top:5px}.admin-flashera-result{margin-top:10px;padding:10px 12px;border:1px solid rgba(176,106,212,.24);border-radius:9px;color:#d9cce2;background:rgba(7,5,12,.35)}@media(max-width:760px){.admin-flashera-grid,.admin-flashera-debug-grid{grid-template-columns:1fr}}
`;document.head.appendChild(style);}

export function mountAdminFlasheraPane(root){
  if(!root) return {load:async()=>{}}; injectStyles();
  root.innerHTML=`
    <div class="admin-section">
      <div class="admin-section-title">💫 FLASHERAS · Autoridad y probabilidades</div>
      <div class="admin-flashera-note"><b>Stage27:</b> configuración server-authoritative y ownership. La adquisición normal sigue <span class="admin-flashera-lock">BLOQUEADA OFF</span> hasta sus stages dedicados; sólo el Debug Admin puede convertir una copia física existente.</div>
      <div class="admin-flashera-grid">
        <div class="admin-flashera-row"><label>Adquisición global</label><label><input id="flashera-acq" type="checkbox" disabled> OFF · bloqueado por Stage27</label></div>
        <div class="admin-flashera-row"><label>Efecto visual habilitado</label><input id="flashera-visual" type="checkbox" checked></div>
        <div class="admin-flashera-row"><label>Sobres (%)</label><input class="admin-field-input" id="flashera-pack" type="number" min="0" max="100" step="0.01"></div>
        <div class="admin-flashera-row"><label>Evolución (%)</label><input class="admin-field-input" id="flashera-evolution" type="number" min="0" max="100" step="0.01"></div>
        <div class="admin-flashera-row"><label>Mezcladora (%)</label><input class="admin-field-input" id="flashera-mixer" type="number" min="0" max="100" step="0.01"></div>
        <div class="admin-flashera-row"><label>Santuario (%)</label><input class="admin-field-input" id="flashera-sanctuary" type="number" min="0" max="100" step="0.01"></div>
      </div>
      <button class="admin-save-btn" id="flashera-save">💾 Guardar configuración</button>
      <div class="admin-success-msg" id="flashera-config-status"></div>
    </div>
    <div class="admin-section">
      <div class="admin-section-title">📊 Flasheras · Estadísticas de circulación y adquisición</div>
      <div class="admin-flashera-note">Circulación: inventario físico de todos los perfiles leídos por Admin. Tasas: recibos del servidor; si hay más de 500, la ventana es una muestra reciente, no el total histórico.</div>
      <div id="flashera-analytics-holdings" class="admin-flashera-result">Cargando circulación…</div>
      <div id="flashera-analytics-sources" class="admin-flashera-result">Cargando recibos…</div>
      <button class="admin-save-btn" type="button" id="flashera-refresh-analytics">↻ Actualizar estadísticas</button>
    </div>
    <div class="admin-section">
      <div class="admin-section-title">🧪 Debug · Convertir acabado de una copia existente</div>
      <div class="admin-flashera-note">No crea cartas nuevas. <b>+1</b> transforma una copia normal de esa variante en Flashera; <b>−1</b> la devuelve a normal. El backend valida capacidad física, Enhanced/Evo y ownership real. Discovery también funciona si la cuenta ya posee esa carta.</div>
      <div class="admin-flashera-debug-grid">
        <label>Jugador<input class="admin-field-input" id="flashera-user-search" list="flashera-users" placeholder="username, email o UID"><datalist id="flashera-users"></datalist></label>
        <label>Card ID<input class="admin-field-input" id="flashera-card-id" list="flashera-cards" placeholder="crea_001"><datalist id="flashera-cards"></datalist><div class="admin-flashera-card-suggest">Las Discovery secretas pueden escribirse por ID (disc_###).</div></label>
        <label>Estado<select class="admin-field-input" id="flashera-state"><option value="base">Base</option><option value="enhanced">Mejorada</option><option value="evo1">Evo 1</option><option value="evo2">Evo 2</option></select></label>
      </div>
      <div class="admin-flashera-debug-grid" style="margin-top:10px;grid-template-columns:.6fr 1.4fr 1fr;">
        <label>Cantidad<input class="admin-field-input" id="flashera-qty" type="number" min="1" max="20" step="1" value="1"></label>
        <label>Motivo<input class="admin-field-input" id="flashera-reason" maxlength="240" placeholder="QA Stage27"></label>
        <div style="display:flex;gap:8px;align-items:end;"><button class="admin-save-btn" id="flashera-grant" style="margin:0;">💫 + Flashera</button><button class="admin-save-btn" id="flashera-revoke" style="margin:0;">↩ − Flashera</button></div>
      </div>
      <div class="admin-flashera-result" id="flashera-debug-result">Sin operación todavía.</div>
    </div>`;

  const q=id=>root.querySelector(id); let loaded=false; let profiles=[]; let config=DEFAULT_FLASHERA_SETTINGS;
  const renderConfig=raw=>{config=normalizeFlasheraSettings(raw||{});q('#flashera-acq').checked=false;q('#flashera-visual').checked=config.visualEnabled;q('#flashera-pack').value=pct(config.packChanceBps);q('#flashera-evolution').value=pct(config.evolutionChanceBps);q('#flashera-mixer').value=pct(config.mixerChanceBps);q('#flashera-sanctuary').value=pct(config.sanctuaryChanceBps);};
  const populateCards=()=>{const cards=[...(cardDb.allCards||[]),...(cardDb.authorizedDiscoveryCards||[])];const seen=new Set();q('#flashera-cards').innerHTML=cards.filter(c=>c?.id&&!seen.has(c.id)&&seen.add(c.id)).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'es')).map(c=>`<option value="${esc(c.id)}">${esc(c.name||c.id)}</option>`).join('');};
  const populateUsers=()=>{q('#flashera-users').innerHTML=profiles.map(p=>`<option value="${esc(p.uid)}">${esc([p.username,p.email].filter(Boolean).join(' · '))}</option>`).join('');};
  async function renderAnalytics(){
    const holdings=flasheraCommunitySnapshot(profiles);
    const top=holdings.top.map(row=>`${esc(cardDb.getById(row.cardId)?.name||row.cardId)} (${row.copies})`).join(' · ')||'Sin Flasheras';
    q('#flashera-analytics-holdings').innerHTML=`<b>${holdings.flasherasInCirculation}</b> copias en circulación · <b>${holdings.playersWithFlasheras}</b> jugadores · <b>${holdings.communityUniqueFlasheras}</b> cartas distintas.<div style="margin-top:7px">Top: ${top}</div>`;
    const box=q('#flashera-analytics-sources');box.textContent='Leyendo recibos de adquisición…';
    try{const audit=await adminGetFlasheraAnalytics();if(!audit)throw new Error('Sin datos');
      const sources={pack:'Sobres',evolution:'Evolución',mixer:'Mezcladora',sanctuary:'Santuario'};
      const rows=Object.entries(sources).map(([key,label])=>{const r=audit.bySource?.[key]||{};return `${label}: ${r.attempts||0} sorteos · ${r.hits||0} aciertos · real ${r.actualPct==null?'N/D':r.actualPct+'%'} / esperado ${r.expectedPct==null?'N/D':r.expectedPct+'%'}`;});
      box.textContent=`${audit.sampleCapped?'MUESTRA RECIENTE (no es histórico completo)':'Recibos disponibles con fecha'} · ${audit.sampledReceipts} recibos consultados.\n${rows.join('\n')}`;box.style.whiteSpace='pre-line';
    }catch(error){box.textContent=`Sin auditoría de recibos: ${String(error?.message||error)}`;}
  }
  async function load(force=false){if(loaded&&!force)return;const status=q('#flashera-config-status');status.textContent='Cargando autoridad Flashera…';try{const [snapshot,userRows]=await Promise.all([adminGetFlasheraStatus(),fetchAllUserProfiles()]);renderConfig(snapshot?.config||{});profiles=Array.isArray(userRows)?userRows.filter(p=>p?.uid):[];populateUsers();populateCards();loaded=true;status.textContent='✓ Config server-authoritative cargada · adquisición real Stage27: OFF.';void renderAnalytics();}catch(err){status.textContent=err?.message||'No se pudo cargar Flasheras.';}}
  q('#flashera-refresh-analytics').addEventListener('click',async()=>{try{profiles=(await fetchAllUserProfiles()).filter(p=>p?.uid);await renderAnalytics();}catch(e){q('#flashera-analytics-holdings').textContent=String(e?.message||e);}});
  q('#flashera-save').addEventListener('click',async()=>{const status=q('#flashera-config-status');status.textContent='';const settings={acquisitionEnabled:false,visualEnabled:q('#flashera-visual').checked,packChanceBps:bps(q('#flashera-pack').value),evolutionChanceBps:bps(q('#flashera-evolution').value),mixerChanceBps:bps(q('#flashera-mixer').value),sanctuaryChanceBps:bps(q('#flashera-sanctuary').value)};try{const saved=await adminSaveFlasheraConfig(settings);renderConfig(saved||settings);status.textContent='✓ Guardado. Probabilidades server-authoritative actualizadas; adquisición sigue bloqueada OFF.';}catch(err){status.textContent=err?.message||'No se pudo guardar.';}});
  const resolveUid=()=>{const raw=String(q('#flashera-user-search').value||'').trim();if(profiles.some(p=>p.uid===raw))return raw;const norm=raw.toLowerCase();const matches=profiles.filter(p=>[p.username,p.email].some(v=>String(v||'').trim().toLowerCase()===norm));return matches.length===1?matches[0].uid:'';};
  const runAdjust=async sign=>{const out=q('#flashera-debug-result');const uid=resolveUid(),baseId=String(q('#flashera-card-id').value||'').trim(),state=q('#flashera-state').value,qty=Math.max(1,Math.min(20,Math.floor(Number(q('#flashera-qty').value)||1))),reason=String(q('#flashera-reason').value||'').trim();if(!uid){out.textContent='Elegí/escribí un UID válido.';return;}const stateId=cardVariantId(baseId,{state,flashera:false});if(!stateId){out.textContent='Card ID / estado inválido.';return;}try{out.textContent='Aplicando autoridad…';const result=await adminAdjustFlasheraDebug(uid,stateId,sign*qty,reason);out.innerHTML=`✓ <b>${esc(result.variantId||stateId)}</b> · ${result.before} → <b>${result.after}</b> Flashera · normales restantes: ${result.normalAfter} · capacidad física: ${result.capacity}${result.favoriteCleared?' · vitrina limpiada por pérdida de ownership':''}.`;}catch(err){out.textContent=err?.message||'No se pudo ajustar la Flashera.';}};
  q('#flashera-grant').addEventListener('click',()=>runAdjust(1)); q('#flashera-revoke').addEventListener('click',()=>runAdjust(-1));
  return {load};
}
