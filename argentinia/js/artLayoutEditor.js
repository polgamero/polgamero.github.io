// js/artLayoutEditor.js — Entrega 23.13.23
// Editor visual Admin-only (la UI decide si mostrar el botón; Firestore Rules protegen el
// write real). Arrastrar mueve el arte y la rueda +/- controla el zoom. SAVE persiste sólo
// scale/x/y; nunca altera ni reexporta el PNG.

import {
  ART_LAYOUT_DEFAULT,
  ART_LAYOUT_LIMITS,
  ensureArtLayoutsLoaded,
  getArtLayout,
  hasCustomArtLayout,
  normalizeArtLayout,
  applyArtLayoutToImage,
  saveArtLayout
} from './artLayout.js';

const STYLE_ID = 'art-layout-editor-styles';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #art-layout-editor-overlay {
      position:fixed; inset:0; z-index:30000; background:rgba(3,7,5,.92);
      display:flex; align-items:center; justify-content:center; padding:22px;
      backdrop-filter:blur(6px);
    }
    .art-layout-editor-panel {
      width:min(980px,96vw); max-height:94vh; overflow:auto;
      background:linear-gradient(180deg,#172019,#0d130f); color:#eee4cf;
      border:2px solid rgba(212,175,55,.78); border-radius:16px;
      box-shadow:0 26px 70px rgba(0,0,0,.68); padding:18px 20px 20px;
    }
    .art-layout-editor-header { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:14px; }
    .art-layout-editor-title { font-size:20px; font-weight:800; color:#f0e0b0; }
    .art-layout-editor-subtitle { margin-top:3px; color:#a99eb2; font-size:12px; }
    .art-layout-editor-close {
      border:1px solid rgba(212,175,55,.45); background:rgba(255,255,255,.04); color:#eadfbf;
      border-radius:8px; width:34px; height:34px; cursor:pointer; font-size:18px;
    }
    .art-layout-editor-grid { display:grid; grid-template-columns:minmax(310px,430px) minmax(250px,1fr); gap:24px; align-items:center; }
    .art-layout-preview-wrap {
      min-height:500px; display:flex; align-items:center; justify-content:center;
      padding:20px; border-radius:14px; border:1px solid rgba(212,175,55,.24);
      background:radial-gradient(circle at center,rgba(212,175,55,.10),rgba(0,0,0,.22));
    }
    .art-layout-preview-wrap .card { --card-w:min(34vh,340px); cursor:default; }
    .art-layout-preview-wrap .card:hover { transform:none !important; }
    .art-layout-preview-wrap .card-art { cursor:grab; touch-action:none; outline:2px dashed rgba(212,175,55,.0); transition:outline-color .12s ease; }
    .art-layout-preview-wrap .card-art.dragging { cursor:grabbing; outline-color:rgba(212,175,55,.72); }
    .art-layout-preview-wrap .card-art.invalid-frame { outline-color:#e65d5d; }
    .art-layout-editor-help { font-size:13px; line-height:1.5; color:#c9becf; margin-bottom:16px; }
    .art-layout-editor-help strong { color:#f0e0b0; }
    .art-layout-control-row { margin:14px 0; }
    .art-layout-control-label { display:flex; justify-content:space-between; gap:10px; color:#e8dec9; font-size:13px; margin-bottom:7px; }
    .art-layout-zoom-controls { display:grid; grid-template-columns:42px 1fr 42px; gap:8px; align-items:center; }
    .art-layout-zoom-controls input[type=range] { width:100%; accent-color:#d4af37; }
    .art-layout-small-btn {
      min-height:36px; border:1px solid rgba(212,175,55,.42); border-radius:8px;
      background:rgba(255,255,255,.055); color:#f0e0b0; cursor:pointer; font-weight:800;
    }
    .art-layout-small-btn:hover { background:rgba(212,175,55,.13); }
    .art-layout-values {
      display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:14px 0;
    }
    .art-layout-value-box { padding:9px 8px; border-radius:8px; background:rgba(255,255,255,.045); text-align:center; }
    .art-layout-value-box span { display:block; color:#998fa5; font-size:10px; text-transform:uppercase; letter-spacing:.5px; }
    .art-layout-value-box strong { font-size:13px; color:#eee4cf; }
    .art-layout-frame-status { min-height:34px; font-size:12px; line-height:1.35; color:#89d29a; margin:10px 0; }
    .art-layout-frame-status.invalid { color:#ff8989; }
    .art-layout-editor-actions { display:flex; flex-wrap:wrap; gap:9px; margin-top:18px; }
    .art-layout-action {
      min-height:40px; padding:0 15px; border-radius:9px; cursor:pointer; font-weight:800;
      border:1px solid rgba(212,175,55,.48); background:rgba(255,255,255,.05); color:#eee4cf;
    }
    .art-layout-action.primary { background:linear-gradient(180deg,#d4af37,#aa8722); color:#17120a; border-color:#f0d77e; }
    .art-layout-action:disabled { opacity:.42; cursor:not-allowed; }
    .art-layout-editor-error { min-height:20px; margin-top:10px; color:#ff8585; font-size:12px; }
    .art-layout-custom-chip { display:inline-block; margin-top:5px; padding:3px 7px; border-radius:999px; font-size:10px; color:#f0e0b0; border:1px solid rgba(212,175,55,.35); }
    @media (max-width:760px) {
      #art-layout-editor-overlay { padding:8px; align-items:flex-start; overflow:auto; }
      .art-layout-editor-panel { margin:8px 0; padding:14px; }
      .art-layout-editor-grid { grid-template-columns:1fr; gap:14px; }
      .art-layout-preview-wrap { min-height:390px; padding:12px; }
      .art-layout-preview-wrap .card { --card-w:min(38vh,280px); }
    }
  `;
  document.head.appendChild(style);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function nearlyEqual(a, b, epsilon = 0.0005) {
  return Math.abs(Number(a) - Number(b)) <= epsilon;
}

function layoutsEqual(a, b) {
  return nearlyEqual(a.scale, b.scale) && nearlyEqual(a.x, b.x) && nearlyEqual(a.y, b.y);
}

function percent(value) {
  return `${Math.round(Number(value) * 100)}%`;
}

function offsetLabel(value) {
  const n = Number(value) || 0;
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function frameCoversContainer(container, img) {
  const c = container.getBoundingClientRect();
  const i = img.getBoundingClientRect();
  const tolerance = 1.25;
  return i.left <= c.left + tolerance && i.top <= c.top + tolerance &&
    i.right >= c.right - tolerance && i.bottom >= c.bottom - tolerance;
}

export async function openArtLayoutEditor({ card, renderCard, onSaved = null } = {}) {
  if (!card?.id || typeof renderCard !== 'function') throw new Error('ART_LAYOUT_EDITOR_INVALID_ARGUMENTS');
  injectStyles();

  document.getElementById('art-layout-editor-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'art-layout-editor-overlay';
  overlay.innerHTML = `
    <div class="art-layout-editor-panel" role="dialog" aria-modal="true" aria-label="Editor de encuadre de arte">
      <div class="art-layout-editor-header">
        <div>
          <div class="art-layout-editor-title">✏️ Encuadre de arte · ${String(card.name || card.id)}</div>
          <div class="art-layout-editor-subtitle">Cargando configuración…</div>
        </div>
        <button type="button" class="art-layout-editor-close" aria-label="Cerrar">×</button>
      </div>
      <div class="art-layout-editor-grid" hidden>
        <div class="art-layout-preview-wrap" id="art-layout-preview"></div>
        <div>
          <div class="art-layout-editor-help">
            <strong>Arrastrá directamente el arte</strong> para moverlo. Usá la <strong>rueda del mouse</strong> sobre la imagen para acercar/alejar. También podés usar − / + o el slider.
          </div>
          <div class="art-layout-control-row">
            <div class="art-layout-control-label"><span>Zoom</span><strong id="art-layout-zoom-label">100%</strong></div>
            <div class="art-layout-zoom-controls">
              <button type="button" class="art-layout-small-btn" id="art-layout-minus">−</button>
              <input type="range" id="art-layout-zoom" min="${ART_LAYOUT_LIMITS.minScale}" max="${ART_LAYOUT_LIMITS.maxScale}" step="0.01" value="1">
              <button type="button" class="art-layout-small-btn" id="art-layout-plus">+</button>
            </div>
          </div>
          <div class="art-layout-values">
            <div class="art-layout-value-box"><span>Zoom</span><strong id="art-layout-v-scale">100%</strong></div>
            <div class="art-layout-value-box"><span>X</span><strong id="art-layout-v-x">0.0%</strong></div>
            <div class="art-layout-value-box"><span>Y</span><strong id="art-layout-v-y">0.0%</strong></div>
          </div>
          <div class="art-layout-frame-status" id="art-layout-frame-status"></div>
          <div class="art-layout-editor-actions">
            <button type="button" class="art-layout-action" id="art-layout-reset">↺ Centrar / Reset</button>
            <button type="button" class="art-layout-action" id="art-layout-cancel">Cancelar</button>
            <button type="button" class="art-layout-action primary" id="art-layout-save">💾 Guardar</button>
          </div>
          <div class="art-layout-editor-error" id="art-layout-error"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.art-layout-editor-close').addEventListener('click', close);
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });

  try {
    await ensureArtLayoutsLoaded({ force: true });
  } catch (error) {
    overlay.querySelector('.art-layout-editor-subtitle').textContent = 'No se pudo cargar gameConfig/artLayouts.';
    overlay.querySelector('#art-layout-error').textContent = `Error: ${error?.message || error}`;
    return;
  }

  const grid = overlay.querySelector('.art-layout-editor-grid');
  const previewHost = overlay.querySelector('#art-layout-preview');
  const subtitle = overlay.querySelector('.art-layout-editor-subtitle');
  const initial = getArtLayout(card.id);
  let draft = { ...initial };
  let saveInFlight = false;
  let frameValid = true;

  subtitle.innerHTML = `${String(card.id)}${hasCustomArtLayout(card.id) ? ' <span class="art-layout-custom-chip">encuadre personalizado guardado</span>' : ''}`;

  const previewCard = renderCard(card);
  previewCard.classList.add('art-layout-editor-card-preview');
  previewHost.appendChild(previewCard);
  const artBox = previewCard.querySelector('.card-art');
  const artImg = previewCard.querySelector('.card-art-image');
  if (!artBox || !artImg) {
    grid.hidden = false;
    overlay.querySelector('#art-layout-error').textContent = 'Esta carta no tiene una imagen editable.';
    overlay.querySelector('#art-layout-save').disabled = true;
    return;
  }
  // Evita el drag nativo/ghost del navegador: dentro del editor el gesto pertenece al pan.
  artImg.draggable = false;
  artImg.addEventListener('dragstart', event => event.preventDefault());

  const zoomInput = overlay.querySelector('#art-layout-zoom');
  const zoomLabel = overlay.querySelector('#art-layout-zoom-label');
  const vScale = overlay.querySelector('#art-layout-v-scale');
  const vX = overlay.querySelector('#art-layout-v-x');
  const vY = overlay.querySelector('#art-layout-v-y');
  const status = overlay.querySelector('#art-layout-frame-status');
  const saveBtn = overlay.querySelector('#art-layout-save');
  const errorEl = overlay.querySelector('#art-layout-error');

  function validateFrame() {
    // getBoundingClientRect ya incorpora el transform real. Si asoma fondo, no dejamos
    // guardar: el Admin puede acercar o recolocar hasta que el PNG cubra todo el marco.
    frameValid = frameCoversContainer(artBox, artImg);
    artBox.classList.toggle('invalid-frame', !frameValid);
    status.classList.toggle('invalid', !frameValid);
    status.textContent = frameValid
      ? '✓ El arte cubre completamente el marco.'
      : '⚠ El encuadre deja un borde vacío. Acercá o recolocá la imagen antes de guardar.';
    saveBtn.disabled = !frameValid || saveInFlight;
  }

  function renderDraft() {
    draft = normalizeArtLayout(draft);
    applyArtLayoutToImage(artImg, card.id, draft);
    zoomInput.value = String(draft.scale);
    zoomLabel.textContent = percent(draft.scale);
    vScale.textContent = percent(draft.scale);
    vX.textContent = offsetLabel(draft.x);
    vY.textContent = offsetLabel(draft.y);
    errorEl.textContent = '';
    requestAnimationFrame(validateFrame);
  }

  function setScale(nextScale) {
    draft.scale = clamp(Number(nextScale) || 1, ART_LAYOUT_LIMITS.minScale, ART_LAYOUT_LIMITS.maxScale);
    renderDraft();
  }

  zoomInput.addEventListener('input', e => setScale(e.target.value));
  overlay.querySelector('#art-layout-minus').addEventListener('click', () => setScale(draft.scale - 0.08));
  overlay.querySelector('#art-layout-plus').addEventListener('click', () => setScale(draft.scale + 0.08));

  artBox.addEventListener('wheel', e => {
    e.preventDefault();
    const direction = e.deltaY < 0 ? 1 : -1;
    setScale(draft.scale + direction * 0.07);
  }, { passive: false });

  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let pointerId = null;

  artBox.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    dragging = true;
    pointerId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    artBox.classList.add('dragging');
    try { artBox.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
  });

  artBox.addEventListener('pointermove', e => {
    if (!dragging || e.pointerId !== pointerId) return;
    const width = Math.max(1, artImg.offsetWidth);
    const height = Math.max(1, artImg.offsetHeight);
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    draft.x = clamp(draft.x + (dx / width) * 100, ART_LAYOUT_LIMITS.minOffset, ART_LAYOUT_LIMITS.maxOffset);
    draft.y = clamp(draft.y + (dy / height) * 100, ART_LAYOUT_LIMITS.minOffset, ART_LAYOUT_LIMITS.maxOffset);
    renderDraft();
  });

  const stopDrag = e => {
    if (!dragging) return;
    if (e?.pointerId != null && pointerId != null && e.pointerId !== pointerId) return;
    dragging = false;
    artBox.classList.remove('dragging');
    try { if (pointerId != null) artBox.releasePointerCapture(pointerId); } catch {}
    pointerId = null;
  };
  artBox.addEventListener('pointerup', stopDrag);
  artBox.addEventListener('pointercancel', stopDrag);
  artBox.addEventListener('lostpointercapture', stopDrag);

  overlay.querySelector('#art-layout-reset').addEventListener('click', () => {
    draft = { ...ART_LAYOUT_DEFAULT };
    renderDraft();
  });
  overlay.querySelector('#art-layout-cancel').addEventListener('click', close);

  saveBtn.addEventListener('click', async () => {
    if (!frameValid || saveInFlight) return;
    saveInFlight = true;
    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ Guardando…';
    errorEl.textContent = '';
    try {
      const saved = await saveArtLayout(card.id, draft);
      if (typeof onSaved === 'function') onSaved(saved, { custom: !layoutsEqual(saved, ART_LAYOUT_DEFAULT) });
      saveBtn.textContent = '✅ Guardado';
      setTimeout(() => { if (overlay.isConnected) close(); }, 350);
    } catch (error) {
      console.error('No se pudo guardar el encuadre del arte:', error);
      errorEl.textContent = `No se pudo guardar: ${error?.message || error}`;
      saveBtn.textContent = '💾 Guardar';
    } finally {
      saveInFlight = false;
      if (overlay.isConnected) saveBtn.disabled = !frameValid;
    }
  });

  grid.hidden = false;
  renderDraft();
}
