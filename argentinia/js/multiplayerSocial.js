// 23.21.3 — Multiplayer Social Layer.
// Visualmente convive con la bitácora; técnicamente NO viaja por el snapshot gameplay ni
// entra en telemetry. Chat/emotes usan un canal server-authoritative separado para que una
// ráfaga social jamás pueda tocar revisión, prioridad, mano o estado de combate.
import { listenToMatchCommunication, sendMultiplayerCommunication, fetchStorefrontAuthority } from './firebaseClient.js';
import { EMOTE_CATALOG, getEmoteDefinition, normalizeOwnedEmoteIds, emoteAssetCandidates, emoteAudioCandidates, applyEmoteCatalogSnapshot } from './emoteCatalog.js';
import { animationsEffectivelyEnabled } from './animationDirector.js';
import { gameText } from './gameTexts.js';
import { getAudioSettings } from './audioManager.js';

const MAX_CHAT = 220;
let session = null;
let stopListener = null;
let lastProcessedSeq = 0;
let baselineLoaded = false;
let sendingChat = false;
let sendingEmote = false;
let rivalMuted = false;
let preKeyboardViewportHeight = 0;
const assetProbeCache = new Map();

function byId(id){ return typeof document !== 'undefined' ? document.getElementById(id) : null; }
function muted(){ return rivalMuted === true; }
function setMuted(value){ rivalMuted = value === true; }
function isOwnEvent(event){ return !!session?.uid && String(event?.uid || '') === String(session.uid); }
function escapeText(value){ return String(value ?? ''); }

function setStatus(message = '', kind = '') {
  const el = byId('mp-social-status'); if (!el) return;
  el.textContent = String(message || '');
  el.className = `mp-social-status${kind ? ` ${kind}` : ''}`;
}
function appendSocialLog(event) {
  const log=byId('game-log-box'); if(!log || !event) return;
  const own=isOwnEvent(event);
  if(!own && muted()) return;
  const row=document.createElement('div');
  row.className=`log-entry mp-social-log-entry log-player-entry ${own?'mp-social-own':'mp-social-rival'} mp-social-chat-entry`;
  row.dataset.socialSeq=String(event.seq || '');
  const name=document.createElement('strong'); name.className='mp-social-name'; name.textContent=`${escapeText(event.username || (own?session?.localName:session?.rivalName) || 'Jugador')}:`;
  row.appendChild(name);
  const text=document.createElement('span'); text.className='mp-social-message'; text.textContent=escapeText(event.text || ''); row.appendChild(text);
  log.appendChild(row); log.scrollTop=log.scrollHeight;
}
async function resolveAvailableAsset(urls=[]) {
  const list=Array.isArray(urls)?urls.filter(Boolean):[];
  for(const url of list){
    if(assetProbeCache.has(url)){
      if(assetProbeCache.get(url)===true) return url;
      continue;
    }
    try{
      const response=await fetch(url,{method:'HEAD',cache:'force-cache',credentials:'same-origin'});
      const ok=response.ok;
      assetProbeCache.set(url,ok);
      if(ok) return url;
    }catch{ assetProbeCache.set(url,false); }
  }
  return null;
}
function renderEmoteFallback(holder,def,{decorative=false}={}){
  if(!holder)return;
  holder.replaceChildren();
  const span=document.createElement('span'); span.className='mp-emote-fallback'; span.textContent=def?.fallback || '🙂'; span.setAttribute('aria-hidden',decorative?'true':'false'); holder.appendChild(span);
}
function mountEmoteAsset(holder, def, { decorative=false } = {}) {
  if(!holder) return;
  renderEmoteFallback(holder,def,{decorative});
  if(!def) return;
  const urls=emoteAssetCandidates(def);
  void resolveAvailableAsset(urls).then(url=>{
    if(!url || !holder.isConnected) return;
    const img=document.createElement('img'); img.className='mp-emote-img'; img.alt=decorative?'':def.label; img.decoding='async'; img.draggable=false;
    img.addEventListener('error',()=>renderEmoteFallback(holder,def,{decorative}),{once:true});
    img.src=url; holder.replaceChildren(img);
  });
}
function playEmoteAudio(def) {
  const urls=emoteAudioCandidates(def); if(!urls.length || typeof Audio==='undefined') return;
  const settings=getAudioSettings(); if(settings?.sfxEnabled===false) return;
  void resolveAvailableAsset(urls).then(url=>{
    if(!url)return;
    const audio=new Audio(url); audio.preload='auto'; audio.volume=Math.max(0,Math.min(1,Number(settings?.sfxVolume ?? 1)));
    void audio.play().catch(()=>{});
  });
}
async function refreshAuthoritativeEmoteCatalog(){
  try{const storefront=await fetchStorefrontAuthority();if(storefront?.emotes)applyEmoteCatalogSnapshot(storefront.emotes);}catch(error){console.warn('[Multiplayer Social] Catálogo de emotes authority no disponible; se conserva último snapshot/default:',error);}
}

