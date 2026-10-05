import { gameText } from './gameTexts.js';
import { getSanctuaryStatus, loadAuthorizedDiscoveryCards, adminPreviewSanctuary, adminGetSanctuaryHistory, adminSetSanctuaryConfig, adminSetSanctuaryBarcodeBuckets, adminSetSanctuaryResonanceBuckets, adminSetSanctuaryBarcodeEasterEggs } from './firebaseClient.js';
import { withEconomyButtonPending } from './economyPending.js';
import { cardDb } from './cardLoader.js';
import { isDiscoveryCard } from './discoveryCards.js';

const BARCODE_BUCKET_COUNT = 100;
const RESONANCE_BUCKET_COUNT = 100;
const RESONANCE_AFFINITIES = Object.freeze([
  {id:'W',labelKey:'sanctuary.admin.resonanceAffinityWhite',start:0},
  {id:'U',labelKey:'sanctuary.admin.resonanceAffinityBlue',start:20},
  {id:'B',labelKey:'sanctuary.admin.resonanceAffinityBlack',start:40},
  {id:'R',labelKey:'sanctuary.admin.resonanceAffinityRed',start:60},
  {id:'G',labelKey:'sanctuary.admin.resonanceAffinityGreen',start:80}
]);
const CARD_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;

const EASTER_EGG_MAX_RULES = 200;
const EASTER_EGG_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function gtinCheckDigit(raw) {
  const digits=String(raw??'').replace(/[\s-]+/g,'');
  if(!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(digits)) return null;
  const body=digits.slice(0,-1); let sum=0;
  for(let i=body.length-1,weight=3;i>=0;i-=1,weight=weight===3?1:3) sum+=Number(body[i])*weight;
  return String((10-(sum%10))%10);
}

function normalizeGtin(raw) {
  const digits=String(raw??'').replace(/[\s-]+/g,'');
  if(!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(digits)) return '';
  const check=gtinCheckDigit(digits);
  return check!==null && digits.at(-1)===check ? digits.padStart(14,'0') : '';
}

function parseGtinText(raw) {
  const tokens=String(raw??'').split(/[\s,;]+/).map(value=>value.trim()).filter(Boolean);
  return {tokens,normalized:[...new Set(tokens.map(normalizeGtin).filter(Boolean))],invalid:tokens.filter(value=>!normalizeGtin(value))};
}

function newEasterEggId() {
  const seed=globalThis.crypto?.randomUUID?.().replace(/-/g,'').slice(0,12) || `${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`;
  return `egg_${seed}`.slice(0,64);
}

function normalizeEasterEggRows(raw) {
  return (Array.isArray(raw)?raw:[]).slice(0,EASTER_EGG_MAX_RULES).map(row=>({
    id:String(row?.id||'').trim(), enabled:row?.enabled!==false, label:String(row?.label||'').trim(), note:String(row?.note||'').trim(),
    priority:Number.isInteger(Number(row?.priority))?Number(row.priority):100, cardId:String(row?.cardId||'').trim(),
    gtins:Array.isArray(row?.gtins)?row.gtins.map(String):[]
  }));
}

function easterEggRuleHtml(rule,index) {
  const gtins=(Array.isArray(rule.gtins)?rule.gtins:[]).join('\n');
  return `<div class="admin-sanctuary-egg-card" data-sanctuary-egg-index="${index}">
    <div class="admin-sanctuary-egg-head">
      <label><input type="checkbox" data-egg-field="enabled" ${rule.enabled!==false?'checked':''}> ${esc(gameText('sanctuary.admin.easterEggEnabled'))}</label>
      <span class="admin-sanctuary-egg-state" data-egg-state>${esc(gameText('sanctuary.admin.easterEggInvalid'))}</span>
      <button type="button" class="admin-save-btn admin-sanctuary-egg-remove" data-egg-remove>${esc(gameText('sanctuary.admin.easterEggRemove'))}</button>
    </div>
    <div class="admin-sanctuary-egg-grid">
      <label><span>${esc(gameText('sanctuary.admin.easterEggId'))}</span><input data-egg-field="id" maxlength="64" value="${esc(rule.id)}" placeholder="${esc(gameText('sanctuary.admin.easterEggIdPlaceholder'))}"></label>
      <label><span>${esc(gameText('sanctuary.admin.easterEggLabel'))}</span><input data-egg-field="label" maxlength="80" value="${esc(rule.label)}" placeholder="${esc(gameText('sanctuary.admin.easterEggLabelPlaceholder'))}"></label>
      <label><span>${esc(gameText('sanctuary.admin.priority'))}</span><input data-egg-field="priority" type="number" min="0" max="1000" step="1" value="${Number(rule.priority)||0}"></label>
      <label><span>${esc(gameText('sanctuary.admin.easterEggCard'))}</span><input data-egg-field="cardId" list="admin-sanctuary-discovery-options" maxlength="96" value="${esc(rule.cardId)}" placeholder="${esc(gameText('sanctuary.admin.easterEggCardPlaceholder'))}"></label>
      <label class="admin-sanctuary-egg-wide"><span>${esc(gameText('sanctuary.admin.easterEggGtins'))}</span><textarea data-egg-field="gtins" rows="3" placeholder="7791234567898">${esc(gtins)}</textarea><small>${esc(gameText('sanctuary.admin.easterEggGtinsHelp'))}</small></label>
      <label class="admin-sanctuary-egg-wide"><span>${esc(gameText('sanctuary.admin.note'))}</span><textarea data-egg-field="note" rows="2" maxlength="240" placeholder="${esc(gameText('sanctuary.admin.easterEggNotePlaceholder'))}">${esc(rule.note)}</textarea></label>
    </div>
    <div class="admin-sanctuary-egg-cardname" data-egg-cardname>—</div>
  </div>`;
}


function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function boolLabel(value) {
  return gameText(value ? 'sanctuary.admin.on' : 'sanctuary.admin.off');
}

function normalizeBuckets(raw) {
  const src=Array.isArray(raw)?raw:[];
  return Array.from({length:BARCODE_BUCKET_COUNT},(_,i)=>String(src[i]??'').trim());
}

function normalizeResonanceBuckets(raw) {
  const src=Array.isArray(raw)?raw:[];
  return Array.from({length:RESONANCE_BUCKET_COUNT},(_,i)=>String(src[i]??'').trim());
}

function resonanceAffinityForIndex(index) {
  const group=Math.floor(Number(index)/20);
  return RESONANCE_AFFINITIES[group]?.id || null;
}

function cardMatchesResonanceAffinity(card, affinity) {
  const colors=Array.isArray(card?.colors)?card.colors.map(String):[];
  return colors.includes(String(affinity||''));
}

