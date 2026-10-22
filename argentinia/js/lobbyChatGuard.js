// Local admission only. The server remains authoritative. No network or payload logs.
export const LOBBY_CHAT_LIMITS = Object.freeze({ interval:2500, burstWindow:30000, burstMax:5, longWindow:300000, longMax:20, duplicateWindow:45000 });
const STORAGE_KEY='argentinia.lobbyChatGuard.v1';
const expectedCodes=new Set(['LOBBY_CHAT_RATE_LIMIT','LOBBY_CHAT_DUPLICATE']);
export function lobbyChatBlock(value) {
  const details=value?.blocked||value?.details||value?.customData?.details||{};
  const code=String(details.code||value?.argentiniaCode||value?.code||'');
  if(!expectedCodes.has(code)&&!(code==='RATE_LIMITED'&&details.bucket==='multiplayer-lobby-chat'))return null;
  return {code:code==='RATE_LIMITED'?'LOBBY_CHAT_RATE_LIMIT':code,retryAfterMs:Math.max(1,Math.min(300000,Number(details.retryAfterMs)||2500))};
}
function fingerprint(text) {
  const leet={'4':'a','@':'a','3':'e','1':'i','0':'o','5':'s','$':'s','7':'t'};
  const normalized=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().split('').map(c=>leet[c]||c).join('').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  // Only a local fingerprint is persisted, never the message text.
  let hash=2166136261;for(const c of normalized)hash=Math.imul(hash^c.charCodeAt(0),16777619);
  return normalized?`${normalized.length}:${hash>>>0}`:'';
}
export function createLobbyChatGuard({now=()=>Date.now(),storage=null}={}) {
  let memory={};
  let persisted=true;
  const pending=new Set();
  function load(){try{const value=persisted?JSON.parse(storage?.getItem(STORAGE_KEY)||'null'):null;if(value&&typeof value==='object'&&!Array.isArray(value))memory=value;}catch{persisted=false;}return memory;}
  function write(uid,row){
    const rows=load();rows[uid]=row;
    const kept=Object.entries(rows).filter(([,v])=>v&&now()-(Number(v.touched)||0)<600000).sort((a,b)=>b[1].touched-a[1].touched).slice(0,20);
    memory=Object.fromEntries(kept);try{if(persisted)storage?.setItem(STORAGE_KEY,JSON.stringify(memory));}catch{persisted=false;}
  }
  function state(uid,text=''){
    if(!uid)return {allowed:false,pending:false,retryAfterMs:0,code:'AUTH_REQUIRED'};
    const row=load()[uid]||{},at=now(),limits=LOBBY_CHAT_LIMITS;
    const inFlight=pending.has(uid)||Number(row.inFlightUntil)>at;
    let until=Math.max(Number(row.nextAt)||0,Number(row.blockedUntil)||0);
    if(Number(row.burstCount)>=limits.burstMax)until=Math.max(until,(Number(row.burstAt)||0)+limits.burstWindow);
    if(Number(row.longCount)>=limits.longMax)until=Math.max(until,(Number(row.longAt)||0)+limits.longWindow);
    let code='LOBBY_CHAT_RATE_LIMIT';
    if(text&&fingerprint(text)===row.lastText&&Number(row.duplicateUntil)>at){until=Math.max(until,row.duplicateUntil);code='LOBBY_CHAT_DUPLICATE';}
    return {allowed:!inFlight&&until<=at,pending:inFlight,retryAfterMs:Math.max(0,until-at),code};
  }
  function begin(uid,text){
    const status=state(uid,text);if(!status.allowed)return {ok:false,blocked:{...status,local:true}};
    const at=now(),row=load()[uid]||{};
    pending.add(uid);write(uid,{...row,inFlightUntil:at+90000,nextAt:at+LOBBY_CHAT_LIMITS.interval,touched:at});
    return {ok:true,uid,textHash:fingerprint(text)};
  }
  function finish(ticket,{accepted=false,blocked=null,nextAllowedInMs=0}={}){
    if(!ticket?.ok)return;
    const {uid,textHash}=ticket,at=now(),row={...(load()[uid]||{})},limits=LOBBY_CHAT_LIMITS;
    pending.delete(uid);row.inFlightUntil=0;row.touched=at;
    if(accepted){
      for(const [prefix,window] of [['burst',limits.burstWindow],['long',limits.longWindow]]){
        if(!row[prefix+'At']||at-row[prefix+'At']>=window){row[prefix+'At']=at;row[prefix+'Count']=0;}
        row[prefix+'Count']=(Number(row[prefix+'Count'])||0)+1;
      }
      row.nextAt=at+Math.max(limits.interval,Number(nextAllowedInMs)||0);
      row.lastText=textHash;row.duplicateUntil=at+limits.duplicateWindow;
    }
    if(blocked){
      const until=at+Math.max(1,Number(blocked.retryAfterMs)||limits.interval);
      if(blocked.code==='LOBBY_CHAT_DUPLICATE'){row.lastText=textHash;row.duplicateUntil=until;}
      else row.blockedUntil=Math.max(Number(row.blockedUntil)||0,until);
    }
    write(uid,row);
  }
  return {state,begin,finish};
}
let localStorageRef=null;try{localStorageRef=globalThis.localStorage;}catch{}
export const lobbyChatGuard=createLobbyChatGuard({storage:localStorageRef});

// Reserve across tabs before entering the callable transport. Old browsers still
// share persisted cooldowns; the backend covers simultaneous storage races.
export async function reserveLobbyChat(uid,text){
  if(globalThis.navigator?.locks?.request)return navigator.locks.request(`arg-lobby-chat:${uid}`,()=>lobbyChatGuard.begin(uid,text));
  return lobbyChatGuard.begin(uid,text);
}
