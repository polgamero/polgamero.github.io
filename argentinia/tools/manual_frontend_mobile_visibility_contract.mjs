import fs from 'node:fs';
import assert from 'node:assert/strict';

const ui = fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const manual = fs.readFileSync(new URL('../js/manualUI.js', import.meta.url), 'utf8');
const mobile = fs.readFileSync(new URL('../css/mobile.css', import.meta.url), 'utf8');

const marketPos = ui.indexOf('id="menu-trade-market"');
const helpPos = ui.indexOf('id="menu-how-to-play"');
assert.ok(marketPos >= 0 && helpPos > marketPos, 'help link must remain after Mercado de Pases');
assert.match(manual, /html\.argentinia-mobile \.main-menu-bottom-row\{[\s\S]*?max-width:calc\(100dvw/);
assert.match(manual, /html\.argentinia-mobile \.main-menu-help-link\{[\s\S]*?flex:0 1 var\(--arg-manual-help-max-width,96px\)/);
assert.match(manual, /white-space:normal/);
assert.match(manual, /fitMainMenuHelpLink\(\)/);
assert.match(manual, /visualViewport/);
assert.match(manual, /viewportRight - marketRect\.right - 4/);
assert.match(manual, /Math\.max\(40,/);
assert.match(manual, /Math\.min\(96, available\)/);
// Surgical guard: the frozen mobile stylesheet stays untouched; fitting lives only in manualUI.
assert.match(mobile, /23\.21\.1 — menú principal compacto: Opciones \+ 3 accesos cuadrados/);
console.log('MANUAL_FRONTEND_MOBILE_VISIBILITY_CONTRACT_OK');
