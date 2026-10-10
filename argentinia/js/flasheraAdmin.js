// Flasheras HF3 — Admin-authorized live master and per-source switches; defaults OFF.
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
      <div class="admin-flashera-note"><b>Stage42A HF6:</b> adquisición real bajo autoridad Admin. El master viene apagado por defecto. Para habilitarla, primero publicá Functions de HF3 y confirmá las Rules vigentes. Todos los cambios se auditan en el servidor.</div>
      <div class="admin-flashera-grid">
        <div class="admin-flashera-row"><label>Adquisición global</label><label><input id="flashera-acq" type="checkbox"> MASTER · habilitar adquisición</label></div>
        <div class="admin-flashera-row"><label>Fuente: sobres</label><label><input id="flashera-pack-enabled" type="checkbox" checked> Activa</label></div>
        <div class="admin-flashera-row"><label>Fuente: evolución</label><label><input id="flashera-evolution-enabled" type="checkbox" checked> Activa</label></div>
        <div class="admin-flashera-row"><label>Fuente: Mezcladora</label><label><input id="flashera-mixer-enabled" type="checkbox" checked> Activa</label></div>
        <div class="admin-flashera-row"><label>Fuente: Santuario</label><label><input id="flashera-sanctuary-enabled" type="checkbox" checked> Activa</label></div>
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

  const q=id=>root.querySelector(id); let loaded=false; let profiles=[]; let config=DEFAULT_FLASHERA_SETTINGS; let pendingActivation=null;
  const renderConfig=raw=>{config=normalizeFlasheraSettings(raw||{});q('#flashera-acq').checked=config.acquisitionEnabled;q('#flashera-pack-enabled').checked=config.packEnabled;q('#flashera-evolution-enabled').checked=config.evolutionEnabled;q('#flashera-mixer-enabled').checked=config.mixerEnabled;q('#flashera-sanctuary-enabled').checked=config.sanctuaryEnabled;q('#flashera-visual').checked=config.visualEnabled;q('#flashera-pack').value=pct(config.packChanceBps);q('#flashera-evolution').value=pct(config.evolutionChanceBps);q('#flashera-mixer').value=pct(config.mixerChanceBps);q('#flashera-sanctuary').value=pct(config.sanctuaryChanceBps);};
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
  async function load(force=false){if(loaded&&!force)return;const status=q('#flashera-config-status');status.textContent='Cargando autoridad Flashera…';try{const [snapshot,userRows]=await Promise.all([adminGetFlasheraStatus(),fetchAllUserProfiles()]);renderConfig(snapshot?.config||{});profiles=Array.isArray(userRows)?userRows.filter(p=>p?.uid):[];populateUsers();populateCards();loaded=true;status.textContent=`✓ Configuración desde servidor · master: ${config.acquisitionEnabled?'ON':'OFF'}.`;void renderAnalytics();}catch(err){status.textContent=err?.message||'No se pudo cargar Flasheras.';}}
  q('#flashera-refresh-analytics').addEventListener('click',async()=>{try{profiles=(await fetchAllUserProfiles()).filter(p=>p?.uid);await renderAnalytics();}catch(e){q('#flashera-analytics-holdings').textContent=String(e?.message||e);}});
  // HF6: keep user intent visible until a SECOND independent server read verifies persistence.
  // Never render an unverified response; previous HF4 rechecked all boxes before reporting failure.
  let saveInFlight=false;
  q('#flashera-save').addEventListener('click',async()=>{
    if(saveInFlight)return;
    const status=q('#flashera-config-status'); status.textContent='';
    const settings={
      acquisitionEnabled:q('#flashera-acq').checked,
      packEnabled:q('#flashera-pack-enabled').checked,
      evolutionEnabled:q('#flashera-evolution-enabled').checked,
      mixerEnabled:q('#flashera-mixer-enabled').checked,
      sanctuaryEnabled:q('#flashera-sanctuary-enabled').checked,
      visualEnabled:q('#flashera-visual').checked,
      packChanceBps:bps(q('#flashera-pack').value),
      evolutionChanceBps:bps(q('#flashera-evolution').value),
      mixerChanceBps:bps(q('#flashera-mixer').value),
      sanctuaryChanceBps:bps(q('#flashera-sanctuary').value)
    };
    if(settings.acquisitionEnabled&&!config.acquisitionEnabled){
      const signature=JSON.stringify(settings);
      if(pendingActivation!==signature){pendingActivation=signature;status.textContent='⚠ Activación REAL: revisá fuentes y probabilidades y presioná Guardar otra vez para confirmar.';return;}
    }
    pendingActivation=null;
    const fields=['acquisitionEnabled','packEnabled','evolutionEnabled','mixerEnabled','sanctuaryEnabled','visualEnabled','packChanceBps','evolutionChanceBps','mixerChanceBps','sanctuaryChanceBps'];
    const mismatches=read=>fields.filter(field=>read?.[field]!==settings[field]);
    saveInFlight=true; q('#flashera-save').disabled=true;
    try {
      status.textContent='Guardando y verificando en Firebase…';
      const saved=await adminSaveFlasheraConfig(settings);
      if(!saved||mismatches(saved).length)throw new Error('El servidor rechazó o modificó estos campos: '+mismatches(saved).join(', '));
      // Independent read: no false success if a cached/legacy client sent the wrong schema.
      const statusResponse=await adminGetFlasheraStatus();
      const persisted=statusResponse?.config;
      if(!persisted||mismatches(persisted).length)throw new Error('No coincide la lectura real desde Firestore: '+mismatches(persisted).join(', '));
      renderConfig(persisted);
      status.textContent=`✓ HF6 · Verificado con SEGUNDA lectura de servidor · master ${persisted.acquisitionEnabled?'ON':'OFF'} · Sobres ${persisted.packEnabled?'ON':'OFF'} · Evolución ${persisted.evolutionEnabled?'ON':'OFF'} · Mezcladora ${persisted.mixerEnabled?'ON':'OFF'} · Santuario ${persisted.sanctuaryEnabled?'ON':'OFF'}.`;
    } catch(error) {
      // Do NOT reset the toggles to true: keep exactly the choice the Admin made.
      status.textContent=`✖ HF6 · No se confirmó el guardado: ${String(error?.message||error)}. Los interruptores no se restablecieron.`;
    } finally {saveInFlight=false;q('#flashera-save').disabled=false;}
  });
  const resolveUid=()=>{const raw=String(q('#flashera-user-search').value||'').trim();if(profiles.some(p=>p.uid===raw))return raw;const norm=raw.toLowerCase();const matches=profiles.filter(p=>[p.username,p.email].some(v=>String(v||'').trim().toLowerCase()===norm));return matches.length===1?matches[0].uid:'';};
  const runAdjust=async sign=>{const out=q('#flashera-debug-result');const uid=resolveUid(),baseId=String(q('#flashera-card-id').value||'').trim(),state=q('#flashera-state').value,qty=Math.max(1,Math.min(20,Math.floor(Number(q('#flashera-qty').value)||1))),reason=String(q('#flashera-reason').value||'').trim();if(!uid){out.textContent='Elegí/escribí un UID válido.';return;}const stateId=cardVariantId(baseId,{state,flashera:false});if(!stateId){out.textContent='Card ID / estado inválido.';return;}try{out.textContent='Aplicando autoridad…';const result=await adminAdjustFlasheraDebug(uid,stateId,sign*qty,reason);out.innerHTML=`✓ <b>${esc(result.variantId||stateId)}</b> · ${result.before} → <b>${result.after}</b> Flashera · normales restantes: ${result.normalAfter} · capacidad física: ${result.capacity}${result.favoriteCleared?' · vitrina limpiada por pérdida de ownership':''}.`;}catch(err){out.textContent=err?.message||'No se pudo ajustar la Flashera.';}};
  q('#flashera-grant').addEventListener('click',()=>runAdjust(1)); q('#flashera-revoke').addEventListener('click',()=>runAdjust(-1));
  return {load};
}
