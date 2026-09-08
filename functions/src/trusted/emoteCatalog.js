// 23.21.3 — trusted premium emote catalog. Never accept prices/premium flags from browser.
export const TRUSTED_EMOTE_CATALOG_VERSION = '23.21.3';
export const TRUSTED_EMOTE_CATALOG = Object.freeze([
  Object.freeze({ id:'emote_001', label:'Mate',       premium:false, pricePoints:0 }),
  Object.freeze({ id:'emote_002', label:'Aplausos',   premium:false, pricePoints:0 }),
  Object.freeze({ id:'emote_003', label:'Risa',       premium:false, pricePoints:0 }),
  Object.freeze({ id:'emote_004', label:'Sorpresa',   premium:false, pricePoints:0 }),
  Object.freeze({ id:'emote_005', label:'Enojo',      premium:false, pricePoints:0 }),
  Object.freeze({ id:'emote_006', label:'Desafío',    premium:false, pricePoints:0 }),
  Object.freeze({ id:'emote_007', label:'Fuego',      premium:true,  pricePoints:250 }),
  Object.freeze({ id:'emote_008', label:'Corona',     premium:true,  pricePoints:350 }),
  Object.freeze({ id:'emote_009', label:'Calavera',   premium:true,  pricePoints:350 }),
  Object.freeze({ id:'emote_010', label:'Rayos',      premium:true,  pricePoints:400 }),
  Object.freeze({ id:'emote_011', label:'Fantasma',   premium:true,  pricePoints:450 }),
  Object.freeze({ id:'emote_012', label:'Trofeo',     premium:true,  pricePoints:500 })
]);
export const TRUSTED_EMOTE_BY_ID = Object.freeze(new Map(TRUSTED_EMOTE_CATALOG.map(row => [row.id, row])));
export const FREE_EMOTE_IDS = Object.freeze(TRUSTED_EMOTE_CATALOG.filter(e => !e.premium).map(e => e.id));
export function normalizeOwnedPremiumEmotes(profile = {}) {
  const raw = profile?.cosmetics?.emotes;
  return [...new Set((Array.isArray(raw) ? raw : []).map(String).filter(id => TRUSTED_EMOTE_BY_ID.get(id)?.premium))].slice(0, 64);
}
export function userCanUseEmote(profile, emoteId) {
  const item = TRUSTED_EMOTE_BY_ID.get(String(emoteId || ''));
  if (!item) return false;
  if (!item.premium) return true;
  return normalizeOwnedPremiumEmotes(profile).includes(item.id);
}
