import { fetchTutorialAnnouncements,isAnnouncementDismissed,dismissAnnouncement,claimTutorialPresentation } from './firebaseClient.js';
import {sessionInputBlocked} from './sessionInput.js';
import { showAnnouncementCarousel } from './campaignsUI.js';
import { showMenuGuide } from './menuGuide.js';
import { MENU_GUIDE_ID,MENU_GUIDE_STEPS,TUTORIAL_ZONE_SCREENS,zoneTutorialKey,defaultZoneTutorial,defaultStepTutorial,selectZoneTutorial } from './tutorialContent.js';
import { learningPreference, rememberLearningPreference } from './guidedMatch.js';
import { GUIDED_MATCH_VERSION } from './guidedMatchModel.js';

const visible=node=>!!node?.getClientRects().length&&getComputedStyle(node).visibility!=='hidden';
const screenSelector='#chest-overlay,#daily-rewards-overlay,#encyclopedia-overlay,#store-overlay,#sanctuary-overlay,#workshop-overlay,#deckbuilder-overlay,#mydecks-overlay,#moderation-center-overlay,#achievements-overlay,#admin-panel-overlay,#multiplayer-overlay,#tournament-overlay,#trade-market-overlay,#global-ranking-overlay,#options-menu-overlay,#deck-select-overlay,#public-profile-overlay,#starter-deck-select-overlay,#argentinia-game-manual';
let context=()=>({}),installed=false,busy=false,attempt=0,lastUid=null,route=null,entry=0,handledEntry=null,manual=false,cache=null,cacheTime=0,retryAfter=0;
const considered=new Set(),pendingPreferences=new Map();
const flushTasks=new Map();
function destination(){const screens=[...document.querySelectorAll(screenSelector)].filter(visible);screens.sort((a,b)=>(Number(getComputedStyle(a).zIndex)||0)-(Number(getComputedStyle(b).zIndex)||0));return screens.at(-1)?.id||(visible(document.getElementById('main-menu-overlay'))?'main':'');}
function zoneFor(id){return document.getElementById(id)?.dataset.tutorialZone||Object.entries(TUTORIAL_ZONE_SCREENS).find(([,screen])=>screen===id)?.[0]||null;}
function blockers({ignoreCampaign=false}={}){return [...document.querySelectorAll('#guided-match,#first-game-choice,[aria-modal="true"],.gy-modal-overlay,.mulligan-overlay,#mulligan-overlay,#daily-login-reward-modal,#solo-recovery-overlay,#reconnect-overlay,#global-challenge-layer,#boot-loading-overlay,#match-loading-overlay,.campaign-popup-shell')].some(n=>visible(n)&&!n.matches(screenSelector)&&!n.closest('.arg-menu-guide')&&!n.closest('#main-menu-overlay')&&!(ignoreCampaign&&n.closest('.campaign-popup-shell')));}
function key(uid){return `argentinia:tutorial-preferences:${uid}`;}
function pending(uid){if(!pendingPreferences.has(uid)){try{pendingPreferences.set(uid,new Set(JSON.parse(localStorage.getItem(key(uid))||'[]').filter(id=>typeof id==='string'&&/^[a-z0-9-]{1,100}$/.test(id)).slice(0,100)));}catch{pendingPreferences.set(uid,new Set());}}return pendingPreferences.get(uid);}
function remember(uid,id){pending(uid).add(id);try{localStorage.setItem(key(uid),JSON.stringify([...pending(uid)].slice(-100)));}catch{}}
function flush(uid){if(flushTasks.has(uid))return flushTasks.get(uid);const task=(async()=>{for(const id of [...pending(uid)]){if(context().user?.uid!==uid)return;try{await dismissAnnouncement(uid,id);pending(uid).delete(id);try{localStorage.setItem(key(uid),JSON.stringify([...pending(uid)]));}catch{}}catch{return;}}})().finally(()=>flushTasks.delete(uid));flushTasks.set(uid,task);return task;}
async function contents(zone){if(!cache)cache=new Map();const previous=cache.get(zone);if(previous&&Date.now()-previous.at<60000)return previous.rows;const result=await fetchTutorialAnnouncements(zone),rows=Array.isArray(result)?result:[];if(!cache)cache=new Map();cache.set(zone,{at:Date.now(),rows});return rows;}
// Partida simple already has an editable document at main/play. Reuse that source
// while keeping the picker's dismissal independent from Mis mazos and the menu tour.
function destinationContents(zone,rows){return zone==='play'?selectZoneTutorial('main',rows).filter(a=>a.tutorialStep==='play'):selectZoneTutorial(zone,rows);}
async function guide(menu,uid,forced){
  const owner=()=>context().user?.uid===uid&&context().ready&&destination()==='main';
  let overrides={};try{const rows=selectZoneTutorial('main',await contents('main'));for(const ann of rows){const step=ann.tutorialStep||'welcome';if(!overrides[step])overrides[step]=ann;}}catch{/* Built-in instructions remain available. */}
  if(!owner()||blockers())return false;
  if(!forced){const claimed=await claimTutorialPresentation(uid,MENU_GUIDE_ID);if(!claimed){considered.add(uid);return false;}considered.add(uid);}
  else {considered.add(uid);try{await claimTutorialPresentation(uid,MENU_GUIDE_ID);}catch{remember(uid,`${MENU_GUIDE_ID}-started`);}}
  if(!owner()||blockers()){remember(uid,`${MENU_GUIDE_ID}-abandoned`);void flush(uid);return false;}
  const outcome=await showMenuGuide({menu,overrides,valid:()=>owner()&&!blockers()});
  if(uid){remember(uid,`${MENU_GUIDE_ID}-${outcome}`);void flush(uid);}return true;
}
async function pump(){
  if(!installed||document.visibilityState==='hidden')return;
  const current=context(),uid=current.user?.uid||null,nextRoute=destination();
  if(uid!==lastUid){lastUid=uid;cache=null;cacheTime=0;attempt++;handledEntry=null;retryAfter=0;manual=false;}
  const nextEntry=zoneFor(nextRoute)?'zone:'+zoneFor(nextRoute):nextRoute;
  if(nextEntry!==route){route=nextEntry;entry++;handledEntry=null;}
  if(busy||!uid||!current.ready||Date.now()<retryAfter||!nextRoute||blockers())return;
  const menu=document.getElementById('main-menu-overlay');
  if(nextRoute==='main'&&visible(menu)&&(manual||!considered.has(uid))){
    busy=true;const forced=manual;manual=false;try{await flush(uid);await guide(menu,uid,forced);}catch{retryAfter=Date.now()+30000;}finally{busy=false;}return;
  }
  const zone=zoneFor(nextRoute);
  if(!zone||handledEntry===entry)return;
  busy=true;const thisEntry=entry,thisAttempt=attempt;
  const valid=()=>context().user?.uid===uid&&context().ready&&zoneFor(destination())===zone&&entry===thisEntry&&attempt===thisAttempt&&!blockers({ignoreCampaign:true});
  try{
    await flush(uid);const id=zoneTutorialKey(zone);
    if(pending(uid).has(id)||await isAnnouncementDismissed(uid,id)){if(valid())handledEntry=thisEntry;return;}
    let rows=[];try{rows=destinationContents(zone,await contents(zone==='play'?'main':zone));}catch{/* Default guide instead of blocking the destination. */}
    if(!valid()||blockers())return;
    handledEntry=thisEntry;const selected=rows[0]||(zone==='play'?defaultStepTutorial('play'):defaultZoneTutorial(zone));
    await showAnnouncementCarousel([{...selected,id,dismissible:true}],{currentUser:{uid},isCurrent:valid,onDismissSelected:()=>remember(uid,id)});
    void flush(uid);
  }catch{retryAfter=Date.now()+15000;}finally{busy=false;}
}
export function installMenuTutorials(getContext){
  context=getContext||context;if(installed){void pump();return;}installed=true;
  window.addEventListener('argentinia:menu-destination',()=>void pump());
  window.addEventListener('argentinia:menu-navigation-exit',()=>{entry++;handledEntry=null;queueMicrotask(()=>void pump());});
  window.addEventListener('argentinia:editorial-published',()=>{cache=null;cacheTime=0;});
  window.addEventListener('online',()=>{retryAfter=0;void pump();});
  document.addEventListener('visibilitychange',()=>void pump());
  // Auth/profile hydration can finish without a route change. No game tick/write.
  setInterval(()=>void pump(),750);void pump();
}
export function requestMenuGuideReplay(){if(sessionInputBlocked())return;manual=true;retryAfter=0;considered.delete(context().user?.uid);void pump();}
export function getTutorialRuntimeStatus(){return {busy,route,entry,manual,guideVersion:MENU_GUIDE_ID,steps:MENU_GUIDE_STEPS.length};}

