// js/gameTextsAdmin.js — Entrega 23.13.29
// Editor Admin para copy humano visible. No conoce Firebase: load/save se inyectan desde UI.

import {
  GAME_TEXT_MAX_LENGTH,
  applyGameTextOverrides,
  buildGameTextOverridesDocument,
  getGameTextCatalog,
  getGameTextDefault,
  getGameTextOverridesSnapshot,
  validateGameTextOverride
} from './gameTexts.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function injectStyles() {
  if (document.getElementById('game-text-admin-styles')) return;
  const style = document.createElement('style');
  style.id = 'game-text-admin-styles';
  style.textContent = `
    .game-text-admin { display:flex; flex-direction:column; gap:12px; }
    .game-text-toolbar { display:grid; grid-template-columns:minmax(220px,1fr) minmax(170px,240px) auto; gap:10px; align-items:center; }
    .game-text-search,.game-text-category,.game-text-editor {
      width:100%; box-sizing:border-box; background:rgba(255,255,255,.06); color:#f0e0b0;
      border:1px solid rgba(176,106,212,.4); border-radius:8px; padding:9px 11px; font:inherit;
    }
    .game-text-search:focus,.game-text-category:focus,.game-text-editor:focus { outline:none; border-color:#b06ad4; }
    .game-text-summary { color:#aa98b9; font-size:12px; margin:2px 0 4px; }
    .game-text-list { display:flex; flex-direction:column; gap:10px; }
    .game-text-row { border:1px solid rgba(176,106,212,.23); border-radius:10px; background:rgba(8,5,12,.34); padding:12px; }
    .game-text-row-head { display:flex; gap:10px; align-items:flex-start; justify-content:space-between; }
    .game-text-meta { min-width:0; }
    .game-text-key { color:#d8c4e8; font:600 11px/1.35 ui-monospace,SFMono-Regular,Consolas,monospace; word-break:break-word; }
    .game-text-desc { color:#9f91aa; font-size:11px; margin-top:3px; }
    .game-text-badge { display:inline-block; margin-left:6px; border-radius:999px; padding:2px 6px; font-size:9px; vertical-align:1px; }
    .game-text-badge.custom { color:#f3d983; border:1px solid rgba(212,175,55,.55); background:rgba(212,175,55,.08); }
    .game-text-badge.default { color:#9fa9a1; border:1px solid rgba(255,255,255,.12); }
    .game-text-preview { color:#f0e0b0; margin-top:9px; white-space:pre-wrap; word-break:break-word; line-height:1.45; font-size:13px; }
    .game-text-actions { display:flex; gap:7px; flex-wrap:wrap; flex-shrink:0; }
    .game-text-btn { border:1px solid rgba(176,106,212,.48); border-radius:8px; background:rgba(176,106,212,.10); color:#e6d8ed; padding:7px 10px; cursor:pointer; font-size:11px; font-weight:700; }
    .game-text-btn:hover { background:rgba(176,106,212,.18); }
    .game-text-btn:disabled { opacity:.45; cursor:not-allowed; }
    .game-text-btn.danger { border-color:rgba(220,120,120,.45); color:#edb5ab; background:rgba(150,40,40,.08); }
    .game-text-edit-box { margin-top:10px; padding-top:10px; border-top:1px solid rgba(176,106,212,.16); }
    .game-text-editor { min-height:84px; resize:vertical; line-height:1.42; }
    .game-text-editor-info { display:flex; justify-content:space-between; gap:10px; margin-top:5px; color:#8f819b; font-size:10px; }
    .game-text-placeholder { color:#d7c27b; }
    .game-text-error { min-height:16px; margin-top:6px; color:#e68e7d; font-size:11px; }
    .game-text-status { min-height:18px; color:#7cbf7c; font-size:12px; text-align:center; }
    .game-text-empty { text-align:center; color:#9b8ba8; padding:28px 12px; font-style:italic; }
    @media (max-width:760px) {
      .game-text-toolbar { grid-template-columns:1fr; }
      .game-text-row-head { flex-direction:column; }
      .game-text-actions { width:100%; }
      .game-text-btn { flex:1; }
    }
  `;
  document.head.appendChild(style);
}

