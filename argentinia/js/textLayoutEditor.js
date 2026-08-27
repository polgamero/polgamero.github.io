// js/textLayoutEditor.js — Entrega 23.16.5.2 · DFC face-aware editor
// Editor Admin-only de PRESENTACIÓN del texto. Nunca edita reglas/flavor ni ningún JSON.

import {
  TEXT_LAYOUT_DEFAULT, TEXT_LAYOUT_LIMITS, normalizeCardTextLayout,
  getCardTextLayout, hasCustomCardTextLayout, ensureCardTextLayoutsLoaded,
  applyCardTextLayoutToBox, saveCardTextLayout
} from './textLayout.js';

function injectStyles() {
  if (document.getElementById('text-layout-editor-styles')) return;
  const style = document.createElement('style');
  style.id = 'text-layout-editor-styles';
  style.textContent = `
    #text-layout-editor-overlay { position:fixed; inset:0; z-index:13000; display:flex; align-items:center; justify-content:center; padding:22px; background:rgba(3,7,5,.88); backdrop-filter:blur(5px); }
    .text-layout-editor-panel { width:min(960px,96vw); max-height:94vh; overflow:auto; background:linear-gradient(180deg,#182319,#0d1510); border:2px solid #d4af37; border-radius:14px; box-shadow:0 24px 70px rgba(0,0,0,.72); color:#efe6cf; padding:18px; }
    .text-layout-editor-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:15px; }
    .text-layout-editor-title { color:#f0e0b0; font-size:20px; font-weight:850; }
    .text-layout-editor-subtitle { margin-top:4px; font-size:12px; color:#aaa18e; }
    .text-layout-editor-close { width:34px; height:34px; border-radius:50%; border:1px solid rgba(212,175,55,.55); background:#101810; color:#f0e0b0; cursor:pointer; font-size:22px; }
    .text-layout-editor-grid { display:grid; grid-template-columns:minmax(260px,390px) 1fr; gap:22px; align-items:start; }
    .text-layout-preview-wrap { min-height:560px; display:flex; justify-content:center; align-items:flex-start; padding:16px; border:1px solid rgba(212,175,55,.22); border-radius:12px; background:rgba(255,255,255,.035); --card-w:38vh; }
    .text-layout-preview-wrap .card { cursor:default; }
    .text-layout-preview-wrap .card:hover { transform:none !important; }
    .text-layout-editor-help { font-size:13px; line-height:1.45; color:#d8cfbb; margin-bottom:16px; padding:10px 12px; border-radius:9px; background:rgba(212,175,55,.075); }
    .text-layout-control-row { margin:0 0 15px; }
    .text-layout-control-label { display:flex; justify-content:space-between; gap:10px; font-size:12px; color:#d6ccb5; margin-bottom:5px; }
    .text-layout-control-label strong { color:#f0e0b0; }
    .text-layout-control { display:grid; grid-template-columns:42px 1fr 42px; gap:8px; align-items:center; }
    .text-layout-control input[type=range] { width:100%; accent-color:#d4af37; }
    .text-layout-small-btn,.text-layout-action { border:1px solid rgba(212,175,55,.45); background:#111b13; color:#efe3c6; border-radius:7px; cursor:pointer; min-height:34px; font-weight:750; }
    .text-layout-small-btn:hover,.text-layout-action:hover { background:rgba(212,175,55,.13); }
    .text-layout-values { display:grid; grid-template-columns:repeat(2,1fr); gap:7px; margin:10px 0 15px; }
    .text-layout-value-box { border:1px solid rgba(255,255,255,.10); border-radius:8px; padding:7px 9px; display:flex; justify-content:space-between; font-size:11px; color:#aaa18e; }
    .text-layout-value-box strong { color:#efe3c6; }
    .text-layout-editor-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; margin-top:16px; }
    .text-layout-action { padding:8px 12px; }
    .text-layout-action.primary { border-color:#d4af37; background:#d4af37; color:#17120a; }
    .text-layout-action:disabled { opacity:.48; cursor:not-allowed; }
    .text-layout-editor-error { min-height:18px; margin-top:8px; color:#ffb4a8; font-size:12px; }
    .text-layout-custom-chip { display:inline-block; margin-left:5px; padding:2px 6px; border-radius:999px; color:#17120a; background:#d4af37; font-size:10px; font-weight:800; }
    @media(max-width:760px){ .text-layout-editor-grid{grid-template-columns:1fr}.text-layout-preview-wrap{min-height:430px;--card-w:31vh}.text-layout-editor-panel{padding:13px}.text-layout-values{grid-template-columns:1fr 1fr} }
  `;
  document.head.appendChild(style);
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function percent(value) { return `${Math.round(Number(value) * 100)}%`; }
function heightLabel(value) { return `${Number(value).toFixed(1)}%`; }
function nearlyEqual(a,b,epsilon=.0005){ return Math.abs(Number(a)-Number(b))<=epsilon; }
function layoutsEqual(a,b){ return Object.keys(TEXT_LAYOUT_DEFAULT).every(k=>nearlyEqual(a[k],b[k])); }

export async function openCardTextLayoutEditor({ card, renderCard, layoutId = null, onSaved = null } = {}) {
  if (!card?.id || typeof renderCard !== 'function') throw new Error('TEXT_LAYOUT_EDITOR_INVALID_ARGUMENTS');
  const layoutKey = String(layoutId || card.id);
  injectStyles();
  document.getElementById('text-layout-editor-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'text-layout-editor-overlay';
  overlay.innerHTML = `
    <div class="text-layout-editor-panel" role="dialog" aria-modal="true" aria-label="Editor de texto de carta">
      <div class="text-layout-editor-header">
        <div>
          <div class="text-layout-editor-title">✏️ Ajuste de texto · ${String(card.name || card.id)}</div>
          <div class="text-layout-editor-subtitle">Cargando configuración…</div>
        </div>
        <button type="button" class="text-layout-editor-close" aria-label="Cerrar">×</button>
      </div>
      <div class="text-layout-editor-grid" hidden>
        <div class="text-layout-preview-wrap" id="text-layout-preview"></div>
        <div>
          <div class="text-layout-editor-help"><strong>El contenido no se edita acá.</strong> Reglas y flavor siguen viniendo de los JSON. Estos controles sólo ajustan la presentación guardada para este ID de carta. El auto-fit continúa funcionando debajo de tu ajuste manual.</div>
          <div class="text-layout-control-row" data-key="fontScale"><div class="text-layout-control-label"><span>Tamaño general de letra</span><strong data-label></strong></div><div class="text-layout-control"><button class="text-layout-small-btn" data-minus>−</button><input type="range" min="${TEXT_LAYOUT_LIMITS.minFontScale}" max="${TEXT_LAYOUT_LIMITS.maxFontScale}" step="0.01"><button class="text-layout-small-btn" data-plus>+</button></div></div>
          <div class="text-layout-control-row" data-key="boxHeight"><div class="text-layout-control-label"><span>Altura del recuadro de texto</span><strong data-label></strong></div><div class="text-layout-control"><button class="text-layout-small-btn" data-minus>−</button><input type="range" min="${TEXT_LAYOUT_LIMITS.minBoxHeight}" max="${TEXT_LAYOUT_LIMITS.maxBoxHeight}" step="0.5"><button class="text-layout-small-btn" data-plus>+</button></div></div>
          <div class="text-layout-control-row" data-key="lineHeightScale"><div class="text-layout-control-label"><span>Interlineado</span><strong data-label></strong></div><div class="text-layout-control"><button class="text-layout-small-btn" data-minus>−</button><input type="range" min="${TEXT_LAYOUT_LIMITS.minLineHeightScale}" max="${TEXT_LAYOUT_LIMITS.maxLineHeightScale}" step="0.01"><button class="text-layout-small-btn" data-plus>+</button></div></div>
          <div class="text-layout-control-row" data-key="flavorScale"><div class="text-layout-control-label"><span>Tamaño del flavor</span><strong data-label></strong></div><div class="text-layout-control"><button class="text-layout-small-btn" data-minus>−</button><input type="range" min="${TEXT_LAYOUT_LIMITS.minFlavorScale}" max="${TEXT_LAYOUT_LIMITS.maxFlavorScale}" step="0.01"><button class="text-layout-small-btn" data-plus>+</button></div></div>
          <div class="text-layout-control-row" data-key="flavorGapScale"><div class="text-layout-control-label"><span>Separación antes del flavor</span><strong data-label></strong></div><div class="text-layout-control"><button class="text-layout-small-btn" data-minus>−</button><input type="range" min="${TEXT_LAYOUT_LIMITS.minFlavorGapScale}" max="${TEXT_LAYOUT_LIMITS.maxFlavorGapScale}" step="0.05"><button class="text-layout-small-btn" data-plus>+</button></div></div>
          <div class="text-layout-values">
            <div class="text-layout-value-box"><span>Letra</span><strong id="text-layout-v-font"></strong></div>
            <div class="text-layout-value-box"><span>Recuadro</span><strong id="text-layout-v-height"></strong></div>
            <div class="text-layout-value-box"><span>Interlineado</span><strong id="text-layout-v-line"></strong></div>
            <div class="text-layout-value-box"><span>Flavor</span><strong id="text-layout-v-flavor"></strong></div>
          </div>
          <div class="text-layout-editor-actions">
            <button type="button" class="text-layout-action" id="text-layout-reset">↺ Reset automático</button>
            <button type="button" class="text-layout-action" id="text-layout-cancel">Cancelar</button>
            <button type="button" class="text-layout-action primary" id="text-layout-save">💾 Guardar</button>
          </div>
          <div class="text-layout-editor-error" id="text-layout-error"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close=()=>overlay.remove();
  overlay.querySelector('.text-layout-editor-close').addEventListener('click',close);
  overlay.querySelector('#text-layout-cancel').addEventListener('click',close);
  overlay.addEventListener('mousedown',e=>{ if(e.target===overlay) close(); });

  try { await ensureCardTextLayoutsLoaded({force:true}); }
  catch(error){
    overlay.querySelector('.text-layout-editor-subtitle').textContent='No se pudo cargar gameConfig/textLayouts.';
    overlay.querySelector('#text-layout-error').textContent=`Error: ${error?.message || error}`;
    return;
  }

  let draft={...getCardTextLayout(layoutKey)};
  let saveInFlight=false;
  const grid=overlay.querySelector('.text-layout-editor-grid');
  const subtitle=overlay.querySelector('.text-layout-editor-subtitle');
  subtitle.innerHTML=`${layoutKey}${hasCustomCardTextLayout(layoutKey)?' <span class="text-layout-custom-chip">ajuste personalizado guardado</span>':''}`;

  const previewCard=renderCard(card);
  previewCard.classList.add('text-layout-editor-card-preview');
  overlay.querySelector('#text-layout-preview').appendChild(previewCard);
  const textBox=previewCard.querySelector('.card-text-box');
  const saveBtn=overlay.querySelector('#text-layout-save');
  const errorEl=overlay.querySelector('#text-layout-error');
  if(!textBox){
    grid.hidden=false; errorEl.textContent='Esta carta no tiene un recuadro de texto editable.'; saveBtn.disabled=true; return;
  }

  const rows=[...overlay.querySelectorAll('.text-layout-control-row[data-key]')];
  const stepFor={fontScale:.03,boxHeight:1,lineHeightScale:.03,flavorScale:.03,flavorGapScale:.1};
  function labelFor(key,value){ return key==='boxHeight'?heightLabel(value):percent(value); }
  function renderDraft(){
    draft=normalizeCardTextLayout(draft);
    applyCardTextLayoutToBox(textBox,layoutKey,draft);
    rows.forEach(row=>{ const key=row.dataset.key; row.querySelector('input').value=String(draft[key]); row.querySelector('[data-label]').textContent=labelFor(key,draft[key]); });
    overlay.querySelector('#text-layout-v-font').textContent=percent(draft.fontScale);
    overlay.querySelector('#text-layout-v-height').textContent=heightLabel(draft.boxHeight);
    overlay.querySelector('#text-layout-v-line').textContent=percent(draft.lineHeightScale);
    overlay.querySelector('#text-layout-v-flavor').textContent=percent(draft.flavorScale);
    errorEl.textContent='';
  }
  rows.forEach(row=>{
    const key=row.dataset.key; const input=row.querySelector('input');
    input.addEventListener('input',()=>{ draft[key]=Number(input.value); renderDraft(); });
    row.querySelector('[data-minus]').addEventListener('click',()=>{ draft[key]=clamp(Number(draft[key])-stepFor[key],Number(input.min),Number(input.max)); renderDraft(); });
    row.querySelector('[data-plus]').addEventListener('click',()=>{ draft[key]=clamp(Number(draft[key])+stepFor[key],Number(input.min),Number(input.max)); renderDraft(); });
  });
  overlay.querySelector('#text-layout-reset').addEventListener('click',()=>{ draft={...TEXT_LAYOUT_DEFAULT}; renderDraft(); });
  saveBtn.addEventListener('click',async()=>{
    if(saveInFlight)return; saveInFlight=true; saveBtn.disabled=true; saveBtn.textContent='⏳ Guardando…'; errorEl.textContent='';
    try{
      const saved=await saveCardTextLayout(layoutKey,draft);
      onSaved?.(saved,{custom:!layoutsEqual(saved,TEXT_LAYOUT_DEFAULT)});
      saveBtn.textContent='✅ Guardado'; setTimeout(()=>{if(overlay.isConnected)close();},350);
    }catch(error){ console.error('No se pudo guardar el ajuste de texto:',error); errorEl.textContent=`No se pudo guardar: ${error?.message || error}`; saveBtn.textContent='💾 Guardar'; }
    finally{ saveInFlight=false; if(overlay.isConnected)saveBtn.disabled=false; }
  });

  grid.hidden=false;
  renderDraft();
}
