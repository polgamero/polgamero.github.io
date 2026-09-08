// 23.21.3 RC3 — authoritative Admin-managed emote catalog.
// Browser-supplied premium/price flags are NEVER trusted. The persisted catalog lives at
// gameConfig/emotes and is written only by the Admin-only callable.

export const TRUSTED_EMOTE_CATALOG_VERSION = '23.21.3-rc3';
export const EMOTE_CATALOG_SCHEMA_VERSION = 1;
export const EMOTE_CATALOG_PATH = 'gameConfig/emotes';
export const MAX_EMOTES = 128;
export const MAX_OWNED_EMOTE_IDS = 256;
export const EMOTE_ANIMATIONS = Object.freeze(['none','pop','bounce','shake','float','pulse']);

export const TRUSTED_EMOTE_CATALOG = Object.freeze([
  Object.freeze({ id:'emote_001', label:'Mate',       image:'emote_001', audio:'', fallback:'🧉', animation:'pop',    active:true, premium:false, pricePoints:0 }),
  Object.freeze({ id:'emote_002', label:'Aplausos',   image:'emote_002', audio:'', fallback:'👏', animation:'bounce', active:true, premium:false, pricePoints:0 }),
  Object.freeze({ id:'emote_003', label:'Risa',       image:'emote_003', audio:'', fallback:'😂', animation:'shake',  active:true, premium:false, pricePoints:0 }),
  Object.freeze({ id:'emote_004', label:'Sorpresa',   image:'emote_004', audio:'', fallback:'😱', animation:'pop',    active:true, premium:false, pricePoints:0 }),
  Object.freeze({ id:'emote_005', label:'Enojo',      image:'emote_005', audio:'', fallback:'😤', animation:'shake',  active:true, premium:false, pricePoints:0 }),
  Object.freeze({ id:'emote_006', label:'Desafío',    image:'emote_006', audio:'', fallback:'😏', animation:'float',  active:true, premium:false, pricePoints:0 }),
  Object.freeze({ id:'emote_007', label:'Fuego',      image:'emote_007', audio:'', fallback:'🔥', animation:'pulse',  active:true, premium:true,  pricePoints:250 }),
  Object.freeze({ id:'emote_008', label:'Corona',     image:'emote_008', audio:'', fallback:'👑', animation:'float',  active:true, premium:true,  pricePoints:350 }),
  Object.freeze({ id:'emote_009', label:'Calavera',   image:'emote_009', audio:'', fallback:'💀', animation:'shake',  active:true, premium:true,  pricePoints:350 }),
  Object.freeze({ id:'emote_010', label:'Rayos',      image:'emote_010', audio:'', fallback:'⚡', animation:'pulse',  active:true, premium:true,  pricePoints:400 }),
  Object.freeze({ id:'emote_011', label:'Fantasma',   image:'emote_011', audio:'', fallback:'👻', animation:'float',  active:true, premium:true,  pricePoints:450 }),
  Object.freeze({ id:'emote_012', label:'Trofeo',     image:'emote_012', audio:'', fallback:'🏆', animation:'bounce', active:true, premium:true,  pricePoints:500 })
]);

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/;
const ASSET_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

function cleanText(value, max) { return String(value ?? '').trim().slice(0, max); }
function cleanAsset(value) {
  const out = cleanText(value, 120);
  if (!out) return '';
  if (!ASSET_RE.test(out) || out.includes('..')) throw new Error('EMOTE_CATALOG_ASSET_INVALID');
  return out;
}
function cleanId(value) {
  const id = cleanText(value, 64);
  if (!ID_RE.test(id)) throw new Error('EMOTE_CATALOG_ID_INVALID');
  return id;
}
function cleanPrice(value, premium) {
  if (!premium) return 0;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1 || n > 100000) throw new Error('EMOTE_CATALOG_PRICE_INVALID');
  return n;
}

export function normalizeEmoteCatalogItems(rawItems, { strict = true } = {}) {
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > MAX_EMOTES) throw new Error('EMOTE_CATALOG_SIZE_INVALID');
  const seen = new Set();
  const items = rawItems.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('EMOTE_CATALOG_ROW_INVALID');
    const id = cleanId(raw.id);
    if (seen.has(id)) throw new Error('EMOTE_CATALOG_DUPLICATE_ID');
    seen.add(id);
    const label = cleanText(raw.label ?? raw.name, 40);
    if (!label) throw new Error('EMOTE_CATALOG_LABEL_INVALID');
    const premium = raw.premium === true;
    const animation = cleanText(raw.animation || 'pop', 16).toLowerCase();
    if (!EMOTE_ANIMATIONS.includes(animation)) throw new Error('EMOTE_CATALOG_ANIMATION_INVALID');
    const fallback = cleanText(raw.fallback || '🙂', 16) || '🙂';
    const image = cleanAsset(raw.image || id);
    const audio = cleanAsset(raw.audio || '');
    const active = raw.active !== false;
    const pricePoints = cleanPrice(raw.pricePoints, premium);
    if (strict) {
      const allowed = new Set(['id','label','name','image','audio','fallback','animation','active','premium','pricePoints']);
      for (const key of Object.keys(raw)) if (!allowed.has(key)) throw new Error(`EMOTE_CATALOG_FIELD_INVALID:${index}:${key}`);
    }
    return Object.freeze({ id, label, image, audio, fallback, animation, active, premium, pricePoints });
  });
  return Object.freeze(items);
}

export function normalizeOwnedPremiumEmotes(profile = {}) {
  const raw = profile?.cosmetics?.emotes;
  return [...new Set((Array.isArray(raw) ? raw : []).map(String).filter(id => ID_RE.test(id)))].slice(0, MAX_OWNED_EMOTE_IDS);
}

export function emoteCatalogById(items = TRUSTED_EMOTE_CATALOG) {
  return new Map((Array.isArray(items) ? items : []).map(row => [row.id, row]));
}

export function userCanUseEmote(profile, emoteId, items = TRUSTED_EMOTE_CATALOG) {
  const item = emoteCatalogById(items).get(String(emoteId || ''));
  if (!item || item.active === false) return false;
  if (!item.premium) return true;
  return normalizeOwnedPremiumEmotes(profile).includes(item.id);
}

export async function loadTrustedEmoteCatalog(db, tx = null) {
  const ref = db.doc(EMOTE_CATALOG_PATH);
  const snap = tx ? await tx.get(ref) : await ref.get();
  if (!snap.exists) return { schemaVersion:EMOTE_CATALOG_SCHEMA_VERSION, catalogVersion:'23.21.3-defaults', source:'defaults', items:TRUSTED_EMOTE_CATALOG, byId:emoteCatalogById(TRUSTED_EMOTE_CATALOG) };
  const data = snap.data() || {};
  let items;
  try { items = normalizeEmoteCatalogItems(data.items, { strict:false }); }
  catch (error) { error.code = error.code || 'EMOTE_CATALOG_INVALID'; throw error; }
  return {
    schemaVersion:EMOTE_CATALOG_SCHEMA_VERSION,
    catalogVersion:cleanText(data.catalogVersion || '23.21.3-admin', 96),
    source:'firestore', items, byId:emoteCatalogById(items)
  };
}
