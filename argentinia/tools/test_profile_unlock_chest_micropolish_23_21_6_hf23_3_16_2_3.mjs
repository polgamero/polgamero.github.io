import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const assert=(condition,message)=>{if(!condition) throw new Error(`HF23.3.16.2.3 UX contract: ${message}`);};

const ui=read('js/ui.js');
const profile=read('js/publicProfileUI.js');
const mobile=read('css/mobile.css');

// 1) Unlock lifecycle: server -> hide panel -> cinematic -> unlocked PNG -> reopen same machine panel.
const unlockServer=ui.indexOf("withEconomyButtonPending(btn, () => unlockWorkshopMachine(state.currentUser.uid, machineId)");
const hidePanel=ui.indexOf('panel.hidden=true;',unlockServer);
const cinematic=ui.indexOf('await queueWorkshopUnlockAnimation({machineElement:machineEl,machineId});',unlockServer);
const renderMachines=ui.indexOf('renderMachines();',cinematic);
const reopenPanel=ui.indexOf('renderPanel(machineId);',renderMachines);
assert(unlockServer>=0,'unlock must call server from the pending button');
assert(hidePanel>unlockServer,'unlock detail panel must hide only after server success');
assert(cinematic>hidePanel,'unlock cinematic must run after the panel is hidden');
assert(renderMachines>cinematic,'unlocked machine PNG must render only after the cinematic');
assert(reopenPanel>renderMachines,'same machine panel must reopen after unlocked PNG is visible');

// 2) Rename moves from account badge to own public profile only.
assert(!ui.includes('id="menu-rename"'),'logged account badge must not contain the old rename link');
assert(!ui.includes("container.querySelector('#menu-rename')"),'old account rename handler must be removed');
assert(ui.includes('openRename:onUpdated=>openCurrentUserRename({onUpdated})'),'public profile must receive the existing rename flow from UI host');
assert(profile.includes("openRename:null"),'public profile host must expose optional rename integration');
assert(profile.includes('isOwn?`<button type="button" class="public-profile-rename-btn" data-rename-profile'),'rename pencil must render only for own profile');
assert(profile.includes("overlay.querySelector('[data-rename-profile]')?.addEventListener"),'own-profile pencil must open the rename flow');

// 3) Logged-player badge carries all three currencies, icon + raw number only.
assert(ui.includes('class="main-menu-account-wallet"'),'account wallet row missing');
for(const token of ['${COIN_ICON_HTML}<strong>','${FICHA_ICON_HTML}<strong>','${ESSENCE_ICON_HTML}<strong>']) assert(ui.includes(token),`account badge missing currency token ${token}`);
assert(!ui.includes('class="main-menu-account-points"'),'legacy points-only account row must be removed');
assert(ui.includes('.main-menu-account-wallet .coin-icon, .main-menu-account-wallet .ficha-icon, .main-menu-account-wallet .essence-icon { width:20px; height:20px; }'),'account wallet icons must remain compact/equal');

// 4) Mi Cofre: points/fichas/essence/mythic use the larger Essence-sized icon box on mobile; Mythic uses official rarity PNG.
assert(ui.includes('const MYTHIC_ICON_HTML = `<img class="mythic-icon" src="./assets/images/ui/mythic.png"'),'Mi Cofre Mythic must use official mythic.png');
assert(ui.includes('<div class="chest-item-icon">${MYTHIC_ICON_HTML}</div>'),'guaranteed Mythic card must render the official icon');
assert(ui.includes('.chest-item .coin-icon, .chest-item .ficha-icon, .chest-item .essence-icon, .chest-item .mythic-icon { width:68px; height:68px; object-fit:contain; }'),'desktop chest resource/mythic icons must share size');
for(const token of [
  'html.argentinia-mobile .chest-item .coin-icon,',
  'html.argentinia-mobile .chest-item .ficha-icon,',
  'html.argentinia-mobile .chest-item .essence-icon,',
  'html.argentinia-mobile .chest-item .mythic-icon { width: 68px !important; height: 68px !important; object-fit: contain; }'
]) assert(mobile.includes(token),`mobile chest icon parity missing ${token}`);
assert(!mobile.includes('.ficha-icon { width: 42px !important; height: 42px !important; }'),'old 42px mobile coin/ficha shrink must be gone');

console.log('PROFILE_UNLOCK_CHEST_MICROPOLISH_23_21_6_HF23_3_16_2_3_OK unlock=SERVER_HIDE_CINEMATIC_RENDER_REOPEN rename=OWN_PROFILE_ONLY account=3_CURRENCIES chest=68PX+MYTHIC_PNG');
