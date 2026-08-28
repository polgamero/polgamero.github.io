import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const ui = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
const texts = fs.readFileSync(path.join(root, 'js/gameTexts.js'), 'utf8');
const version = fs.readFileSync(path.join(root, 'js/version.js'), 'utf8');

assert.ok(version.includes('Entrega 23.13.64 Store Horizontal Showcase Redesign'), 'La baseline debe conservar la entrega 23.13.64.');
assert.ok(version.includes('Entrega 23.17.4 Store + Navigation UX Responsive Polish'), 'El layout horizontal 23.13.64 debe declarar su supersesión responsive 23.17.4.');
assert.ok(version.includes("FIRESTORE_RULES_VERSION = '23.13.77'"), 'El contrato de Tienda debe convivir con las Rules actuales.');
assert.ok(texts.includes("'store.pointsHow.link': definition('Tienda', '¿cómo conseguir puntos?'"), 'Falta el link configurable de cómo conseguir puntos.');
assert.ok(texts.includes("'store.pack.showcaseTitle': definition('Tienda', 'Sobres'"), 'La primera tarjeta debe titularse Sobres.');
assert.ok(texts.includes("'store.craft.showcaseTitle': definition('Tienda', 'Fichas'"), 'La segunda tarjeta debe titularse Fichas.');
assert.ok(texts.includes("'store.prebuilt.showcaseTitle': definition('Tienda', 'Mazos Prearmados'"), 'Debe conservarse el acceso a Mazos Prearmados.');
assert.ok(texts.includes("'store.classifieds.showcaseTitle': definition('Tienda', 'Avisos Clasificados'"), 'Debe conservarse Avisos Clasificados.');

const mainStart = ui.indexOf('async function renderMainView');
const mainEnd = ui.indexOf('function toClassifiedsDate', mainStart);
assert.ok(mainStart >= 0 && mainEnd > mainStart, 'No se encontró renderMainView de Tienda.');
const main = ui.slice(mainStart, mainEnd);

assert.ok(main.includes('id="store-active-events"'), 'La Tienda debe conservar eventos activos.');
assert.ok(ui.includes('id="store-points-info-panel" hidden'), 'Cómo conseguir puntos debe iniciar cerrado.');
assert.ok(ui.includes('id="store-points-info-close"'), 'Panel de puntos necesita cruz de cierre.');
assert.ok(ui.includes("gameTextHtml('store.pointsHow.winHard'"), 'El panel debe reutilizar el contenido actual de puntos.');
assert.ok(ui.includes("gameTextHtml('store.pointsHow.abandon'"), 'El panel debe conservar la penalidad de abandono.');

const marketIx = main.indexOf('class="store-market-strip"');
const packIx = main.indexOf('store-market-pack', marketIx);
const craftIx = main.indexOf('store-market-craft', marketIx);
const prebuiltIx = main.indexOf('store-prebuilt-entry', marketIx);
const classifiedsIx = main.indexOf('store-classifieds-entry', marketIx);
assert.ok(packIx > marketIx && craftIx > packIx && prebuiltIx > craftIx && classifiedsIx > prebuiltIx, 'Orden de Tienda debe ser SOBRES → FICHAS → PREARMADOS → CLASIFICADOS.');
assert.ok(main.includes('chest-item store-market-item store-market-pack'), 'Sobres debe reutilizar .chest-item de Mi Cofre.');
assert.ok(main.includes('chest-item store-market-item store-market-craft'), 'Fichas debe reutilizar .chest-item de Mi Cofre.');
assert.ok(main.includes('chest-item store-market-item store-prebuilt-entry'), 'Prearmados debe reutilizar .chest-item de Mi Cofre.');
assert.ok(main.includes('chest-item store-market-item store-classifieds-entry'), 'Clasificados debe reutilizar .chest-item de Mi Cofre.');
assert.ok(ui.includes('.store-market-strip {\n      display:grid;'), '23.17.4 debe usar grid responsive y no carrusel horizontal obligatorio.');
assert.ok(ui.includes('injectRewardsStyles(); // 23.13.64'), 'Tienda debe conservar el lenguaje visual compartido de Mi Cofre.');

console.log('STORE_REDESIGN_23_13_64_OK legacy=preserved layout=responsive-23.17.4 order=packs>fichas>prebuilt>classifieds chestStyle=shared');
