import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const ui=fs.readFileSync(path.join(root,'js/ui.js'),'utf8');
const mobile=fs.readFileSync(path.join(root,'css/mobile.css'),'utf8');

assert.equal(ENGINE_VERSION, '23.18.3');
assert.equal(FIRESTORE_RULES_VERSION,'23.13.75');

// Native browser ghost drag must never steal pointermove from card selectors.
assert.match(ui,/addEventListener\('dragstart',[\s\S]*rowFromEvent\(event\)[\s\S]*event\.preventDefault\(\)/);
assert.match(ui,/-webkit-user-drag:\s*none/);

// Drag starts even over .card content, with threshold + click suppression preserved.
assert.match(ui,/click\+drag puede comenzar SOBRE una carta/);
assert.match(ui,/Math\.abs\(dx\) < 7/);
assert.match(ui,/suppressSelectionClickUntil/);
assert.doesNotMatch(ui,/closest\?\.\([^\n]*\.card/);

// Hover zoom must render in a body-level fixed preview rather than inside overflow-x:auto.
assert.match(ui,/function showMulliganHoverPreview/);
assert.match(ui,/document\.body\.appendChild\(preview\)/);
assert.match(ui,/mulligan-card-hover-preview/);
assert.match(ui,/position:\s*fixed !important/);
assert.match(ui,/transform:\s*scale\(2\) !important/);
assert.doesNotMatch(ui,/\.mulligan-card-slot:hover\s*\{[^}]*transform:\s*scale\(2/s);

// Real mulligan is centered when it fits, while generic search/selection rows keep start alignment.
assert.match(ui,/overlay\.classList\.add\('mulligan-flow-overlay'\)/);
assert.match(ui,/#mulligan-overlay\.mulligan-flow-overlay \.mulligan-hand-row\s*\{[\s\S]*justify-content:\s*safe center/);
assert.match(ui,/\.mulligan-hand-row\s*\{[\s\S]*justify-content:\s*flex-start/);
assert.match(mobile,/mulligan-flow-overlay \.mulligan-hand-row[\s\S]*justify-content:\s*safe center !important/);

console.log('SELECTION_MODAL_DRAG_HOVER_23_17_5_3_OK drag=card-safe native-drag=off hover=portal mulligan=safe-center rules=23.13.75');
