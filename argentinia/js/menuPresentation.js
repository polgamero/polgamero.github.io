import { installMenuNavigation } from './menuNavigation.js';
// Menu-only presentation. No rules, economy actions, Auth or network access.
const ICONS = ['play','tournament','multiplayer','decks','chest','workshop','encyclopedia','store','market','ranking','daily','sanctuary','achievements','support','options','more'];
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const newsCaption = value => String(value ?? '').replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u,'');

export function menuIcon(name) {
  const utility = ['today','news','achievements'].indexOf(name);
  if (utility >= 0) return `<span class="arg-menu-icon arg-menu-utility-icon" aria-hidden="true" style="--utility-x:${utility * 50}%"></span>`;
  const index = Math.max(0, ICONS.indexOf(name));
  return `<span class="arg-menu-icon" aria-hidden="true" style="--icon-x:${(index % 4) * 100 / 3}%;--icon-y:${Math.floor(index / 4) * 100 / 7}%;--icon-mobile-y:${(Math.floor(index / 4) + 4) * 100 / 7}%"></span>`;
}

function button(id, icon, label, key = '', extra = '') {
  return `<button type="button" id="${id}" class="arg-menu-button" ${extra}>${menuIcon(icon)}<span data-menu-label${key ? ` data-menu-text="${key}"` : ''}>${escape(label)}</span></button>`;
}

export function mainMenuMarkup(t) {
  const mode = (id, icon, key, subtitle, primary = false) => `<button type="button" id="${id}" class="arg-menu-mode arg-menu-frame${primary ? ' arg-menu-primary' : ''}">${menuIcon(icon)}<span class="arg-menu-mode-copy"><span data-menu-label data-menu-text="${key}">${escape(t(key))}</span><span class="arg-menu-subtitle" data-menu-text="${subtitle}">${escape(t(subtitle))}</span></span><img class="arg-menu-mode-art${primary ? ' arg-menu-tano' : ''}" src="./assets/images/menu/${primary ? 'tano' : icon}.webp" alt="" aria-hidden="true"></button>`;
  return `
    <div id="arg-menu-utility-slot" class="arg-menu-utility-slot"></div>
    <header class="arg-menu-header">
      <div id="main-menu-account" class="arg-menu-account"></div>
      <div class="arg-menu-brand" aria-label="Argentinia — Magia y leyenda">
        <img class="arg-menu-logo" src="./assets/images/ui/logo.png" alt="Argentinia — Magia y leyenda" onload="this.parentElement.classList.add('has-original-logo')" onerror="this.hidden=true">
        <div class="arg-menu-wordmark" aria-hidden="true">ARGENTINIA<span>MAGIA Y LEYENDA</span></div>
      </div>
      <div class="arg-menu-hud"><div id="arg-menu-wallet-slot"></div><div class="arg-menu-tools"><div id="arg-menu-support-slot"></div>${button('menu-options','options',t('menu.options'),'menu.options')}</div></div>
    </header>
    <main class="arg-menu-body">
      <section class="arg-menu-modes" aria-label="${escape(t('menu.redesign.playModes'))}">
        ${mode('menu-play','play','menu.play','menu.redesign.playSubtitle',true)}
        ${mode('menu-tournament','tournament','menu.tournament','menu.redesign.tournamentSubtitle')}
        ${mode('menu-multiplayer','multiplayer','menu.multiplayer','menu.redesign.multiplayerSubtitle')}
        
      </section>
      <aside class="arg-menu-aside">
        <section class="arg-menu-panel arg-menu-frame arg-menu-today"><button type="button" id="menu-today-toggle" class="arg-menu-panel-toggle" aria-expanded="false" aria-controls="arg-menu-today-content">${menuIcon('today')}<span data-menu-text="menu.redesign.today">${escape(t('menu.redesign.today'))}</span><span class="arg-menu-today-notice" role="img" aria-label="${escape(t('menu.redesign.ready'))}">!</span><span class="arg-menu-chevron" aria-hidden="true"></span></button><div id="arg-menu-today-content" hidden><div id="arg-menu-today-actions"></div><div id="main-menu-active-events" class="arg-menu-events"></div></div></section>
        <section class="arg-menu-panel arg-menu-frame" id="main-menu-news"><button type="button" id="menu-news-toggle" class="arg-menu-panel-toggle" aria-expanded="false" aria-controls="main-menu-news-list">${menuIcon('news')}<span class="main-menu-news-title" data-menu-text="menu.news.title">${escape(newsCaption(t('menu.news.title')))}</span><span class="arg-menu-chevron" aria-hidden="true"></span></button><div id="main-menu-news-list" class="arg-menu-news-list" hidden><div class="main-menu-news-empty">${escape(t('menu.news.loading'))}</div></div></section>
        ${button('menu-how-to-play','more',t('manual.menu.link'),'manual.menu.link')}
      </aside>
    </main>
    <nav class="arg-menu-dock arg-menu-frame" aria-label="${escape(t('menu.redesign.places'))}">
      ${button('menu-mydecks','decks',t('menu.myDecks'),'menu.myDecks')}
      <div id="arg-menu-chest-slot" class="arg-menu-place-slot"></div><div id="arg-menu-workshop-slot" class="arg-menu-place-slot"></div>
      ${button('menu-encyclopedia','encyclopedia',t('menu.encyclopedia'),'menu.encyclopedia')}
      <div id="arg-menu-extra-places" class="arg-menu-extra-places" tabindex="-1" aria-label="${escape(t('menu.redesign.morePlaces'))}">
        ${button('menu-store','store',t('menu.store'),'menu.store')}${button('menu-trade-market','market',t('menu.tradeMarket'),'menu.tradeMarket')}${button('menu-ranking','ranking',t('menu.ranking'),'menu.ranking')}
        <button type="button" id="menu-close-places" class="arg-menu-close" aria-label="${escape(t('common.close'))}">×</button>
      </div>
      ${button('menu-more-places','more',t('menu.redesign.morePlaces'),'menu.redesign.morePlaces','aria-expanded="false" aria-controls="arg-menu-extra-places"')}
    </nav>
    <button type="button" id="menu-places-backdrop" class="arg-menu-places-backdrop" tabindex="-1" aria-label="${escape(t('common.close'))}" hidden></button>`;
}

