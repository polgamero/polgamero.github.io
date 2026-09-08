// 23.21.3 — catálogo visual de emojis multiplayer.
// Los assets son reemplazables sin tocar el motor: para cada slot el cliente intenta
// .webp -> .gif -> .png. Un PNG/APNG/GIF/WebP transparente funciona; si falta el archivo,
// se muestra el fallback Unicode. El servidor posee un catálogo trusted equivalente para
// validar ownership/precios de los premium.

export const EMOTE_ASSET_BASE = './assets/images/emotes';
export const EMOTE_CATALOG_VERSION = '23.21.3';

export const EMOTE_CATALOG = Object.freeze([
  Object.freeze({ id:'emote_001', label:'Mate',       fallback:'🧉', premium:false, pricePoints:0,   animation:'pop' }),
  Object.freeze({ id:'emote_002', label:'Aplausos',   fallback:'👏', premium:false, pricePoints:0,   animation:'bounce' }),
  Object.freeze({ id:'emote_003', label:'Risa',       fallback:'😂', premium:false, pricePoints:0,   animation:'shake' }),
  Object.freeze({ id:'emote_004', label:'Sorpresa',   fallback:'😱', premium:false, pricePoints:0,   animation:'pop' }),
  Object.freeze({ id:'emote_005', label:'Enojo',      fallback:'😤', premium:false, pricePoints:0,   animation:'shake' }),
  Object.freeze({ id:'emote_006', label:'Desafío',    fallback:'😏', premium:false, pricePoints:0,   animation:'float' }),
  Object.freeze({ id:'emote_007', label:'Fuego',      fallback:'🔥', premium:true,  pricePoints:250, animation:'pulse' }),
  Object.freeze({ id:'emote_008', label:'Corona',     fallback:'👑', premium:true,  pricePoints:350, animation:'float' }),
  Object.freeze({ id:'emote_009', label:'Calavera',   fallback:'💀', premium:true,  pricePoints:350, animation:'shake' }),
  Object.freeze({ id:'emote_010', label:'Rayos',      fallback:'⚡', premium:true,  pricePoints:400, animation:'pulse' }),
  Object.freeze({ id:'emote_011', label:'Fantasma',   fallback:'👻', premium:true,  pricePoints:450, animation:'float' }),
  Object.freeze({ id:'emote_012', label:'Trofeo',     fallback:'🏆', premium:true,  pricePoints:500, animation:'bounce' })
]);

const BY_ID = new Map(EMOTE_CATALOG.map(row => [row.id, row]));
export function getEmoteDefinition(id) { return BY_ID.get(String(id || '')) || null; }
export function freeEmoteIds() { return EMOTE_CATALOG.filter(e => !e.premium).map(e => e.id); }
export function normalizeOwnedEmoteIds(profile = null) {
  const raw = profile?.cosmetics?.emotes;
  const owned = new Set(Array.isArray(raw) ? raw.map(String) : []);
  for (const id of freeEmoteIds()) owned.add(id);
  return owned;
}
export function emoteAssetCandidates(id) {
  const safe = String(id || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!safe) return [];
  return [`${EMOTE_ASSET_BASE}/${safe}.webp`, `${EMOTE_ASSET_BASE}/${safe}.gif`, `${EMOTE_ASSET_BASE}/${safe}.png`];
}
