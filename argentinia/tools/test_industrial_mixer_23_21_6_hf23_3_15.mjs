import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const repo=path.resolve(root,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const readRepo=rel=>fs.readFileSync(path.join(repo,rel),'utf8');
const fail=msg=>{ throw new Error(`HF23.3.15 industrial mixer contract: ${msg}`); };

const ui=read('js/ui.js');
const store=read('js/store.js');
const texts=read('js/gameTexts.js');
const anim=read('js/animationDirector.js');
const economyClient=read('js/economyClient.js');
const impl=read('js/firebaseClientImpl.js');
const publicClient=read('js/firebaseClient.js');
const index=readRepo('functions/src/index.js');
const workshop=readRepo('functions/src/economy/workshop.js');
const mixer=readRepo('functions/src/economy/mixerCore.js');
const audit=readRepo('functions/src/economy/audit.js');
const errors=readRepo('functions/src/shared/errors.js');

for(const token of [
  "export const INDUSTRIAL_MIX_COPIES_CONSUMED = 3",
  "['Common','Uncommon','Rare','Mythic']",
  'export function nextIndustrialMixRarity',
  'export function industrialMixFreeCopies',
  'protectedFloor = Math.max(1',
  'generateIndustrialMixResult'
]) if(!mixer.includes(token)) fail(`missing mixer invariant ${token}`);

for(const token of [
  'export async function mixCardsTx',
  'Math.max(1,protectedByGame)',
  'normalizeReservation',
  'INDUSTRIAL_MIX_COPIES_CONSUMED',
  'enabledTrustedPool(publication)',
  "throw economyError('INDUSTRIAL_MIX_MAX_RARITY')",
  'nextCollection.push(generated.cardId)',
  "kind:'industrialMix'"
]) if(!workshop.includes(token)) fail(`missing server authority token ${token}`);

if(!workshop.includes('workshopMachine3Available, true')) fail('machine3 must be available by default');
if(!workshop.includes('industrialMixerEnabled, true')) fail('mixer must be enabled by default');
for(const token of ['industrialMixerCommonPoints ?? 150','industrialMixerUncommonPoints ?? 400','industrialMixerRarePoints ?? 1000']) if(!workshop.includes(token)) fail(`missing default cost ${token}`);

for(const token of [
  "action === 'mixCards' ? 'industrial-mix'",
  "if (action === 'mixCards')",
  "type:'workshop.mix_cards'",
  'createServerEntropy()',
  'mixCardsTx({db,tx,uid:auth.uid,cardId,seed:entropy.seed,entropyCommitment:entropy.commitment})'
]) if(!index.includes(token)) fail(`missing callable multiplex token ${token}`);

for(const token of ["industrialMix: 'workshop.mix_cards'","industrialMix:'industrial-mix'","runEconomyActionAuthority(uid,'industrialMix'"]) if(!impl.includes(token)) fail(`missing browser exactly-once token ${token}`);
if(!economyClient.includes("action: 'mixCards'")) fail('economyClient mixCards action missing');
if(!publicClient.includes("asyncProxy('mixCards')")) fail('firebaseClient mixCards export missing');

for(const token of [
  'function openMachine3Mixer',
  'clientMixerProtectedCopies',
  'return Math.max(1,maxDeck,enhanced+evolved)',
  'mixCards(state.currentUser.uid,cardId)',
  'mixerCelebration',
  'showMixerSuccessModal',
  "workshop.mixer.successTitle",
  "workshop-mixer-success-card",
  'createCardElement(displayCard,false,true',
  "machine3"
]) if(!ui.includes(token)) fail(`missing Machine 3 UX token ${token}`);

for(const token of [
  "key:'workshop_mixer'",
  "labelGameTextKey:'admin.animations.workshopMixer'",
  "sfxIds:Object.freeze(['libraryShuffle'])",
  'export async function queueWorkshopMixerAnimation',
  "animationTunedDuration(2450,'workshop_mixer'"
]) if(!anim.includes(token)) fail(`missing mixer cinematic token ${token}`);

for(const token of [
  'admin-workshop-mixer-enabled',
  'admin-workshop-mixer-common-points',
  'admin-workshop-mixer-uncommon-points',
  'admin-workshop-mixer-rare-points',
  'industrialMixerCommonEssence',
  'industrialMixerUncommonEssence',
  'industrialMixerRareEssence'
]) if(!ui.includes(token)) fail(`missing Admin > Taller mixer token ${token}`);

if(ui.includes('admin-workshop-mixer-mythic-points')) fail('Mythic must not be accepted as a mixer input tier');
for(const key of [
  'workshop.mixer.title','workshop.mixer.description','workshop.mixer.rule','workshop.mixer.successTitle',
  'admin.animations.workshopMixer','admin.workshop.mixerTitle','admin.workshop.mixerEnabled','admin.stats.store.mixes'
]) if(!texts.includes(`'${key}'`)) fail(`missing Game Text ${key}`);
if(!texts.includes("'LA MEZCLA DIO COMO RESULTADO ESTA CARTA'")) fail('required result modal title missing');

for(const token of ["case 'workshop.mix_cards':","industrialMixes:1","cardsDelta=1-nonneg(result.copiesConsumed||3)"]) if(!audit.includes(token)) fail(`missing audit/stats token ${token}`);
for(const code of ['INDUSTRIAL_MIX_WORKSHOP_LOCKED','INDUSTRIAL_MIX_CARD_INVALID','INDUSTRIAL_MIX_MAX_RARITY','INDUSTRIAL_MIX_COPIES_REQUIRED','INDUSTRIAL_MIX_INSUFFICIENT_FUNDS','INDUSTRIAL_MIX_POOL_EMPTY']) if(!errors.includes(code)) fail(`missing error ${code}`);

for(const token of [
  'industrialMixerEnabled: true',
  'industrialMixerCommonPoints: 150',
  'industrialMixerUncommonPoints: 400',
  'industrialMixerRarePoints: 1000'
]) if(!store.includes(token)) fail(`missing client default ${token}`);

console.log('INDUSTRIAL_MIXER_23_21_6_HF23_3_15_OK machine3=SERVER+IDEMPOTENT copies=3_FREE+KEEP_1 deck=PROTECTED market=RESERVED rarity=CONTIGUOUS_RANDOM mythic=INPUT_BLOCKED costs=ADMIN_EDITABLE cinematic=SFX+TUNABLE modal=REAL_CARD stats=AUDIT');
