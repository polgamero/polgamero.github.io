import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ENGINE_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';

const ui = fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../build-manifest.json', import.meta.url), 'utf8'));

assert.equal(ENGINE_VERSION, '23.18.1');
assert.equal(FIRESTORE_RULES_VERSION, '23.13.75');
assert.equal(manifest.engineVersion, ENGINE_VERSION);
assert.equal(manifest.firestoreRulesVersion, FIRESTORE_RULES_VERSION);

// RCA: 23.17.4 usaba DIVs clickeables. enableDesktopDragScroll no los consideraba
// interactivos, tomaba pointer capture en pointerdown y el click no llegaba a los slots.
assert.ok(ui.includes("const interactive = 'button, a, input, select, textarea, .card, [role=\"button\"], [contenteditable=\"true\"]';"),
  'Drag-scroll dejó de excluir buttons reales.');
assert.ok(ui.includes('<button type="button" class="mydecks-slot mydecks-slot-filled" data-deck-id="${deck.id}">'),
  'Los mazos guardados no son buttons reales.');
assert.ok(ui.includes('<button type="button" class="mydecks-slot mydecks-slot-empty">+ Crear mazo</button>'),
  'Crear mazo no es un button real.');
assert.ok(!ui.includes('<div class="mydecks-slot mydecks-slot-filled"'),
  'Persisten DIVs clickeables que pueden ser capturados por drag-scroll.');
assert.ok(!ui.includes('<div class="mydecks-slot mydecks-slot-empty"'),
  'Persisten slots vacíos DIV clickeables.');
assert.ok(ui.includes("body.querySelectorAll('.mydecks-slot-filled').forEach(el => {"));
assert.ok(ui.includes("body.querySelectorAll('.mydecks-slot-empty').forEach(el => {"));
assert.ok(ui.includes('appearance:none; -webkit-appearance:none; width:100%; font:inherit; color:inherit;'),
  'Los buttons de Mis Mazos no resetean estilo nativo.');

console.log('MYDECKS_CLICK_HOTFIX_23_17_4_1_OK slots=buttons dragCapture=excluded open=click create=click keyboard=native rules=23.13.75');
