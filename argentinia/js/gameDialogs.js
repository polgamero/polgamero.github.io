// Game-owned dialogs. No native blocking browser dialogs or lazy style dependency.
let active = null;
function styles() {
  if (document.getElementById('arg-game-dialog-styles')) return;
  const style = document.createElement('style');
  style.id = 'arg-game-dialog-styles';
  style.textContent = `.arg-game-dialog{position:fixed;inset:0;z-index:100100;display:grid;place-items:center;padding:16px;background:#000b}.arg-game-dialog>section{box-sizing:border-box;width:min(100%,480px);max-height:85dvh;overflow:auto;padding:22px;border:2px solid #d4af37;border-radius:14px;background:#0c1811;color:#f0e0b0;font:16px/1.5 system-ui,sans-serif;box-shadow:0 15px 60px #000}.arg-game-dialog h2{margin:0 0 12px;font-size:21px}.arg-game-dialog p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 20px}.arg-game-dialog footer{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}.arg-game-button,.arg-game-dialog button{min-height:44px;padding:9px 18px;border:1px solid #d4af37;border-radius:8px;background:#29351a;color:#fff0c8;font:700 15px system-ui;cursor:pointer}.arg-game-button:focus-visible,.arg-game-dialog button:focus-visible{outline:3px solid #a7e4ff;outline-offset:3px}`;
  style.textContent+=`html.argentinia-mobile:has(#first-game-choice) #arg-mobile-fullscreen-retry{display:none!important}`;
  document.head.append(style);
  style.textContent+=`.arg-game-choice>section{position:relative}.arg-game-choice h2{text-align:center;padding:0 34px;margin-bottom:16px}.arg-game-choice p{text-align:center}.arg-game-choice footer{justify-content:center;gap:14px}.arg-game-choice footer button{flex:1 1 160px;min-height:48px}.arg-game-choice button[data-primary]{background:#d4af37;color:#151c12;border-color:#ffe19c}.arg-game-choice .arg-game-dialog-close{position:absolute;top:9px;right:9px;width:40px;min-height:40px;padding:0;border-color:transparent;background:transparent;font-size:26px;font-weight:400;color:#c6bea5}.arg-game-choice .arg-game-dialog-close:hover{color:#fff0c8;border-color:#d4af37}`;
}
export function ensureGameDialogStyles(){styles();}
export function closeGameDialog() { active?.finish(false); }
export function showGameDialog(message, { title = 'Argentinia', confirm = false, acceptLabel = 'Entendido', valid = () => true, input = null } = {}) {
  closeGameDialog(); styles();
  const previousFocus = document.activeElement;
  const overlay = document.createElement('div'); overlay.className = 'gy-modal-overlay arg-game-dialog';
  const panel = document.createElement('section'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
  const heading = document.createElement('h2'); heading.id = 'arg-game-dialog-title'; heading.textContent = title;
  panel.setAttribute('aria-labelledby', heading.id);
  const copy = document.createElement('p'); copy.textContent = String(message ?? '');
  const field = input ? document.createElement('textarea') : null;
  if (field) {
    field.setAttribute('aria-label',String(input.label||message||title));
    field.maxLength=Number(input.maxLength)||1000;field.rows=4;field.value=String(input.value||'');
    field.style.cssText='box-sizing:border-box;width:100%;margin-bottom:16px;padding:10px;border:1px solid #d4af37;border-radius:8px;background:#101a13;color:#fff0c8;font:inherit;resize:vertical';
  }
  const actions = document.createElement('footer');
  const accept = document.createElement('button'); accept.type = 'button'; accept.textContent = acceptLabel;
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancelar';
  panel.append(heading, copy);if(field)panel.append(field);panel.append(actions); if (confirm) actions.append(cancel); actions.append(accept); overlay.append(panel);
  return new Promise(resolve => {
    let settled = false;
    const finish = accepted => {
      if (settled) return; settled = true;
      clearInterval(watch); document.removeEventListener('keydown', keydown, true); overlay.remove();
      if (active?.overlay === overlay) active = null;
      if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
      const ok=accepted === true && valid();
      resolve(field ? (ok ? field.value : null) : ok);
    };
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
      if (event.key === 'Tab') {
        const buttons = [...(field?[field]:[]),...(confirm?[cancel,accept]:[accept])];
        const next = buttons[(buttons.indexOf(document.activeElement) + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length];
        event.preventDefault(); next.focus();
      }
    };
    const watch = setInterval(() => { if (!overlay.isConnected || !valid()) finish(false); }, 125);
    accept.addEventListener('click', () => finish(true)); cancel.addEventListener('click', () => finish(false));
    active = { overlay, finish }; document.addEventListener('keydown', keydown, true);
    document.body.append(overlay); (field || (confirm ? cancel : accept)).focus();
  });
}

// Same focus/escape/lifetime as confirmations; replaces native window.prompt.
export function showGamePrompt(message, options = {}) {
  return showGameDialog(message,{...options,confirm:true,input:options.input||{}});
}

// Same shared modal and buttons as confirmations; only the action layout differs.
export function showGameChoice({id,title,message,choices,closeLabel='Cerrar',cancelValue=null,valid=()=>true}){
  closeGameDialog();styles();
  const previousFocus=document.activeElement,overlay=document.createElement('div');overlay.className='gy-modal-overlay arg-game-dialog arg-game-choice';if(id)overlay.id=id;
  const panel=document.createElement('section');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
  const heading=document.createElement('h2');heading.id=(id||'arg-game-choice')+'-title';heading.textContent=title;panel.setAttribute('aria-labelledby',heading.id);
  const copy=document.createElement('p');copy.textContent=message;
  const close=document.createElement('button');close.type='button';close.className='arg-game-dialog-close';close.textContent='×';close.setAttribute('aria-label',closeLabel);
  const footer=document.createElement('footer');panel.append(close,heading,copy,footer);overlay.append(panel);
  return new Promise(resolve=>{
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;clearInterval(watch);window.removeEventListener('keydown',keys,true);overlay.remove();if(active?.overlay===overlay)active=null;if(previousFocus?.isConnected)previousFocus.focus?.({preventScroll:true});resolve(valid()&&choices.some(choice=>choice.value===value)?value:cancelValue);};
    const buttons=choices.map(choice=>{const button=document.createElement('button');button.type='button';button.textContent=choice.label;if(choice.id)button.id=choice.id;if(choice.primary)button.dataset.primary='';button.addEventListener('click',()=>finish(choice.value));footer.append(button);return button;});
    close.addEventListener('click',()=>finish(cancelValue));
    const keys=event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finish(cancelValue);}else if(event.key==='Tab'){const nodes=[...buttons,close],i=nodes.indexOf(document.activeElement);event.preventDefault();event.stopImmediatePropagation();nodes[(i+(event.shiftKey?nodes.length-1:1)+nodes.length)%nodes.length].focus();}else event.stopPropagation();};
    const watch=setInterval(()=>{if(!overlay.isConnected||!valid())finish(cancelValue);},125);active={overlay,finish};window.addEventListener('keydown',keys,true);document.body.append(overlay);buttons[0]?.focus();
  });
}