export function createGameTextsAdminPane({ loadDocument, saveDocument, onApplied } = {}) {
  injectStyles();
  const root = document.createElement('div');
  root.className = 'game-text-admin';
  root.innerHTML = `
    <div class="admin-section">
      <div class="admin-section-title">Textos del juego</div>
      <div style="color:#bcaec6;font-size:12px;line-height:1.5;margin-bottom:12px;">
        Editá copy humano visible sin tocar código. Los valores se guardan como texto plano; las variables entre llaves deben conservarse.
      </div>
      <div class="game-text-toolbar">
        <input class="game-text-search" type="search" placeholder="Buscar texto, clave o descripción…" aria-label="Buscar textos del juego">
        <select class="game-text-category" aria-label="Filtrar categoría"></select>
        <button class="game-text-btn danger" type="button" data-action="reset-category">Restaurar categoría</button>
      </div>
      <div class="game-text-summary"></div>
      <div class="game-text-status"></div>
      <div class="game-text-list"></div>
    </div>`;

  const search = root.querySelector('.game-text-search');
  const category = root.querySelector('.game-text-category');
  const list = root.querySelector('.game-text-list');
  const summary = root.querySelector('.game-text-summary');
  const status = root.querySelector('.game-text-status');
  const resetCategoryBtn = root.querySelector('[data-action="reset-category"]');

  let loaded = false;
  let loading = false;
  let saving = false;
  let overrides = {};
  let editingKey = null;

  function rowForKey(key) {
    return [...list.querySelectorAll('.game-text-row')].find(row => row.dataset.textKey === key) || null;
  }

  function notifyApplied() {
    try { onApplied?.(); } catch (error) { console.error('GAME_TEXT_ADMIN_NOTIFY_FAILED', error); }
  }

  function filteredCatalog() {
    const needle = String(search.value || '').trim().toLowerCase();
    const selectedCategory = category.value;
    return getGameTextCatalog().filter(item => {
      if (selectedCategory && item.category !== selectedCategory) return false;
      if (!needle) return true;
      return `${item.key}\n${item.category}\n${item.description}\n${item.defaultText}\n${item.effectiveText}`.toLowerCase().includes(needle);
    });
  }

  function render() {
    const catalog = getGameTextCatalog();
    const categories = [...new Set(catalog.map(item => item.category))];
    const previousCategory = category.value;
    category.innerHTML = `<option value="">Todas las categorías</option>${categories.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}`;
    if (categories.includes(previousCategory)) category.value = previousCategory;

    const visible = filteredCatalog();
    const customCount = catalog.filter(item => item.overrideText !== null).length;
    summary.textContent = `${visible.length} de ${catalog.length} textos · ${customCount} personalizado${customCount === 1 ? '' : 's'}.`;
    resetCategoryBtn.disabled = saving || !category.value || !catalog.some(item => item.category === category.value && item.overrideText !== null);

    if (!visible.length) {
      list.innerHTML = '<div class="game-text-empty">No hay textos que coincidan con el filtro.</div>';
      return;
    }

    list.innerHTML = visible.map(item => {
      const custom = item.overrideText !== null;
      const isEditing = editingKey === item.key;
      const placeholders = item.placeholders.map(name => `{${name}}`).join(', ');
      return `
        <div class="game-text-row" data-text-key="${escapeHtml(item.key)}">
          <div class="game-text-row-head">
            <div class="game-text-meta">
              <div class="game-text-key">${escapeHtml(item.key)}<span class="game-text-badge ${custom ? 'custom' : 'default'}">${custom ? 'PERSONALIZADO' : 'ORIGINAL'}</span></div>
              <div class="game-text-desc">${escapeHtml(item.description)}</div>
            </div>
            <div class="game-text-actions">
              <button class="game-text-btn" type="button" data-action="edit">✏️ Editar</button>
              <button class="game-text-btn danger" type="button" data-action="restore" ${custom ? '' : 'disabled'}>Restaurar original</button>
            </div>
          </div>
          <div class="game-text-preview">${escapeHtml(item.effectiveText)}</div>
          ${isEditing ? `
            <div class="game-text-edit-box">
              <textarea class="game-text-editor" maxlength="${GAME_TEXT_MAX_LENGTH}">${escapeHtml(item.effectiveText)}</textarea>
              <div class="game-text-editor-info">
                <span>${placeholders ? `Variables obligatorias: <span class="game-text-placeholder">${escapeHtml(placeholders)}</span>` : 'Sin variables obligatorias.'}</span>
                <span data-char-count>${item.effectiveText.length}/${GAME_TEXT_MAX_LENGTH}</span>
              </div>
              <div class="game-text-error"></div>
              <div class="game-text-actions" style="margin-top:7px;">
                <button class="game-text-btn" type="button" data-action="save">💾 Guardar</button>
                <button class="game-text-btn" type="button" data-action="cancel">Cancelar</button>
              </div>
            </div>` : ''}
        </div>`;
    }).join('');

    list.querySelectorAll('.game-text-row').forEach(row => {
      const key = row.dataset.textKey;
      const item = getGameTextCatalog().find(entry => entry.key === key);
      row.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
        editingKey = key;
        render();
        rowForKey(key)?.querySelector('.game-text-editor')?.focus();
      });
      row.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
        editingKey = null;
        render();
      });
      row.querySelector('[data-action="restore"]')?.addEventListener('click', () => void persistKey(key, null));
      const editor = row.querySelector('.game-text-editor');
      if (editor) {
        const counter = row.querySelector('[data-char-count]');
        editor.addEventListener('input', () => { if (counter) counter.textContent = `${editor.value.length}/${GAME_TEXT_MAX_LENGTH}`; });
        row.querySelector('[data-action="save"]')?.addEventListener('click', () => void persistKey(key, editor.value));
      }
      if (!item) row.remove();
    });
  }

  async function persistDocument(nextOverrides, successMessage) {
    if (saving) return;
    saving = true;
    status.textContent = '';
    try {
      const payload = buildGameTextOverridesDocument(nextOverrides);
      await saveDocument(payload);
      overrides = { ...payload.overrides };
      applyGameTextOverrides(payload);
      editingKey = null;
      status.textContent = successMessage;
      notifyApplied();
      render();
    } catch (error) {
      console.error('No se pudieron guardar los Textos del Juego:', error);
      status.textContent = '';
      const row = editingKey ? rowForKey(editingKey) : null;
      const box = row?.querySelector('.game-text-error');
      if (box) box.textContent = error?.message || 'No se pudo guardar el texto.';
      else window.alert(error?.message || 'No se pudieron guardar los textos.');
    } finally {
      saving = false;
      resetCategoryBtn.disabled = false;
    }
  }

  async function persistKey(key, value) {
    const next = { ...overrides };
    if (value === null || value === getGameTextDefault(key)) {
      delete next[key];
      return persistDocument(next, 'Texto restaurado al original.');
    }
    const validation = validateGameTextOverride(key, value);
    if (!validation.ok) {
      const row = rowForKey(key);
      const box = row?.querySelector('.game-text-error');
      if (box) box.textContent = validation.message;
      return;
    }
    next[key] = value;
    return persistDocument(next, 'Texto guardado y aplicado en esta sesión.');
  }

  async function load() {
    if (loaded || loading) return;
    loading = true;
    status.textContent = 'Cargando textos…';
    try {
      const doc = await loadDocument();
      applyGameTextOverrides(doc);
      overrides = getGameTextOverridesSnapshot();
      loaded = true;
      status.textContent = '';
      notifyApplied();
      render();
    } catch (error) {
      console.error('No se pudieron cargar los Textos del Juego:', error);
      status.textContent = 'No se pudieron cargar los textos remotos; se muestran los originales locales.';
      overrides = getGameTextOverridesSnapshot();
      loaded = true;
      render();
    } finally {
      loading = false;
    }
  }

  search.addEventListener('input', render);
  category.addEventListener('change', render);
  resetCategoryBtn.addEventListener('click', () => {
    const selected = category.value;
    if (!selected || saving) return;
    const affected = getGameTextCatalog().filter(item => item.category === selected && item.overrideText !== null);
    if (!affected.length) return;
    if (!window.confirm(`¿Restaurar ${affected.length} texto(s) de “${selected}” a su versión original?`)) return;
    const next = { ...overrides };
    affected.forEach(item => { delete next[item.key]; });
    void persistDocument(next, `Categoría “${selected}” restaurada.`);
  });

  render();
  return { element: root, load };
}
