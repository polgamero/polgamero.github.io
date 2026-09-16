import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui = fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');

// HF23 P0 #1: chat rows must never shrink inside the flex column.
assert.match(ui, /\.mp-chat-row\s*\{[^}]*flex:\s*0\s+0\s+auto;[^}]*flex-shrink:\s*0;[^}]*height:\s*auto;/s);
assert.match(ui, /\.mp-chat-list\s*\{[^}]*overflow:\s*auto;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s);

// HF23 P0 #2: coarse/touch pointers must not depend on native title/long-press.
assert.match(ui, /const finePointer = !!globalThis\.matchMedia\?\.\('\(hover:hover\) and \(pointer:fine\)'\)\?\.matches;/);
assert.match(ui, /if \(!finePointer\) node\.removeAttribute\('title'\);/);
assert.match(ui, /node\.addEventListener\('pointerup', event => \{/);
assert.match(ui, /\['touch','pen'\]\.includes\(String\(event\.pointerType \|\| ''\)\)/);
assert.match(ui, /suppressSyntheticClickUntil = Date\.now\(\) \+ 650;/);
assert.match(ui, /node\.style\.touchAction = 'manipulation';/);

console.log('MULTIPLAYER_LOBBY_P0_23_21_6_HF23_OK chatRows=no-shrink touchProfile=pointerup-no-native-title');
