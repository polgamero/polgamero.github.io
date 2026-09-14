import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const audit = read('../../functions/src/economy/audit.js');
const constants = read('../../functions/src/shared/constants.js');
const ranking = read('../js/rankingUI.js');
const tradeCore = read('../../functions/src/economy/tradeCore.js');
const trade = read('../../functions/src/economy/trade.js');
const fn = read('../../functions/src/index.js');
const store = read('../js/store.js');
const ui = read('../js/ui.js');
const bot = read('../js/bot.js');
const turn = read('../js/turnManager.js');

// Admin ranking exclusion: authority is the canonical server email, never a username.
assert.match(constants, /ADMIN_EMAIL = 'pablogamero1@gmail\.com'/);
assert.match(audit, /excludeFromGlobalRanking:String\(profile\.email\|\|''\)\.trim\(\)\.toLowerCase\(\) === ADMIN_EMAIL/);
assert.doesNotMatch(audit, /email:\s*String\(profile\.email/);
assert.match(ranking, /filter\(row=>row\?\.excludeFromGlobalRanking !== true\)/);
assert.doesNotMatch(ranking, /_Admin|_admin/);

// Bot cannot act while an interactive resolution is paused, including stale timers.
assert.match(bot, /hasBotInteractiveResolutionPending/);
assert.match(bot, /pendingCounterUnlessPay \|\| state\.pendingScrySurveilChoice \|\| state\.pendingProliferateChoice/);
assert.match(bot, /Re-check after thinking/);
assert.match(turn, /hasSoloInteractiveResolutionPending/);
assert.match(turn, /setTimeout\(\(\) => \{/);

// Store/Cofre cards center content in the remaining height and pin CTA to the bottom.
assert.match(ui, /\.chest-item-content \{ flex:1 1 auto; min-height:0; width:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; \}/);
assert.match(ui, /\.chest-item > \.reward-action-btn \{ flex:0 0 auto; margin-top:12px; \}/);
assert.match(ui, /<div class="chest-item-content"><div class="chest-item-icon">\$\{PACK_ICON_HTML\}/);

// Trade active-listing count is admin-configurable, bounded server-side, and listing-addressed.
assert.match(tradeCore, /maxActiveListings: 1/);
assert.match(tradeCore, /maxActiveListings: 10/);
assert.match(tradeCore, /activeListingIds/);
assert.match(tradeCore, /addActiveListing/);
assert.match(tradeCore, /removeActiveListing/);
assert.match(store, /tradeMaxActiveListings: 1/);
assert.match(ui, /id: 'tradeMaxActiveListings'/);
assert.match(ui, /Máximo de publicaciones activas por jugador · 1–10/);
assert.match(trade, /listingRefById/);
assert.match(trade, /ownListings:ownPublic/);
assert.match(trade, /limits\.maxActiveListings/);
assert.match(fn, /'listingOwnerUid','listingId','cardId'/);
assert.match(ui, /createTradeOffer\(listing\.ownerUid,listing\.listingId,selected\)/);

console.log('HF5_PREDEPLOY_FIXES_23_21_6_OK admin=email bot=pending-resolution store=bottom-cta trade=multi-listing');
