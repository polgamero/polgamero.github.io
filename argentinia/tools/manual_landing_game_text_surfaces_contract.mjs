import fs from 'node:fs';
import assert from 'node:assert/strict';
const gt=fs.readFileSync(new URL('../js/gameTexts.js', import.meta.url),'utf8');
const manual=fs.readFileSync(new URL('../js/manualUI.js', import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../js/ui.js', import.meta.url),'utf8');
for (const key of ['manual.menu.link','manual.header.title','manual.objetivo.body','manual.habilidades.keyword1.name','manual.completo.footer','landing.hero.title1','landing.gallery.screen1.subtitle','landing.footer.contact']) {
  assert.ok(gt.includes(`'${key}': definition(`), `missing game-text definition ${key}`);
}
assert.ok(manual.includes("import { gameText } from './gameTexts.js';"));
assert.ok(manual.includes('applyManualGameTexts(overlay)'));
assert.ok(manual.includes("gameText('manual.media.animatedBadge')"));
assert.ok(ui.includes("gameTextHtml('manual.menu.link')"));
console.log('MANUAL_LANDING_GAME_TEXT_SURFACES_OK');
