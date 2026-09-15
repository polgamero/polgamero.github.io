import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const ui = read('../js/ui.js');
const texts = read('../js/gameTexts.js');

function slice(src, start, end) {
  const a = src.indexOf(start);
  assert.ok(a >= 0, `missing ${start}`);
  const b = end ? src.indexOf(end, a + start.length) : src.length;
  assert.ok(b > a, `missing ${end}`);
  return src.slice(a,b);
}

const styles = slice(ui, 'function injectMainMenuStyles()', '// Enciclopedia:');
const options = slice(ui, 'export function showOptionsMenu(onBack)', '// Alerta simple de un solo botón');

// Root overlay must never let a centered over-tall panel escape above/below the viewport.
assert.match(styles, /#options-menu-overlay\s*\{[\s\S]*box-sizing:\s*border-box;[\s\S]*padding:\s*clamp\(10px, 2vh, 24px\);[\s\S]*overflow:\s*auto;/);
assert.match(styles, /\.options-menu-panel\s*\{[\s\S]*width:\s*min\(940px, calc\(100vw - 32px\)\);[\s\S]*max-height:\s*calc\(100dvh - 32px\);[\s\S]*overflow-y:\s*auto;[\s\S]*box-sizing:\s*border-box;/);
assert.match(styles, /scrollbar-gutter:\s*stable/);

// Desktop is a true landscape two-column layout; narrow screens collapse safely to one.
assert.match(styles, /\.options-layout-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(styles, /@media \(max-width: 759px\)[\s\S]*\.options-layout-grid\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\)/);
assert.match(styles, /@media \(max-height: 640px\) and \(min-width: 760px\)[\s\S]*max-height:\s*calc\(100dvh - 16px\)/);

// Controls are split into semantic columns without changing their canonical IDs/behaviour.
assert.match(options, /options-layout-grid/);
assert.match(options, /options-column-gameplay/);
assert.match(options, /options-column-audio/);
for (const id of [
  'opt-difficulty','opt-animations-toggle','opt-animation-speed',
  'opt-music-toggle','opt-music-volume','opt-sfx-toggle','opt-sfx-volume','opt-back'
]) {
  assert.ok(options.includes(`id=\"${id}\"`), `missing canonical options control ${id}`);
}
assert.match(options, /\$\{dangerZoneHTML\}[\s\S]*<\/section>/);
assert.match(options, /main-menu-btn options-back-btn/);

for (const key of ['options.gameplay','options.back']) {
  assert.ok(texts.includes(`'${key}'`), `missing Game Text ${key}`);
}

console.log('OPTIONS_RESPONSIVE_TWO_COLUMN_23_21_6_HF14_OK desktop=2col viewport=contained mobile=1col');
