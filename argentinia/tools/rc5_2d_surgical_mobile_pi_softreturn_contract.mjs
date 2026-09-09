import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicTerminologyText } from '../js/publicTerminology.js';
import { buildCardTextLayout } from '../js/cardTextFormatter.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const load=rel=>JSON.parse(read(rel));

const main=read('js/main.js');
const mobile=read('js/mobileUI.js');
const css=read('css/mobile.css');
const html=read('index.html');
const cards=load('assets/data/criaturas.json');
const sirena=cards.find(c=>c.id==='crea_244');

assert.equal(publicTerminologyText('Hexproof / Spellslinger'),'Intocable / Hechizo lanzado');
const layout=buildCardTextLayout(sirena);
assert.ok(layout.keywordLabels.includes('Intocable'));
assert.ok(!layout.paragraphs.some(p=>/Hexproof|Intocable/i.test(String(p.text||''))));
assert.ok(main.includes("spell_cast: 'hechizo lanzado'"));
assert.ok(!/spell_cast:\s*'Spellslinger'/.test(main));

assert.match(main,/btnRestart\.addEventListener\('click', async \(\) => \{[\s\S]*?returnToMainMenuAfterAbandon/);
assert.match(main,/teardownBoardLayout\(\{ clearGameplay: true \}\)/);
assert.match(main,/__ARGENTINIA_SYNC_MOBILE_VIEWPORT__/);
assert.match(mobile,/export function syncMobileViewportMetrics\(\)/);
assert.match(css,/--arg-mobile-live-height/);
assert.match(css,/--arg-mobile-hand-card-h/);
assert.match(css,/--arg-mobile-field-card-h/);

assert.match(html,/id="local-lands"[^>]*style="flex: 8;"/);
assert.match(html,/id="local-support"[^>]*style="flex: 3;"/);
assert.match(html,/id="local-planeswalkers"[^>]*style="flex: 1;"/);
assert.match(html,/id="rival-lands"[^>]*style="flex: 8;"/);
assert.match(html,/id="rival-support"[^>]*style="flex: 3;"/);
assert.match(html,/id="rival-planeswalkers"[^>]*style="flex: 1;"/);

console.log('RC5_2D_SURGICAL_MOBILE_PI_SOFTRETURN_CONTRACT_OK');
