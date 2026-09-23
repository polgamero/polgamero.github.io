import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EVOLUTION_PATHS,
  EVOLUTION_CARD_OVERRIDE_FIELDS,
  applyEvolutionStage,
  expectedEvolutionArtEntries,
  isEvolutionStageDiscovered
} from '../js/evolution.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const readJson = rel => JSON.parse(read(rel));
const fail = message => { throw new Error(message); };
const rarityRank = new Map([['Common',0],['Uncommon',1],['Rare',2],['Mythic',3]]);
const mechanicalFields = [
  'keywords','etbEffect','diesTrigger','attackTrigger','combatDamageTrigger','blockTrigger','upkeepTrigger',
  'spellCastTrigger','creatureEtbTrigger','anyCreatureDiesTrigger','opponentDeathTrigger','landEtbTrigger',
  'activatedAbility','activatedAbilities','staticEffect','staticEffects','replacementEffect','requiresTarget'
];
const stable = value => JSON.stringify(value ?? null);
const pngExists = rel => fs.existsSync(path.join(root, rel)) && fs.statSync(path.join(root, rel)).size > 0;

const creatures = readJson('assets/data/criaturas.json');
const byId = new Map(creatures.map(card => [card.id, card]));
if (EVOLUTION_PATHS.length !== 20) fail(`catalog must remain closed at 20 base lines; got ${EVOLUTION_PATHS.length}`);
if (new Set(EVOLUTION_PATHS.map(row => row.baseId)).size !== 20) fail('duplicate evolution base ids');

const requiredOverrideFields = [
  'manaCost','cmc','rarity','power','toughness','keywords','text','etbEffect','diesTrigger','attackTrigger',
  'combatDamageTrigger','blockTrigger','activatedAbility','staticEffect','replacementEffect'
];
for (const field of requiredOverrideFields) if (!EVOLUTION_CARD_OVERRIDE_FIELDS.includes(field)) fail(`evolution schema cannot override ${field}`);

let stageCount = 0;
let mechanicallyExpanded = 0;
for (const row of EVOLUTION_PATHS) {
  const base = byId.get(row.baseId);
  if (!base) fail(`missing canonical base ${row.baseId}`);
  if (!String(base.type || '').includes('Criatura')) fail(`${row.baseId} is not a creature`);
  let previous = base;
  for (const stageNumber of [1,2]) {
    stageCount += 1;
    const spec = row.stages?.[stageNumber];
    if (!spec) fail(`${row.baseId} missing EVO${stageNumber}`);
    const evolved = applyEvolutionStage(base, stageNumber);
    for (const field of ['name','manaCost','cmc','rarity','power','toughness','keywords','text']) {
      if (evolved[field] === undefined || evolved[field] === null || evolved[field] === '') fail(`${row.baseId} EVO${stageNumber} missing ${field}`);
    }
    if (!(Number(evolved.cmc) > Number(previous.cmc))) fail(`${row.baseId} EVO${stageNumber}: CMC must strictly increase (${previous.cmc} -> ${evolved.cmc})`);
    const prevRank = rarityRank.get(previous.rarity);
    const nextRank = rarityRank.get(evolved.rarity);
    if (prevRank === undefined || nextRank === undefined || nextRank !== prevRank + 1) fail(`${row.baseId} EVO${stageNumber}: rarity must rise exactly one tier (${previous.rarity} -> ${evolved.rarity})`);
    if (evolved.keywords?.includes('defender') && Number(evolved.power) !== 0) fail(`${row.baseId} EVO${stageNumber}: defender must have power 0`);
    if (evolved.imageRoot !== 'evolutions') fail(`${row.baseId} EVO${stageNumber}: imageRoot must be evolutions`);
    if (evolved.image !== `${row.baseId}_evo${stageNumber}.png`) fail(`${row.baseId} EVO${stageNumber}: deterministic art filename broken`);
    const hasMechanicalEvolution = mechanicalFields.some(field => stable(evolved[field]) !== stable(previous[field]));
    if (!hasMechanicalEvolution) fail(`${row.baseId} EVO${stageNumber}: evolution changes only numbers/cost; a keyword/trigger/ability change is required`);
    mechanicallyExpanded += 1;
    previous = evolved;
  }
}
if (stageCount !== 40 || mechanicallyExpanded !== 40) fail(`expected 40 mechanically expanded evolution stages; got stages=${stageCount} mechanical=${mechanicallyExpanded}`);

