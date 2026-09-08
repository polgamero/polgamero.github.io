// 23.21.3 — Multiplayer Social Layer.
// Visualmente convive con la bitácora; técnicamente NO viaja por el snapshot gameplay ni
// entra en telemetry. Chat/emotes usan un canal server-authoritative separado para que una
// ráfaga social jamás pueda tocar revisión, prioridad, mano o estado de combate.
import { listenToMatchCommunication, sendMultiplayerCommunication, fetchStorefrontAuthority } from './firebaseClient.js';
import { EMOTE_CATALOG, getEmoteDefinition, normalizeOwnedEmoteIds, emoteAssetCandidates, emoteAudioCandidates, applyEmoteCatalogSnapshot } from './emoteCatalog.js';
import { animationsEffectivelyEnabled } from './animationDirector.js';
import { gameText } from './gameTexts.js';
import { getAudioSettings } from './audioManager.js';

const MUTE_KEY = 'argentinia.multiplayerSocial.muteRival.v1';
const MAX_CHAT = 220;
let session = null;
let stopListener = null;
let lastProcessedSeq = 0;
let baselineLoaded = false;
let sendingChat = false;
let sendingEmote = false;

function byId(id){ return typeof document !== 'undefined' ? document.getElementById(id) : null; }
function muted(){ try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } }
function setMuted(value){ try { localStorage.setItem(MUTE_KEY, value ? '1' : '0'); } catch {} }
function isOwnEvent(event){ return !!session?.uid && String(event?.uid || '') === String(session.uid); }
function escapeText(value){ return String(value ?? ''); }

function setStatus(message = '', kind = '') {
  const el = byId('mp-social-status'); if (!el) return;
  el.textContent = String(message || '');
  el.className = `mp-social-status${kind ? ` ${kind}` : ''}`;
}
function updateMuteButton(){
  const btn=byId('mp-social-mute'); if(!btn) return;
  const on=muted(); btn.textContent=on?'🔇':'🔊'; btn.title=on?gameText('multiplayer.social.unmute'):gameText('multiplayer.social.mute'); btn.setAttribute('aria-pressed',on?'true':'false');
}
function appendSocialLog(event) {
  const log=byId('game-log-box'); if(!log || !event) return;
  const own=isOwnEvent(event);
  if(!own && muted()) return;
  const row=document.createElement('div');
  row.className=`log-entry mp-social-log-entry ${own?'mp-social-own':'mp-social-rival'} ${event.type==='emote'?'mp-social-emote-entry':'mp-social-chat-entry'}`;
  row.dataset.socialSeq=String(event.seq || '');
  const name=document.createElement('strong'); name.className='mp-social-name'; name.textContent=`${escapeText(event.username || (own?session?.localName:session?.rivalName) || 'Jugador')}:`;
  row.appendChild(name);
  if(event.type==='chat') {
    const text=document.createElement('span'); text.className='mp-social-message'; text.textContent=escapeText(event.text || ''); row.appendChild(text);
  } else {
    const def=getEmoteDefinition(event.emoteId);
    const holder=document.createElement('span'); holder.className='mp-social-inline-emote';
    mountEmoteAsset(holder,def); row.appendChild(holder);
  }
  log.appendChild(row); log.scrollTop=log.scrollHeight;
}
function mountEmoteAsset(holder, def, { decorative=false } = {}) {
  if(!holder) return;
  holder.replaceChildren();
  if(!def){ holder.textContent='🙂'; return; }
  const urls=emoteAssetCandidates(def);
  let index=0;
  const fallback=()=>{ holder.replaceChildren(); const span=document.createElement('span'); span.className='mp-emote-fallback'; span.textContent=def.fallback || '🙂'; span.setAttribute('aria-hidden', decorative?'true':'false'); holder.appendChild(span); };
  const img=document.createElement('img'); img.className='mp-emote-img'; img.alt=decorative?'':def.label; img.decoding='async'; img.draggable=false;
  img.onerror=()=>{ index+=1; if(index<urls.length) img.src=urls[index]; else fallback(); };
  if(urls.length) { img.src=urls[0]; holder.appendChild(img); } else fallback();
}
function playEmoteAudio(def) {
  const urls=emoteAudioCandidates(def); if(!urls.length || typeof Audio==='undefined') return;
  const settings=getAudioSettings(); if(settings?.sfxEnabled===false) return;
  let index=0; const audio=new Audio(); audio.preload='auto'; audio.volume=Math.max(0,Math.min(1,Number(settings?.sfxVolume ?? 1)));
  audio.onerror=()=>{index+=1;if(index<urls.length){audio.src=urls[index];void audio.play().catch(()=>{});}};
  audio.src=urls[0]; void audio.play().catch(()=>{});
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
  burst.className=`mp-emote-burst ${own?'mp-emote-burst-own':'mp-emote-burst-rival'}${canAnimate?` mp-emote-anim-${def.animation||'pop'}`:' mp-emote-static'}`;
  burst.setAttribute('role','status'); burst.setAttribute('aria-label',`${event.username || 'Jugador'}: ${def.label}`);
  const art=document.createElement('div'); art.className='mp-emote-burst-art'; mountEmoteAsset(art,def,{decorative:true}); burst.appendChild(art);
  target.appendChild(burst);
  setTimeout(()=>burst.remove(), canAnimate?2600:1800);
}
function renderEvent(event,{animate=false}={}){
  const seq=Math.max(0,Math.floor(Number(event?.seq)||0));
  if(!seq || seq<=lastProcessedSeq) return;
  lastProcessedSeq=seq;
  appendSocialLog(event);
  if(event.type==='emote' && animate) animateEmote(event);
}
function onSnapshot(data){
  const events=Array.isArray(data?.events)?data.events:[];
  for(const event of events) renderEvent(event,{animate:baselineLoaded});
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

async function sendChat(){
  if(!session || sendingChat) return;
  const input=byId('mp-chat-input'); const btn=byId('mp-chat-send'); if(!input) return;
  const text=String(input.value||'').replace(/\s+/g,' ').trim();
  if(!text) return;
  if(text.length>MAX_CHAT){ setStatus(gameText('multiplayer.social.maxChars',{count:MAX_CHAT}),'error'); return; }
  sendingChat=true; if(btn) btn.disabled=true; input.value=''; setStatus('');
  try { const event=await sendMultiplayerCommunication(session.matchId,{type:'chat',text}); renderEvent(event,{animate:false}); }
  catch(error){ input.value=text; setStatus(error?.message||gameText('multiplayer.social.sendError'),'error'); }
  finally { sendingChat=false; if(btn) btn.disabled=false; input.focus(); }
}
async function sendEmote(emoteId){
  if(!session || sendingEmote) return;
  sendingEmote=true; hidePicker(); setStatus('');
  try { const event=await sendMultiplayerCommunication(session.matchId,{type:'emote',emoteId}); renderEvent(event,{animate:true}); }
  catch(error){ setStatus(error?.message||gameText('multiplayer.social.emoteError'),'error'); }
  finally { sendingEmote=false; }
}

function bindControls(){
  const send=byId('mp-chat-send'), input=byId('mp-chat-input'), emotes=byId('mp-emote-open'), mute=byId('mp-social-mute');
  if(send && !send.dataset.boundSocial){ send.dataset.boundSocial='1'; send.addEventListener('click',()=>void sendChat()); }
  if(input && !input.dataset.boundSocial){ input.dataset.boundSocial='1'; input.maxLength=MAX_CHAT; input.addEventListener('keydown',event=>{ if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void sendChat();} }); }
  if(emotes && !emotes.dataset.boundSocial){ emotes.dataset.boundSocial='1'; emotes.addEventListener('click',()=>{ const picker=byId('mp-emote-picker'); if(!picker)return; if(picker.classList.contains('hidden'))renderEmotePicker(); else hidePicker(); }); }
  if(mute && !mute.dataset.boundSocial){ mute.dataset.boundSocial='1'; mute.addEventListener('click',()=>{setMuted(!muted());updateMuteButton();}); }
  updateMuteButton();
}

