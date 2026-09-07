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
const fn=fs.readFileSync(path.join(repo,'functions','src','index.js'),'utf8');

// Visual renderer + modal/zoom reuse.
assert.match(ui,/hydrateTradeCards/);
assert.match(ui,/createCardElement\(card,false,true,null,'preview',null\)/);
assert.match(ui,/openTradeCardPreview/);
assert.match(ui,/data-trade-zoom-card/);
assert.match(ui,/trade-preview-modal/);

// Explore filters: name + color + rarity + type, all client-side over the already-authorized market view.
assert.match(ui,/trade-explore-search/);
assert.match(ui,/data-trade-color-filter/);
assert.match(ui,/trade-filter-rarity/);
assert.match(ui,/trade-filter-type/);
assert.match(ui,/applyExploreFilters/);
assert.match(ui,/tradeNormalizeSearch/);
assert.match(ui,/tradeCardMatchesColor/);
assert.match(ui,/tradeCardTypeKey/);

// Offer flow must be visual and only expose real free/matching cards from tradableCounts.
assert.match(ui,/openTradeOfferModal/);
assert.match(ui,/tradeTradableEntries\(market,listing\)/);
assert.match(ui,/trade-offer-choice-grid/);
assert.match(ui,/data-trade-offer-choice/);
assert.match(ui,/createTradeOffer\(listing\.ownerUid,selected\)/);

// Publication, received offers, outgoing offers, and history all render actual card pairs.
assert.match(ui,/renderPublishCardChooser/);
assert.match(ui,/trade-publish-card-grid/);
assert.match(ui,/tradePairHtml\(o\.offeredCardId,item\.cardId/);
assert.match(ui,/tradePairHtml\(o\.offeredCardId,o\.listedCardId/);
assert.match(ui,/tradePairHtml\(gave,got/);
assert.match(ui,/openTradeAcceptModal/);
assert.match(ui,/trade\.pair\.youGive/);
assert.match(ui,/trade\.pair\.youReceive/);

// Game Text owns all new player-facing UX copy.
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

// No extra callable: RC2 is frontend-only.
const callables=[...fn.matchAll(/export const \w+\s*=\s*onCall\(/g)];
assert.equal(callables.length,37);

// Strong byte-parity guard: the whole functions/ tree must remain the exact backend candidate
// that passed Gate05 + Gate07 and was deployed before this visual RC2.
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
assert.equal(hash.digest('hex'),'eefdec575ec64b97e4a3cbf96e066a9fd2a1a2d8b1c222163cd6f63d88a0b6d5');

console.log('TRADE_MARKET_VISUAL_23_21_0_RC2_OK filters=NAME_COLOR_RARITY_TYPE cards=CANONICAL_RENDERER offerModal=VISUAL pairs=VISUAL zoom=PASS mobile=PASS functions=BYTE_IDENTICAL_37');
