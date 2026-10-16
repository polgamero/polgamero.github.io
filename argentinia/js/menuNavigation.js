// Presentation only: one navigation row, retaining each screen's original button/listener.
const BACK = '#chest-back,#daily-rewards-back,#enc-back,#store-back,#sanctuary-back,#workshop-back,#deckbuilder-cancel,#mydecks-back,#playpicker-back,#moderation-center-back,#achievements-back,#admin-back,#mp-back,#tournament-back,#trade-back,#ranking-back,#opt-back,#deckselect-back,.public-profile-back';
const SCREENS = '#chest-overlay,#daily-rewards-overlay,#encyclopedia-overlay,#store-overlay,#sanctuary-overlay,#workshop-overlay,#deckbuilder-overlay,#mydecks-overlay,#moderation-center-overlay,#achievements-overlay,#admin-panel-overlay,#multiplayer-overlay,#tournament-overlay,#trade-market-overlay,#global-ranking-overlay,#options-menu-overlay,#deck-select-overlay,#public-profile-overlay';
let installed = false;

export function installMenuNavigation() {
  if (installed || typeof document === 'undefined' || !document.body) return;
  installed = true;
  const watched = new Map();
  let frame = 0, panelRef = null;
  function schedule() { if (!frame) frame = requestAnimationFrame(refresh); }
  function refresh() {
    frame = 0;
    for (const [root,observer] of watched) if (!root.isConnected) {observer.disconnect();watched.delete(root);}
    const screens = [...document.querySelectorAll(SCREENS)];
    for (const root of screens) {
      if (!watched.has(root)) {
        const observer = new MutationObserver(schedule);
        observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class','hidden']});
        watched.set(root,observer);
      }
      const candidates = [...root.querySelectorAll(BACK)];
      const fresh = candidates.find(button=>!button.closest('.arg-screen-navigation'));
      let row = root.querySelector(':scope > .arg-screen-navigation');
      if (fresh) {
        if (!row) {row=document.createElement('div');row.className='arg-screen-navigation';root.prepend(row);}
        row.querySelector('.arg-screen-back')?.remove();
        fresh.classList.add('arg-screen-back');row.prepend(fresh);
        root.classList.add('arg-screen-shell');
      }
    }
    const visible = screens.filter(root=>root.getClientRects().length && getComputedStyle(root).visibility !== 'hidden');
    visible.sort((a,b)=>(Number(getComputedStyle(a).zIndex)||0)-(Number(getComputedStyle(b).zIndex)||0));
    const top = visible.at(-1);
    const menu = document.querySelector('#main-menu-overlay.arg-menu-v2');
    const surface = top ? 'screen' : (menu?.getClientRects().length ? 'main' : '');
    if (document.documentElement.dataset.argMenuSurface !== surface) document.documentElement.dataset.argMenuSurface = surface;
    // A destination's removal also detaches its utility row; preserve the same panel.
    const panel = document.getElementById('argentinia-telemetry-panel') || panelRef;
    if (panel) panelRef = panel;
    const slot = top?.querySelector(':scope > .arg-screen-navigation') || (menu?.getClientRects().length ? menu.querySelector('#arg-menu-utility-slot') : null);
    if (panel && slot && panel.parentElement !== slot) slot.append(panel);
    else if (panel && !slot && panel.parentElement !== document.body) document.body.append(panel);
  }
  new MutationObserver(schedule).observe(document.body,{childList:true});
  // The main menu is hidden/restored instead of recreated for most destinations.
  const menuObserver = new MutationObserver(schedule);
  function watchMenu() {
    menuObserver.disconnect();
    const menu = document.getElementById('main-menu-overlay');
    if (menu) menuObserver.observe(menu,{attributes:true,attributeFilter:['style','class']});
  }
  new MutationObserver(()=>{watchMenu();schedule();}).observe(document.body,{childList:true});
  watchMenu();schedule();
}
