import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const ui = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
const texts = fs.readFileSync(path.join(root, 'js/gameTexts.js'), 'utf8');
const version = fs.readFileSync(path.join(root, 'js/version.js'), 'utf8');

assert.ok(version.includes('Entrega 23.13.64 Store Horizontal Showcase Redesign'), 'La baseline debe conservar la entrega 23.13.64.');
assert.ok(version.includes("FIRESTORE_RULES_VERSION = '23.13.68'"), 'El contrato de Tienda debe convivir con las Rules actuales.');
assert.ok(texts.includes("'store.pointsHow.link': definition('Tienda', '¿cómo conseguir puntos?'"), 'Falta el link configurable de cómo conseguir puntos.');
assert.ok(texts.includes("'store.pack.showcaseTitle': definition('Tienda', 'Sobres'"), 'La primera tarjeta debe titularse Sobres.');
assert.ok(texts.includes("'store.craft.showcaseTitle': definition('Tienda', 'Fichas'"), 'La segunda tarjeta debe titularse Fichas.');
assert.ok(texts.includes("'store.classifieds.showcaseTitle': definition('Tienda', 'Avisos Clasificados'"), 'La tercera tarjeta debe titularse Avisos Clasificados.');

const mainStart = ui.indexOf('async function renderMainView()');
const mainEnd = ui.indexOf('function toClassifiedsDate', mainStart);
assert.ok(mainStart >= 0 && mainEnd > mainStart, 'No se encontró renderMainView de Tienda.');
const main = ui.slice(mainStart, mainEnd);

const eventIx = main.indexOf('id="store-active-events"');
const balancesIx = main.indexOf('class="store-balance-row"');
const marketIx = main.indexOf('class="store-market-strip-shell"');
assert.ok(eventIx >= 0 && balancesIx > eventIx && marketIx > balancesIx, 'Orden esperado: evento → saldos → vidriera.');

assert.ok(main.includes('id="store-points-how-link"'), 'Falta link debajo del saldo de Puntos.');
assert.ok(ui.includes('id="store-points-info-panel" hidden'), 'Cómo conseguir puntos debe iniciar cerrado.');
assert.ok(ui.includes('id="store-points-info-close"'), 'Panel de puntos necesita cruz de cierre.');
assert.ok(ui.includes("gameTextHtml('store.pointsHow.winHard'"), 'El panel debe reutilizar el contenido actual de puntos.');
assert.ok(ui.includes("gameTextHtml('store.pointsHow.abandon'"), 'El panel debe conservar la penalidad de abandono.');
assert.ok(!main.includes('body.innerHTML = pointsInfoHTML +'), 'El panel antiguo no debe mostrarse permanentemente arriba.');

const stripStart = main.indexOf('class="store-market-strip"');
const packIx = main.indexOf('store-market-pack', stripStart);
const craftIx = main.indexOf('store-market-craft', stripStart);
const classifiedsIx = main.indexOf('store-classifieds-entry', stripStart);
assert.ok(packIx > stripStart && craftIx > packIx && classifiedsIx > craftIx, 'Orden de vidriera debe ser SOBRES → FICHAS → AVISOS CLASIFICADOS.');
assert.ok(main.includes('chest-item store-market-item store-market-pack'), 'Sobres debe reutilizar .chest-item de Mi Cofre.');
assert.ok(main.includes('chest-item store-market-item store-market-craft'), 'Fichas debe reutilizar .chest-item de Mi Cofre.');
assert.ok(main.includes('chest-item store-market-item store-classifieds-entry'), 'Clasificados debe reutilizar .chest-item de Mi Cofre.');

assert.ok(ui.includes('.store-market-strip {\n      display:flex; flex-wrap:nowrap;'), 'Vidriera debe ser una fila horizontal nowrap.');
assert.ok(ui.includes('overflow-x:auto; overflow-y:hidden;'), 'Vidriera necesita scroll horizontal cuando no entra.');
assert.ok(ui.includes('injectRewardsStyles(); // 23.13.64'), 'Tienda debe cargar el lenguaje visual compartido de Mi Cofre.');

console.log('STORE_REDESIGN_23_13_64_OK event>balances>strip points=collapsible order=packs>fichas>classifieds chestStyle=shared scroll=x');
