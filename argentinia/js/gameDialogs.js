// Game-owned dialogs. No native blocking browser dialogs or lazy style dependency.
let active = null;
function styles() {
  if (document.getElementById('arg-game-dialog-styles')) return;
  const style = document.createElement('style');
  style.id = 'arg-game-dialog-styles';
  style.textContent = `.arg-game-dialog{position:fixed;inset:0;z-index:100100;display:grid;place-items:center;padding:16px;background:#000b}.arg-game-dialog>section{box-sizing:border-box;width:min(100%,480px);max-height:85dvh;overflow:auto;padding:22px;border:2px solid #d4af37;border-radius:14px;background:#0c1811;color:#f0e0b0;font:16px/1.5 system-ui,sans-serif;box-shadow:0 15px 60px #000}.arg-game-dialog h2{margin:0 0 12px;font-size:21px}.arg-game-dialog p{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 20px}.arg-game-dialog footer{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}.arg-game-dialog button{min-height:44px;padding:9px 18px;border:1px solid #d4af37;border-radius:8px;background:#29351a;color:#fff0c8;font:700 15px system-ui;cursor:pointer}.arg-game-dialog button:focus-visible{outline:3px solid #a7e4ff;outline-offset:3px}`;
  document.head.append(style);
}
export function closeGameDialog() { active?.finish(false); }
export function showGameDialog(message, { title = 'Argentinia', confirm = false, acceptLabel = 'Entendido', valid = () => true } = {}) {
  closeGameDialog(); styles();
  const previousFocus = document.activeElement;
  const overlay = document.createElement('div'); overlay.className = 'gy-modal-overlay arg-game-dialog';
  const panel = document.createElement('section'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
  const heading = document.createElement('h2'); heading.id = 'arg-game-dialog-title'; heading.textContent = title;
  panel.setAttribute('aria-labelledby', heading.id);
  const copy = document.createElement('p'); copy.textContent = String(message ?? '');
  const actions = document.createElement('footer');
  const accept = document.createElement('button'); accept.type = 'button'; accept.textContent = acceptLabel;
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancelar';
  panel.append(heading, copy, actions); if (confirm) actions.append(cancel); actions.append(accept); overlay.append(panel);
  return new Promise(resolve => {
    let settled = false;
    const finish = accepted => {
      if (settled) return; settled = true;
      clearInterval(watch); document.removeEventListener('keydown', keydown, true); overlay.remove();
      if (active?.overlay === overlay) active = null;
      if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
      resolve(accepted === true && valid());
    };
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
      if (event.key === 'Tab') {
        const buttons = confirm ? [cancel, accept] : [accept];
        const next = buttons[(buttons.indexOf(document.activeElement) + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length];
        event.preventDefault(); next.focus();
      }
    };
    const watch = setInterval(() => { if (!valid()) finish(false); }, 125);
    accept.addEventListener('click', () => finish(true)); cancel.addEventListener('click', () => finish(false));
    active = { overlay, finish }; document.addEventListener('keydown', keydown, true);
    document.body.append(overlay); (confirm ? cancel : accept).focus();
  });
}
