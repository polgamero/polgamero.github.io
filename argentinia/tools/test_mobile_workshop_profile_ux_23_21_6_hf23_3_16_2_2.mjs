import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const assert=(condition,message)=>{if(!condition) throw new Error(`HF23.3.16.2.2 UX contract: ${message}`);};

const ui=read('js/ui.js');
const profile=read('js/publicProfileUI.js');
const animations=read('js/animationDirector.js');
const texts=read('js/gameTexts.js');

// 1) Mis Logros mobile wallet: all three resources use the same icon+number grammar and aligned pills.
assert(ui.includes("<span>${ESSENCE_ICON_HTML} ${e}</span>"),'Achievements Essence pill must show icon + number only');
assert(!ui.includes("ESSENCE_ICON_HTML} ${escapeHtml(gameText('workshop.wallet.essence',{essence:e}))}"),'Achievements Essence pill must not append the word Esencia');
assert(ui.includes('grid-template-columns:repeat(3,max-content)'),'mobile achievement wallet needs three aligned resource columns');
assert(ui.includes('.achievements-wallet>span{height:38px;box-sizing:border-box;justify-content:center;white-space:nowrap}'),'mobile achievement pills need equal height/alignment');

// 2) Machine 2/3 mobile surfaces must be bounded and internally scrollable; action labels must be semantic.
assert(ui.includes("panel.classList.add('workshop-panel--machine-detail')"),'machine detail mode class missing');
assert(ui.includes('@media(max-width:850px){.workshop-panel.workshop-panel--machine-detail'),'machine 2/3 responsive breakpoint must cover landscape mobile widths');
assert(ui.includes('max-height:calc(100dvh - 76px);overflow-y:auto;overscroll-behavior:contain'),'machine 2/3 mobile internal scroll contract missing');
assert(texts.includes("'workshop.machine2.action': definition('Taller', 'EVOLUCIONAR CARTA'"),'Machine 2 action copy incorrect');
assert(texts.includes("'workshop.machine3.action': definition('Taller', 'MEZCLAR CARTAS'"),'Machine 3 action copy incorrect');
assert(ui.includes("if(id==='machine2') return gameText('workshop.machine2.action')") && ui.includes("if(id==='machine3') return gameText('workshop.machine3.action')"),'machine action copy routing missing');

// 3) Unlock is one surface: pending spinner, server action, one shared tuned cinematic+SFX, PNG only rendered afterwards.
assert(!ui.includes('await showWorkshopUnlockConfirmModal({machine:machineTitle(machineId),points,fichas})'),'unlock still opens a second modal');
assert(ui.includes('withEconomyButtonPending(btn, () => unlockWorkshopMachine(state.currentUser.uid, machineId)'),'unlock button must own spinner/pending state');
{ const cinematic=ui.indexOf('await queueWorkshopUnlockAnimation({machineElement:machineEl,machineId});'); const render=ui.indexOf('renderMachines();',cinematic); assert(cinematic>=0 && render>cinematic,'machine PNG must render only after unlock cinematic'); }
for(const token of [
  "key:'workshop_unlock'",
  "labelGameTextKey:'admin.animations.workshopUnlock'",
  "sfxIds:Object.freeze(['permanentEntered'])",
  'export async function queueWorkshopUnlockAnimation',
  "animationTunedDuration(2050,'workshop_unlock'",
  "playAnimationSfx('permanentEntered','workshop_unlock','key')"
]) assert(animations.includes(token),`missing unlock cinematic token ${token}`);
assert(texts.includes("'admin.animations.workshopUnlock'"),'unlock cinematic must be configurable in Admin > Animaciones');

// 4) Favorite picker mobile: controls above, two columns, only left list scrolls, modal itself never scrolls vertically.
assert(profile.includes('class="public-profile-favorite-list-pane"'),'favorite picker left pane missing');
assert(profile.includes('height:min(96dvh,610px);max-height:calc(100dvh - 12px);overflow:hidden'),'favorite mobile panel must be viewport bounded without global vertical scroll');
assert(profile.includes('.public-profile-favorite-modal-actions{order:2;display:grid'),'favorite mobile actions must stay above picker');
assert(profile.includes('grid-template-columns:minmax(0,55%) minmax(0,45%)'),'favorite picker must remain left-list/right-preview on mobile');
assert(profile.includes('.public-profile-favorite-list{min-height:0;height:100%;flex:1;font-size:12px;padding:4px;overflow-y:auto}'),'only favorite list should vertically scroll');
assert(profile.includes('.public-profile-favorite-preview{min-height:0;height:100%;align-self:stretch;overflow:hidden}'),'favorite preview must remain same-height and non-scrolling');

console.log('MOBILE_WORKSHOP_PROFILE_UX_23_21_6_HF23_3_16_2_2_OK achievements=WALLET_ALIGNED machines=MOBILE_SCROLL+SEMANTIC_ACTIONS unlock=SINGLE_PANEL+SPINNER+CINEMATIC favorite=TWO_COLUMN_NO_GLOBAL_VSCROLL');
