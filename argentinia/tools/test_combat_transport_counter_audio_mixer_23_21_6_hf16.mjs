import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const json=rel=>JSON.parse(read(rel));

// 1) Confirmar bloqueos debe consumir la selección visual transitoria (también vía Space).
const combat=read('js/combatRules.js');
const blockFn=combat.slice(combat.indexOf('export async function executeRivalAttack()'),combat.indexOf('// --- GOLPE PRIMERO'));
assert.match(blockFn,/state\.localBlockersDeclaredThisCombat = true;[\s\S]{0,420}?state\.pendingBlockerIndex = null;/);
assert.match(blockFn,/menaceViolations\.length[\s\S]{0,260}?state\.pendingBlockerIndex = null;/);

// 2) En filas desktop con scroll no puede convivir el viejo scale 2.8x con el portal externo.
const css=read('css/style.css');
const ui=read('js/ui.js');
assert.match(css,/\.field-row\.desktop-overflow-scroll \.card:not\(\.tapped\):hover\s*\{\s*transform: none !important;/);
assert.match(css,/\.field-row\.desktop-overflow-scroll \.card\.tapped:hover \.card-inner\s*\{\s*transform: rotate\(90deg\) !important;/);
assert.match(ui,/verticalSourceWidth \* 2\.65/);
assert.match(ui,/maxWByHeight/);
assert.match(ui,/window\.visualViewport\?\.height/);

// 3) Odómetro/Batería: self-target de contador en Support debe conservar targetKind al resolver.
for(const rel of ['assets/data/artefactos.json','../functions/src/trusted/cards/artefactos.json']){
  const cards=json(rel);
  for(const id of ['art_068','art_070']){
    const card=cards.find(c=>c.id===id);
    assert.ok(card,`${rel}: falta ${id}`);
    const upkeep=card.triggers?.find(t=>t.event==='upkeep_started');
    assert.equal(upkeep?.target,'self');
    assert.equal(upkeep?.effect?.type,'add_counter');
    assert.equal(upkeep?.effect?.targetKind,'support');
    assert.equal(upkeep?.effect?.targetController,'self');
  }
}

// 4) Crew: no más Main1/Main2 oportunista; usa planner ataque/bloqueo y Telemetry detecta desperdicio.
const bot=read('js/bot.js');
const crewFn=bot.slice(bot.indexOf('function tryBotCrewVehicle'),bot.indexOf('// Punto 12: mismo contrato de timing'));
assert.match(bot,/chooseHardAttackPlan, chooseHardBlockPlan/);
assert.match(crewFn,/state\.phase==='combat_begin'/);
assert.match(crewFn,/state\.phase==='combat_attackers'/);
assert.doesNotMatch(crewFn,/\['main1','main2','combat_begin'\]/);
assert.match(bot,/function chooseStrategicBotCrewSet/);
assert.match(bot,/plan\.indexes\.includes\(virtualIndex\)/);
assert.match(bot,/plan\.assignment\?\.\[virtualBlockerPos\]/);
assert.match(bot,/BOT_CREW_WASTE/);
assert.match(bot,/bot_crew_plan/);
assert.match(bot,/enteredThisTurn && !hasKeyword\(vehicleItem,'haste'\)/);

// 5) Counter resources: el bot debe poder gastar Kilómetros cuando es una línea de valor segura.
assert.match(bot,/else if \(effect\.type === 'remove_counter'\)/);
assert.match(bot,/getCounterCount\(target\.item,counterType\)>=amount/);
assert.match(bot,/state\.activePlayer==='rival' && state\.phase==='main2'/);
assert.match(bot,/state\.activePlayer==='local' && state\.phase==='end_step'/);
assert.match(bot,/bot_counter_resource_plan/);

// 6) Mixer rápido: ya no hay botón suelto del menú; el control junto a REC abre dos sliders reales.
const telemetry=read('js/telemetry.js');
const audio=read('js/audioManager.js');
assert.doesNotMatch(ui,/id="menu-music-toggle"/);
assert.match(telemetry,/panel\.append\(recToggle, gameplayMusicToggleEl,/);
assert.match(telemetry,/\['menu','solo','multiplayer'\]\.includes\(audio\.desiredScene\)/);
assert.match(telemetry,/id="arg-quick-music-volume"/);
assert.match(telemetry,/id="arg-quick-sfx-volume"/);
assert.match(telemetry,/gameText\('options\.music'\)/);
assert.match(telemetry,/gameText\('options\.effects'\)/);
assert.match(telemetry,/setQuickMusicLevel\(Number\(music\.value\) \/ 100\)/);
assert.match(telemetry,/setQuickSfxLevel\(Number\(sfx\.value\) \/ 100\)/);
assert.match(audio,/export function setQuickMusicLevel/);
assert.match(audio,/musicEnabled:next > 0/);
assert.match(audio,/export function setQuickSfxLevel/);
assert.match(audio,/sfxEnabled:next > 0/);
assert.match(css,/\.arg-quick-audio-mixer/);

console.log('COMBAT_TRANSPORT_COUNTER_AUDIO_MIXER_23_21_6_HF16_OK');
