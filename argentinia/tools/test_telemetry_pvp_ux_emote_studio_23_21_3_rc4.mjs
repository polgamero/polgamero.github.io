import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const telemetry=read('js/telemetry.js');
const firebase=read('js/firebaseClientImpl.js');
const turn=read('js/turnManager.js');
const ui=read('js/ui.js');
const texts=read('js/gameTexts.js');
const social=read('js/multiplayerSocial.js');
const catalog=read('js/emoteCatalog.js');
const admin=read('js/emotesAdmin.js');
const style=read('css/style.css');
const mobile=read('css/mobile.css');
const html=read('index.html');
const trusted=fs.readFileSync(new URL('../../functions/src/trusted/emoteCatalog.js',import.meta.url),'utf8');
const emoteFn=fs.readFileSync(new URL('../../functions/src/economy/emotes.js',import.meta.url),'utf8');
const manifest=JSON.parse(read('build-manifest.json'));

// 1 Telemetry recovery payload + diagnostics.
for(const field of ['tournamentId','tournamentMatchId','tournamentRoundKey']) assert.match(firebase,new RegExp(`${field}:`),`missing ${field}`);
assert.match(telemetry,/console\.error\('\[Telemetry Remote\] upload failed'/);
assert.match(telemetry,/code:\s*error\?\.code/);

// 3 Zero-blocker fast UX.
assert.match(turn,/durationMs:\s*5000/);
assert.match(turn,/telemetryType:\s*'priority_no_blockers_fast_window'/);
assert.match(ui,/gameText\('priority\.button\.noBlockers'\)/);
assert.match(ui,/onclick\s*=\s*executeRivalAttack/);
assert.match(texts,/SIN BLOQUEADORES — AVANZAR ➔/);

// 4 ELO visible in final PvP result.
assert.match(turn,/function pvpEloNotice\(/);
assert.match(turn,/const eloNotice = pvpEloNotice\(result\)/);
assert.match(texts,/ELO \{before\} → \{after\} \(\{delta\}\)/);

// 5 Bitácora filters + emotes badge-only + larger burst.
for(const id of ['mp-log-filter-players','mp-log-filter-system']) assert.ok(html.includes(id));
assert.match(social,/if\(event\.type==='chat'\) appendSocialLog\(event\)/);
assert.match(social,/if\(event\.type==='emote' && animate\) animateEmote\(event\)/);
assert.doesNotMatch(social,/if\(event\.type==='emote'[^\n]*appendSocialLog/);
assert.match(style,/\.mp-emote-burst\s*\{[^}]*width:136px;[^}]*height:136px;/s);
assert.match(mobile,/\.mp-emote-burst\s*\{\s*width:98px;\s*height:98px;/s);
assert.match(style,/hide-player-messages/); assert.match(style,/hide-system-messages/);

// 6 SFX convention at root sfx, default basename=id.
assert.match(catalog,/EMOTE_AUDIO_BASE = '\.\/assets\/sounds\/sfx'/);
assert.match(catalog,/id:'emote_001'[\s\S]{0,120}audio:'emote_001'/);
assert.match(trusted,/id:'emote_001'[\s\S]{0,140}audio:'emote_001'/);
assert.match(social,/getAudioSettings\(\)/); assert.match(social,/sfxEnabled===false/);

// 7 Admin Emote Studio: asset probes + selectable fallback + authority preserved.
for(const label of ['WEBP','GIF','PNG','OPUS','MP3']) assert.ok(admin.includes(label),`missing probe ${label}`);
assert.match(admin,/EMOTE_FALLBACK_OPTIONS/); assert.match(admin,/data-f="fallback"/);
assert.match(admin,/probeUrl/); assert.match(admin,/Detectar assets/);
assert.match(admin,/premium/); assert.match(admin,/pricePoints/);
// Store showcase count follows the active authoritative catalog; it is not hardcoded to the 12 bootstrap defaults.
assert.match(texts,/store\.emotes\.showcaseCount[\s\S]{0,120}\{count\} emotes/);
assert.match(ui,/currentEmoteActiveCount\(\)/);
assert.match(ui,/store\.emotes\.showcaseCount'\s*,\s*\{\s*count:\s*currentEmoteActiveCount\(\)\s*\}/);
assert.match(trusted,/EMOTE_CATALOG_PATH = 'gameConfig\/emotes'/);
assert.match(emoteFn,/setEmoteCatalogAdminTx/);
assert.equal(manifest.firestoreRulesVersion,'23.13.86');
assert.equal(manifest.functionsCount,40);
assert.ok(['RC5','RC5.1','RC5.2'].includes(manifest.releaseCandidate));
// RC5 social delivery + mobile containment hardening.
assert.ok(!html.includes('id="mp-social-mute"'));
assert.match(social,/command==='\/silenciar'/);
assert.match(social,/rivalMuted=false/);
assert.match(social,/resolveAvailableAsset/);
assert.match(social,/fetch\(url,\{method:'HEAD'/);
assert.match(firebase,/const snap = await getDocFromServer\(ref\)/);
assert.match(firebase,/await updateDoc\(ref, \{ \[field\]: serverTimestamp\(\) \}\)/);
assert.match(style,/grid-template-rows:auto minmax\(0,1fr\) auto auto auto auto/);
assert.match(mobile,/grid-template-rows:auto minmax\(42px,1fr\) auto auto auto auto/);
assert.match(style,/\.mp-emote-picker \{ position:fixed/);
assert.match(mobile,/arg-mobile-keyboard-recovering/);
assert.match(mobile,/html\.argentinia-mobile \.btn-turn \{ min-height:30px/);
assert.match(mobile,/html\.argentinia-mobile \.mp-social-compose \{ grid-template-columns:minmax\(0,1fr\) 28px minmax\(46px,auto\)/);
assert.match(mobile,/#multiplayer-overlay #mp-back \{ min-height:28px/);
assert.match(mobile,/#multiplayer-overlay \.mp-body \{[^}]*overflow:hidden/s);
assert.match(ui,/resolveStoreEmoteAsset/);
assert.match(ui,/method:'HEAD'/);
assert.match(admin,/async function probeUrl/);
assert.ok(['RC5','RC5.1','RC5.2'].includes(manifest.releaseCandidate));
console.log('TELEMETRY_PVP_UX_EMOTE_STUDIO_23_21_3_RC5_OK telemetry=RECOVERED social=SYMMETRIC mute=COMMAND_ONLY heartbeat=NONCONTENDING mobileHud=CONTAINED emotePicker=EXTERNAL asset404=PROBED functions=40 rules=23.13.86');
