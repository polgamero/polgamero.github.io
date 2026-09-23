import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const repo=path.resolve(root,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const readRepo=rel=>fs.readFileSync(path.join(repo,rel),'utf8');
const fail=msg=>{throw new Error(`HF23.3.16.1 favorite/profile/chest contract: ${msg}`);};

const ui=read('js/ui.js');
const profileUi=read('js/publicProfileUI.js');
const texts=read('js/gameTexts.js');
const client=read('js/firebaseClient.js');
const impl=read('js/firebaseClientImpl.js');
const index=readRepo('functions/src/index.js');
const publicProfile=readRepo('functions/src/community/publicProfile.js');
const favorite=readRepo('functions/src/shared/profileFavorite.js');
const trade=readRepo('functions/src/economy/trade.js');
const workshop=readRepo('functions/src/economy/workshop.js');

for(const token of [
  'favoriteCardIdIfOwned','favoriteCardPatchForCollection','TRUSTED_CARD_IDS',"favoriteCardId:''"
]) if(!favorite.includes(token)) fail(`missing shared favorite helper ${token}`);
for(const token of [
  'favoriteCardId','favoriteCardName','normalizePublicProfileCosmetics','profileCosmetics','schemaVersion:2',
  "db.doc(`users/${uid}`).update({favoriteCardId:''})",'setFavoriteCard','PUBLIC_PROFILE_FAVORITE_NOT_OWNED','cardEnabledByPolicy'
]) if(!publicProfile.includes(token)) fail(`missing server profile token ${token}`);
if(!index.includes("action === 'set_favorite_card'")) fail('existing community callable must route favorite setter');
if(!index.includes('setFavoriteCard(db,{ uid:auth.uid, cardId:data.cardId })')) fail('favorite setter must bind authenticated uid server-side');
if((index.match(/export const\s+\w+\s*=\s*onCall/g)||[]).length!==42) fail('must preserve exactly 42 deployed callables');
if(!trade.includes('favoriteCardPatchForCollection(ownerProfile,swapped.collectionA)')||!trade.includes('favoriteCardPatchForCollection(offererProfile,swapped.collectionB)')) fail('trade acceptance must auto-clear stale favorites for either side');
if(!workshop.includes('favoriteCardPatchForCollection(profile,nextCollection)')) fail('mixer collection mutation must preserve/clear favorite invariant');

for(const token of [
  "setPublicProfileFavoriteCard = asyncProxy('setPublicProfileFavoriteCard')",
  "communityActionServer('set_favorite_card'"
]) if(!(client+impl).includes(token)) fail(`missing client favorite authority ${token}`);

for(const token of [
  'configurePublicProfileUI','public-profile-favorite','public-profile-favorite-card','public-profile-favorite-picker',
  'realOwnedCards','renderRealCard','setPublicProfileFavoriteCard','data-profile-background','data-profile-name-badge','data-profile-frame','data-profile-title'
]) if(!profileUi.includes(token)) fail(`missing favorite/cosmetics UI ${token}`);
if(profileUi.includes('alert(')||profileUi.includes('window.confirm(')||profileUi.includes('confirm(')) fail('favorite profile UX must not use native browser alert/confirm dialogs');
if(!profileUi.includes("cardDb.getById")||!profileUi.includes('host.renderCard')) fail('favorite showcase must render the real card definition');

for(const key of [
  'publicProfile.favorite.title','publicProfile.favorite.choose','publicProfile.favorite.pickerHelp','publicProfile.favorite.clear',
  'publicProfile.cosmetics.future','chest.essence.title','chest.essence.description','chest.essence.action'
]) if(!texts.includes(`'${key}'`)) fail(`missing Game Text ${key}`);

for(const token of [
  'const essence = Number(state.userProfile.essence) || 0;',
  'id="chest-use-essence"','chest.essence.title','chest.essence.description','chest.essence.action',
  'showWorkshopScreen(() => showChestScreen(onBack))',
  'grid-template-columns:repeat(auto-fit,minmax(170px,1fr))'
]) if(!ui.includes(token)) fail(`Mi Cofre Esencia missing ${token}`);
if(!ui.includes('ESSENCE_ICON_HTML')) fail('Mi Cofre Esencia must use official esencia.png icon helper');

const allowBlock=publicProfile.match(/const PUBLIC_STAT_KEYS[\s\S]*?\]\);/)?.[0]||'';
for(const forbidden of ['pointsCurrent','fichasCurrent','essenceCurrent']) if(allowBlock.includes(`'${forbidden}'`)) fail(`private balance leaked through public allowlist: ${forbidden}`);

console.log('PUBLIC_PROFILE_FAVORITE_CHEST_ESSENCE_23_21_6_HF23_3_16_1_OK favorite=OWNED_REAL_CARD+AUTO_CLEAR+FAIL_CLOSED showcase=REAL_RENDER cosmetics=SCHEMA_READY chest=ESSENCE+WORKSHOP_LINK callables=42 privacy=PRESERVED');
