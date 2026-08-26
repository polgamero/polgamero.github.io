// js/tokenCatalog.js — Entrega 23.15.7 · Generic Permanent Tokens
import { normalizeTokenSpec, buildTokenCard } from './tokenEngine.js';

// Catálogo visual derivado de los efectos create_tokens. NO forma parte del pool canónico,
// colección, sobres ni deckbuilder. Su objetivo es dar identidad estable al arte de cada
// token para Enciclopedia Admin + Art Framing sin contaminar gameplay/protocolo.

function cleanSlug(value) {
  return String(value || 'token')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_') || 'token';
}

export function tokenArtLayoutId(image, tokenName = 'token') {
  const source = image || tokenName || 'token';
  return `tokenart_${cleanSlug(source)}`.slice(0, 80);
}

function visitEffects(value, visitor, path = '') {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visitEffects(entry, visitor, `${path}[${index}]`));
    return;
  }
  if (typeof value !== 'object') return;
  if (value.type === 'create_tokens') visitor(value, path || 'effect');
  Object.entries(value).forEach(([key, child]) => {
    if (key === 'type') return;
    const nextPath = path ? `${path}.${key}` : key;
    visitEffects(child, visitor, nextPath);
  });
}

export function collectTokenProducerEffects(cards = []) {
  const effects = [];
  (Array.isArray(cards) ? cards : []).forEach(card => {
    visitEffects(card, (effect, path) => {
      effects.push({
        cardId: card?.id || '',
        cardName: card?.name || '',
        cardColors: Array.isArray(card?.colors) ? [...card.colors] : [],
        path,
        effect
      });
    });
  });
  return effects;
}

export function buildTokenCatalog(cards = []) {
  const byVisualId = new Map();
  collectTokenProducerEffects(cards).forEach(({ cardId, cardName, cardColors, path, effect }) => {
    const spec = normalizeTokenSpec(effect, { colors:cardColors });
    const tokenName = spec.name;
    const image = spec.image;
    const id = tokenArtLayoutId(image, image ? tokenName : `${tokenName}_${spec.type}`);
    let entry = byVisualId.get(id);
    if (!entry) {
      entry = {
        ...buildTokenCard(spec, { id }),
        artLayoutId: id,
        tokenProducerCount: 0,
        tokenProducerNames: [],
        tokenProducerRefs: []
      };
      byVisualId.set(id, entry);
    }
    entry.tokenProducerCount += 1;
    if (cardName && !entry.tokenProducerNames.includes(cardName)) entry.tokenProducerNames.push(cardName);
    entry.tokenProducerRefs.push({ cardId, cardName, path });
  });

  return [...byVisualId.values()].sort((a, b) =>
    String(a.name).localeCompare(String(b.name), 'es', { sensitivity: 'base' }) ||
    String(a.id).localeCompare(String(b.id))
  );
}