function renderStatusSummary(status) {
  const cfg=status?.config||{};
  const access=status?.access||{};
  const rows=[
    [gameText('sanctuary.admin.serverAuthority'), gameText('sanctuary.admin.serverAuthorityValue')],
    [gameText('sanctuary.admin.masterSwitch'), cfg.masterEnabled ? gameText('sanctuary.admin.masterOn') : gameText('sanctuary.admin.masterOff')],
    [gameText('sanctuary.admin.bypass'), access.bypassAdmin ? gameText('sanctuary.admin.on') : gameText('sanctuary.admin.off')],
    [gameText('sanctuary.admin.unlimited'), access.unlimited ? '∞' : gameText('sanctuary.admin.off')],
    [gameText('sanctuary.admin.barcodeEnabled'), boolLabel(cfg.barcodeEnabled)],
    [gameText('sanctuary.admin.resonanceEnabled'), boolLabel(cfg.resonanceEnabled)],
    [gameText('sanctuary.admin.cooldownDays'), String(cfg.cooldownDays || 7)],
    [gameText('sanctuary.admin.historyTitle'), gameText('sanctuary.admin.historyReadOnly')]
  ];
  return `<div class="admin-sanctuary-status-grid">${rows.map(([k,v])=>`<div class="admin-sanctuary-status-card"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>`;
}

function applyToggleVisual(button, enabled) {
  if (!button) return;
  button.dataset.enabled = enabled ? 'true' : 'false';
  button.classList.toggle('active', !!enabled);
  button.textContent = enabled ? gameText('sanctuary.admin.on') : gameText('sanctuary.admin.off');
  button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
}

function bucketRowsHtml() {
  return Array.from({length:BARCODE_BUCKET_COUNT},(_,index)=>{
    const bucket=String(index).padStart(2,'0');
    return `<tr data-sanctuary-bucket-row="${bucket}">
      <td class="admin-sanctuary-bucket-code">${bucket}</td>
      <td><input class="admin-sanctuary-bucket-input" data-sanctuary-bucket-index="${index}" list="admin-sanctuary-discovery-options" maxlength="96" autocomplete="off" spellcheck="false" placeholder="${esc(gameText('sanctuary.admin.barcodeBucketsPlaceholder'))}"></td>
      <td class="admin-sanctuary-bucket-name" data-sanctuary-bucket-name="${index}">${esc(gameText('sanctuary.admin.barcodeCardNameUnknown'))}</td>
      <td class="admin-sanctuary-bucket-state" data-sanctuary-bucket-state="${index}">${esc(gameText('sanctuary.admin.barcodeEmpty'))}</td>
    </tr>`;
  }).join('');
}

function resonanceRowsHtml() {
  return RESONANCE_AFFINITIES.map(group=>{
    const groupHeader=`<tr class="admin-sanctuary-resonance-group" data-affinity="${group.id}"><td colspan="5"><strong>${esc(gameText(group.labelKey))}</strong><span data-resonance-affinity-coverage="${group.id}">0/20</span></td></tr>`;
    const rows=Array.from({length:20},(_,localIndex)=>{
      const index=group.start+localIndex;
      const globalBucket=String(index).padStart(2,'0');
      const localBucket=String(localIndex).padStart(2,'0');
      return `<tr data-sanctuary-resonance-row="${globalBucket}" data-affinity="${group.id}">
        <td class="admin-sanctuary-affinity-code">${group.id}</td>
        <td class="admin-sanctuary-bucket-code">${localBucket}<small>${globalBucket}</small></td>
        <td><input class="admin-sanctuary-bucket-input" data-sanctuary-resonance-index="${index}" list="admin-sanctuary-discovery-options-${group.id}" maxlength="96" autocomplete="off" spellcheck="false" placeholder="${esc(gameText('sanctuary.admin.resonanceBucketsPlaceholder'))}"></td>
        <td class="admin-sanctuary-bucket-name" data-sanctuary-resonance-name="${index}">${esc(gameText('sanctuary.admin.barcodeCardNameUnknown'))}</td>
        <td class="admin-sanctuary-bucket-state" data-sanctuary-resonance-state="${index}">${esc(gameText('sanctuary.admin.resonanceEmpty'))}</td>
      </tr>`;
    }).join('');
    return groupHeader+rows;
  }).join('');
}


function historyDate(value){
  const ms=Number(value);
  if(!Number.isFinite(ms)||ms<=0) return '—';
  try{return new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'medium'}).format(new Date(ms));}catch{return new Date(ms).toLocaleString();}
}
function historyCardLabel(cardId){
  const id=String(cardId||'');
  const card=id?cardDb.getById(id):null;
  return card?`${String(card.name||id)} · ${id}`:(id||'—');
}
function historyShort(value,max=34){
  const text=String(value||'');
  return text.length>max?`${text.slice(0,max-1)}…`:text;
}
function historyBindingRows(snapshot){
  const rows=[...(snapshot?.bindings?.barcode||[]),...(snapshot?.bindings?.resonance||[])].sort((a,b)=>(Number(b?.createdAtMs)||0)-(Number(a?.createdAtMs)||0));
  if(!rows.length) return `<tr><td colspan="7" class="admin-sanctuary-history-empty">${esc(gameText('sanctuary.admin.historyEmpty'))}</td></tr>`;
  return rows.map(row=>{
    const input=row.type==='barcode'?row.gtin14:row.signature;
    const bucket=Number.isInteger(Number(row.bucket))?String(Number(row.bucket)).padStart(2,'0'):'—';
    const validity=row.valid===false?`<span class="admin-sanctuary-history-invalid">${esc(gameText('sanctuary.admin.historyInvalid'))}</span>`:'';
    return `<tr>
      <td><strong>${esc(row.type==='barcode'?gameText('sanctuary.admin.historySourceBarcode'):gameText('sanctuary.admin.historySourceResonance'))}</strong>${validity}</td>
      <td><code title="${esc(input||'')}">${esc(historyShort(input,38)||'—')}</code></td>
      <td><code title="${esc(String(row.cardId||''))}">${esc(historyShort(historyCardLabel(row.cardId),42))}</code></td>
      <td>${esc(bucket)}</td>
      <td><code>${esc(String(row.source||'—'))}</code></td>
      <td><code title="${esc(String(row.bindingId||''))}">${esc(historyShort(row.bindingId,26)||'—')}</code></td>
      <td>${esc(historyDate(row.createdAtMs))}</td>
    </tr>`;
  }).join('');
}
function historyClaimRows(snapshot){
  const rows=Array.isArray(snapshot?.claims)?snapshot.claims:[];
  if(!rows.length) return `<tr><td colspan="9" class="admin-sanctuary-history-empty">${esc(gameText('sanctuary.admin.historyEmpty'))}</td></tr>`;
  return rows.map(row=>{
    const bucket=Number.isInteger(Number(row.bucket))?String(Number(row.bucket)).padStart(2,'0'):'—';
    const validity=row.valid===false?`<span class="admin-sanctuary-history-invalid">${esc(gameText('sanctuary.admin.historyInvalid'))}</span>`:'';
    return `<tr>
      <td>${esc(historyDate(row.claimedAtMs))}${validity}</td>
      <td><code title="${esc(String(row.uid||''))}">${esc(historyShort(row.uid,20)||'—')}</code></td>
      <td><strong>${esc(row.type==='barcode'?gameText('sanctuary.admin.historySourceBarcode'):gameText('sanctuary.admin.historySourceResonance'))}</strong></td>
      <td><code title="${esc(String(row.cardId||''))}">${esc(historyShort(historyCardLabel(row.cardId),36))}</code></td>
      <td>${esc(bucket)}</td>
      <td><code>${esc(String(row.source||'—'))}</code></td>
      <td>${esc(row.adminBypass?gameText('sanctuary.admin.historyAdmin'):gameText('sanctuary.admin.historyPlayer'))}</td>
      <td>${esc(row.bindingCreated?gameText('sanctuary.admin.historyYes'):gameText('sanctuary.admin.historyNo'))}</td>
      <td><code title="${esc(String(row.operationId||''))}">${esc(historyShort(row.operationId,24)||'—')}</code></td>
    </tr>`;
  }).join('');
}

export function mountAdminSanctuaryPane(root) {
  if (!root) return { load:async()=>{} };
  if (!document.getElementById('admin-sanctuary-stage9-styles')) {
    const style=document.createElement('style');
    style.id='admin-sanctuary-stage9-styles';
    style.textContent=`
      .admin-sanctuary-wrap{max-width:1080px;margin:0 auto;}
      .admin-sanctuary-status-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin:12px 0 16px;}
      .admin-sanctuary-status-card{border:1px solid rgba(212,175,55,.22);border-radius:10px;background:rgba(255,255,255,.025);padding:10px 12px;display:flex;flex-direction:column;gap:4px;}
      .admin-sanctuary-status-card span{font-size:10px;color:#aaa58f;text-transform:uppercase;letter-spacing:.06em;font-weight:800;}
      .admin-sanctuary-status-card strong{font-size:13px;color:#f0e0b0;overflow-wrap:anywhere;}
      .admin-sanctuary-help{font-size:12px;line-height:1.55;color:#aaa58f;margin-top:5px;}
      .admin-sanctuary-warning{border:1px solid rgba(224,122,107,.45);background:rgba(120,30,20,.14);border-radius:9px;padding:10px 12px;color:#e6b2a6;font-size:12px;line-height:1.45;margin:10px 0 14px;}
      .admin-sanctuary-info{border:1px solid rgba(96,146,189,.35);background:rgba(24,62,90,.16);border-radius:9px;padding:10px 12px;color:#bfd3df;font-size:12px;line-height:1.45;margin:10px 0 14px;}
      .admin-sanctuary-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:14px;}
      .admin-sanctuary-actions.admin-sanctuary-mapping-tools{justify-content:flex-start;margin:10px 0;}
      .admin-sanctuary-mapping-tools .admin-save-btn{font-size:10px;padding:7px 9px;}
      .admin-sanctuary-picker-note{margin:8px 0 10px;padding:8px 10px;border:1px solid rgba(121,173,114,.28);border-radius:8px;background:rgba(38,82,38,.10);color:#bdd3b5;font-size:11px;line-height:1.45;}
      .admin-sanctuary-toggle{min-width:118px;}
      .admin-sanctuary-toggle.active{background:rgba(64,120,65,.34);border-color:#79ad72;color:#dff4d8;}
      .admin-sanctuary-statusline{min-height:20px;margin-top:10px;text-align:right;font-size:12px;color:#d6bd69;}
      .admin-sanctuary-bucket-kpis{display:grid;grid-template-columns:repeat(5,minmax(110px,1fr));gap:8px;margin:12px 0;}
      .admin-sanctuary-bucket-kpi{padding:8px 10px;border:1px solid rgba(212,175,55,.18);border-radius:8px;background:rgba(255,255,255,.02);display:flex;flex-direction:column;gap:2px;}
      .admin-sanctuary-bucket-kpi span{font-size:9px;color:#9c9887;text-transform:uppercase;font-weight:800;letter-spacing:.05em;}
      .admin-sanctuary-bucket-kpi strong{font-size:17px;color:#efd36f;}
      .admin-sanctuary-bucket-table-wrap{max-height:min(58vh,620px);overflow:auto;border:1px solid rgba(212,175,55,.20);border-radius:10px;background:rgba(0,0,0,.16);}
      .admin-sanctuary-bucket-table{width:100%;border-collapse:collapse;min-width:720px;}
      .admin-sanctuary-bucket-table th{position:sticky;top:0;z-index:2;background:#15140f;color:#d7c689;font-size:10px;text-transform:uppercase;letter-spacing:.05em;padding:8px;border-bottom:1px solid rgba(212,175,55,.24);text-align:left;}
      .admin-sanctuary-bucket-table td{padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.05);font-size:11px;color:#c7c2ad;vertical-align:middle;}
      .admin-sanctuary-bucket-code{font-weight:900;color:#efd36f!important;font-variant-numeric:tabular-nums;width:54px;}
      .admin-sanctuary-bucket-input{width:100%;box-sizing:border-box;background:rgba(0,0,0,.34);border:1px solid rgba(212,175,55,.24);border-radius:6px;color:#f1e6bd;padding:7px 8px;font:600 11px/1.2 monospace;}
      .admin-sanctuary-bucket-input:focus{outline:2px solid rgba(212,175,55,.38);outline-offset:1px;}
      .admin-sanctuary-bucket-name{max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .admin-sanctuary-bucket-state{font-weight:900;font-size:9px!important;letter-spacing:.04em;white-space:nowrap;}
      .admin-sanctuary-bucket-state[data-kind="ok"]{color:#8fd18b;}.admin-sanctuary-bucket-state[data-kind="future"]{color:#80b9df;}.admin-sanctuary-bucket-state[data-kind="warn"]{color:#e4b56d;}.admin-sanctuary-bucket-state[data-kind="error"]{color:#e07a6b;}.admin-sanctuary-bucket-state[data-kind="empty"]{color:#777568;}
      .admin-sanctuary-resonance-group td{position:sticky;top:27px;z-index:1;background:#1b1912!important;border-top:1px solid rgba(212,175,55,.34);border-bottom:1px solid rgba(212,175,55,.20);padding:8px 10px!important;color:#efd36f!important;}
      .admin-sanctuary-resonance-group td{display:flex;justify-content:space-between;gap:12px;align-items:center;}
      .admin-sanctuary-resonance-group span{font-size:10px;color:#aaa58f;font-weight:900;}
      .admin-sanctuary-affinity-code{width:44px;font-weight:1000;color:#efd36f!important;text-align:center;}
      .admin-sanctuary-bucket-code small{display:block;font-size:8px;color:#777568;font-weight:700;margin-top:2px;}
      .admin-sanctuary-affinity-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin:10px 0 12px;}
      .admin-sanctuary-affinity-kpis div{border:1px solid rgba(212,175,55,.16);border-radius:7px;padding:7px 8px;background:rgba(255,255,255,.018);display:flex;justify-content:space-between;gap:7px;font-size:10px;color:#a9a58f;}
      .admin-sanctuary-affinity-kpis strong{color:#efd36f;}
      .admin-sanctuary-egg-list{display:grid;gap:10px;margin-top:12px;}
      .admin-sanctuary-egg-card{border:1px solid rgba(212,175,55,.20);border-radius:10px;background:rgba(0,0,0,.16);padding:10px;}
      .admin-sanctuary-egg-card.invalid{border-color:rgba(224,122,107,.65);}
      .admin-sanctuary-egg-head{display:flex;align-items:center;gap:10px;margin-bottom:9px;}
      .admin-sanctuary-egg-head label{font-size:11px;color:#d7c689;font-weight:900;}
      .admin-sanctuary-egg-state{margin-left:auto;font-size:9px;font-weight:1000;letter-spacing:.05em;color:#aaa58f;}
      .admin-sanctuary-egg-state[data-kind="ok"]{color:#8fd18b}.admin-sanctuary-egg-state[data-kind="future"]{color:#80b9df}.admin-sanctuary-egg-state[data-kind="warn"]{color:#e4b56d}.admin-sanctuary-egg-state[data-kind="error"]{color:#e07a6b}
      .admin-sanctuary-egg-grid{display:grid;grid-template-columns:1.1fr 1.5fr .6fr 1.2fr;gap:8px;}
      .admin-sanctuary-egg-grid label{display:flex;flex-direction:column;gap:4px;min-width:0;}
      .admin-sanctuary-egg-grid label>span{font-size:9px;color:#9c9887;text-transform:uppercase;font-weight:900;letter-spacing:.05em;}
      .admin-sanctuary-egg-grid input,.admin-sanctuary-egg-grid textarea{box-sizing:border-box;width:100%;background:rgba(0,0,0,.34);border:1px solid rgba(212,175,55,.24);border-radius:6px;color:#f1e6bd;padding:7px 8px;font:600 11px/1.25 monospace;resize:vertical;}
      .admin-sanctuary-egg-grid small{font-size:9px;line-height:1.35;color:#777568;}
      .admin-sanctuary-egg-wide{grid-column:1/-1;}
      .admin-sanctuary-egg-cardname{margin-top:7px;font-size:10px;color:#aaa58f;}
      .admin-sanctuary-egg-remove{padding:5px 8px!important;font-size:9px!important;}
      .admin-sanctuary-debug-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;}
      .admin-sanctuary-debug-card{border:1px solid rgba(212,175,55,.20);border-radius:10px;background:rgba(0,0,0,.16);padding:11px;display:flex;flex-direction:column;gap:8px;}
      .admin-sanctuary-debug-card h4{margin:0;color:#efd36f;font-size:12px;letter-spacing:.04em;}
      .admin-sanctuary-debug-inputrow{display:flex;gap:7px;align-items:flex-end;}
      .admin-sanctuary-debug-inputrow label{display:flex;flex:1 1 auto;flex-direction:column;gap:4px;min-width:0;}
      .admin-sanctuary-debug-inputrow label>span{font-size:9px;color:#9c9887;text-transform:uppercase;font-weight:900;letter-spacing:.05em;}
      .admin-sanctuary-debug-input{width:100%;box-sizing:border-box;background:rgba(0,0,0,.34);border:1px solid rgba(212,175,55,.24);border-radius:6px;color:#f1e6bd;padding:8px 9px;font:700 12px/1.2 monospace;}
      .admin-sanctuary-debug-result{min-height:108px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:rgba(255,255,255,.018);padding:8px;}
      .admin-sanctuary-debug-empty{color:#777568;font-size:11px;line-height:1.4;}
      .admin-sanctuary-debug-result-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px;}
      .admin-sanctuary-debug-result-head strong{color:#efd36f;font-size:12px;}
      .admin-sanctuary-debug-result-head span{font-size:9px;font-weight:1000;letter-spacing:.05em;color:#8fd18b;}
      .admin-sanctuary-debug-result-head span[data-resolved="false"]{color:#e4b56d;}
      .admin-sanctuary-debug-result-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 8px;}
      .admin-sanctuary-debug-result-grid div{min-width:0;}
      .admin-sanctuary-debug-result-grid small{display:block;color:#777568;font-size:8px;text-transform:uppercase;font-weight:900;letter-spacing:.04em;}
      .admin-sanctuary-debug-result-grid code,.admin-sanctuary-debug-result-grid b{display:block;margin-top:1px;color:#d8d1b8;font-size:10px;overflow-wrap:anywhere;white-space:normal;}
      .admin-sanctuary-history-toolbar{display:grid;grid-template-columns:minmax(220px,2fr) repeat(3,minmax(120px,.7fr)) auto;gap:8px;align-items:end;margin:12px 0;}
      .admin-sanctuary-history-field{display:flex;flex-direction:column;gap:4px;min-width:0;}
      .admin-sanctuary-history-field>span{font-size:9px;color:#9c9887;text-transform:uppercase;font-weight:900;letter-spacing:.05em;}
      .admin-sanctuary-history-field input,.admin-sanctuary-history-field select{width:100%;box-sizing:border-box;background:rgba(0,0,0,.34);border:1px solid rgba(212,175,55,.24);border-radius:6px;color:#f1e6bd;padding:8px 9px;font:600 11px/1.2 inherit;}
      .admin-sanctuary-history-table-wrap{max-height:min(43vh,480px);overflow:auto;border:1px solid rgba(212,175,55,.20);border-radius:10px;background:rgba(0,0,0,.16);margin-top:8px;}
      .admin-sanctuary-history-table{width:100%;border-collapse:collapse;min-width:900px;}
      .admin-sanctuary-history-table th{position:sticky;top:0;z-index:2;background:#15140f;color:#d7c689;font-size:9px;text-transform:uppercase;letter-spacing:.05em;padding:8px;border-bottom:1px solid rgba(212,175,55,.24);text-align:left;}
      .admin-sanctuary-history-table td{padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.05);font-size:10px;color:#c7c2ad;vertical-align:top;}
      .admin-sanctuary-history-table code{font-size:9px;color:#d8d1b8;overflow-wrap:anywhere;white-space:normal;}
      .admin-sanctuary-history-subtitle{margin:14px 0 4px;color:#efd36f;font-size:11px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;}
      .admin-sanctuary-history-empty{text-align:center;color:#777568!important;padding:18px!important;}
      .admin-sanctuary-history-invalid{display:block;margin-top:3px;color:#e07a6b;font-size:8px;font-weight:1000;}
      .admin-sanctuary-history-window{margin-top:8px;font-size:10px;line-height:1.45;color:#777568;}
      @media(max-width:760px){.admin-sanctuary-history-toolbar{grid-template-columns:1fr 1fr}.admin-sanctuary-history-toolbar .admin-save-btn{grid-column:1/-1}.admin-sanctuary-debug-grid{grid-template-columns:1fr}.admin-sanctuary-status-grid{grid-template-columns:1fr 1fr}.admin-sanctuary-bucket-kpis{grid-template-columns:repeat(2,1fr)}.admin-sanctuary-affinity-kpis{grid-template-columns:1fr 1fr}.admin-sanctuary-actions{justify-content:stretch}.admin-sanctuary-actions .admin-save-btn{flex:1 1 auto;}.admin-sanctuary-egg-grid{grid-template-columns:1fr 1fr}.admin-sanctuary-egg-head{flex-wrap:wrap}.admin-sanctuary-egg-state{margin-left:0}}
    `;
    document.head.appendChild(style);
  }

  root.innerHTML=`
    <div class="admin-sanctuary-wrap">
      <datalist id="admin-sanctuary-discovery-options"></datalist>
      ${RESONANCE_AFFINITIES.map(group=>`<datalist id="admin-sanctuary-discovery-options-${group.id}"></datalist>`).join('')}
      <div class="admin-section">
        <div class="admin-section-title">${esc(gameText('sanctuary.admin.sectionTitle'))}</div>
        <div class="admin-debug-summary">${esc(gameText('sanctuary.admin.stage18Note'))}</div>
        <div class="admin-debug-summary">${esc(gameText('sanctuary.admin.stage23Note'))}</div>
        <div id="admin-sanctuary-status-summary">${esc(gameText('sanctuary.admin.loading'))}</div>
      </div>
      <div class="admin-section">
        <div class="admin-section-title">${esc(gameText('sanctuary.admin.general'))}</div>
        <div class="admin-field-row">
          <div><span class="admin-field-label">${esc(gameText('sanctuary.admin.masterSwitch'))}</span><div class="admin-sanctuary-help">${esc(gameText('sanctuary.admin.masterSwitchHelp'))}</div></div>
          <button type="button" class="options-toggle-btn admin-sanctuary-toggle" id="admin-sanctuary-master"></button>
        </div>
        <div class="admin-sanctuary-warning">${esc(gameText('sanctuary.admin.masterWarning'))}</div>
        <div class="admin-field-row">
          <div><span class="admin-field-label">${esc(gameText('sanctuary.admin.cooldownDays'))}</span><div class="admin-sanctuary-help">${esc(gameText('sanctuary.admin.cooldownHelp'))}</div></div>
          <input class="admin-field-input" id="admin-sanctuary-cooldown" type="number" min="1" max="365" step="1" value="7" style="width:110px;">
        </div>
        <div class="admin-debug-summary" style="margin:12px 0 8px;">${esc(gameText('sanctuary.admin.sourcesHelp'))}</div>
        <div class="admin-field-row"><span class="admin-field-label">${esc(gameText('sanctuary.admin.barcodeEnabled'))}</span><button type="button" class="options-toggle-btn admin-sanctuary-toggle" id="admin-sanctuary-barcode"></button></div>
        <div class="admin-field-row"><span class="admin-field-label">${esc(gameText('sanctuary.admin.resonanceEnabled'))}</span><button type="button" class="options-toggle-btn admin-sanctuary-toggle" id="admin-sanctuary-resonance"></button></div>
        <div class="admin-field-row"><span class="admin-field-label">${esc(gameText('sanctuary.admin.bypass'))}</span><strong style="color:#7fd28c;">${esc(gameText('sanctuary.admin.on'))}</strong></div>
        <div class="admin-field-row"><span class="admin-field-label">${esc(gameText('sanctuary.admin.unlimited'))}</span><strong style="font-size:20px;color:#efd36f;">∞</strong></div>
        <div class="admin-sanctuary-actions">
          <button class="admin-save-btn" id="admin-sanctuary-reload">${esc(gameText('sanctuary.admin.reload'))}</button>
          <button class="admin-save-btn" id="admin-sanctuary-save">${esc(gameText('sanctuary.admin.save'))}</button>
        </div>
        <div class="admin-sanctuary-statusline" id="admin-sanctuary-message"></div>
      </div>
      <div class="admin-section">
        <div class="admin-section-title">${esc(gameText('sanctuary.admin.barcodeBuckets'))}</div>
        <div class="admin-sanctuary-help">${esc(gameText('sanctuary.admin.barcodeBucketsHelp'))}</div>
        <div class="admin-sanctuary-picker-note">${esc(gameText('sanctuary.admin.discoveryPickerHelp'))}</div>
        <div class="admin-sanctuary-info">${esc(gameText('sanctuary.admin.barcodeBucketsBindingWarning'))}</div>
        <div class="admin-sanctuary-actions admin-sanctuary-mapping-tools"><button class="admin-save-btn" type="button" id="admin-sanctuary-buckets-autofill">${esc(gameText('sanctuary.admin.bucketAutofill'))}</button><button class="admin-save-btn" type="button" id="admin-sanctuary-buckets-clear">${esc(gameText('sanctuary.admin.bucketClear'))}</button></div>
        <div class="admin-sanctuary-bucket-kpis">
          <div class="admin-sanctuary-bucket-kpi"><span>${esc(gameText('sanctuary.admin.barcodeConfigured'))}</span><strong id="admin-sanctuary-kpi-configured">0/100</strong></div>
          <div class="admin-sanctuary-bucket-kpi"><span>${esc(gameText('sanctuary.admin.barcodeUnique'))}</span><strong id="admin-sanctuary-kpi-unique">0</strong></div>
          <div class="admin-sanctuary-bucket-kpi"><span>${esc(gameText('sanctuary.admin.barcodeDuplicates'))}</span><strong id="admin-sanctuary-kpi-duplicates">0</strong></div>
          <div class="admin-sanctuary-bucket-kpi"><span>${esc(gameText('sanctuary.admin.barcodeUnresolved'))}</span><strong id="admin-sanctuary-kpi-unresolved">0</strong></div>
          <div class="admin-sanctuary-bucket-kpi"><span>${esc(gameText('sanctuary.admin.barcodeNonDiscovery'))}</span><strong id="admin-sanctuary-kpi-nondiscovery">0</strong></div>
        </div>
        <div class="admin-sanctuary-bucket-table-wrap">
          <table class="admin-sanctuary-bucket-table">
            <thead><tr><th>${esc(gameText('sanctuary.admin.bucket'))}</th><th>${esc(gameText('sanctuary.admin.card'))}</th><th>${esc(gameText('sanctuary.admin.barcodeCurrentName'))}</th><th>${esc(gameText('sanctuary.admin.barcodeStatus'))}</th></tr></thead>
            <tbody>${bucketRowsHtml()}</tbody>
          </table>
        </div>
        <div class="admin-sanctuary-actions"><button class="admin-save-btn" id="admin-sanctuary-buckets-save">${esc(gameText('sanctuary.admin.barcodeBucketsSave'))}</button></div>
        <div class="admin-sanctuary-statusline" id="admin-sanctuary-buckets-message"></div>
      </div>
      <div class="admin-section">
        <div class="admin-section-title">${esc(gameText('sanctuary.admin.resonanceBuckets'))}</div>
        <div class="admin-sanctuary-help">${esc(gameText('sanctuary.admin.resonanceBucketsHelp'))}</div>
        <div class="admin-sanctuary-picker-note">${esc(gameText('sanctuary.admin.resonanceAssignmentHelp'))}</div>
        <div class="admin-sanctuary-info">${esc(gameText('sanctuary.admin.resonanceBucketsBindingWarning'))}</div>
        <div class="admin-sanctuary-actions admin-sanctuary-mapping-tools"><button class="admin-save-btn" type="button" id="admin-sanctuary-resonance-autofill">${esc(gameText('sanctuary.admin.resonanceAutofill'))}</button><button class="admin-save-btn" type="button" id="admin-sanctuary-resonance-clear">${esc(gameText('sanctuary.admin.bucketClear'))}</button></div>
        <div class="admin-sanctuary-bucket-kpis">
          <div class="admin-sanctuary-bucket-kpi"><span>${esc(gameText('sanctuary.admin.resonanceConfigured'))}</span><strong id="admin-sanctuary-res-kpi-configured">0/100</strong></div>
          <div class="admin-sanctuary-bucket-kpi"><span>${esc(gameText('sanctuary.admin.resonanceUnique'))}</span><strong id="admin-sanctuary-res-kpi-unique">0</strong></div>
          <div class="admin-sanctuary-bucket-kpi"><span>${esc(gameText('sanctuary.admin.resonanceDuplicates'))}</span><strong id="admin-sanctuary-res-kpi-duplicates">0</strong></div>
          <div class="admin-sanctuary-bucket-kpi"><span>${esc(gameText('sanctuary.admin.resonanceUnresolved'))}</span><strong id="admin-sanctuary-res-kpi-unresolved">0</strong></div>
          <div class="admin-sanctuary-bucket-kpi"><span>${esc(gameText('sanctuary.admin.resonanceNonDiscovery'))}</span><strong id="admin-sanctuary-res-kpi-nondiscovery">0</strong></div>
          <div class="admin-sanctuary-bucket-kpi"><span>${esc(gameText('sanctuary.admin.resonanceAffinityMismatch'))}</span><strong id="admin-sanctuary-res-kpi-mismatch">0</strong></div>
        </div>
        <div class="admin-sanctuary-affinity-kpis">${RESONANCE_AFFINITIES.map(group=>`<div><span>${esc(gameText(group.labelKey))}</span><strong id="admin-sanctuary-res-affinity-${group.id}">0/20</strong></div>`).join('')}</div>
        <div class="admin-sanctuary-bucket-table-wrap">
          <table class="admin-sanctuary-bucket-table">
            <thead><tr><th>${esc(gameText('sanctuary.admin.resonanceAffinity'))}</th><th>${esc(gameText('sanctuary.admin.resonanceLocalBucket'))}</th><th>${esc(gameText('sanctuary.admin.card'))}</th><th>${esc(gameText('sanctuary.admin.barcodeCurrentName'))}</th><th>${esc(gameText('sanctuary.admin.barcodeStatus'))}</th></tr></thead>
            <tbody>${resonanceRowsHtml()}</tbody>
          </table>
        </div>
        <div class="admin-sanctuary-actions"><button class="admin-save-btn" id="admin-sanctuary-resonance-save">${esc(gameText('sanctuary.admin.resonanceBucketsSave'))}</button></div>
        <div class="admin-sanctuary-statusline" id="admin-sanctuary-resonance-message"></div>
      </div>
      <div class="admin-section">
        <div class="admin-section-title">${esc(gameText('sanctuary.admin.easterEggs'))}</div>
        <div class="admin-sanctuary-help">${esc(gameText('sanctuary.admin.easterEggsHelp'))}</div><div class="admin-sanctuary-picker-note">${esc(gameText('sanctuary.admin.easterEggHowTo'))}</div>
        <div class="admin-sanctuary-info">${esc(gameText('sanctuary.admin.easterEggPrivacy'))}</div>
        <div class="admin-sanctuary-warning">${esc(gameText('sanctuary.admin.easterEggBindingsWarning'))}</div>
        <div class="admin-sanctuary-bucket-kpis">
          <div class="admin-sanctuary-bucket-kpi"><span>${esc(gameText('sanctuary.admin.easterEggRules'))}</span><strong id="admin-sanctuary-egg-kpi-rules">0</strong></div>
          <div class="admin-sanctuary-bucket-kpi"><span>${esc(gameText('sanctuary.admin.easterEggEnabledRules'))}</span><strong id="admin-sanctuary-egg-kpi-enabled">0</strong></div>
          <div class="admin-sanctuary-bucket-kpi"><span>${esc(gameText('sanctuary.admin.easterEggGtinsKpi'))}</span><strong id="admin-sanctuary-egg-kpi-gtins">0</strong></div>
          <div class="admin-sanctuary-bucket-kpi"><span>${esc(gameText('sanctuary.admin.easterEggOverlaps'))}</span><strong id="admin-sanctuary-egg-kpi-overlaps">0</strong></div>
        </div>
        <div class="admin-sanctuary-actions" style="justify-content:flex-start;"><button class="admin-save-btn" id="admin-sanctuary-egg-add">${esc(gameText('sanctuary.admin.easterEggAdd'))}</button></div>
        <div class="admin-sanctuary-egg-list" id="admin-sanctuary-egg-list"></div>
        <div class="admin-sanctuary-actions"><button class="admin-save-btn" id="admin-sanctuary-egg-save">${esc(gameText('sanctuary.admin.easterEggSave'))}</button></div>
        <div class="admin-sanctuary-statusline" id="admin-sanctuary-egg-message"></div>
      </div>
      <div class="admin-section" id="admin-sanctuary-history-section">
        <div class="admin-section-title">${esc(gameText('sanctuary.admin.historyTitle'))}</div>
        <div class="admin-sanctuary-help">${esc(gameText('sanctuary.admin.historyHelp'))}</div>
        <div class="admin-sanctuary-warning">${esc(gameText('sanctuary.admin.historyReadOnly'))}</div>
        <div class="admin-sanctuary-history-toolbar">
          <label class="admin-sanctuary-history-field"><span>${esc(gameText('sanctuary.admin.historySearch'))}</span><input id="admin-sanctuary-history-query" autocomplete="off" spellcheck="false" placeholder="${esc(gameText('sanctuary.admin.historySearchPlaceholder'))}"></label>
          <label class="admin-sanctuary-history-field"><span>${esc(gameText('sanctuary.admin.historySource'))}</span><select id="admin-sanctuary-history-source"><option value="all">${esc(gameText('sanctuary.admin.historySourceAll'))}</option><option value="barcode">${esc(gameText('sanctuary.admin.historySourceBarcode'))}</option><option value="resonance">${esc(gameText('sanctuary.admin.historySourceResonance'))}</option></select></label>
          <label class="admin-sanctuary-history-field"><span>${esc(gameText('sanctuary.admin.historyActor'))}</span><select id="admin-sanctuary-history-actor"><option value="all">${esc(gameText('sanctuary.admin.historyActorAll'))}</option><option value="player">${esc(gameText('sanctuary.admin.historyActorPlayer'))}</option><option value="admin">${esc(gameText('sanctuary.admin.historyActorAdmin'))}</option></select></label>
          <label class="admin-sanctuary-history-field"><span>${esc(gameText('sanctuary.admin.historyLimit'))}</span><select id="admin-sanctuary-history-limit"><option value="25">25</option><option value="50" selected>50</option><option value="100">100</option></select></label>
          <button type="button" class="admin-save-btn" id="admin-sanctuary-history-reload">${esc(gameText('sanctuary.admin.historyReload'))}</button>
        </div>
        <div class="admin-sanctuary-bucket-kpis">
          <div class="admin-sanctuary-bucket-kpi"><span>${esc(gameText('sanctuary.admin.historyBarcodeBindings'))}</span><strong id="admin-sanctuary-history-kpi-barcode">—</strong></div>
          <div class="admin-sanctuary-bucket-kpi"><span>${esc(gameText('sanctuary.admin.historyResonanceBindings'))}</span><strong id="admin-sanctuary-history-kpi-resonance">—</strong></div>
          <div class="admin-sanctuary-bucket-kpi"><span>${esc(gameText('sanctuary.admin.historyClaimsTotal'))}</span><strong id="admin-sanctuary-history-kpi-claims-total">—</strong></div>
          <div class="admin-sanctuary-bucket-kpi"><span>${esc(gameText('sanctuary.admin.historyClaimsWindow'))}</span><strong id="admin-sanctuary-history-kpi-claims-window">0</strong></div>
          <div class="admin-sanctuary-bucket-kpi"><span>${esc(gameText('sanctuary.admin.historyPlayerClaims'))}</span><strong id="admin-sanctuary-history-kpi-player">0</strong></div>
          <div class="admin-sanctuary-bucket-kpi"><span>${esc(gameText('sanctuary.admin.historyAdminClaims'))}</span><strong id="admin-sanctuary-history-kpi-admin">0</strong></div>
        </div>
        <div class="admin-sanctuary-history-subtitle">${esc(gameText('sanctuary.admin.historyBindingsTable'))}</div>
        <div class="admin-sanctuary-history-table-wrap"><table class="admin-sanctuary-history-table"><thead><tr><th>${esc(gameText('sanctuary.admin.historyType'))}</th><th>${esc(gameText('sanctuary.admin.historyInput'))}</th><th>${esc(gameText('sanctuary.admin.card'))}</th><th>${esc(gameText('sanctuary.admin.bucket'))}</th><th>${esc(gameText('sanctuary.admin.debugSource'))}</th><th>${esc(gameText('sanctuary.admin.historyBindingId'))}</th><th>${esc(gameText('sanctuary.admin.historyCreated'))}</th></tr></thead><tbody id="admin-sanctuary-history-bindings"><tr><td colspan="7" class="admin-sanctuary-history-empty">${esc(gameText('sanctuary.admin.historyLoading'))}</td></tr></tbody></table></div>
        <div class="admin-sanctuary-history-subtitle">${esc(gameText('sanctuary.admin.historyClaimsTable'))}</div>
        <div class="admin-sanctuary-history-table-wrap"><table class="admin-sanctuary-history-table"><thead><tr><th>${esc(gameText('sanctuary.admin.historyCreated'))}</th><th>${esc(gameText('sanctuary.admin.historyUser'))}</th><th>${esc(gameText('sanctuary.admin.historyType'))}</th><th>${esc(gameText('sanctuary.admin.card'))}</th><th>${esc(gameText('sanctuary.admin.bucket'))}</th><th>${esc(gameText('sanctuary.admin.debugSource'))}</th><th>${esc(gameText('sanctuary.admin.historyMode'))}</th><th>${esc(gameText('sanctuary.admin.historyBindingCreated'))}</th><th>${esc(gameText('sanctuary.admin.historyOperation'))}</th></tr></thead><tbody id="admin-sanctuary-history-claims"><tr><td colspan="9" class="admin-sanctuary-history-empty">${esc(gameText('sanctuary.admin.historyLoading'))}</td></tr></tbody></table></div>
        <div class="admin-sanctuary-history-window" id="admin-sanctuary-history-window">${esc(gameText('sanctuary.admin.historyWindowNote'))}</div>
        <div class="admin-sanctuary-statusline" id="admin-sanctuary-history-message"></div>
      </div>
      <div class="admin-section">
        <div class="admin-section-title">${esc(gameText('sanctuary.admin.debugPreview'))}</div>
        <div class="admin-sanctuary-info">${esc(gameText('sanctuary.admin.debugPreviewHelp'))}</div>
        <div class="admin-sanctuary-debug-grid">
          <div class="admin-sanctuary-debug-card">
            <h4>${esc(gameText('sanctuary.admin.debugBarcodeTitle'))}</h4>
            <div class="admin-sanctuary-debug-inputrow"><label><span>${esc(gameText('sanctuary.admin.debugBarcodeInput'))}</span><input class="admin-sanctuary-debug-input" id="admin-sanctuary-debug-barcode-input" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="${esc(gameText('sanctuary.admin.debugBarcodePlaceholder'))}"></label><button type="button" class="admin-save-btn" id="admin-sanctuary-debug-barcode-run">${esc(gameText('sanctuary.admin.debugBarcodeRun'))}</button></div>
            <div class="admin-sanctuary-debug-result" id="admin-sanctuary-debug-barcode-result"><div class="admin-sanctuary-debug-empty">${esc(gameText('sanctuary.admin.debugEmpty'))}</div></div>
          </div>
          <div class="admin-sanctuary-debug-card">
            <h4>${esc(gameText('sanctuary.admin.debugResonanceTitle'))}</h4>
            <div class="admin-sanctuary-help">${esc(gameText('sanctuary.admin.debugResonanceHelp'))}</div>
            <div class="admin-sanctuary-debug-inputrow"><label><span>${esc(gameText('sanctuary.admin.debugResonanceInput'))}</span><input class="admin-sanctuary-debug-input" id="admin-sanctuary-debug-resonance-input" autocomplete="off" spellcheck="false" placeholder="${esc(gameText('sanctuary.admin.debugResonancePlaceholder'))}"></label><button type="button" class="admin-save-btn" id="admin-sanctuary-debug-resonance-run">${esc(gameText('sanctuary.admin.debugResonanceRun'))}</button></div>
            <div class="admin-sanctuary-debug-result" id="admin-sanctuary-debug-resonance-result"><div class="admin-sanctuary-debug-empty">${esc(gameText('sanctuary.admin.debugEmpty'))}</div></div>
          </div>
        </div>
      </div>
    </div>`;

  const master=root.querySelector('#admin-sanctuary-master');
  const barcode=root.querySelector('#admin-sanctuary-barcode');
  const resonance=root.querySelector('#admin-sanctuary-resonance');
  const cooldown=root.querySelector('#admin-sanctuary-cooldown');
  const save=root.querySelector('#admin-sanctuary-save');
  const reload=root.querySelector('#admin-sanctuary-reload');
  const bucketSave=root.querySelector('#admin-sanctuary-buckets-save');
  const resonanceSave=root.querySelector('#admin-sanctuary-resonance-save');
  const bucketAutofill=root.querySelector('#admin-sanctuary-buckets-autofill');
  const bucketClear=root.querySelector('#admin-sanctuary-buckets-clear');
  const resonanceAutofill=root.querySelector('#admin-sanctuary-resonance-autofill');
  const resonanceClear=root.querySelector('#admin-sanctuary-resonance-clear');
  const discoveryOptions=root.querySelector('#admin-sanctuary-discovery-options');
  const eggAdd=root.querySelector('#admin-sanctuary-egg-add');
  const eggSave=root.querySelector('#admin-sanctuary-egg-save');
  const eggList=root.querySelector('#admin-sanctuary-egg-list');
  const statusSummary=root.querySelector('#admin-sanctuary-status-summary');
  const message=root.querySelector('#admin-sanctuary-message');
  const bucketMessage=root.querySelector('#admin-sanctuary-buckets-message');
  const resonanceMessage=root.querySelector('#admin-sanctuary-resonance-message');
  const eggMessage=root.querySelector('#admin-sanctuary-egg-message');
  const debugBarcodeInput=root.querySelector('#admin-sanctuary-debug-barcode-input');
  const debugBarcodeRun=root.querySelector('#admin-sanctuary-debug-barcode-run');
  const debugBarcodeResult=root.querySelector('#admin-sanctuary-debug-barcode-result');
  const debugResonanceInput=root.querySelector('#admin-sanctuary-debug-resonance-input');
  const debugResonanceRun=root.querySelector('#admin-sanctuary-debug-resonance-run');
  const debugResonanceResult=root.querySelector('#admin-sanctuary-debug-resonance-result');
  const historyQuery=root.querySelector('#admin-sanctuary-history-query');
  const historySource=root.querySelector('#admin-sanctuary-history-source');
  const historyActor=root.querySelector('#admin-sanctuary-history-actor');
  const historyLimit=root.querySelector('#admin-sanctuary-history-limit');
  const historyReload=root.querySelector('#admin-sanctuary-history-reload');
  const historyBindings=root.querySelector('#admin-sanctuary-history-bindings');
  const historyClaims=root.querySelector('#admin-sanctuary-history-claims');
  const historyWindow=root.querySelector('#admin-sanctuary-history-window');
  const historyMessage=root.querySelector('#admin-sanctuary-history-message');
  const bucketInputs=[...root.querySelectorAll('[data-sanctuary-bucket-index]')];
  const resonanceInputs=[...root.querySelectorAll('[data-sanctuary-resonance-index]')];
  let current=null;
  let loading=false;

  function authorizedDiscoveryCards(){
    return (cardDb.authorizedDiscoveryCards || []).filter(isDiscoveryCard).slice().sort((a,b)=>String(a.id||'').localeCompare(String(b.id||''),undefined,{numeric:true}));
  }

  function refreshDiscoveryOptions(){
    if(!discoveryOptions) return 0;
    const cards=authorizedDiscoveryCards();
    const optionHtml=list=>list.map(card=>`<option value="${esc(card.id)}">${esc(`${card.id} · ${card.name || 'Sin nombre'} · ${(card.colors||[]).join('/') || '—'}`)}</option>`).join('');
    discoveryOptions.innerHTML=optionHtml(cards);
    for(const group of RESONANCE_AFFINITIES){
      const list=root.querySelector(`#admin-sanctuary-discovery-options-${group.id}`);
      if(list) list.innerHTML=optionHtml(cards.filter(card=>cardMatchesResonanceAffinity(card,group.id)));
    }
    return cards.length;
  }

  async function ensureAdminDiscoveryCatalog(){
    let count=refreshDiscoveryOptions();
    if(count===100) return count;
    try{ await loadAuthorizedDiscoveryCards(); }catch(error){ console.warn('[Santuario Admin] Discovery picker load skipped',error?.message||error); }
    return refreshDiscoveryOptions();
  }

  function setMappingInputs(inputs, values){
    inputs.forEach((input,index)=>{ input.value=String(values[index]||''); });
  }

  function toggle(btn){ applyToggleVisual(btn,btn?.dataset?.enabled!=='true'); }
  master?.addEventListener('click',()=>toggle(master));
  barcode?.addEventListener('click',()=>toggle(barcode));
  resonance?.addEventListener('click',()=>toggle(resonance));

  function currentBucketValues(){
    return Array.from({length:BARCODE_BUCKET_COUNT},(_,index)=>String(root.querySelector(`[data-sanctuary-bucket-index="${index}"]`)?.value||'').trim());
  }

  function currentResonanceValues(){
    return Array.from({length:RESONANCE_BUCKET_COUNT},(_,index)=>String(root.querySelector(`[data-sanctuary-resonance-index="${index}"]`)?.value||'').trim());
  }

  function refreshBucketDiagnostics(){
    const values=currentBucketValues();
    const counts=new Map();
    values.filter(Boolean).forEach(value=>counts.set(value,(counts.get(value)||0)+1));
    let configured=0, unresolved=0, nonDiscovery=0, invalid=0;
    const unique=new Set();
    for(let index=0;index<BARCODE_BUCKET_COUNT;index+=1){
      const value=values[index];
      const input=root.querySelector(`[data-sanctuary-bucket-index="${index}"]`);
      const nameCell=root.querySelector(`[data-sanctuary-bucket-name="${index}"]`);
      const stateCell=root.querySelector(`[data-sanctuary-bucket-state="${index}"]`);
      let name=gameText('sanctuary.admin.barcodeCardNameUnknown');
      let state=gameText('sanctuary.admin.barcodeEmpty');
      let kind='empty';
      input?.classList.remove('invalid');
      if(value){
        configured+=1; unique.add(value);
        if(!CARD_ID_RE.test(value)){
          invalid+=1; state=gameText('sanctuary.admin.barcodeInvalidStatus'); kind='error'; input?.classList.add('invalid');
        }else{
          const card=cardDb.getById(value);
          if(card){
            name=String(card.name||value);
            if(!isDiscoveryCard(card)){ nonDiscovery+=1; state=gameText('sanctuary.admin.barcodeNonDiscoveryStatus'); kind='warn'; }
            else { state=gameText('sanctuary.admin.barcodeDiscoveryOk'); kind='ok'; }
          }else{ unresolved+=1; state=gameText('sanctuary.admin.barcodeFuture'); kind='future'; }
          if((counts.get(value)||0)>1){ state=`${state} · ${gameText('sanctuary.admin.barcodeDuplicateStatus')}`; if(kind==='ok'||kind==='future') kind='warn'; }
        }
      }
      if(nameCell) nameCell.textContent=name;
      if(stateCell){ stateCell.textContent=state; stateCell.dataset.kind=kind; }
    }
    const duplicates=Math.max(0,configured-unique.size);
    const set=(id,value)=>{const el=root.querySelector(id);if(el)el.textContent=String(value);};
    set('#admin-sanctuary-kpi-configured',`${configured}/100`); set('#admin-sanctuary-kpi-unique',unique.size); set('#admin-sanctuary-kpi-duplicates',duplicates); set('#admin-sanctuary-kpi-unresolved',unresolved); set('#admin-sanctuary-kpi-nondiscovery',nonDiscovery);
    return {values,configured,unique:unique.size,duplicates,unresolved,nonDiscovery,invalid};
  }

  function refreshResonanceDiagnostics(){
    const values=currentResonanceValues();
    const counts=new Map();
    values.filter(Boolean).forEach(value=>counts.set(value,(counts.get(value)||0)+1));
    let configured=0, unresolved=0, nonDiscovery=0, invalid=0, affinityMismatch=0;
    const unique=new Set();
    const coverage=Object.fromEntries(RESONANCE_AFFINITIES.map(group=>[group.id,0]));
    for(let index=0;index<RESONANCE_BUCKET_COUNT;index+=1){
      const value=values[index];
      const affinity=resonanceAffinityForIndex(index);
      const input=root.querySelector(`[data-sanctuary-resonance-index="${index}"]`);
      const nameCell=root.querySelector(`[data-sanctuary-resonance-name="${index}"]`);
      const stateCell=root.querySelector(`[data-sanctuary-resonance-state="${index}"]`);
      let name=gameText('sanctuary.admin.barcodeCardNameUnknown');
      let state=gameText('sanctuary.admin.resonanceEmpty');
      let kind='empty';
      input?.classList.remove('invalid');
      if(value){
        configured+=1; unique.add(value); coverage[affinity]=(coverage[affinity]||0)+1;
        if(!CARD_ID_RE.test(value)){
          invalid+=1; state=gameText('sanctuary.admin.resonanceInvalidStatus'); kind='error'; input?.classList.add('invalid');
        }else{
          const card=cardDb.getById(value);
          if(card){
            name=String(card.name||value);
            if(!isDiscoveryCard(card)){ nonDiscovery+=1; state=gameText('sanctuary.admin.resonanceNonDiscoveryStatus'); kind='warn'; }
            else if(!cardMatchesResonanceAffinity(card,affinity)){ affinityMismatch+=1; state=gameText('sanctuary.admin.resonanceAffinityMismatchStatus'); kind='warn'; }
            else { state=gameText('sanctuary.admin.resonanceDiscoveryOk'); kind='ok'; }
          }else{ unresolved+=1; state=gameText('sanctuary.admin.resonanceFuture'); kind='future'; }
          if((counts.get(value)||0)>1){ state=`${state} · ${gameText('sanctuary.admin.resonanceDuplicateStatus')}`; if(kind==='ok'||kind==='future') kind='warn'; }
        }
      }
      if(nameCell) nameCell.textContent=name;
      if(stateCell){ stateCell.textContent=state; stateCell.dataset.kind=kind; }
    }
    const duplicates=Math.max(0,configured-unique.size);
    const set=(id,value)=>{const el=root.querySelector(id);if(el)el.textContent=String(value);};
    set('#admin-sanctuary-res-kpi-configured',`${configured}/100`); set('#admin-sanctuary-res-kpi-unique',unique.size); set('#admin-sanctuary-res-kpi-duplicates',duplicates); set('#admin-sanctuary-res-kpi-unresolved',unresolved); set('#admin-sanctuary-res-kpi-nondiscovery',nonDiscovery); set('#admin-sanctuary-res-kpi-mismatch',affinityMismatch);
    RESONANCE_AFFINITIES.forEach(group=>{ set(`#admin-sanctuary-res-affinity-${group.id}`,`${coverage[group.id]||0}/20`); const label=root.querySelector(`[data-resonance-affinity-coverage="${group.id}"]`); if(label) label.textContent=`${coverage[group.id]||0}/20`; });
    return {values,configured,unique:unique.size,duplicates,unresolved,nonDiscovery,invalid,affinityMismatch,coverage};
  }

  function readEasterEggRules(){
    return [...root.querySelectorAll('[data-sanctuary-egg-index]')].map(card=>{
      const get=name=>card.querySelector(`[data-egg-field="${name}"]`);
      const parsed=parseGtinText(get('gtins')?.value||'');
      return {
        id:String(get('id')?.value||'').trim(), enabled:!!get('enabled')?.checked, label:String(get('label')?.value||'').trim(),
        note:String(get('note')?.value||'').trim(), priority:Number(get('priority')?.value), cardId:String(get('cardId')?.value||'').trim(),
        gtins:parsed.normalized, _tokens:parsed.tokens, _invalidGtins:parsed.invalid, _card:card
      };
    });
  }

  function refreshEasterEggDiagnostics(){
    const rules=readEasterEggRules(); const ids=new Set(); const ties=new Map(); const overlapCounts=new Map();
    let invalid=0,enabled=0,totalGtins=0;
    for(const rule of rules){ if(rule.enabled) enabled+=1; totalGtins+=rule.gtins.length; if(rule.enabled) rule.gtins.forEach(gtin=>overlapCounts.set(gtin,(overlapCounts.get(gtin)||0)+1)); }
    for(const rule of rules){
      const cardEl=rule._card; const stateEl=cardEl?.querySelector('[data-egg-state]'); const cardName=cardEl?.querySelector('[data-egg-cardname]');
      let kind='ok',state=gameText('sanctuary.admin.easterEggDiscoveryOk'); let rowInvalid=false;
      if(!EASTER_EGG_ID_RE.test(rule.id)||ids.has(rule.id)||!Number.isInteger(rule.priority)||rule.priority<0||rule.priority>1000||!CARD_ID_RE.test(rule.cardId)||rule.gtins.length<1||rule._invalidGtins.length){ rowInvalid=true; state=rule._invalidGtins.length?gameText('sanctuary.admin.easterEggGtinInvalid'):gameText('sanctuary.admin.easterEggInvalid'); kind='error'; }
      ids.add(rule.id);
      if(rule.enabled){ for(const gtin of rule.gtins){ const key=`${gtin}|${rule.priority}`; if(ties.has(key)){rowInvalid=true; state=gameText('sanctuary.admin.easterEggCollision'); kind='error'; const other=ties.get(key); other._card?.classList.add('invalid'); const otherState=other._card?.querySelector('[data-egg-state]'); if(otherState){otherState.textContent=gameText('sanctuary.admin.easterEggCollision');otherState.dataset.kind='error';}} else ties.set(key,rule); } }
      const card=cardDb.getById(rule.cardId);
      if(!rowInvalid){ if(card){ if(cardName)cardName.textContent=String(card.name||rule.cardId); if(!isDiscoveryCard(card)){state=gameText('sanctuary.admin.easterEggNonDiscovery');kind='warn';} } else {if(cardName)cardName.textContent=gameText('sanctuary.admin.barcodeCardNameUnknown');state=gameText('sanctuary.admin.easterEggFuture');kind='future';} }
      if(rowInvalid) invalid+=1;
      cardEl?.classList.toggle('invalid',rowInvalid); if(stateEl){stateEl.textContent=state;stateEl.dataset.kind=kind;}
    }
    const overlaps=[...overlapCounts.values()].filter(count=>count>1).length;
    const set=(id,value)=>{const el=root.querySelector(id);if(el)el.textContent=String(value);};
    set('#admin-sanctuary-egg-kpi-rules',rules.length); set('#admin-sanctuary-egg-kpi-enabled',enabled); set('#admin-sanctuary-egg-kpi-gtins',totalGtins); set('#admin-sanctuary-egg-kpi-overlaps',overlaps);
    return {rules:rules.map(({_tokens,_invalidGtins,_card,...rule})=>rule),invalid,enabled,totalGtins,overlaps};
  }

  function renderEasterEggs(status){
    current=status||current; const rules=normalizeEasterEggRows(status?.adminConfig?.barcodeEasterEggs);
    if(eggList) eggList.innerHTML=rules.length?rules.map(easterEggRuleHtml).join(''):`<div class="admin-sanctuary-help">${esc(gameText('sanctuary.admin.easterEggEmpty'))}</div>`;
    refreshEasterEggDiagnostics();
  }

  eggAdd?.addEventListener('click',()=>{
    const currentRules=readEasterEggRules().map(({_tokens,_invalidGtins,_card,...rule})=>rule);
    if(currentRules.length>=EASTER_EGG_MAX_RULES) return;
    currentRules.push({id:newEasterEggId(),enabled:true,label:'',note:'',priority:100,cardId:'',gtins:[]});
    if(eggList) eggList.innerHTML=currentRules.map(easterEggRuleHtml).join(''); refreshEasterEggDiagnostics();
  });
  eggList?.addEventListener('click',event=>{ const remove=event.target.closest('[data-egg-remove]'); if(!remove)return; remove.closest('[data-sanctuary-egg-index]')?.remove(); if(!eggList.querySelector('[data-sanctuary-egg-index]'))eggList.innerHTML=`<div class="admin-sanctuary-help">${esc(gameText('sanctuary.admin.easterEggEmpty'))}</div>`; refreshEasterEggDiagnostics(); });
  eggList?.addEventListener('input',()=>{if(eggMessage)eggMessage.textContent='';refreshEasterEggDiagnostics();});
  eggList?.addEventListener('change',()=>{if(eggMessage)eggMessage.textContent='';refreshEasterEggDiagnostics();});

  bucketAutofill?.addEventListener('click',async()=>{
    const count=await ensureAdminDiscoveryCatalog();
    const cards=authorizedDiscoveryCards();
    if(count!==100||cards.length!==100){ if(bucketMessage)bucketMessage.textContent=gameText('sanctuary.admin.discoveryPickerIncomplete'); return; }
    if(!window.confirm(gameText('sanctuary.admin.bucketAutofillConfirm'))) return;
    setMappingInputs(bucketInputs,cards.map(card=>card.id)); refreshBucketDiagnostics(); if(bucketMessage)bucketMessage.textContent=gameText('sanctuary.admin.bucketAutofillLocal');
  });
  bucketClear?.addEventListener('click',()=>{ if(!window.confirm(gameText('sanctuary.admin.bucketClearConfirm')))return; setMappingInputs(bucketInputs,Array(100).fill('')); refreshBucketDiagnostics(); if(bucketMessage)bucketMessage.textContent=gameText('sanctuary.admin.bucketClearLocal'); });
  resonanceAutofill?.addEventListener('click',async()=>{
    const count=await ensureAdminDiscoveryCatalog();
    const cards=authorizedDiscoveryCards();
    if(count!==100||cards.length!==100){ if(resonanceMessage)resonanceMessage.textContent=gameText('sanctuary.admin.discoveryPickerIncomplete'); return; }
    const values=[];
    for(const group of RESONANCE_AFFINITIES){
      const groupCards=cards.filter(card=>cardMatchesResonanceAffinity(card,group.id));
      if(groupCards.length!==20){ if(resonanceMessage)resonanceMessage.textContent=gameText('sanctuary.admin.resonanceAutofillInvalidPool'); return; }
      values.push(...groupCards.map(card=>card.id));
    }
    if(!window.confirm(gameText('sanctuary.admin.resonanceAutofillConfirm'))) return;
    setMappingInputs(resonanceInputs,values); refreshResonanceDiagnostics(); if(resonanceMessage)resonanceMessage.textContent=gameText('sanctuary.admin.resonanceAutofillLocal');
  });
  resonanceClear?.addEventListener('click',()=>{ if(!window.confirm(gameText('sanctuary.admin.bucketClearConfirm')))return; setMappingInputs(resonanceInputs,Array(100).fill('')); refreshResonanceDiagnostics(); if(resonanceMessage)resonanceMessage.textContent=gameText('sanctuary.admin.bucketClearLocal'); });

  bucketInputs.forEach(input=>input.addEventListener('input',()=>{ if(bucketMessage) bucketMessage.textContent=''; refreshBucketDiagnostics(); }));
  resonanceInputs.forEach(input=>input.addEventListener('input',()=>{ if(resonanceMessage) resonanceMessage.textContent=''; refreshResonanceDiagnostics(); }));

  function historyFilters(){
    return {query:String(historyQuery?.value||'').trim(),source:String(historySource?.value||'all'),actor:String(historyActor?.value||'all'),limit:Number(historyLimit?.value)||50};
  }
  function historyTotal(value){ return Number.isFinite(Number(value))?String(Number(value)):gameText('sanctuary.admin.historyTotalsUnavailable'); }
  function renderHistory(snapshot){
    const k=snapshot?.kpis||{};
    const set=(id,value)=>{const el=root.querySelector(id);if(el)el.textContent=String(value);};
    set('#admin-sanctuary-history-kpi-barcode',historyTotal(k.barcodeBindingsTotal));
    set('#admin-sanctuary-history-kpi-resonance',historyTotal(k.resonanceBindingsTotal));
    set('#admin-sanctuary-history-kpi-claims-total',historyTotal(k.claimsTotal));
    set('#admin-sanctuary-history-kpi-claims-window',Number(k.claimsWindow)||0);
    set('#admin-sanctuary-history-kpi-player',Number(k.playerClaimsWindow)||0);
    set('#admin-sanctuary-history-kpi-admin',Number(k.adminClaimsWindow)||0);
    if(historyBindings) historyBindings.innerHTML=historyBindingRows(snapshot);
    if(historyClaims) historyClaims.innerHTML=historyClaimRows(snapshot);
    const w=snapshot?.window||{};
    if(historyWindow){
      const flags=[];
      if(w.barcodeMayBeTruncated) flags.push('Barcode');
      if(w.resonanceMayBeTruncated) flags.push('Resonancia');
      if(w.claimsMayBeTruncated) flags.push('Claims');
      historyWindow.textContent=`${gameText('sanctuary.admin.historyWindowNote')} · scan=${Number(w.scanLimit)||250} · limit=${Number(w.resultLimit)||50}${flags.length?` · ventana truncada: ${flags.join(', ')}`:''}`;
    }
  }
  async function loadHistory({pending=false}={}){
    if(historyMessage) historyMessage.textContent=gameText('sanctuary.admin.historyLoading');
    try{
      const task=()=>adminGetSanctuaryHistory(historyFilters());
      const snapshot=pending?await withEconomyButtonPending(historyReload,task,{pendingLabel:gameText('sanctuary.admin.historyLoading'),slowLabel:gameText('workshop.server.slow')}):await task();
      if(!snapshot?.readOnly || snapshot?.mutationsAllowed!==false) throw new Error('HISTORY_READ_ONLY_CONTRACT');
      renderHistory(snapshot);
      if(historyMessage) historyMessage.textContent=gameText('sanctuary.admin.historyLoaded');
      return snapshot;
    }catch(error){
      if(historyMessage) historyMessage.textContent=`${gameText('sanctuary.admin.historyError')} ${error?.message||''}`.trim();
      if(historyBindings) historyBindings.innerHTML=`<tr><td colspan="7" class="admin-sanctuary-history-empty">${esc(gameText('sanctuary.admin.historyError'))}</td></tr>`;
      if(historyClaims) historyClaims.innerHTML=`<tr><td colspan="9" class="admin-sanctuary-history-empty">${esc(gameText('sanctuary.admin.historyError'))}</td></tr>`;
      return null;
    }
  }
  historyReload?.addEventListener('click',()=>{void loadHistory({pending:true});});
  historyQuery?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void loadHistory({pending:true});}});

  function applyGeneral(status){
    current=status||current;
    const cfg=status?.config||{};
    applyToggleVisual(master,!!cfg.masterEnabled);
    applyToggleVisual(barcode,!!cfg.barcodeEnabled);
    applyToggleVisual(resonance,!!cfg.resonanceEnabled);
    if(cooldown) cooldown.value=String(Math.max(1,Math.min(365,Number(cfg.cooldownDays)||7)));
    if(statusSummary) statusSummary.innerHTML=renderStatusSummary(status);
  }

  function applyBuckets(status){
    current=status||current;
    const buckets=normalizeBuckets(status?.adminConfig?.barcodeBuckets);
    bucketInputs.forEach((input,index)=>{ input.value=buckets[index]||''; });
    refreshBucketDiagnostics();
  }

  function applyResonance(status){
    current=status||current;
    const buckets=normalizeResonanceBuckets(status?.adminConfig?.resonanceBuckets);
    resonanceInputs.forEach((input,index)=>{ input.value=buckets[index]||''; });
    refreshResonanceDiagnostics();
  }

  function apply(status){ applyGeneral(status); applyBuckets(status); applyResonance(status); renderEasterEggs(status); }

  async function load(){
    if(loading) return current;
    loading=true;
    if(message) message.textContent=gameText('sanctuary.admin.loading');
    if(reload) reload.disabled=true;
    try{
      await ensureAdminDiscoveryCatalog();
      const status=await getSanctuaryStatus();
      apply(status);
      if(message) message.textContent=gameText('sanctuary.admin.loaded');
      if(bucketMessage) bucketMessage.textContent='';
      if(resonanceMessage) resonanceMessage.textContent='';
      if(eggMessage) eggMessage.textContent='';
      await loadHistory();
      return status;
    }catch(error){
      if(message) message.textContent=error?.message||gameText('sanctuary.admin.saveError');
      throw error;
    }finally{
      loading=false;
      if(reload) reload.disabled=false;
    }
  }

  reload?.addEventListener('click',()=>{ void load(); });
  save?.addEventListener('click',async()=>{
    const days=Math.floor(Number(cooldown?.value));
    if(!Number.isInteger(days)||days<1||days>365){ if(message) message.textContent=gameText('sanctuary.admin.saveError'); cooldown?.focus(); return; }
    const payload={masterEnabled:master?.dataset?.enabled==='true',cooldownDays:days,barcodeEnabled:barcode?.dataset?.enabled==='true',resonanceEnabled:resonance?.dataset?.enabled==='true'};
    if(message) message.textContent='';
    try{
      const status=await withEconomyButtonPending(save,()=>adminSetSanctuaryConfig(payload),{pendingLabel:gameText('sanctuary.admin.saving'),slowLabel:gameText('workshop.server.slow')});
      applyGeneral(status);
      if(message) message.textContent=gameText('sanctuary.admin.saved');
    }catch(error){ if(message) message.textContent=`${gameText('sanctuary.admin.saveError')} ${error?.message||''}`.trim(); }
  });

  bucketSave?.addEventListener('click',async()=>{
    const diagnostics=refreshBucketDiagnostics();
    if(diagnostics.invalid>0){
      if(bucketMessage) bucketMessage.textContent=gameText('sanctuary.admin.barcodeBucketsSaveError');
      root.querySelector('.admin-sanctuary-bucket-input.invalid')?.focus();
      return;
    }
    try{
      const status=await withEconomyButtonPending(bucketSave,()=>adminSetSanctuaryBarcodeBuckets(diagnostics.values),{pendingLabel:gameText('sanctuary.admin.barcodeBucketsSaving'),slowLabel:gameText('workshop.server.slow')});
      applyBuckets(status);
      if(bucketMessage) bucketMessage.textContent=gameText('sanctuary.admin.barcodeBucketsSaved');
    }catch(error){ if(bucketMessage) bucketMessage.textContent=`${gameText('sanctuary.admin.barcodeBucketsSaveError')} ${error?.message||''}`.trim(); }
  });

  resonanceSave?.addEventListener('click',async()=>{
    const diagnostics=refreshResonanceDiagnostics();
    if(diagnostics.invalid>0){
      if(resonanceMessage) resonanceMessage.textContent=gameText('sanctuary.admin.resonanceBucketsSaveError');
      root.querySelector('[data-sanctuary-resonance-index].invalid')?.focus();
      return;
    }
    try{
      const status=await withEconomyButtonPending(resonanceSave,()=>adminSetSanctuaryResonanceBuckets(diagnostics.values),{pendingLabel:gameText('sanctuary.admin.resonanceBucketsSaving'),slowLabel:gameText('workshop.server.slow')});
      applyResonance(status);
      if(resonanceMessage) resonanceMessage.textContent=gameText('sanctuary.admin.resonanceBucketsSaved');
    }catch(error){ if(resonanceMessage) resonanceMessage.textContent=`${gameText('sanctuary.admin.resonanceBucketsSaveError')} ${error?.message||''}`.trim(); }
  });

  eggSave?.addEventListener('click',async()=>{
    const diagnostics=refreshEasterEggDiagnostics();
    if(diagnostics.invalid>0){ if(eggMessage)eggMessage.textContent=gameText('sanctuary.admin.easterEggSaveError'); root.querySelector('.admin-sanctuary-egg-card.invalid input, .admin-sanctuary-egg-card.invalid textarea')?.focus(); return; }
    try{
      const status=await withEconomyButtonPending(eggSave,()=>adminSetSanctuaryBarcodeEasterEggs(diagnostics.rules),{pendingLabel:gameText('sanctuary.admin.easterEggSaving'),slowLabel:gameText('workshop.server.slow')});
      renderEasterEggs(status); if(eggMessage)eggMessage.textContent=gameText('sanctuary.admin.easterEggSaved');
    }catch(error){ if(eggMessage)eggMessage.textContent=`${gameText('sanctuary.admin.easterEggSaveError')} ${error?.message||''}`.trim(); }
  });

  function previewSourceLabel(source){
    if(source==='easter_egg') return gameText('sanctuary.admin.debugSourceEasterEgg');
    if(source==='barcode_bucket') return gameText('sanctuary.admin.debugSourceBarcodeBucket');
    if(source==='resonance_bucket') return gameText('sanctuary.admin.debugSourceResonanceBucket');
    return String(source||'—');
  }

  function renderDebugPreview(target,preview){
    if(!target) return;
    if(!preview){ target.innerHTML=`<div class="admin-sanctuary-debug-empty">${esc(gameText('sanctuary.admin.debugEmpty'))}</div>`; return; }
    const cardId=String(preview.cardId||'');
    const genericCardId=String(preview.genericCardId||'');
    const card=cardId?cardDb.getById(cardId):null;
    const egg=preview.easterEgg&&typeof preview.easterEgg==='object'?preview.easterEgg:null;
    const rows=[
      [gameText('sanctuary.admin.debugNormalizedInput'),preview.normalizedInput||'—','code'],
      [gameText('sanctuary.admin.debugSource'),previewSourceLabel(preview.source),'b'],
      [gameText('sanctuary.admin.debugAlgorithm'),preview.algorithmVersion||'—','code'],
      [gameText('sanctuary.admin.debugBucket'),Number.isInteger(Number(preview.bucket))?String(Number(preview.bucket)).padStart(2,'0'):'—','code'],
      ...(preview.affinity?[[gameText('sanctuary.admin.debugAffinity'),preview.affinity,'b']]:[]),
      ...(Number.isInteger(Number(preview.localBucket))?[[gameText('sanctuary.admin.debugLocalBucket'),String(Number(preview.localBucket)).padStart(2,'0'),'code']]:[]),
      [gameText('sanctuary.admin.debugCardId'),cardId||'—','code'],
      [gameText('sanctuary.admin.debugCardName'),card?String(card.name||cardId):(cardId?gameText('sanctuary.admin.barcodeCardNameUnknown'):'—'),'b'],
      ...(preview.type==='barcode'?[[gameText('sanctuary.admin.debugGenericCard'),genericCardId||'—','code']]:[]),
      ...(egg?[[gameText('sanctuary.admin.debugEasterEgg'),`${egg.ruleId}${egg.label?` · ${egg.label}`:''}`,'code'],[gameText('sanctuary.admin.debugPriority'),String(egg.priority??'—'),'code']]:[]),
      [gameText('sanctuary.admin.debugSideEffects'),gameText('sanctuary.admin.debugSideEffectsNone'),'b']
    ];
    target.innerHTML=`<div class="admin-sanctuary-debug-result-head"><strong>${esc(preview.type==='barcode'?gameText('sanctuary.admin.debugBarcodeTitle'):gameText('sanctuary.admin.debugResonanceTitle'))}</strong><span data-resolved="${preview.resolved?'true':'false'}">${esc(preview.resolved?gameText('sanctuary.admin.debugResultResolved'):gameText('sanctuary.admin.debugResultUnresolved'))}</span></div><div class="admin-sanctuary-debug-result-grid">${rows.map(([label,value,tag])=>`<div><small>${esc(label)}</small><${tag}>${esc(value)}</${tag}></div>`).join('')}</div>`;
  }

  async function runDebugPreview(type,inputEl,button,resultEl){
    const input=String(inputEl?.value||'').trim();
    if(!input){ if(resultEl)resultEl.innerHTML=`<div class="admin-sanctuary-debug-empty">${esc(gameText('sanctuary.admin.debugError'))}</div>`; inputEl?.focus(); return; }
    try{
      const preview=await withEconomyButtonPending(button,()=>adminPreviewSanctuary(type,input),{pendingLabel:gameText('sanctuary.admin.debugRunning'),slowLabel:gameText('workshop.server.slow')});
      renderDebugPreview(resultEl,preview);
    }catch(error){
      if(resultEl)resultEl.innerHTML=`<div class="admin-sanctuary-debug-empty">${esc(`${gameText('sanctuary.admin.debugError')} ${error?.message||''}`.trim())}</div>`;
    }
  }

  debugBarcodeRun?.addEventListener('click',()=>{void runDebugPreview('barcode',debugBarcodeInput,debugBarcodeRun,debugBarcodeResult);});
  debugBarcodeInput?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void runDebugPreview('barcode',debugBarcodeInput,debugBarcodeRun,debugBarcodeResult);}});
  debugResonanceRun?.addEventListener('click',()=>{void runDebugPreview('resonance',debugResonanceInput,debugResonanceRun,debugResonanceResult);});
  debugResonanceInput?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void runDebugPreview('resonance',debugResonanceInput,debugResonanceRun,debugResonanceResult);}});

  return { load };
}
