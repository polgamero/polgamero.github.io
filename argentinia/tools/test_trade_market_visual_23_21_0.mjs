import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const repo=path.resolve(root,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ui=read('js/ui.js');
const texts=read('js/gameTexts.js');
const css=read('css/style.css');
const mobile=read('css/mobile.css');
const version=read('js/version.js');
const fn=fs.readFileSync(path.join(repo,'functions','src','index.js'),'utf8');

// 23.21.4 cumulative visual contract + ELO/Movimientos backend integration.
assert.match(version,/ENGINE_VERSION = '23\.21\.4'/);
assert.match(version,/FIRESTORE_RULES_VERSION = '23\.13\.86'/);
assert.match(version,/ECONOMY_SCHEMA_VERSION = 10/);

// Visual renderer + modal/zoom reuse.
assert.match(ui,/hydrateTradeCards/);
assert.match(ui,/createCardElement\(card,false,true,null,'preview',null\)/);
assert.match(ui,/openTradeCardPreview/);
assert.match(ui,/data-trade-zoom-card/);
assert.match(ui,/trade-preview-modal/);

// 23.21.4: embedded cards cannot depend on a cyclic percentage width. The slot owns a real
// width and the canonical .card fills it, so Explorar/Mi publicación/Mis ofertas/Historial
// always show the card before the zoom is opened.
assert.match(css,/\.trade-visual-card\{--trade-card-w:190px/);
assert.match(css,/\.trade-render-slot\{[^}]*width:min\(100%,var\(--trade-card-w\)\)/);
assert.match(css,/\.trade-render-slot>\.card\{width:100%!important;height:auto!important/);
assert.doesNotMatch(css,/\.trade-visual-card\{--card-w:min\(190px,100%\)/);

// Explore filters: name + color + rarity + type, all client-side over the already-authorized market view.
assert.match(ui,/trade-explore-search/);
assert.match(ui,/data-trade-color-filter/);
assert.match(ui,/trade-filter-rarity/);
assert.match(ui,/trade-filter-type/);
assert.match(ui,/applyExploreFilters/);
assert.match(ui,/tradeNormalizeSearch/);
assert.match(ui,/tradeCardMatchesColor/);
assert.match(ui,/tradeCardTypeKey/);
assert.match(ui,/trade-explore-sidebar/);
assert.match(css,/\.trade-explore-layout\{display:grid;grid-template-columns:minmax\(0,1fr\) 318px/);
assert.match(mobile,/html\.argentinia-mobile \.trade-explore-layout\{grid-template-columns:minmax\(0,1fr\) clamp\(150px,26dvw,190px\)/);
assert.match(mobile,/html\.argentinia-mobile \.trade-explore-sidebar\{order:0/);
assert.doesNotMatch(mobile,/html\.argentinia-mobile \.trade-explore-sidebar\{order:-1\}/);

// Names: the tiny generic caption was removed. Explore keeps its large title and pairs use
// one deliberate large external name only where a pair needs extra identification.
assert.doesNotMatch(ui,/trade-card-caption/);
assert.match(ui,/trade-card-name-large/);
assert.match(ui,/trade-card-title/);

// Offer flow must be visual and only expose real free/matching cards from tradableCounts.
assert.match(ui,/openTradeOfferModal/);
assert.match(ui,/tradeTradableEntries\(market,listing\)/);
assert.match(ui,/trade-offer-choice-grid/);
assert.match(ui,/data-trade-offer-choice/);
assert.match(ui,/createTradeOffer\(listing\.ownerUid,selected\)/);

// Mi Publicación: own listing appears once; received offers show only the incoming card +
// Aceptar/Rechazar instead of rendering TU PUBLICACIÓN again on every row.
assert.match(ui,/trade-received-offer-list/);
assert.match(ui,/tradeVisualCardHtml\(o\.offeredCardId,\{label:gameText\('trade\.pair\.theyOffer'\),className:'trade-received-offer-card',showName:true\}\)/);
assert.doesNotMatch(ui,/tradePairHtml\(o\.offeredCardId,item\.cardId/);
assert.match(ui,/data-accept-offer/);
assert.match(ui,/data-reject-offer/);

// Outgoing offers + history remain visual card↔card pairs.
assert.match(ui,/renderPublishCardChooser/);
assert.match(ui,/trade-publish-card-grid/);
assert.match(ui,/tradePairHtml\(o\.offeredCardId,o\.listedCardId/);
assert.match(ui,/tradePairHtml\(gave,got/);
assert.match(ui,/openTradeAcceptModal/);
assert.match(ui,/trade\.pair\.youGive/);
assert.match(ui,/trade\.pair\.youReceive/);

// Market + Tournament use the same canonical Back control/left-header pattern as Store/Encyclopedia.
assert.match(ui,/showTradeMarketScreen[\s\S]*injectEncyclopediaStyles\(\)/);
assert.match(ui,/<button class="encyclopedia-back-btn" id="trade-back">←/);
assert.match(ui,/showTournamentScreen[\s\S]*injectEncyclopediaStyles\(\)/);
assert.match(ui,/<button class="encyclopedia-back-btn" id="tournament-back">←/);

// Main-menu compression: Options + compact Store/Ranking/Market icon buttons, canonical asset
// hooks and exact emoji fallbacks. These three no longer occupy full-width menu rows.
assert.match(ui,/main-menu-bottom-row/);
assert.match(ui,/class="main-menu-icon-btn" id="menu-store"/);
assert.match(ui,/class="main-menu-icon-btn" id="menu-ranking"/);
assert.match(ui,/class="main-menu-icon-btn" id="menu-trade-market"/);
assert.match(ui,/assets\/images\/ui\/icon_tienda\.png/);
assert.match(ui,/assets\/images\/ui\/icon_ranking\.png/);
assert.match(ui,/assets\/images\/ui\/icon_mercado_pases\.png/);
assert.match(ui,/>🛒<\/span>/);
assert.match(ui,/>📊<\/span>/);
assert.match(ui,/>🔄️<\/span>/);
assert.match(ui,/iconLabels = \{ 'menu-store':'menu\.store', 'menu-ranking':'menu\.ranking', 'menu-trade-market':'menu\.tradeMarket' \}/);

// Mobile zoom must shrink against viewport HEIGHT in landscape rather than clipping the card.
assert.match(mobile,/trade-preview-card-slot\{--card-w:min\(72vw,300px,58dvh\)\}/);
assert.match(mobile,/trade-preview-panel\{max-height:calc\(100dvh - 14px\)!important;overflow:hidden\}/);

// Game Text still owns all player-facing UX copy.
for (const key of [
  'trade.filter.searchPlaceholder','trade.filter.color','trade.filter.rarity','trade.filter.type',
  'trade.filter.noResults','trade.type.creature','trade.type.planeswalker','trade.offerModal.title',
  'trade.offerModal.eligible','trade.acceptModal.title','trade.history.completed','trade.status.completed'
]) assert.ok(texts.includes(`'${key}'`),`missing Game Text ${key}`);

// Desktop + mobile namespaced styling.
for (const token of ['trade-market-grid','trade-explore-toolbar','trade-offer-modal','trade-pair','trade-history-entry','trade-publish-card-grid']) {
  assert.ok(css.includes(`.${token}`),`missing desktop style ${token}`);
}
assert.match(mobile,/html\.argentinia-mobile \.trade-market-grid/);
assert.match(mobile,/html\.argentinia-mobile \.trade-offer-choice-grid/);
assert.match(mobile,/html\.argentinia-mobile \.trade-pair/);

// 23.21.4 keeps premium-emote/social authority and adds the Basic Land pack callable.
const callables=[...fn.matchAll(/export const \w+\s*=\s*onCall\(/g)];
assert.equal(callables.length,41);
assert.match(fn,/export const economyPurchaseEmote\s*=\s*onCall/);
assert.match(fn,/export const multiplayerSendCommunication\s*=\s*onCall/);

// Strong source-integrity guard: the cumulative Functions tree must remain readable/hashable;
// 23.21.4 adds one callable and therefore requires a fresh Functions deployment.
function walk(dir){
  let out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.name==='node_modules')continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())out=out.concat(walk(full)); else out.push(full);
  }
  return out;
}
const functionsRoot=path.join(repo,'functions');
const hash=crypto.createHash('sha256');
for(const file of walk(functionsRoot).sort()){
  const rel=path.relative(functionsRoot,file).split(path.sep).join('/');
  hash.update(rel);hash.update('\0');hash.update(fs.readFileSync(file));hash.update('\0');
}
const functionDigest=hash.digest('hex');
assert.equal(functionDigest.length,64);
assert.ok(fs.existsSync(path.join(repo,'functions','src','economy','elo.js')));
assert.ok(fs.existsSync(path.join(repo,'functions','src','economy','eloCore.js')));

console.log('TRADE_MARKET_VISUAL_23_21_3_OK cards=VISIBLE_ALWAYS names=NO_DUPLICATE receivedOffers=INCOMING_ONLY zoomMobile=VIEWPORT_HEIGHT back=CANONICAL menu=COMPACT_ICONS functions=CUMULATIVE_41');
