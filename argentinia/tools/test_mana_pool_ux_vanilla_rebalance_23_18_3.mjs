import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const html = read('index.html');
const css = read('css/style.css');
const mobile = read('css/mobile.css');
const ui = read('js/ui.js');
const main = read('js/main.js');
const texts = read('js/gameTexts.js');
const version = read('js/version.js');
const manifest = JSON.parse(read('build-manifest.json'));
const creatures = JSON.parse(read('assets/data/criaturas.json'));

assert.ok((version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.4.1'")), 'engine 23.19');
assert.equal(manifest.engineVersion, '23.19.4.1');
assert.equal(manifest.pool, 880);
assert.equal(manifest.firestoreRulesVersion, '23.13.78');

// Mana pool: independent docks outside the player-name row, no cemetery/exile relocation.
assert.match(html, /player-card rival-card[\s\S]{0,220}id="rival-mana-pool" class="mana-pool-hud mana-pool-dock mana-pool-dock-rival mana-pool-empty"/);
assert.match(html, /player-card local-card[\s\S]{0,260}id="local-mana-pool" class="mana-pool-hud mana-pool-dock mana-pool-dock-local mana-pool-empty"/);
assert.ok(html.includes('id="local-mana-pool-hint"'), 'local education hint exists');
assert.ok(css.includes('right:calc(100% + 10px);'), 'desktop pool floats to the left of the player card');
assert.ok(css.includes('.mana-pool-hud.mana-pool-empty { display:none; }'), 'empty pool has no visible container');
assert.ok(css.includes('.mana-pool-dock-rival') && css.includes('flex-wrap:nowrap'), 'rival pool stays horizontally compressed');
assert.ok(css.includes('.mana-pool-education-hint'), 'visible educational callout style');
assert.ok(mobile.includes('right:calc(100% + 4px) !important;'), 'mobile pool also floats left without moving zones');
assert.ok(!/CEMENTERIO[\s\S]{0,800}local-mana-pool/.test(html), 'local mana pool not inserted into cemetery/exile zone');

// Tutorial only on transition empty -> non-empty, outside payment, max once/turn.
assert.ok(ui.includes('lastRenderedLocalManaPoolTotal <= 0'), 'tutorial triggers on pool appearance');
assert.ok(ui.includes('lastManaPoolEducationTurn !== state.turnCount'), 'tutorial capped once per turn');
assert.ok(ui.includes("gameText('mana.pool.educationHint')"), 'tutorial copy comes from Game Texts');
assert.ok(texts.includes("'mana.pool.educationHint'"));
assert.ok(texts.includes('Tu maná fue agregado al pool'));

// Bitácora is explicit that mana went to the pool and still reports pool clearing.
assert.ok(main.includes("gameText(isLocal ? 'mana.added.local' : 'mana.added.rival'"), 'mana addition log is side-aware and explicit');
assert.ok(texts.includes("'mana.added.local'") && texts.includes('a tu pool de maná'));
assert.ok(texts.includes("'mana.added.rival'") && texts.includes('al pool de maná rival'));
assert.ok(texts.includes("'mana.pool.emptied'"), 'pool empty log preserved');

// Vanilla audit: mechanically vanilla MV>=2 must be zero. One pedagogical MV1 vanilla is retained.
const mechanicKeys = new Set([
  'etbEffect','triggers','attackTrigger','activatedAbility','diesTrigger','combatDamageTrigger','staticEffect',
  'landEtbTrigger','dfc','spellCastTrigger','suspend','blockTrigger','anyCreatureDiesTrigger','escape',
  'opponentDeathTrigger','kicker','manaAbility','requiresTarget','creatureEtbTrigger','upkeepTrigger',
  'replacementEffect','staticEffects','landManaTrigger','delve','convoke','affinity','legendary'
]);
const isMechanicallyVanilla = c => !(c.keywords?.length) && !Object.keys(c).some(k => mechanicKeys.has(k));
const bad = creatures.filter(c => Number(c.cmc) >= 2 && isMechanicallyVanilla(c));
assert.deepEqual(bad.map(c => c.id), [], `no vanilla MV>=2; found ${bad.map(c=>c.id).join(',')}`);
const allVanilla = creatures.filter(isMechanicallyVanilla);
assert.deepEqual(allVanilla.map(c => c.id), ['crea_001'], 'only El Firulais remains true vanilla');

const expectedUpgrades = {
  crea_004:'vigilance', crea_006:'menace', crea_094:'menace', crea_099:'haste', crea_103:'firststrike',
  crea_104:'trample', crea_110:'vigilance', crea_111:'vigilance', crea_113:'trample', crea_132:'ward_1',
  crea_134:'reach', crea_187:'menace', crea_193:'reach', crea_194:'trample', crea_214:'haste', crea_220:'vigilance'
};
for (const [id, keyword] of Object.entries(expectedUpgrades)) {
  const c = creatures.find(x => x.id === id);
  assert.ok(c?.keywords?.includes(keyword), `${id} gains ${keyword}`);
  assert.ok(String(c.text || '').trim(), `${id} has visible rules text`);
}
const chipa = creatures.find(c => c.id === 'crea_009');
assert.deepEqual(chipa?.etbEffect, { type:'heal', amount:1 }, 'Vendedora de Chipá gets low-impact flavorful ETB');
assert.match(chipa?.text || '', /ganás 1 Punto de Vida/);

console.log(`MANA_POOL_UX_VANILLA_REBALANCE_23_18_3_OK pool=880 vanillaMV2plus=${bad.length} trueVanilla=${allVanilla.length} upgraded=17 rules=23.13.78`);