export function startMultiplayerSocialSession({matchId,uid,localName='Vos',rivalName='Rival',profile=null}={}){
  stopMultiplayerSocialSession({keepLog:true});
  const safeMatch=String(matchId||'').trim().toUpperCase(); const safeUid=String(uid||'').trim();
  if(!safeMatch||!safeUid) return false;
  session={matchId:safeMatch,uid:safeUid,localName:String(localName||'Vos'),rivalName:String(rivalName||'Rival'),profile:profile||{}};
  lastProcessedSeq=0; baselineLoaded=false; bindControls(); void refreshAuthoritativeEmoteCatalog().then(()=>{ if(session?.matchId===safeMatch) hidePicker(); });
  const shell=byId('mp-social-shell'); if(shell) shell.classList.remove('hidden');
  const input=byId('mp-chat-input'); if(input) input.placeholder=gameText('multiplayer.social.placeholder',{rival:session.rivalName});
  stopListener=listenToMatchCommunication(safeMatch,onSnapshot,onListenerError);
  return true;
}
export function refreshMultiplayerSocialProfile(profile){ if(session) session.profile=profile||{}; }
export function stopMultiplayerSocialSession({keepLog=false}={}){
  if(typeof stopListener==='function'){try{stopListener();}catch{}} stopListener=null; session=null; lastProcessedSeq=0; baselineLoaded=false; sendingChat=false; sendingEmote=false;
  hidePicker(); setStatus(''); const shell=byId('mp-social-shell'); if(shell) shell.classList.add('hidden');
  if(!keepLog && typeof document!=='undefined') document.querySelectorAll('.mp-social-log-entry,.mp-emote-burst').forEach(node=>node.remove());
}