export function resetMenuAccountPorts(container) {
  const menu = container?.closest('.arg-menu-v2');
  if (!menu) return;
  container.__accountExpanded = !!container.querySelector('details[open]');
  const active = document.activeElement?.closest?.('button');
  container.__accountFocus = active && ['menu-public-profile','menu-chest','menu-workshop','menu-daily-rewards','menu-sanctuary','menu-achievements','menu-moderation','menu-logout','menu-admin'].includes(active.id) ? active.id : '';
  for (const id of ['arg-menu-wallet-slot','arg-menu-support-slot','arg-menu-chest-slot','arg-menu-workshop-slot','arg-menu-today-actions']) menu.querySelector(`#${id}`)?.replaceChildren();
}

function dressButton(el, icon, label, status = '') {
  if (!el) return;
  const badges = [...el.querySelectorAll('.main-menu-reward-badge')];
  el.className = 'arg-menu-button';
  el.innerHTML = `${menuIcon(icon)}<span class="arg-menu-action-copy"><span data-menu-label>${escape(label)}</span>${status ? `<span class="arg-menu-action-status">${escape(status)}</span>` : ''}</span>`;
  el.append(...badges);
  el.setAttribute('aria-label', label);
  el.title = label;
}

export function presentMenuAccount(container, user, { profile, name, admin, t, dailyCount = 0 } = {}) {
  const menu = container?.closest('.arg-menu-v2');
  if (!menu) return;
  const port = id => menu.querySelector(`#${id}`);
  const move = (id, slot, icon, label, status = '') => {
    const el = container.querySelector(`#${id}`);
    dressButton(el, icon, label, status);
    if (el) port(slot)?.append(el);
    return el;
  };
  if (user) {
    const wallet = container.querySelector('.main-menu-account-wallet');
    if (wallet) {
      wallet.className = 'arg-menu-wallet arg-menu-frame';
      const labels = [t('menu.redesign.points'),t('menu.redesign.tokens'),t('menu.redesign.essence')];
      [...wallet.children].forEach((item,i) => {
        item.className = 'arg-menu-resource';
        // Preserve the official currency artwork and authoritative amounts.
        const amount = item.querySelector('strong')?.textContent || '0';
        item.innerHTML = `<img class="arg-menu-resource-icon" src="./assets/images/ui/${['moneda','ficha','esencia'][i]}.png" alt="" aria-hidden="true"><span><strong>${escape(amount)}</strong><span class="arg-menu-resource-label">${escape(labels[i])}</span></span>`;
        item.setAttribute('aria-label', `${labels[i]}: ${amount}`);
      });
      port('arg-menu-wallet-slot').append(wallet);
    }
    const profileButton = container.querySelector('#menu-public-profile');
    const logout = container.querySelector('#menu-logout'), adminButton = container.querySelector('#menu-admin');
    move('menu-chest','arg-menu-chest-slot','chest',t('menu.redesign.chest'));
    move('menu-workshop','arg-menu-workshop-slot','workshop',t('menu.redesign.workshop'));
    const daily = move('menu-daily-rewards','arg-menu-today-actions','daily',t('menu.redesign.daily'),profile ? (dailyCount ? t('menu.redesign.ready') : t('menu.redesign.viewCalendar')) : t('common.loading'));
    if (dailyCount && daily) daily.classList.add('has-reward');
    move('menu-sanctuary','arg-menu-today-actions','sanctuary',t('sanctuary.menu.title'),t('menu.redesign.discover'));
    move('menu-achievements','arg-menu-today-actions','achievements',t('menu.redesign.achievements'),t('menu.redesign.viewGoals'));
    move('menu-moderation','arg-menu-support-slot','support',t('menu.redesign.support'));
    if (profileButton) {
      profileButton.className = 'arg-menu-profile arg-menu-frame';
      profileButton.innerHTML = `<span class="arg-menu-avatar" aria-hidden="true">✹</span><span class="arg-menu-identity-copy"><span class="arg-menu-player-name"></span><span class="arg-menu-profile-caption">${escape(t('menu.redesign.profile'))}</span></span>`;
      profileButton.querySelector('.arg-menu-player-name').textContent = name;
      profileButton.title = name;
      profileButton.setAttribute('aria-label', `${name} · ${t('menu.redesign.profile')}`);
      if (user.photoURL) {
        const image = document.createElement('img');image.alt = '';image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => image.remove(), {once:true});image.src = user.photoURL;
        profileButton.querySelector('.arg-menu-avatar').append(image);
      }
    }
    if (admin && adminButton) {
      const details = document.createElement('details');details.className = 'arg-menu-account-details';details.open = container.__accountExpanded;
      details.innerHTML = `<summary>${escape(t('menu.redesign.account'))}<span class="arg-menu-chevron" aria-hidden="true"></span></summary><div class="arg-menu-account-popover arg-menu-frame"></div>`;
      const actions = details.querySelector('div');
      adminButton.className = 'arg-menu-account-action';actions.append(adminButton);
      if (logout) {logout.className = 'arg-menu-account-action';actions.append(logout);}
      container.replaceChildren(...[profileButton,details].filter(Boolean));
    } else {
      if (logout) {logout.className = 'arg-menu-account-action arg-menu-logout-direct';logout.title = t('account.logout');}
      container.replaceChildren(...[profileButton,logout].filter(Boolean));
    }
  } else {
    const guest = document.createElement('div');guest.className = 'arg-menu-guest';
    guest.textContent = t('menu.redesign.guest');container.prepend(guest);
    for (const [id,slot,icon,label] of [['menu-chest','arg-menu-chest-slot','chest',t('menu.redesign.chest')],['menu-workshop','arg-menu-workshop-slot','workshop',t('menu.redesign.workshop')]]) {
      const el = document.createElement('button');el.id = id;el.type = 'button';dressButton(el,icon,label);
      el.setAttribute('aria-disabled','true');el.classList.add('main-menu-btn-disabled');
      el.addEventListener('click',()=>container.querySelector('#menu-login')?.focus());port(slot).append(el);
    }
    const help = document.createElement('button');help.id = 'menu-moderation';help.type = 'button';dressButton(help,'support',t('menu.redesign.support'));
    help.addEventListener('click',()=>{menu.__setMenuPanel?.('menu-today-toggle',true);container.querySelector('#menu-login')?.focus();});
    port('arg-menu-support-slot').append(help);
    const note = document.createElement('p');note.className = 'arg-menu-login-note';note.textContent = t('menu.redesign.loginActivities');port('arg-menu-today-actions').append(note);
  }
  const restore = container.__accountFocus && menu.querySelector(`#${container.__accountFocus}`);
  if (restore && restore.getClientRects().length) restore.focus({preventScroll:true});
}

