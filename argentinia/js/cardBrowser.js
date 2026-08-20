// 23.13.15 — utilidades compartidas por Enciclopedia y Constructor.
// Esta capa no renderiza cartas ni toca red: sólo normaliza criterios de orden y ofrece
// comparadores estables para que las vistas puedan reordenar nodos DOM ya existentes.

export const CARD_BROWSER_SORT_KEYS = Object.freeze({
  CMC: 'cmc',
  POWER: 'power',
  TOUGHNESS: 'toughness'
});

export function getCardBrowserSortOptions(categoryKey) {
  if (categoryKey === 'criaturas') {
    return [
      { key: CARD_BROWSER_SORT_KEYS.CMC, label: 'CMC' },
      { key: CARD_BROWSER_SORT_KEYS.POWER, label: 'Poder' },
      { key: CARD_BROWSER_SORT_KEYS.TOUGHNESS, label: 'Defensa' }
    ];
  }
  return [{ key: CARD_BROWSER_SORT_KEYS.CMC, label: 'CMC' }];
}

export function normalizeCardBrowserSort(categoryKey, sort = {}) {
  const options = getCardBrowserSortOptions(categoryKey);
  const allowed = new Set(options.map(option => option.key));
  return {
    key: allowed.has(sort.key) ? sort.key : CARD_BROWSER_SORT_KEYS.CMC,
    direction: sort.direction === 'desc' ? 'desc' : 'asc'
  };
}

function numericMetric(card, key) {
  const value = Number(card?.[key]);
  return Number.isFinite(value) ? value : 0;
}

export function compareCardsForBrowser(a, b, sort = {}) {
  const direction = sort.direction === 'desc' ? -1 : 1;
  const key = sort.key || CARD_BROWSER_SORT_KEYS.CMC;
  const delta = numericMetric(a, key) - numericMetric(b, key);
  if (delta !== 0) return delta * direction;

  // Empates deterministas: CMC, luego nombre, luego id. Mantener esto estable evita que
  // cambiar filtros haga "saltar" cartas equivalentes sin necesidad.
  if (key !== CARD_BROWSER_SORT_KEYS.CMC) {
    const cmcDelta = numericMetric(a, CARD_BROWSER_SORT_KEYS.CMC) - numericMetric(b, CARD_BROWSER_SORT_KEYS.CMC);
    if (cmcDelta !== 0) return cmcDelta * direction;
  }
  const nameDelta = String(a?.name || '').localeCompare(String(b?.name || ''), 'es', { sensitivity: 'base' });
  if (nameDelta !== 0) return nameDelta;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

export function sortCardsForBrowser(cards = [], sort = {}) {
  return [...cards].sort((a, b) => compareCardsForBrowser(a, b, sort));
}