// Regla global del pool físico: Muralla/Defensora nunca puede tener poder de ataque.
const defenderViolations = creatures.filter(card => Array.isArray(card.keywords) && card.keywords.includes('defender') && Number(card.power) !== 0);
if (defenderViolations.length) fail(`physical defender power violations: ${defenderViolations.map(card => `${card.id}:${card.power}`).join(', ')}`);
const trustedCreatures = readJson('../functions/src/trusted/cards/criaturas.json');
const trustedDefenderViolations = trustedCreatures.filter(card => Array.isArray(card.keywords) && card.keywords.includes('defender') && Number(card.power) !== 0);
if (trustedDefenderViolations.length) fail(`trusted defender power violations: ${trustedDefenderViolations.map(card => `${card.id}:${card.power}`).join(', ')}`);

const expectedArt = expectedEvolutionArtEntries();
if (expectedArt.length !== 40) fail(`expected exactly 40 EVO art entries, got ${expectedArt.length}`);
if (new Set(expectedArt.map(row => row.path)).size !== 40) fail('duplicate EVO art paths');
for (const art of expectedArt) {
  if (art.path !== `assets/images/evolutions/${art.baseId}_evo${art.stage}.png`) fail(`bad EVO art path ${art.path}`);
}

// Descubrimiento: EVO2 implica EVO1, pero un perfil vacío no revela ningún arte.
if (isEvolutionStageDiscovered({}, 'crea_001', 1)) fail('empty profile must not reveal EVO1');
if (!isEvolutionStageDiscovered({crea_001:{stage:2}}, 'crea_001', 1)) fail('EVO2 must discover EVO1');
if (!isEvolutionStageDiscovered({crea_001:{stage:2}}, 'crea_001', 2)) fail('EVO2 must reveal EVO2');

const ui = read('js/ui.js');
const loader = read('js/cardLoader.js');
const generator = read('tools/generate_image_manifest.py');
const texts = read('js/gameTexts.js');
if (!ui.includes("./assets/images/ui/evolucionable.png")) fail('evolvable icon is not rendered');
if (!ui.includes('${rarityIconHTML}${evolvableIconHTML}')) fail('evolvable icon must render immediately after rarity icon');
if (!ui.includes('encyclopedia-evolution-buttons') || !ui.includes('showEncyclopediaEvolutionPreview')) fail('encyclopedia EVO buttons/preview missing');
if (!ui.includes('isEvolutionStageDiscovered')) fail('encyclopedia EVO discovery gate missing');
if (!loader.includes('missingEvolutionImages') || !loader.includes('expectedEvolutionArtEntries')) fail('image audit does not inspect EVO art');
if (!generator.includes("'evolutionImages'") && !generator.includes('"evolutionImages"')) fail('image manifest generator lacks evolution inventory');
const evoArtManifest = readJson('assets/images/evolutions/evolution_art_manifest.json');
if (evoArtManifest?.entries?.length !== 40) fail('evolution art contract must expose 40 entries');
if (stable(evoArtManifest.entries.map(row => row.path)) !== stable(expectedArt.map(row => row.path))) fail('evolution_art_manifest.json drifted from evolution.js');
const cardImageManifest = readJson('assets/images/cards/cards-image-manifest.json');
if (cardImageManifest?.evolutionImages?.expectedFileCount !== 40) fail('cards image manifest must expect 40 EVO files');
if (!Array.isArray(cardImageManifest?.evolutionImages?.missingFiles)) fail('cards image manifest must expose dynamic EVO missing files');
for (const key of ['encyclopedia.evolution.stage1','encyclopedia.evolution.stage2','encyclopedia.evolution.locked','admin.images.evolutionsTitle','card.evolvable.icon']) {
  if (!texts.includes(`'${key}'`)) fail(`Game Text missing ${key}`);
}

if (!pngExists('assets/images/ui/evolucionable.png')) fail('official evolucionable.png missing');
for (const tier of ['copper','bronze','silver','gold','diamond']) if (!pngExists(`assets/images/logros/soloWins_${tier}.png`)) fail(`official soloWins_${tier}.png missing`);

console.log(`EVOLUTION_CONTENT_BALANCE_23_21_6_HF23_3_14_1_OK bases=${EVOLUTION_PATHS.length} stages=${stageCount} artExpected=${expectedArt.length} defenderRule=GLOBAL rarity=STRICT_UP mana=STRICT_UP mechanics=40/40`);
