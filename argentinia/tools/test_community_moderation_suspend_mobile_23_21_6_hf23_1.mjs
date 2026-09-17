import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const ui=read('js/ui.js');
const main=read('js/main.js');
const mobile=read('js/mobileUI.js');
const mobileCss=read('css/mobile.css');
const economyClient=read('js/economyClient.js');
const firebaseImpl=read('js/firebaseClientImpl.js');
const functionsIndex=read('../functions/src/index.js');
const community=read('../functions/src/community/community.js');
const policy=read('../functions/src/community/moderationPolicy.js');
const communication=read('../functions/src/multiplayer/communication.js');
const challenges=read('../functions/src/multiplayer/directChallenges.js');
const manifest=JSON.parse(read('build-manifest.json'));

assert.equal([...functionsIndex.matchAll(/export const \w+\s*=\s*onCall\(/g)].length,42,'HF23.1 intentionally adds exactly one callable');
assert.match(functionsIndex,/export const economyCommunityAction\s*=\s*onCall/);
assert.match(economyClient,/economyCommunityAction/);
assert.match(firebaseImpl,/adminGetCommunityDashboard/);
assert.equal(manifest.functionsCount,42);

assert.match(policy,/'pija'/,'Argentine profanity baseline includes pija');
assert.match(policy,/moderationSkeleton/,'repeated-letter bypass normalization exists');
assert.match(policy,/matchesSpacedObfuscation/,'punctuation/spacing bypass normalization exists');
assert.match(communication,/loadCommunityModerationPolicy/,'chat reads editable server policy');
assert.match(communication,/assertUserNotBanned/,'chat is ban-authoritative');
assert.match(challenges,/assertUserNotBanned/,'direct challenges are ban-authoritative');
for(const capability of ['trade_listing_create','trade_offer_create','trade_offer_reject','trade_offer_accept']) assert.ok(functionsIndex.includes(capability),`market ban guard missing: ${capability}`);
assert.match(community,/communityBans\/\$\{uid\}/,'ban authority is UID keyed');
assert.match(community,/emailSnapshot/,'ban keeps email audit snapshot');
assert.match(community,/report_lobby_message/);
assert.match(community,/status:'resolved'/);

assert.ok(ui.includes("{ key: 'messages', label: 'MODERACIÓN Y USUARIOS' }"));
const gamePane=ui.slice(ui.indexOf('data-admin-pane="game"'),ui.indexOf('data-admin-pane="animations"'));
const moderationPane=ui.slice(ui.indexOf('data-admin-pane="messages"'),ui.indexOf('data-admin-pane="campaigns"'));
assert.ok(!gamePane.includes('${admissionAdminHTML}'),'Admission moved out of Ajustes del juego');
assert.ok(moderationPane.includes('${admissionAdminHTML}'),'Admission lives in Moderación y usuarios');
assert.ok(moderationPane.includes('${communityAdminHTML}'));
assert.match(ui,/p\.email \? ` · \${escapeHtml\(p\.email\)}`/,'Admin player picker exposes email while UID remains the value');
assert.match(ui,/showModerationCenter/);
assert.match(ui,/reportLobbyMessage/);
assert.match(ui,/reportCommunityUser/);
assert.match(main,/await maybeShowAnnouncementPopup[\s\S]*await getCommunityStatus\(\)[\s\S]*showCommunityStatusAtBoot/,'boot queue is Daily/announcement then moderation');

assert.match(mobile,/id="arg-mobile-preview-suspend"/,'mobile preview exposes Suspend action');
assert.match(mobile,/card\.querySelector\('\.suspend-action-fab'\)/,'preview invokes original Suspend FAB');
assert.match(mobile,/instant-ability-fab,\.suspend-action-fab/,'tap interceptor treats hourglass as a direct action');
assert.match(mobileCss,/#local-hand \.suspend-action-fab[\s\S]*bottom:\s*3px\s*!important/,'mobile hand hourglass is lifted from screen edge');
assert.match(mobileCss,/#local-hand \.suspend-action-fab[\s\S]*width:\s*24px\s*!important/,'mobile Suspend hit target is enlarged');

console.log('COMMUNITY_MODERATION_SUSPEND_MOBILE_23_21_6_HF23_1_OK functions=42 moderation=SERVER_UID_BAN+LUNFARDO+ADMIN_LIST+CASES admission=MOVED suspendMobile=LIFTED+PREVIEW_ACTION rules=23.13.89');
