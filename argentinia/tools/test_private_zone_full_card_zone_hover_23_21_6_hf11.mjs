import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizePrivateCardDescriptor } from '../js/privateZoneProtocol.js';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const json = rel => JSON.parse(read(rel));
const ui = read('../js/ui.js');
const css = read('../css/style.css');
const creatures = json('../assets/data/criaturas.json');
const sorceries = json('../assets/data/conjuros.json');

// Revealed private-zone offers must carry enough PRINTED/PUBLIC data to use the canonical
// renderer, but must not leak engine-only effect objects or private runtime state.
const raid = sorceries.find(c => c.id === 'conj_059');
const raidPublic = sanitizePrivateCardDescriptor(raid);
for (const key of ['id','name','type','manaCost','cmc','rarity','colors','text','flavorText','image']) {
  assert.ok(Object.prototype.hasOwnProperty.call(raidPublic, key), `missing printed field ${key}`);
}
assert.equal(raidPublic.effect, undefined, 'engine effect metadata must not be published in private-zone descriptors');

const pibe = creatures.find(c => c.id === 'crea_332');
const pibePublic = sanitizePrivateCardDescriptor(pibe);
assert.equal(pibePublic.power, pibe.power);
assert.equal(pibePublic.toughness, pibe.toughness);
assert.deepEqual(pibePublic.keywords, pibe.keywords);
assert.equal(pibePublic.dfc?.kind, 'transform');
assert.equal(pibePublic.dfc?.backFace?.name, pibe.dfc.backFace.name);
assert.equal(pibePublic.dfc?.backFace?.image, pibe.dfc.backFace.image);
assert.equal(pibePublic.dfc?.backFace?.triggers, undefined, 'reverse-face engine triggers stay private; printed rules text is sufficient');

const semigods = json('../assets/data/planeswalkers.json');
const semiPublic = sanitizePrivateCardDescriptor(semigods[0]);
assert.ok(Array.isArray(semiPublic.loyaltyAbilities) && semiPublic.loyaltyAbilities.length > 0);
assert.equal(semiPublic.loyaltyAbilities[0].effect, undefined, 'loyalty engine effects must not leak through reveal descriptor');

// Allanamiento / reveal_candidates now uses the finished Mulligan/Land-search picker and
// canonical FULL card renderer rather than legacy purple name/type buttons.
const modalStart = ui.indexOf('export function showPrivateZoneChoiceModal');
const modalEnd = ui.indexOf('// FASE 2: confirmación antes de abandonar', modalStart);
const modal = ui.slice(modalStart, modalEnd);
assert.match(modal, /overlay\.id\s*=\s*'mulligan-overlay'/);
assert.match(modal, /mulligan-panel private-zone-selection-panel/);
assert.match(modal, /mulligan-hand-row private-zone-card-row/);
assert.match(modal, /createCardElement\(entry\.card/);
assert.match(modal, /mulligan-card-slot', 'private-zone-revealed-card'/);
assert.match(modal, /entry\.selectable !== false/);
assert.match(modal, /private-zone-opaque-card/);
assert.match(modal, /clearMulliganHoverPreview\(\)/);
assert.ok(!/loyalty-ability-btn/.test(modal), 'legacy name/type option buttons must be gone from private-zone picker');

// Cementerio + Exilio desktop: portal hover is >2x, outside the modal clipping context,
// keeps TOP transform origin and clamps the entire result to the viewport.
assert.match(ui, /const targetScale = 2\.15/);
assert.match(ui, /cloneNode\(true\)/);
assert.match(ui, /document\.body\.appendChild\(preview\)/);
assert.match(ui, /window\.innerHeight - displayH - pad/);
assert.ok((ui.match(/classList\.add\('zone-browser-card-slot'\)/g) || []).length >= 2, 'graveyard and exile must opt into external hover portal');
assert.match(css, /\.zone-card-hover-preview/);
assert.match(css, /transform:\s*scale\(var\(--zone-hover-scale, 2\.15\)\)/);
assert.match(css, /transform-origin:\s*top center/);
assert.match(css, /position:\s*fixed/);
assert.match(css, /z-index:\s*21050/);
assert.match(css, /\.gy-modal-grid \.zone-browser-card-slot:hover[\s\S]*transform:\s*none !important/);

console.log('PRIVATE_ZONE_FULL_CARD_ZONE_HOVER_23_21_6_HF11_OK private=reveal-full-render+opaque-safe hover=graveyard+exile-2.15x-body-portal-top-origin');
