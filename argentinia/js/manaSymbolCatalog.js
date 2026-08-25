// js/manaSymbolCatalog.js — Argentinia 23.15.5.3
// Catálogo presentation-only de símbolos. Las rutas son relativas al documento HTML.

export const MANA_ICON_URLS = Object.freeze({
  W: './assets/images/ui/mana_blanco.png',
  U: './assets/images/ui/mana_azul.png',
  B: './assets/images/ui/mana_negro.png',
  R: './assets/images/ui/mana_rojo.png',
  G: './assets/images/ui/mana_verde.png',
  '0': './assets/images/ui/mana_0.png',
  '1': './assets/images/ui/mana_1.png',
  '2': './assets/images/ui/mana_2.png',
  '3': './assets/images/ui/mana_3.png',
  '4': './assets/images/ui/mana_4.png',
  '5': './assets/images/ui/mana_5.png',
  '6': './assets/images/ui/mana_6.png',
  '7': './assets/images/ui/mana_7.png',
  '8': './assets/images/ui/mana_8.png',
  '9': './assets/images/ui/mana_9.png',
  C: './assets/images/ui/mana_incoloro.png',
  X: './assets/images/ui/mana_x.png',
  T: './assets/images/ui/girar.png',

  'W/U': './assets/images/ui/blanco_azul.png',
  'W/B': './assets/images/ui/blanco_negro.png',
  'U/B': './assets/images/ui/azul_negro.png',
  'U/R': './assets/images/ui/azul_rojo.png',
  'B/R': './assets/images/ui/negro_rojo.png',
  'B/G': './assets/images/ui/negro_verde.png',
  'R/W': './assets/images/ui/rojo_blanco.png',
  'R/G': './assets/images/ui/rojo_verde.png',
  'G/W': './assets/images/ui/verde_blanco.png',
  'G/U': './assets/images/ui/verde_azul.png',

  'W/P': './assets/images/ui/pir_blanco.png',
  'U/P': './assets/images/ui/pir_azul.png',
  'B/P': './assets/images/ui/pir_negro.png',
  'R/P': './assets/images/ui/pir_rojo.png',
  'G/P': './assets/images/ui/pir_verde.png',
  P: './assets/images/ui/pir_generico.png',

  'W/U/P': './assets/images/ui/pir_blanco_azul.png',
  'W/B/P': './assets/images/ui/pir_blanco_negro.png',
  'W/R/P': './assets/images/ui/pir_blanco_rojo.png',
  'W/G/P': './assets/images/ui/pir_blanco_verde.png',
  'U/B/P': './assets/images/ui/pir_azul_negro.png',
  'U/R/P': './assets/images/ui/pir_azul_rojo.png',
  'B/R/P': './assets/images/ui/pir_negro_rojo.png',
  'B/G/P': './assets/images/ui/pir_negro_verde.png',
  'R/G/P': './assets/images/ui/pir_rojo_verde.png',
  'G/U/P': './assets/images/ui/pir_verde_azul.png'
});

const HYBRID_CANONICAL = Object.freeze({
  'U/W':'W/U', 'W/U':'W/U',
  'B/W':'W/B', 'W/B':'W/B',
  'B/U':'U/B', 'U/B':'U/B',
  'R/U':'U/R', 'U/R':'U/R',
  'R/B':'B/R', 'B/R':'B/R',
  'G/B':'B/G', 'B/G':'B/G',
  'W/R':'R/W', 'R/W':'R/W',
  'G/R':'R/G', 'R/G':'R/G',
  'W/G':'G/W', 'G/W':'G/W',
  'U/G':'G/U', 'G/U':'G/U'
});

export function manaIconKeyForSymbol(symbol) {
  const raw = String(symbol || '').toUpperCase().replace(/\s+/g, '');
  if (MANA_ICON_URLS[raw]) return raw;
  const parts = raw.split('/').filter(Boolean);
  if (parts.length === 2 && parts.includes('P')) {
    const color = parts.find(x => x !== 'P');
    return color && MANA_ICON_URLS[`${color}/P`] ? `${color}/P` : raw;
  }
  if (parts.length === 2) return HYBRID_CANONICAL[raw] || raw;
  if (parts.length === 3 && parts.includes('P')) {
    const colors = parts.filter(x => x !== 'P');
    if (colors.length === 2) {
      const pair = HYBRID_CANONICAL[colors.join('/')];
      if (pair && MANA_ICON_URLS[`${pair}/P`]) return `${pair}/P`;
    }
  }
  return raw;
}

export function manaIconUrlForSymbol(symbol) {
  return MANA_ICON_URLS[manaIconKeyForSymbol(symbol)] || null;
}