function animateEmote(event) {
  if(!event || (!isOwnEvent(event) && muted())) return;
  const own=isOwnEvent(event);
  const target=document.querySelector(own?'.player-card.local-card':'.player-card.rival-card');
  if(!target) return;
  const def=getEmoteDefinition(event.emoteId); if(!def) return;
  playEmoteAudio(def);
  target.querySelectorAll('.mp-emote-burst').forEach(node=>node.remove());
  const burst=document.createElement('div');
  const canAnimate=animationsEffectivelyEnabled();
  burst.className=`mp-emote-burst ${own?'mp-emote-burst-own':'mp-emote-burst-rival'}${def.premium?' premium':''}${canAnimate?` mp-emote-anim-${def.animation||'pop'}`:' mp-emote-static'}`;
  burst.setAttribute('role','status'); burst.setAttribute('aria-label',`${event.username || 'Jugador'}: ${def.label}`);
  const art=document.createElement('div'); art.className='mp-emote-burst-art'; mountEmoteAsset(art,def,{decorative:true}); burst.appendChild(art);
  target.appendChild(burst);
  setTimeout(()=>burst.remove(), canAnimate?2600:1800);
}
function renderEvent(event,{animate=false}={}){
  const seq=Math.max(0,Math.floor(Number(event?.seq)||0));
  if(!seq || seq<=lastProcessedSeq) return;
  lastProcessedSeq=seq;
  if(event.type==='chat') appendSocialLog(event);
  if(event.type==='emote' && animate) animateEmote(event);
}
function onSnapshot(data){
  const events=Array.isArray(data?.events)?data.events:[];
  for(const event of events){
    const freshAtStart=!baselineLoaded && Number(event?.createdAtMs||0) >= Number(session?.startedAtMs||0)-2500;
    renderEvent(event,{animate:baselineLoaded || freshAtStart});
  }
  baselineLoaded=true;
}
function onListenerError(error){ console.warn('[Multiplayer Social] Listener interrumpido:',error); setStatus(gameText('multiplayer.social.disconnected'),'error'); }

function renderEmotePicker(){
  const picker=byId('mp-emote-picker'); if(!picker || !session) return;
  picker.replaceChildren();
  const owned=normalizeOwnedEmoteIds(session.profile);
  for(const def of EMOTE_CATALOG.filter(row=>row.active!==false&&owned.has(row.id))){
    const btn=document.createElement('button'); btn.type='button'; btn.className=`mp-emote-choice${def.premium?' premium':''}`; btn.title=def.label; btn.dataset.emoteId=def.id;
    const art=document.createElement('span'); art.className='mp-emote-choice-art'; mountEmoteAsset(art,def); btn.appendChild(art);
    btn.addEventListener('click',()=>{ void sendEmote(def.id); }); picker.appendChild(btn);
  }
  picker.classList.toggle('hidden',false);
}
function hidePicker(){ byId('mp-emote-picker')?.classList.add('hidden'); }

