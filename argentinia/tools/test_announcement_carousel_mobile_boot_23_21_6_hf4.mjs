import fs from 'node:fs';
import assert from 'node:assert/strict';

const campaigns = fs.readFileSync(new URL('../js/campaignsUI.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const texts = fs.readFileSync(new URL('../js/gameTexts.js', import.meta.url), 'utf8');
const mobile = fs.readFileSync(new URL('../css/mobile.css', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.match(campaigns, /const candidates=list\.filter\(a=>campaignStatus\(a,now\)==='active' && a\.showPopup && !a\.finalizedAt\)/);
assert.match(campaigns, /const visible=candidates\.filter\(\(_,index\)=>!dismissed\[index\]\)/);
assert.match(campaigns, /await showAnnouncementCarousel\(visible,\{currentUser\}\)/);
assert.match(campaigns, /new Promise\(resolveClosed =>/);
assert.match(campaigns, /campaign-popup-dot/);
assert.match(campaigns, /setTimeout\(\(\)=>\{showIndex\(\(index\+1\)%items\.length,\{auto:true\}\);\},9000\)/);
assert.match(campaigns, /selectedDismissals=new Map\(\)/);
assert.doesNotMatch(campaigns, /showAnnouncementPopup\(ann,\{currentUser\}\); return true;/);

const dailyAwait = main.indexOf('await showDailyLoginRewardModal(dailyResult.login)');
const announcementAwait = main.indexOf('await maybeShowAnnouncementPopup({ currentUser: state.currentUser })');
assert.ok(dailyAwait >= 0 && announcementAwait > dailyAwait, 'Daily Rewards must complete before announcements');
assert.doesNotMatch(main, /dailyModalResult\s*!==\s*['"]view_rewards['"]/);
assert.match(ui, /showDailyRewardsScreen\(\(\) => \{[\s\S]*finish\('view_rewards'\);[\s\S]*\}\);/);

for (const key of ['campaign.popup.previous','campaign.popup.next','campaign.popup.position']) {
  assert.ok(texts.includes(`'${key}'`), `Missing Game Text key ${key}`);
}

assert.match(index, /<div id="boot-loading-overlay">\s*<div class="boot-spinner"><\/div>/);
assert.match(mobile, /html\.argentinia-mobile-bootstrap\.arg-bootdiag-force:not\(\.arg-mobile-engine-ready\) #arg-mobile-boot-fallback/);
assert.doesNotMatch(mobile, /html\.argentinia-mobile-bootstrap:not\(\.arg-mobile-engine-ready\) #arg-mobile-boot-fallback,/);
assert.doesNotMatch(mobile, /html\.argentinia-mobile-bootstrap:not\(\.arg-mobile-shell-ready\) #arg-mobile-boot-fallback \{/);

console.log('ANNOUNCEMENT_CAROUSEL_MOBILE_BOOT_23_21_6_HF4_OK carousel=allActive dismissal=perAnnouncement startup=serialized mobileLandscape=spinnerOnly');
