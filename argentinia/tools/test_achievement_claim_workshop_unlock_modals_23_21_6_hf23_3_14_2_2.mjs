import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const fail=msg=>{ throw new Error(`HF23.3.14.2.2 contract: ${msg}`); };

const ui=read('js/ui.js');
const texts=read('js/gameTexts.js');

for(const token of [
  'function showAchievementClaimRewardModal',
  'function achievementRewardCardsHtml',
  "modal.className='gy-modal-overlay achievement-claim-success-overlay'",
  'achievement-claim-success-modal',
  'achievement-claim-success-resources',
  'achievement-claim-resource-icon',
  'COIN_ICON_HTML',
  'FICHA_ICON_HTML',
  'ESSENCE_ICON_HTML',
  'showAchievementClaimRewardModal(row); render();'
]) if(!ui.includes(token)) fail(`missing achievement claim modal token ${token}`);

if(ui.includes("showSimpleAlertModal(gameTextHtml('achievements.claim.success'")) fail('achievement success must not use simple text alert');
if(!ui.includes('.achievement-claim-resource :is(.coin-icon,.ficha-icon,.essence-icon)')) fail('achievement claim resources must render real resource images');
if(!ui.includes('.achievement-claim-success-modal{width:min(560px,94vw)')) fail('achievement claim desktop modal styling missing');
if(!ui.includes('.achievement-claim-success-modal{width:min(94vw,460px)')) fail('achievement claim mobile modal styling missing');

// HF23.3.16.2.2 supersedes the intermediate custom confirm: the visible workshop panel is now
// the only confirmation surface, with a spinner on its own DESBLOQUEAR button.
if(ui.includes('await showWorkshopUnlockConfirmModal({machine:machineTitle(machineId),points,fichas})')) fail('workshop unlock must not open a second confirmation modal');
if(ui.includes('window.confirm(confirmText)')) fail('workshop unlock must never use native window.confirm');
for(const token of [
  "panel.querySelector('#workshop-unlock-machine')?.addEventListener('click', async event =>",
  'withEconomyButtonPending(btn, () => unlockWorkshopMachine(state.currentUser.uid, machineId)',
  "pendingLabel:gameText('workshop.unlock.pending')",
  'await queueWorkshopUnlockAnimation({machineElement:machineEl,machineId})',
  'panel.hidden=true;',
  'renderMachines();',
  'renderPanel(machineId);',
  'updateAccountUI(state.currentUser);'
]) if(!ui.includes(token)) fail(`missing single-surface workshop unlock token ${token}`);

for(const key of [
  'achievements.claim.modalTitle',
  'achievements.claim.modalSubtitle',
  'achievements.claim.continue'
]) if(!texts.includes(`'${key}'`)) fail(`missing Game Text ${key}`);

console.log('ACHIEVEMENT_CLAIM_WORKSHOP_UNLOCK_MODALS_23_21_6_HF23_3_14_2_2_OK achievements=STANDARD_GY_MODAL+RESOURCE_IMAGES workshopUnlock=SINGLE_PANEL+SPINNER+FULLSCREEN_SAFE mobile=RESPONSIVE');