// Explicitly await the existing editable Partida Simple banner BEFORE any deck picker.
export async function presentPlayIntroduction(user,isCurrent=()=>true){
  if(busy)return false;
  busy=true;const uid=user?.uid||null,id=zoneTutorialKey('play'),guestKey='argentinia:play-intro:guest';
  try{
    if(uid){try{if(pending(uid).has(id)||await isAnnouncementDismissed(uid,id))return true;}catch{/* Offline default introduction remains available. */}}
    if(!uid){try{if(localStorage.getItem(guestKey))return true;}catch{}}
    let rows=[];try{rows=destinationContents('play',await contents('main'));}catch{}
    if(!isCurrent())return false;
    const selected=rows[0]||defaultStepTutorial('play');
    await showAnnouncementCarousel([{...selected,id,dismissible:true}],{currentUser:user,isCurrent,onDismissSelected:()=>{}});
    if(!isCurrent())return false;
    if(uid){remember(uid,id);void flush(uid);}else{try{localStorage.setItem(guestKey,'1');}catch{}}
    return true;
  }finally{busy=false;}
}
export async function learningOfferHandled(uid){
  if(['skip','completed'].includes(learningPreference(uid)))return true;
  if(!uid)return false;
  const id=`${GUIDED_MATCH_VERSION}-dismissed`;
  try{if(pending(uid).has(id)||await isAnnouncementDismissed(uid,id)){rememberLearningPreference(uid,'skip');return true;}}catch{}
  return false;
}
export function rememberLearningOutcome(uid,outcome){
  rememberLearningPreference(uid,outcome);
  if(uid&&['skip','completed'].includes(outcome)){remember(uid,`${GUIDED_MATCH_VERSION}-dismissed`);void flush(uid);}
}
