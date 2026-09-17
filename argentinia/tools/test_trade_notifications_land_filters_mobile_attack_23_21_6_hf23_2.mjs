import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const ui=read('js/ui.js');
const main=read('js/main.js');
const mobileCss=read('css/mobile.css');
const animationDirector=read('js/animationDirector.js');
const texts=read('js/gameTexts.js');
const functionsIndex=read('../functions/src/index.js');
const trade=read('../functions/src/economy/trade.js');
const tradeCore=read('../functions/src/economy/tradeCore.js');
const community=read('../functions/src/community/community.js');
const manifest=JSON.parse(read('build-manifest.json'));

assert.equal([...functionsIndex.matchAll(/export const \w+\s*=\s*onCall\(/g)].length,42,'HF23.2 reuses Community callable; Functions remain 42');
assert.equal(manifest.functionsCount,42);

// Persistent market outcomes are authored server-side for every terminal owner action.
assert.match(trade,/writeTradeNotificationTx\(tx,db,offer,'rejected',nowMs,'owner_rejected'\)/);
assert.match(trade,/writeTradeNotificationTx\(tx,db,accepted,'accepted',nowMs,'owner_accepted'\)/);
assert.match(trade,/writeTradeNotificationTx\(tx,db,other\.data,'rejected',nowMs,'listing_completed'\)/);
assert.match(community,/getPendingTradeNotifications/);
assert.match(community,/acknowledgeTradeNotification/);
assert.match(functionsIndex,/action === 'trade_notifications'/);
assert.match(functionsIndex,/action === 'ack_trade_notification'/);
assert.match(ui,/export async function showTradeNotificationsAtBoot/);
assert.match(ui,/await acknowledgeTradeNotification\(id\)/,'notification is ACKed only by close flow');
assert.match(texts,/'trade\.notification\.accepted\.title'[\s\S]*'Aceptaron tu oferta'/);
assert.match(texts,/'trade\.notification\.rejected\.title'[\s\S]*'Rechazaron tu oferta'/);
const announcementAt=main.indexOf('await maybeShowAnnouncementPopup');
const moderationAt=main.indexOf('await getCommunityStatus()');
const tradeNoticeAt=main.indexOf('await getPendingTradeNotifications()');
assert.ok(announcementAt>=0 && moderationAt>announcementAt && tradeNoticeAt>moderationAt,'startup overlays serialize announcements -> moderation -> trade notices');

// Receipt-linked disputes: user cannot forge an unrelated trade because server validates receipt participant.
assert.match(functionsIndex,/action === 'trade_dispute'/);
assert.match(community,/tradeReceipts\/\$\{id\}/);
assert.match(community,/uid !== ownerUid && uid !== offererUid/);
assert.match(community,/tradeSnapshot = \{/);
assert.match(ui,/data-open-trade-dispute/);
assert.match(ui,/createTradeDispute\(tradeId,text\)/);
assert.match(texts,/'trade\.history\.dispute'[\s\S]*'ABRIR DISPUTA'/);

// Color filter contract: Lands derive filter colors from produced mana, not card.colors.
assert.match(tradeCore,/export function cardFilterColors\(card\)/);
assert.match(tradeCore,/card\?\.producesOptions/);
assert.match(tradeCore,/return filtered\.length \? filtered : \['C'\]/,'colorless nonlands remain C');
assert.match(ui,/function cardFilterColors\(card\)/);
assert.match(ui,/card\?\.producesOptions/);
assert.match(ui,/cardFilterColors\(card\)\.some\(color => activeColors\.has\(color\)\)/,'shared browser filters use produced colors');
assert.match(ui,/data-trade-card-colors="\$\{escapeHtml\(colors\)\}"/,'market DOM filters use same helper');

// Mobile combat presentation: tapped+attacking state remains vertical; ordinary tapped cards are untouched.
assert.match(mobileCss,/\.card\.tapped\.attacking[\s\S]*aspect-ratio:5 \/ 7 !important;/);
assert.match(mobileCss,/\.card\.tapped\.attacking \.card-inner[\s\S]*transform:none !important;/);
assert.match(mobileCss,/GAME STATE tapped/,'fix is explicitly presentation-only');
// Combat-damage cinematics clone the tapped attacker. Normalize that disposable
// clone too, otherwise the mobile snapshot can be enlarged near the player badge
// with landscape geometry + a second 90deg transform.
assert.match(animationDirector,/const mobileTappedAttacker = snapshot\.kind === 'card'/);
assert.match(animationDirector,/document\.documentElement\?\.classList\?\.contains\('argentinia-mobile'\)/);
assert.match(animationDirector,/clone\.classList\?\.contains\('tapped'\)[\s\S]*clone\.classList\?\.contains\('attacking'\)/);
assert.match(animationDirector,/const verticalWidth = Math\.min\(cloneWidth, cloneHeight\)/);
assert.match(animationDirector,/clone\.classList\.remove\([\s\S]*'tapped'[\s\S]*'attacking'/);
assert.match(animationDirector,/transform:'none'/);

console.log('TRADE_NOTIFICATIONS_LAND_FILTERS_MOBILE_ATTACK_23_21_6_HF23_2_OK functions=42 notices=PERSISTENT disputes=RECEIPT_LINKED landColors=PRODUCED_MANA mobileAttack=VERTICAL+ANIMATION_CLONE_NORMALIZED');
