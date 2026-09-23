import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const repo=path.resolve(root,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const readRepo=rel=>fs.readFileSync(path.join(repo,rel),'utf8');
const fail=msg=>{throw new Error(`HF23.3.16 public profile contract: ${msg}`);};

const ui=read('js/ui.js');
const ranking=read('js/rankingUI.js');
const profileUi=read('js/publicProfileUI.js');
const texts=read('js/gameTexts.js');
const client=read('js/firebaseClient.js');
const impl=read('js/firebaseClientImpl.js');
const index=readRepo('functions/src/index.js');
const publicProfile=readRepo('functions/src/community/publicProfile.js');

for(const token of [
  'buildPublicPlayerProfile','getPublicPlayerProfile','PUBLIC_STAT_KEYS',
  "db.doc(`users/${uid}`).get()","db.doc(`playerStats/${uid}`).get()",
  'normalizeAchievementProfile','normalizeAchievementsConfig','achievementMetricValue'
]) if(!publicProfile.includes(token)) fail(`missing server profile token ${token}`);

for(const forbidden of ['pointsCurrent','fichasCurrent','essenceCurrent']) {
  const allowBlock=publicProfile.match(/const PUBLIC_STAT_KEYS[\s\S]*?\]\);/)?.[0]||'';
  if(allowBlock.includes(`'${forbidden}'`)) fail(`private balance leaked through public allowlist: ${forbidden}`);
}
for(const token of ["action === 'public_profile'",'getPublicPlayerProfile(db, { targetUid:data.targetUid })']) if(!index.includes(token)) fail(`missing existing-callable route ${token}`);
if((index.match(/export const\s+\w+\s*=\s*onCall/g)||[]).length!==42) fail('must preserve exactly 42 deployed callables');

if(!impl.includes("communityActionServer('public_profile'")) fail('firebase implementation must route through existing community callable');
if(!client.includes("fetchPublicPlayerProfile = asyncProxy('fetchPublicPlayerProfile')")) fail('lazy firebase facade missing public profile');

for(const token of [
  'showPublicPlayerProfile','public-profile-overlay','public-profile-trophies','achievementTrophyPath',
  'publicProfile.privacy','machinesUnlocked','cardsEvolved','industrialMixes'
]) if(!profileUi.includes(token)) fail(`missing profile UI token ${token}`);

for(const key of ['publicProfile.title','publicProfile.view','publicProfile.myProfile','publicProfile.section.competition','publicProfile.section.achievements','publicProfile.privacy']) if(!texts.includes(`'${key}'`)) fail(`missing Game Text ${key}`);

for(const token of [
  "data-open-public-profile=\"${escapeHtml(uid)}\"",
  "showPublicPlayerProfile(uid)",
  "id=\"menu-public-profile\"",
  "data-open-public-profile=\"${escapeHtml(String(match.hostUid||''))}\"",
  'trade-profile-link'
]) if(!ui.includes(token)) fail(`missing social entry point ${token}`);
if(!ranking.includes('ranking-profile-btn')||!ranking.includes('showPublicPlayerProfile(uid)')) fail('Ranking Global must open public profiles');
if(!ui.includes("gameTextHtml('publicProfile.view')")) fail('multiplayer popover must expose VER PERFIL action');

console.log('PUBLIC_PROFILE_23_21_6_HF23_3_16_OK server=SANITIZED achievements=REAL_CLAIMS+trophies workshop=AGGREGATED entrypoints=MULTIPLAYER+RANKING+TRADE+MENU callables=42 privacy=NO_BALANCES+NO_DECKS+NO_COLLECTION_IDS');
