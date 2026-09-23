import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const fail=msg=>{ throw new Error(`HF23.3.14.2 contract: ${msg}`); };

const animations=read('js/animationDirector.js');
const ui=read('js/ui.js');
const texts=read('js/gameTexts.js');

for(const token of [
  "key:'workshop_evolution'",
  "labelGameTextKey:'admin.animations.workshopEvolution'",
  "sfxIds:Object.freeze(['permanentTransformed'])",
  'export async function queueWorkshopEvolutionAnimation',
  "animationTunedDuration(2300,'workshop_evolution'",
  "playAnimationSfx('permanentTransformed','workshop_evolution','start')",
  "playAnimationSfx('permanentTransformed','workshop_evolution','key')"
]) if(!animations.includes(token)) fail(`missing evolution cinematic token ${token}`);

for(const token of [
  'queueWorkshopEvolutionAnimation',
  'function showEvolutionSuccessModal',
  'applyEvolutionStage(baseCard,resolvedStage)',
  "showWorkshopScreen(onBack,{ evolutionCelebration:{cardId,stage:nextStage} })",
  "[data-machine-id=\"machine2\"] .workshop-machine-img",
  'await queueWorkshopEvolutionAnimation({ machineElement:machineEl })',
  'showEvolutionSuccessModal(options.evolutionCelebration)',
  "gameTextHtml('workshop.evolution.successTitle')",
  "gameTextHtml('workshop.evolution.successStage'",
  "createCardElement(displayCard,false,true,null,'preview',null)"
]) if(!ui.includes(token)) fail(`missing evolution UX token ${token}`);

for(const key of [
  'workshop.evolution.successTitle',
  'workshop.evolution.successStage',
  'workshop.evolution.successReminder',
  'workshop.evolution.continue',
  'admin.animations.workshopEvolution'
]) if(!texts.includes(`'${key}'`)) fail(`missing Game Text ${key}`);

if(!ui.includes('.achievement-trophy-media{display:inline-flex;width:158px;height:158px')) fail('desktop trophies must be 158x158');
if(!ui.includes('.achievement-trophy-media{width:108px;height:108px}')) fail('mobile trophies must use dedicated 108x108 size');
if(!ui.includes('.achievement-level{min-width:174px;min-height:236px')) fail('mobile achievement cards must be resized for larger trophy');
if(!ui.includes('min-height:286px')) fail('desktop achievement cards must be resized for 158px trophy');

console.log('WORKSHOP_EVOLUTION_CINEMATIC_TROPHIES_23_21_6_HF23_3_14_2_OK cinematic=MACHINE2+SFX_TRANSFORM admin=TUNABLE modal=REAL_EVO_CARD trophies=158_DESKTOP+108_MOBILE');