function normalizeMobileViewportAfterKeyboard(){
  const root=document.documentElement;
  if(!root?.classList.contains('argentinia-mobile')) return;
  const recoveryHeight=Math.max(1,Number(preKeyboardViewportHeight)||window.innerHeight||0);
  if(recoveryHeight>0){ root.style.setProperty('--arg-mobile-keyboard-recovery-height',`${recoveryHeight}px`); root.classList.add('arg-mobile-keyboard-recovering'); }
  const settle=()=>{ try{window.scrollTo(0,0);}catch{} void root.offsetHeight; };
  requestAnimationFrame(settle);
  setTimeout(settle,120);
  setTimeout(()=>{ root.classList.remove('arg-mobile-keyboard-recovering'); root.style.removeProperty('--arg-mobile-keyboard-recovery-height'); settle(); },520);
}
function processLocalChatCommand(text){
  const command=String(text||'').trim().toLowerCase();
  if(command==='/silenciar'){
    setMuted(true);
    setStatus(gameText('multiplayer.social.command.muted'),'ok');
    return true;
  }
  if(command==='/activar' || command==='/desilenciar'){
    setMuted(false); setStatus(gameText('multiplayer.social.command.unmuted'),'ok'); return true;
  }
  if(command==='/ayuda'){
    setStatus(gameText('multiplayer.social.command.help'),'ok'); return true;
  }
  if(command.startsWith('/')){
    setStatus(gameText('multiplayer.social.command.unknown'),'error'); return true;
  }
  return false;
}

async function sendChat(){
  if(!session || sendingChat) return;
  const input=byId('mp-chat-input'); const btn=byId('mp-chat-send'); if(!input) return;
  const text=String(input.value||'').replace(/\s+/g,' ').trim();
  if(!text) return;
  if(processLocalChatCommand(text)){ input.value=''; return; }
  if(text.length>MAX_CHAT){ setStatus(gameText('multiplayer.social.maxChars',{count:MAX_CHAT}),'error'); return; }
  sendingChat=true; if(btn) btn.disabled=true; input.value=''; setStatus('');
  try { const event=await sendMultiplayerCommunication(session.matchId,{type:'chat',text}); renderEvent(event,{animate:false}); }
  catch(error){ input.value=text; setStatus(error?.message||gameText('multiplayer.social.sendError'),'error'); }
  finally { sendingChat=false; if(btn) btn.disabled=false; if(!document.documentElement.classList.contains('argentinia-mobile')) input.focus(); }
}
async function sendEmote(emoteId){
  if(!session || sendingEmote) return;
  sendingEmote=true; hidePicker(); setStatus('');
  try { const event=await sendMultiplayerCommunication(session.matchId,{type:'emote',emoteId}); renderEvent(event,{animate:true}); }
  catch(error){ setStatus(error?.message||gameText('multiplayer.social.emoteError'),'error'); }
  finally { sendingEmote=false; }
}

const FILTER_PLAYERS_KEY='argentinia.multiplayerSocial.showPlayers.v1';
const FILTER_SYSTEM_KEY='argentinia.multiplayerSocial.showSystem.v1';
function storedFilter(key, fallback=true){ try { const raw=localStorage.getItem(key); return raw===null?fallback:raw!=='0'; } catch { return fallback; } }
function applyLogFilters(){
  const log=byId('game-log-box'), players=byId('mp-log-filter-players'), system=byId('mp-log-filter-system'); if(!log)return;
  const showPlayers=players?players.checked:storedFilter(FILTER_PLAYERS_KEY,true);
  const showSystem=system?system.checked:storedFilter(FILTER_SYSTEM_KEY,true);
  log.classList.toggle('hide-player-messages',!showPlayers);
  log.classList.toggle('hide-system-messages',!showSystem);
  log.classList.toggle('filters-hide-all',!showPlayers && !showSystem);
}
function bindLogFilters(){
  const shell=byId('mp-log-filters'), players=byId('mp-log-filter-players'), system=byId('mp-log-filter-system');
  if(shell) shell.classList.remove('hidden');
  if(players && !players.dataset.boundFilter){ players.dataset.boundFilter='1'; players.checked=storedFilter(FILTER_PLAYERS_KEY,true); players.addEventListener('change',()=>{try{localStorage.setItem(FILTER_PLAYERS_KEY,players.checked?'1':'0');}catch{} applyLogFilters();}); }
  if(system && !system.dataset.boundFilter){ system.dataset.boundFilter='1'; system.checked=storedFilter(FILTER_SYSTEM_KEY,true); system.addEventListener('change',()=>{try{localStorage.setItem(FILTER_SYSTEM_KEY,system.checked?'1':'0');}catch{} applyLogFilters();}); }
  applyLogFilters();
}

