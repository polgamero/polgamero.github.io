// Session verification is an admission boundary, never a queue for user intent.
let readState=null,installed=false,identityKey='',epoch=0;
let appliedMenu=null,appliedBlocked=null;
let discardPointerClick=false,discardKeyboardClick=false;
const heldKeys=new Set();
export const sessionActionsReady=s=>s?.authInitialResolved===true&&s?.authIdentityReady===true;
function snapshot(){
  const s=readState?.(),key=JSON.stringify([s?.authInitialResolved===true,s?.authIdentityReady===true,s?.currentUser?.uid||null]);
  if(key!==identityKey){identityKey=key;epoch++;}
  return {ready:sessionActionsReady(s),epoch,uid:s?.currentUser?.uid||null};
}
export function sessionInputBlocked(){return installed&&!snapshot().ready;}
export function captureSessionAction(){const s=snapshot();return installed&&s.ready?{epoch:s.epoch,uid:s.uid}:null;}
export function sessionActionCurrent(ticket){const s=snapshot();return !!ticket&&s.ready&&s.epoch===ticket.epoch&&s.uid===ticket.uid;}
export function syncSessionInput(){
  if(!installed)return;
  const blocked=!snapshot().ready,menu=document.getElementById('main-menu-overlay');
  if(menu===appliedMenu&&blocked===appliedBlocked)return;
  appliedMenu=menu;appliedBlocked=blocked;
  document.documentElement.classList.toggle('arg-session-checking',blocked);
  // Busy describes the wait without removing hover, focus or gate hints.
  // Activation is discarded by guard(), never by making the menu inert.
  if(menu)menu.setAttribute('aria-busy',String(blocked));
}
// Only controls required by the existing serialized identity/startup flow can
// work while it is pending. Navigation, gameplay and tutorial replay cannot.
const bootControls='.username-overlay[data-session-verification-control],#starter-deck-select-overlay,#daily-login-reward-modal,.campaign-popup-shell,.trade-notification-modal,#community-notice-ok,#simple-alert-ok';
function suppress(event){if(event.cancelable)event.preventDefault();event.stopImmediatePropagation();}
function guard(event){
  const blocked=!snapshot().ready,target=event.target instanceof Element?event.target:null;
  syncSessionInput();
  if(blocked&&target?.closest(bootControls))return;
  if(event.type==='keydown'){
    // Browsing focus and its tooltip remains available during verification.
    if(event.key==='Tab')return;
    // Reload remains a browser recovery action, rather than an in-game command.
    if(event.key==='F5'||((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='r'))return;
    const key=event.code||event.key;
    if(blocked||heldKeys.has(key)){heldKeys.add(key);discardKeyboardClick=true;suppress(event);return;}
    if(!event.repeat)discardKeyboardClick=false;
  }
  if(event.type==='keyup'&&heldKeys.delete(event.code||event.key)){discardKeyboardClick=true;suppress(event);return;}
  if(event.type==='pointerdown'||event.type==='mousedown'||event.type==='touchstart'){
    if(blocked)discardPointerClick=true;
    // Compatibility mousedown/touchstart belongs to the same pointer gesture.
    // It must not revive a press begun before verification finished.
    else if(event.type==='pointerdown'||typeof PointerEvent==='undefined'){discardPointerClick=false;discardKeyboardClick=false;}
    // Existing pointer handlers provide hover/touch feedback, not navigation.
    // Only the ensuing activation is rejected, including a press spanning ready.
    return;
  }
  if(event.type==='click'&&(discardPointerClick||(event.detail===0&&discardKeyboardClick))){discardPointerClick=false;suppress(event);return;}
  if(blocked)suppress(event);
}
export function installSessionInput(getState){
  readState=getState;
  if(!installed){
    installed=true;
    for(const type of ['pointerdown','mousedown','touchstart','click','dblclick','auxclick','contextmenu','keydown','keyup','submit','dragstart','drop'])window.addEventListener(type,guard,{capture:true,passive:false});
    window.addEventListener('blur',()=>heldKeys.clear());
  }
  syncSessionInput();
}
