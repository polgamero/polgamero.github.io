import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const main = read('../js/main.js');
const ui = read('../js/ui.js');
const firebase = read('../js/firebaseClientImpl.js');
const texts = read('../js/gameTexts.js');

function slice(src, start, end) {
  const a = src.indexOf(start);
  assert.ok(a >= 0, `missing ${start}`);
  const b = end ? src.indexOf(end, a + start.length) : src.length;
  assert.ok(b > a, `missing ${end}`);
  return src.slice(a,b);
}

// Account switching: Argentinia signs out only from Firebase; Google browser cookies may remain.
// Every explicit login must therefore force Google's account chooser.
assert.match(firebase, /const googleProvider = new GoogleAuthProvider\(\);[\s\S]*googleProvider\.setCustomParameters\(\{ prompt: 'select_account' \}\)/);
assert.match(firebase, /return signInWithPopup\(auth, googleProvider\)/);

// Identity readiness now distinguishes a genuinely missing profile from an existing profile
// whose mandatory starter deck is still pending. Pending onboarding re-opens instead of showing
// the old generic profile-unavailable alert.
const gate = slice(main, 'export async function ensureMenuIdentityReady()', 'let animationPolicyStop');
assert.match(gate, /!state\.userProfile[\s\S]*AUTH_PROFILE_NOT_READY/);
assert.match(gate, /state\.userProfile\?\.starterDeckPending === true/);
assert.match(gate, /promptStarterDeckSelection\(\)/);
assert.match(gate, /AUTH_STARTER_DECK_REQUIRED/);

const starter = slice(main, 'function promptStarterDeckSelection()', 'const BUILD_FRESHNESS_TIMEOUT_MS');
assert.match(starter, /starterDeckSelectionOpen/);
assert.match(starter, /starter-deck-select-overlay/);
assert.match(starter, /mandatory: true/);
assert.match(starter, /await signOutUser\(\)/);
assert.match(starter, /updatedProfile\.starterDeckPending === true/);
assert.match(starter, /state\.userProfile = updatedProfile/);
assert.match(starter, /state\.authIdentityReady = true/);
assert.match(starter, /updateAccountUI\(state\.currentUser\)/);
assert.match(starter, /throw err/); // failed save keeps the mandatory chooser recoverable
assert.match(starter, /processDailyLoginRewards\(\{ showModal: false \}\)/);
assert.match(starter, /setTimeout\(\(\) => \{ void showDailyLoginRewardModal\(dailyResult\.login\); \}, 0\)/);

// Login-gated menu surfaces are NOT ready while starterDeckPending is true.
const menuGate = slice(ui, 'function updateMainMenuLoginGatedButtons(overlay)', '// 23.13.29');
assert.match(menuGate, /const starterDeckPending =/);
assert.match(menuGate, /const loggedInReady =[^;]*!starterDeckPending/);
assert.match(menuGate, /menu\.starterDeckRequiredTooltip/);

const menuAwait = slice(ui, 'async function awaitMenuIdentityOrStay()', 'const releaseMenuIdentityAction');
assert.match(menuAwait, /err\?\.code !== 'AUTH_STARTER_DECK_REQUIRED'/);
assert.match(menuAwait, /menu\.profileUnavailable/);

// Mandatory deck selector has no normal Back path. It waits for async persistence, keeps the
// chooser mounted on failure with inline feedback, and offers only a controlled session exit.
const chooser = slice(ui, 'export function showDeckSelectionModal(', 'let desktopZoneHoverInteractionsInstalled');
assert.match(chooser, /const mandatory = options\?\.mandatory === true/);
assert.match(chooser, /deckselect-exit/);
assert.match(chooser, /mandatory[\s\S]*deckselect-back/);
assert.match(chooser, /const accepted = await onChoose\(identity\)/);
assert.match(chooser, /failInline\(err\)/);
assert.match(chooser, /await options\?\.onExit\?\.\(\)/);
assert.match(chooser, /return overlay/);
assert.match(ui, /#deck-select-overlay, #starter-deck-select-overlay/);

for (const key of [
  'menu.starterDeckRequired',
  'menu.starterDeckRequiredTooltip',
  'account.starter.title',
  'account.starter.subtitle',
  'account.starter.saving',
  'account.starter.inlineError',
  'account.starter.signOut'
]) {
  assert.ok(texts.includes(`'${key}'`), `missing Game Text ${key}`);
}

console.log('AUTH_ONBOARDING_ACCOUNT_CHOOSER_23_21_6_HF13_OK starter=mandatory recovery=automatic google=select_account');
