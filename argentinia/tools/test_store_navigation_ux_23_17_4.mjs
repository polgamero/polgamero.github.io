import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ENGINE_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';

const ui = fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const mobile = fs.readFileSync(new URL('../css/mobile.css', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../build-manifest.json', import.meta.url), 'utf8'));

assert.equal(ENGINE_VERSION, '23.19.4.5');
assert.equal(FIRESTORE_RULES_VERSION, '23.13.79');
assert.equal(manifest.engineVersion, ENGINE_VERSION);
assert.equal(manifest.firestoreRulesVersion, FIRESTORE_RULES_VERSION);
assert.equal(manifest.pool, 880);

// Header compacto: título + wallet sin labels gigantes dentro del body.
assert.ok(ui.includes('class="store-header-wallet" id="store-header-wallet"'));
assert.ok(ui.includes('store-header-wallet-item'));
assert.ok(ui.includes("renderStoreHeader(gameText('store.title'))"));
assert.ok(ui.includes("renderStoreHeader(gameText('prebuilt.title'))"));
assert.ok(ui.includes("renderStoreHeader(gameText('classifieds.title'))"));
assert.ok(!ui.includes('<div class="store-balance-row classifieds-balance-row">'));

// Grid responsive: tienda, prearmados y clasificados sin carrusel horizontal obligatorio.
assert.ok(ui.includes('grid-template-columns:repeat(auto-fit,minmax(245px,1fr))'));
assert.ok(ui.includes('grid-template-columns:repeat(auto-fit,minmax(235px,1fr))'));
assert.ok(ui.includes('grid-template-columns:repeat(auto-fit,minmax(205px,1fr))'));
assert.ok(!ui.includes('.prebuilt-strip { display:flex;'));
assert.ok(!ui.includes('.classifieds-strip {\n      display:flex;'));

// Navegación estilizada y refresh con affordance visual.
assert.ok(ui.includes('.store-back-link {\n      appearance:none; display:inline-flex'));
assert.ok(ui.includes('↻ ${gameTextHtml(\'classifieds.refresh\')}'));

// Imagen oficial de entrada a Mazos Prearmados.
assert.ok(ui.includes('./assets/images/ui/mazos_prearmados.png'));

// Zoom en detalle de Mis Mazos y soporte drag-scroll desktop.
assert.ok(ui.includes('id="mydecks-detail-zoom"'));
assert.ok(ui.includes('setBrowserCardZoom(grid, detailZoom.value)'));
assert.ok(ui.includes('function enableDesktopDragScroll'));
assert.ok(ui.includes("enableDesktopDragScroll(body, { axis:'y' })"));

// REC: collapsed menor, expanded mantiene el contrato previo.
assert.ok(css.includes('.telemetry-panel:not(.arg-mobile-telemetry-expanded) .arg-mobile-telemetry-toggle'));
assert.ok(css.includes("content:'● REC'"));
assert.ok(mobile.includes('width: 26px !important'));

console.log('STORE_NAVIGATION_UX_23_17_4_OK header=compact grids=responsive backLinks=styled deckZoom=yes rec=smaller dragScroll=desktop prebuiltAsset=mazos_prearmados.png');
