import assert from 'node:assert/strict';
import fs from 'node:fs';

const facade = fs.readFileSync(new URL('../js/firebaseClient.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');

assert.match(facade, /export function waitForInitialAuthState\(\)/);
assert.match(facade, /for \(const cb of \[\.\.\.authSubscribers\]\)[\s\S]*if \(!initialAuthResolved\)/);
assert.match(main, /export async function ensureMenuIdentityReady\(\)[\s\S]*await waitForInitialAuthState\(\)[\s\S]*await userProfileLoadPromise/);
assert.match(main, /authInitialResolved:\s*false/);
assert.match(main, /authIdentityReady:\s*false/);
assert.match(ui, /setGate\('menu-play', guestReady \|\| loggedInReady/);
assert.match(ui, /menu\.authCheckingTooltip/);
assert.match(ui, /#menu-encyclopedia'\)\.addEventListener\('click', async/);
assert.match(ui, /await awaitMenuIdentityOrStay\(\)/);
assert.match(main, /if \(state\.currentUser\) \{[\s\S]*savedDecks\.length <= 0[\s\S]*menu\.noDecksReady/);
assert.match(main, /Sólo una identidad Auth resuelta explícitamente como null puede jugar como Gaucho\/random/);
console.log('AUTH_BOOTSTRAP_GATE_23_13_52_OK');