export function refreshMenuCopy(menu, t) {
  menu.querySelectorAll('[data-menu-text]').forEach(el => {const value=t(el.dataset.menuText);el.textContent = el.dataset.menuText === 'menu.news.title' ? newsCaption(value) : value;});
}

export function bindMenuPresentation(menu) {
  installMenuNavigation();
  const compact = matchMedia('(max-width: 1050px), (max-height: 600px)');
  const more = menu.querySelector('#menu-more-places'), tray = menu.querySelector('#arg-menu-extra-places'), backdrop = menu.querySelector('#menu-places-backdrop');
  function closePlaces(restore = true) {
    const wasOpen = menu.classList.contains('places-open');menu.classList.remove('places-open');more.setAttribute('aria-expanded','false');backdrop.hidden=true;tray.removeAttribute('role');tray.removeAttribute('aria-modal');
    if (restore && wasOpen && more.getClientRects().length) more.focus({preventScroll:true});
  }
  more.addEventListener('click',()=>{
    if (menu.classList.contains('places-open')) return closePlaces();
    menu.classList.add('places-open');more.setAttribute('aria-expanded','true');backdrop.hidden=false;tray.setAttribute('role','dialog');tray.setAttribute('aria-modal','true');
    tray.querySelector('button')?.focus({preventScroll:true});
  });
  backdrop.addEventListener('click',()=>closePlaces());menu.querySelector('#menu-close-places').addEventListener('click',()=>closePlaces());
  const panelIds = ['menu-today-toggle','menu-news-toggle'];
  function setPanel(id, open, persist = true) {
    for (const panelId of panelIds) {
      const toggle = menu.querySelector('#'+panelId);
      const content = menu.querySelector('#'+toggle.getAttribute('aria-controls'));
      const expanded = panelId === id ? open : (open ? false : toggle.getAttribute('aria-expanded') === 'true');
      toggle.setAttribute('aria-expanded',String(expanded));content.hidden = !expanded;
      if (persist) try {localStorage.setItem('argentinia:menu-v2:'+panelId,expanded?'open':'closed');}catch{}
    }
  }
  menu.__setMenuPanel = setPanel;
  let initialPanel = '';
  for (const id of panelIds) {
    const toggle = menu.querySelector('#'+id);
    let stored = null;try {stored = localStorage.getItem('argentinia:menu-v2:'+id);}catch{}
    if (stored === 'open' || (stored === null && id === 'menu-today-toggle' && !compact.matches)) initialPanel = id;
    toggle.addEventListener('click',()=>setPanel(id,toggle.getAttribute('aria-expanded') !== 'true'));
  }
  if (initialPanel) setPanel(initialPanel,true,false);
  // Keep the original callbacks. Close only the presentation tray before a destination opens.
  menu.addEventListener('click',event=>{
    const button = event.target.closest('button');
    if (menu.classList.contains('places-open') && !tray.contains(event.target) && button !== more) {
      event.preventDefault();event.stopPropagation();closePlaces();return;
    }
    if (button && tray.contains(button) && button.id !== 'menu-close-places') closePlaces(false);
    if (button && !button.closest('.arg-menu-account-details')) menu.querySelector('.arg-menu-account-details')?.removeAttribute('open');
  },true);
  menu.addEventListener('keydown',event=>{
    if (event.key === 'Escape') {
      if (menu.classList.contains('places-open')) {event.preventDefault();event.stopPropagation();closePlaces();}
      else { const account = menu.querySelector('.arg-menu-account-details[open]'); if(account) {account.removeAttribute('open');account.querySelector('summary')?.focus();} }
    }
    if (event.key === 'Tab' && menu.classList.contains('places-open')) {
      const buttons=[...tray.querySelectorAll('button')].filter(el=>el.getClientRects().length),first=buttons[0],last=buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) {event.preventDefault();last?.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first?.focus();}
    }
  });
  // A resize must never leave a modal backdrop over the desktop places bar.
  const onResize = () => {if (!compact.matches) closePlaces(false);};
  compact.addEventListener('change',onResize);
  const observer = new MutationObserver(()=>{if (!menu.isConnected) {compact.removeEventListener('change',onResize);observer.disconnect();}});
  observer.observe(menu.parentNode,{childList:true});
}
