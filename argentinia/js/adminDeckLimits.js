import { saveAdminDeckCopyLimit } from './firebaseClient.js';
import { canConfigureDeckCopyLimit, configuredDeckCopyLimit, DEFAULT_DECK_COPY_LIMIT } from './deckCopyLimit.js';
import { refreshDeckCopyLimits, setDeckCopyLimits } from './deckLimitsPolicy.js';

function makeOption(value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

export function mountAdminDeckLimits(root, { loadCards, matches, types, rarities }) {
  root.innerHTML = `
    <div class="admin-pane-narrow">
      <div class="admin-section">
        <div class="admin-section-title">Límites por carta</div>
        <p class="admin-debug-summary">Las cartas sin excepción tienen el máximo general de Ajustes del juego. Todas las variantes cuentan juntas. Las tierras básicas son ilimitadas.</p>
        <button class="encyclopedia-tab" type="button" data-limit-add disabled>Agregar</button>
        <form data-limit-editor hidden>
          <div class="admin-field-row"><label for="admin-limit-search">Buscar carta</label><input id="admin-limit-search" type="search" placeholder="Nombre o texto"></div>
          <div class="admin-field-row"><label for="admin-limit-type">Tipo</label><select id="admin-limit-type"></select></div>
          <div class="admin-field-row"><label for="admin-limit-rarity">Rareza</label><select id="admin-limit-rarity"></select></div>
          <div class="admin-field-row"><label for="admin-limit-card">Carta</label><select id="admin-limit-card" required></select></div>
          <div class="admin-field-row"><label for="admin-limit-value">Máximo por mazo</label><select id="admin-limit-value">
            <option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4 (sin excepción)</option>
          </select></div>
          <button class="encyclopedia-tab" type="submit">Aceptar</button>
          <button class="encyclopedia-tab" type="button" data-limit-cancel>Cancelar</button>
        </form>
        <p class="admin-debug-summary" role="status" aria-live="polite" data-limit-status></p>
        <button class="encyclopedia-tab" type="button" data-limit-retry hidden>Volver a cargar</button>
        <div class="admin-debug-table-wrap">
          <table class="admin-debug-table admin-deck-limits-table">
            <thead><tr><th scope="col">Carta</th><th scope="col">Máximo</th><th scope="col">Acciones</th></tr></thead>
            <tbody data-limit-rows></tbody>
          </table>
        </div>
      </div>
    </div>`;
  const find = selector => root.querySelector(selector);
  const add = find('[data-limit-add]');
  const form = find('form');
  const search = find('#admin-limit-search');
  const type = find('#admin-limit-type');
  const rarity = find('#admin-limit-rarity');
  const cardSelect = find('#admin-limit-card');
  const limitSelect = find('#admin-limit-value');
  const submit = find('[type="submit"]');
  const rows = find('[data-limit-rows]');
  const status = find('[data-limit-status]');
  const retry = find('[data-limit-retry]');
  const defaultLimit = DEFAULT_DECK_COPY_LIMIT;
  let cards = [];
  let overrides = Object.create(null);
  let busy = false;
  let editing = null;

  type.append(makeOption('', 'Todos'), ...Object.entries(types).map(([value, label]) => makeOption(value, label)));
  rarity.append(makeOption('', 'Todas'), ...Object.entries(rarities).map(([value, label]) => makeOption(value, label)));
  const currentLimit = card => configuredDeckCopyLimit(card, overrides) ?? defaultLimit;

  function syncLimit() {
    const card = cards.find(item => item.id === cardSelect.value);
    limitSelect.value = String(card ? Math.min(defaultLimit, currentLimit(card)) : 1);
    submit.disabled = busy || !card;
  }

  function updatePicker() {
    const selected = cardSelect.value;
    const options = editing ? [editing] : cards.filter(card =>
      currentLimit(card) >= defaultLimit && matches(card, search.value, type.value, rarity.value));
    cardSelect.replaceChildren(...(options.length
      ? [makeOption('', 'Elegí una carta'), ...options.map(card => makeOption(card.id, `${card.name} · ${card.type}`))]
      : [makeOption('', 'Sin cartas para esta búsqueda')]));
    cardSelect.value = editing?.id || (options.some(card => card.id === selected) ? selected : '');
    syncLimit();
  }

  function openEditor(card = null) {
    editing = card;
    form.reset();
    form.hidden = false;
    search.disabled = type.disabled = rarity.disabled = !!card;
    updatePicker();
    (card ? limitSelect : search).focus();
  }

  function rowAction(label, card, run) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'encyclopedia-tab';
    button.textContent = label;
    button.setAttribute('aria-label', `${label} · ${card.name}`);
    button.addEventListener('click', run);
    return button;
  }

  function renderRows() {
    rows.replaceChildren();
    for (const card of cards.filter(card => currentLimit(card) < defaultLimit)) {
      const row = rows.insertRow();
      row.insertCell().textContent = card.name;
      row.insertCell().textContent = String(currentLimit(card));
      row.insertCell().append(rowAction('Editar', card, () => openEditor(card)),
        rowAction('Quitar límite', card, () => save(card, defaultLimit)));
    }
    if (!rows.rows.length) {
      const cell = rows.insertRow().insertCell();
      cell.colSpan = 3;
      cell.textContent = 'Todavía no hay límites por carta.';
    }
  }

  function setBusy(value) {
    busy = value;
    root.querySelectorAll('button, #admin-limit-card, #admin-limit-value').forEach(control => { control.disabled = value; });
    syncLimit();
  }

  async function load() {
    if (busy) return;
    setBusy(true);
    status.textContent = 'Cargando límites…';
    retry.hidden = true;
    try {
      const [catalogue, live] = await Promise.all([loadCards(), refreshDeckCopyLimits()]);
      cards = catalogue.filter(canConfigureDeckCopyLimit).sort((a, b) => a.name.localeCompare(b.name, 'es'));
      overrides = live;
      renderRows();
      updatePicker();
      status.textContent = '';
    } catch (error) {
      status.textContent = error.message || 'No se pudieron cargar los límites.';
      retry.hidden = false;
    } finally {
      setBusy(false);
      add.disabled = !cards.length;
    }
  }

  async function save(card, limit) {
    if (busy || !card) return;
    setBusy(true);
    try {
      overrides = setDeckCopyLimits(await saveAdminDeckCopyLimit(card.id, limit, overrides[card.id] ?? null));
      form.hidden = true;
      renderRows();
      status.textContent = limit === defaultLimit ? `${card.name} vuelve al máximo general.` : `Límite de ${card.name} guardado.`;
    } catch (error) {
      if (error.code === 'DECK_COPY_LIMIT_CHANGED') {
        setBusy(false);
        await load();
        if (!retry.hidden) return;
      }
      status.textContent = error.message || 'No se pudo guardar el límite.';
    } finally {
      setBusy(false);
      if (form.hidden) add.focus();
    }
  }

  add.addEventListener('click', () => openEditor());
  retry.addEventListener('click', load);
  find('[data-limit-cancel]').addEventListener('click', () => { form.hidden = true; add.focus(); });
  search.addEventListener('input', updatePicker);
  type.addEventListener('change', updatePicker);
  rarity.addEventListener('change', updatePicker);
  cardSelect.addEventListener('change', syncLimit);
  form.addEventListener('submit', event => {
    event.preventDefault();
    void save(cards.find(card => card.id === cardSelect.value), Number(limitSelect.value));
  });
  return { load };
}
