import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { CURRENT_POOL_MILESTONE, POOL_BASELINE } from '../js/poolContract.js';
import {
  TEXT_LAYOUT_SCHEMA_VERSION, TEXT_LAYOUT_DOCUMENT_ID, TEXT_LAYOUT_DEFAULT, TEXT_LAYOUT_LIMITS,
  normalizeCardTextLayout, isDefaultCardTextLayout, buildCardTextLayoutsDocument
} from '../js/textLayout.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

assert.ok(['23.15.10','23.16.1','23.16.1.1','23.16.2','23.16.2.1','23.16.3','23.16.3.1','23.16.4','23.16.4.1','23.16.5','23.16.5.1','23.16.5.2','23.17.1','23.17.2','23.17.3','23.18.3','23.19','23.19.2','23.19.5.5'].includes(ENGINE_VERSION),'Card Text Layout contract must survive later engine-only releases');
assert.ok(['mp-23.10.0','mp-23.19.0','mp-23.19.2'].includes(ENGINE_PROTOCOL_VERSION));
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.ok(['pool_expansion_iii_730','pool_expansion_iv_760','pool_expansion_v_790','pool_expansion_vi_820','pool_expansion_vii_850','pool_expansion_viii_880'].includes(CURRENT_POOL_MILESTONE));
assert.ok(POOL_BASELINE.total>=730);
assert.equal(TEXT_LAYOUT_SCHEMA_VERSION,1);
assert.equal(TEXT_LAYOUT_DOCUMENT_ID,'textLayouts');
assert.deepEqual(normalizeCardTextLayout(null),TEXT_LAYOUT_DEFAULT);
assert.ok(isDefaultCardTextLayout(TEXT_LAYOUT_DEFAULT));

const normalized=normalizeCardTextLayout({fontScale:99,lineHeightScale:0,flavorScale:99,flavorGapScale:-2,boxHeight:100});
assert.equal(normalized.fontScale,TEXT_LAYOUT_LIMITS.maxFontScale);
assert.equal(normalized.lineHeightScale,TEXT_LAYOUT_LIMITS.minLineHeightScale);
assert.equal(normalized.flavorScale,TEXT_LAYOUT_LIMITS.maxFlavorScale);
assert.equal(normalized.flavorGapScale,TEXT_LAYOUT_LIMITS.minFlavorGapScale);
assert.equal(normalized.boxHeight,TEXT_LAYOUT_LIMITS.maxBoxHeight);
assert.ok(!isDefaultCardTextLayout(normalized));

const doc=buildCardTextLayoutsDocument({
  crea_001:{...TEXT_LAYOUT_DEFAULT,fontScale:1.1},
  default_card:{...TEXT_LAYOUT_DEFAULT},
  'bad id!':{...TEXT_LAYOUT_DEFAULT,fontScale:1.2}
});
assert.equal(doc.schemaVersion,1);
assert.equal(doc.layouts.crea_001.fontScale,1.1);
assert.equal(doc.layouts.default_card,undefined);
assert.equal(doc.layouts['bad id!'],undefined);

const ui=read('js/ui.js');
for(const marker of [
  "registerCardTextBox", "openCardTextLayoutEditor", "hasCustomCardTextLayout",
  "encyclopedia-text-edit-btn", "if (isAdminUser())", "textBox.appendChild(editTextBtn)",
  "card-text-box-stat-reserve", "const encyclopediaMinZoom = 16", "min=\"${encyclopediaMinZoom}\"",
  "clamp(3px, var(--card-text-effective-size), 26px)"
]) assert.ok(ui.includes(marker),`ui missing ${marker}`);

const css=read('css/style.css');
for(const marker of [
  "height: var(--card-text-box-height, 42cqh)",
  "--card-text-line-height", "--card-flavor-gap", "--card-flavor-font-size",
  ".card-text-box-stat-reserve .card-flavor-text", "padding-right: 27cqw"
]) assert.ok(css.includes(marker),`style missing ${marker}`);

const editor=read('js/textLayoutEditor.js');
for(const marker of [
  'Tamaño general de letra','Altura del recuadro de texto','Interlineado','Tamaño del flavor','Separación antes del flavor',
  'El contenido no se edita acá.','saveCardTextLayout(','Reset automático'
]) assert.ok(editor.includes(marker),`editor missing ${marker}`);
assert.ok(!editor.includes('<textarea'), 'editor must not edit content');
assert.ok(!editor.includes('type="text"'), 'editor must expose only layout controls');

const layout=read('js/textLayout.js');
for(const marker of [
  "TEXT_LAYOUT_DOCUMENT_ID = 'textLayouts'", "TEXT_LAYOUT_CACHE_KEY = 'argentinia.textLayouts.v1'",
  'loadPublicGameConfigDocument(TEXT_LAYOUT_DOCUMENT_ID)', 'saveAdminGameConfigDocument(TEXT_LAYOUT_DOCUMENT_ID',
  'applyAllCardTextLayoutsToVisibleBoxes()', 'registerCardTextBox'
]) assert.ok(layout.includes(marker),`textLayout missing ${marker}`);

const workflow=read('../.github/workflows/pages.yml');
assert.ok(workflow.includes('regression_legacy_23_17_3_1.zip'),'Pages must retain Text Layout as historical regression');
assert.ok(fs.readFileSync(path.join(root,'tools','ci_regression_manifest_23_17_3_1.txt'),'utf8').includes('test_card_text_layout_editor_23_15_10.mjs'),'Text Layout must remain in historical regression manifest');

console.log('PASS test_card_text_layout_editor_23_15_10.mjs · Admin per-card text layout + flavor guard + encyclopedia zoom floor OK · Pool 730');