function bindControls(){
  const send=byId('mp-chat-send'), input=byId('mp-chat-input'), emotes=byId('mp-emote-open');
  if(send && !send.dataset.boundSocial){ send.dataset.boundSocial='1'; send.addEventListener('click',()=>void sendChat()); }
  if(input && !input.dataset.boundSocial){
    input.dataset.boundSocial='1'; input.maxLength=MAX_CHAT;
    input.addEventListener('keydown',event=>{ if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void sendChat();} });
    input.addEventListener('focus',()=>{ if(document.documentElement.classList.contains('argentinia-mobile')) preKeyboardViewportHeight=Math.max(window.innerHeight||0,document.documentElement.clientHeight||0); });
    input.addEventListener('blur',normalizeMobileViewportAfterKeyboard);
  }
  if(emotes && !emotes.dataset.boundSocial){ emotes.dataset.boundSocial='1'; emotes.addEventListener('click',()=>{ const picker=byId('mp-emote-picker'); if(!picker)return; if(picker.classList.contains('hidden'))renderEmotePicker(); else hidePicker(); }); }
  if(!document.documentElement.dataset.boundEmoteDismiss){
    document.documentElement.dataset.boundEmoteDismiss='1';
    document.addEventListener('pointerdown',event=>{ const picker=byId('mp-emote-picker'); const trigger=byId('mp-emote-open'); if(!picker||picker.classList.contains('hidden'))return; if(picker.contains(event.target)||trigger?.contains(event.target))return; hidePicker(); },true);
  }
  bindLogFilters();
}

export function startMultiplayerSocialSession({matchId,uid,localName='Vos',rivalName='Rival',profile=null}={}){
  stopMultiplayerSocialSession({keepLog:true});
  const safeMatch=String(matchId||'').trim().toUpperCase(); const safeUid=String(uid||'').trim();
  if(!safeMatch||!safeUid) return false;
  session={matchId:safeMatch,uid:safeUid,localName:String(localName||'Vos'),rivalName:String(rivalName||'Rival'),profile:profile||{},startedAtMs:Date.now()};
  rivalMuted=false;
  try{ localStorage.removeItem('argentinia.multiplayerSocial.muteRival.v1'); }catch{}
  lastProcessedSeq=0; baselineLoaded=false; bindControls(); void refreshAuthoritativeEmoteCatalog().then(()=>{ if(session?.matchId===safeMatch) hidePicker(); });
  const shell=byId('mp-social-shell'); if(shell) shell.classList.remove('hidden');
  const input=byId('mp-chat-input'); if(input) input.placeholder=gameText('multiplayer.social.placeholder',{rival:session.rivalName});
  stopListener=listenToMatchCommunication(safeMatch,onSnapshot,onListenerError);
  return true;
}
export function refreshMultiplayerSocialProfile(profile){ if(session) session.profile=profile||{}; }
export function stopMultiplayerSocialSession({keepLog=false}={}){
  if(typeof stopListener==='function'){try{stopListener();}catch{}} stopListener=null; session=null; lastProcessedSeq=0; baselineLoaded=false; sendingChat=false; sendingEmote=false; rivalMuted=false;
  hidePicker(); setStatus(''); const shell=byId('mp-social-shell'); if(shell) shell.classList.add('hidden'); const filters=byId('mp-log-filters'); if(filters) filters.classList.add('hidden');
  if(!keepLog && typeof document!=='undefined') document.querySelectorAll('.mp-social-log-entry,.mp-emote-burst').forEach(node=>node.remove());
}
