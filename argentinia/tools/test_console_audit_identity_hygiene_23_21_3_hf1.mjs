import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const impl = read('js/firebaseClientImpl.js');
const manifest = JSON.parse(read('build-manifest.json'));
const emoteFn = fs.readFileSync(new URL('../../functions/src/economy/emotes.js', import.meta.url), 'utf8');

// The audited Admin emote-catalog action intentionally targets a Firestore resource path,
// not a users/{uid} document. That evidence must remain immutable and visible.
assert.match(emoteFn, /targetUid:'gameConfig\/emotes'/);

// Username resolution must only feed plain users collection document IDs into documentId().
assert.match(impl, /const isResolvableUserDocumentId = value =>/);
assert.match(impl, /!id\.includes\('\/'\)/);
assert.match(impl, /\.filter\(isResolvableUserDocumentId\)/);
assert.match(impl, /where\(documentId\(\), 'in', chunk\)/);
assert.doesNotMatch(impl, /\.filter\(value => value && value !== 'server'\)\)\];/);

// The browser application itself does not own Chrome-extension message channels.
for (const file of fs.readdirSync(new URL('../js/', import.meta.url)).filter(x => x.endsWith('.js'))) {
  const source = read(`js/${file}`);
  assert.doesNotMatch(source, /(?:chrome|browser)\.runtime\.(?:onMessage|sendMessage)/, `extension messaging leaked into ${file}`);
}

assert.equal(manifest.engineVersion, '23.21.4');
assert.match(String(manifest.promotedFrom || ''), /23\.21\.3 HF1/);
assert.equal(manifest.firestoreRulesVersion, '23.13.86');
assert.equal(manifest.functionsCount, 41);
console.log('CONSOLE_AUDIT_IDENTITY_HYGIENE_23_21_3_HF1_OK resourcePaths=SKIPPED_FROM_USER_LOOKUP extensionMessaging=NONE rules=23.13.86 functions=41');
