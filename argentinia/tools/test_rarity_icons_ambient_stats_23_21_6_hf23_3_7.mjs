import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const ui=read('js/ui.js');
const css=read('css/style.css');
const bots=read('../functions/src/community/bots.js');

// Rarity must be a bounded image asset, not the historical colored dot.
for (const [rarity,file] of [['Common','common.png'],['Uncommon','uncommon.png'],['Rare','rare.png'],['Mythic','mythic.png']]) {
  assert.match(ui,new RegExp(`${rarity}:'${file.replace('.png','')}'`));
}
assert.match(ui,/\.\/assets\/images\/ui\/\$\{rarityKey\}\.png/);
assert.doesNotMatch(ui,/class="rarity-icon">●<\/span>/);
assert.match(css,/\.rarity-icon\s*\{[\s\S]*?width:\s*1\.1em;[\s\S]*?height:\s*1\.1em;[\s\S]*?max-width:\s*1\.1em;[\s\S]*?max-height:\s*1\.1em;[\s\S]*?filter:\s*drop-shadow\(0px 0px 3px black\);/);
assert.doesNotMatch(css,/\.card\.Mythic \.rarity-icon\s*\{\s*color:/);

// Ambient public stats must remain mutually coherent and non-identical-looking.
assert.match(bots,/AMBIENT_ECONOMY_MODEL_VERSION\s*=\s*3/);
assert.match(bots,/AMBIENT_STATS_MODEL_VERSION\s*=\s*3/);
assert.match(bots,/ambientHistoricalRecord/);
assert.match(bots,/ambientHistoricalDurationMs/);
assert.match(bots,/ambientGameDurationMs/);
assert.match(bots,/totalDurationMs:durationMs/,'each simulated game must accumulate real-looking duration');
assert.match(bots,/gamesPlayed:historical\.games[\s\S]*?wins:historical\.wins[\s\S]*?losses:historical\.losses/);
assert.match(bots,/games>=2\) wins=Math\.max\(1,Math\.min\(games-1,wins\)\)/,'legacy multi-game profiles cannot remain 0-win/0-loss');
assert.match(bots,/ambientTargetUniqueCards/);
assert.match(bots,/80\+botIndex\*7\+profileVariance/,'ambient collection baselines must vary per profile');
assert.match(bots,/ensureAmbientCollectionDiversity/);
assert.doesNotMatch(bots,/for\(let i=0;i<72;i\+\+\)/,'fixed 72-card discovery fingerprint must be removed');
assert.match(bots,/ambientStatsModelVersion:AMBIENT_STATS_MODEL_VERSION/);

console.log('RARITY_ICONS_AMBIENT_STATS_23_21_6_HF23_3_7_OK rarity=PNG_BOUNDED_1_1EM_SHADOW ambientTime=NONZERO_PER_GAME wins=COHERENT collection=VARIED economy=REBUILT_V3');
