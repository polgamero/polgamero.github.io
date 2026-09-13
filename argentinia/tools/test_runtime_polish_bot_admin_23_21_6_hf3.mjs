import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installHeadlessDom } from './headless_dom_stub_23_18_1.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const ui=fs.readFileSync(path.join(root,'js','ui.js'),'utf8');
const css=fs.readFileSync(path.join(root,'css','style.css'),'utf8');
const mobileCss=fs.readFileSync(path.join(root,'css','mobile.css'),'utf8');
const bot=fs.readFileSync(path.join(root,'js','bot.js'),'utf8');

// Daily Reward: compound rewards stay horizontal and the 3 action buttons share geometry.
assert.match(ui,/\.daily-login-reward \.daily-reward-icons \{[^}]*max-width:none;[^}]*flex-wrap:nowrap;/s);
assert.match(ui,/\.daily-login-actions \.reward-action-btn,[\s\S]*?\.daily-login-actions \.reward-secondary-btn \{[\s\S]*?margin-top:0;[\s\S]*?min-height:46px;/);
assert.match(mobileCss,/\.daily-login-reward \.daily-reward-icons \{ max-width:none !important;[\s\S]*?flex-wrap:nowrap !important;/);
assert.match(mobileCss,/\.daily-login-actions \.reward-action-btn,[\s\S]*?min-height:34px !important;/);

// Desktop long rows: horizontal clipping may not eat the grouped permanent counter.
assert.match(css,/\.field-row\.desktop-overflow-scroll \.stack-counter-container \{ top: 3px; z-index: 500; \}/);

// Admin publication workflow: only Admin receives the unpublished filter and filtering is real.
assert.match(ui,/isAdminUser\(\) \? `<label class="encyclopedia-filter-option encyclopedia-admin-publication-filter">[\s\S]*?id="enc-unpublished-only"[\s\S]*?encyclopedia\.filter\.unpublished/);
assert.match(ui,/\(!unpublishedOnly \|\| card\.enabled === false\)/);
assert.match(ui,/querySelector\('#enc-unpublished-only'\)\?\.addEventListener\('change'/);

// Combat regression: the production incident is a 5\/4 vehicle trading into a 2\/2 Letal blocker.
// predictDuel must report mutual death and the basic/Medium bot must reject trading DOWN.
installHeadlessDom();
const keywords=await import(pathToFileURL(path.join(root,'js','keywords.js')).href+`?hf3_keywords=${Date.now()}`);
const combat=await import(pathToFileURL(path.join(root,'js','combatBot2.js')).href+`?hf3_combat=${Date.now()}`);
const vehicle={card:{id:'art_vehicle',name:'Vehículo 5/4',type:'Artefacto — Vehículo',cmc:4,rarity:'Rare',power:5,toughness:4,keywords:[]},damageTaken:0};
const widow={card:{id:'crea_letal',name:'Bloqueadora Letal',type:'Criatura',cmc:2,rarity:'Common',power:2,toughness:2,keywords:['deathtouch']},damageTaken:0};
const duel=keywords.predictDuel(vehicle,widow);
assert.deepEqual(duel,{attackerDies:true,blockerDies:true},'Letal blocker must kill the attacking vehicle while dying itself');
const helpers={getPower:u=>Number(u.card.power)||0,getToughness:u=>Number(u.card.toughness)||0,hasKeyword:(u,k)=>(u.card.keywords||[]).includes(k)};
const vehicleValue=combat.combatUnitValue(vehicle,helpers);
const widowValue=combat.combatUnitValue(widow,helpers);
assert.ok(vehicleValue>widowValue,'5/4 Rare vehicle is more valuable than the 2/2 Letal blocker in trade evaluation');
assert.match(bot,/const opponentHasPunishingBlock = dueledBlockers\.some/);
assert.match(bot,/if \(!duel\.blockerDies\) return true;[\s\S]*?return blockerValue <= attackerValue;/);
assert.match(bot,/if \(opponentHasPunishingBlock\) return false;/);

console.log(`RUNTIME_POLISH_BOT_ADMIN_23_21_6_HF3_OK daily=aligned scrollBadges=visible unpublished=adminOnly lethalTrade=blocked values=${vehicleValue.toFixed(2)}>${widowValue.toFixed(2)}`);
