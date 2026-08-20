// 23.13.9 — Composición analítica del Constructor de Mazos.
// Presentación pura: agrupa las cartas elegidas por categoría/tipo y luego por CMC,
// calculando Mana Value promedio ponderado por cantidad de copias. No toca colección,
// economía ni validación/persistencia del mazo.

export const DECK_COMPOSITION_GROUPS = [
  { key: 'criaturas', label: 'CRIATURAS', showManaValue: true },
  { key: 'instantaneos', label: 'INSTANTÁNEOS', showManaValue: true },
  { key: 'conjuros', label: 'CONJUROS', showManaValue: true },
  { key: 'encantamientos', label: 'ENCANTAMIENTOS', showManaValue: true },
  { key: 'artefactos', label: 'ARTEFACTOS', showManaValue: true },
  { key: 'planeswalkers', label: 'PLANESWALKERS', showManaValue: true },
  { key: 'tierras', label: 'TIERRAS', showManaValue: false }
];

const GROUP_META = new Map(DECK_COMPOSITION_GROUPS.map((group, index) => [group.key, { ...group, order: index }]));

function safeCmc(card) {
  const value = Number(card?.cmc);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function formatManaValue(value) {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function buildDeckComposition(entries = []) {
  const groups = new Map();

  for (const entry of entries) {
    if (!entry?.card || !entry?.count || entry.count <= 0) continue;
    const categoryKey = entry.categoryKey || 'otros';
    const meta = GROUP_META.get(categoryKey) || {
      key: categoryKey,
      label: String(categoryKey || 'OTROS').toUpperCase(),
      showManaValue: true,
      order: DECK_COMPOSITION_GROUPS.length
    };

    if (!groups.has(categoryKey)) {
      groups.set(categoryKey, {
        key: meta.key,
        label: meta.label,
        showManaValue: meta.showManaValue,
        order: meta.order,
        count: 0,
        cmcTotal: 0,
        cmcGroups: new Map()
      });
    }

    const group = groups.get(categoryKey);
    const cmc = safeCmc(entry.card);
    group.count += entry.count;
    group.cmcTotal += cmc * entry.count;
    if (!group.cmcGroups.has(cmc)) group.cmcGroups.set(cmc, []);
    group.cmcGroups.get(cmc).push({ ...entry, cmc });
  }

  return [...groups.values()]
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
    .map(group => ({
      key: group.key,
      label: group.label,
      showManaValue: group.showManaValue,
      count: group.count,
      manaValue: group.count > 0 ? group.cmcTotal / group.count : 0,
      cmcGroups: [...group.cmcGroups.entries()]
        .sort(([a], [b]) => b - a)
        .map(([cmc, cmcEntries]) => ({
          cmc,
          count: cmcEntries.reduce((sum, entry) => sum + entry.count, 0),
          entries: cmcEntries.sort((a, b) => a.card.name.localeCompare(b.card.name))
        }))
    }));
}
