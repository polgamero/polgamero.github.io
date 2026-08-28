import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const fnStart = src.indexOf('export function createCardElement(');
assert.ok(fnStart >= 0, 'createCardElement must exist');
const section = src.slice(fnStart, src.indexOf('\nexport function ', fnStart + 10) > 0 ? src.indexOf('\nexport function ', fnStart + 10) : undefined);

const decl = section.indexOf('const hasCreatureStats = isCreaturePermanent(itemObj);');
const basicLandBranch = section.indexOf('if (isBasicLand && landSymbolImg)');
const firstOutsideUse = section.indexOf('const effPower = hasCreatureStats ?');
assert.ok(decl >= 0, 'hasCreatureStats declaration missing');
assert.ok(basicLandBranch >= 0, 'basic land render branch missing');
assert.ok(firstOutsideUse >= 0, 'P/T use of hasCreatureStats missing');
assert.ok(decl < basicLandBranch, 'hasCreatureStats must be declared before the basic-land/text branch');
assert.ok(decl < firstOutsideUse, 'hasCreatureStats must be in scope for P/T rendering');
assert.equal((section.match(/const hasCreatureStats\s*=/g) || []).length, 1, 'hasCreatureStats must have one canonical declaration');

console.log('PASS test_ui_card_renderer_scope_23_15_3_1');
