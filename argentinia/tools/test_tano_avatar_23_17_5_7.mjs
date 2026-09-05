import fs from 'node:fs';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ui = read('js/ui.js');
const css = read('css/style.css');
const version = read('js/version.js');
const manifest = JSON.parse(read('build-manifest.json'));
const diff = read('js/botDifficulty.js');
const bot = read('js/bot.js');

function ok(cond, msg) { if (!cond) throw new Error(msg); }

ok((version.includes("ENGINE_VERSION = '23.19.2'") || version.includes("ENGINE_VERSION = '23.19.5.6'")), 'engine 23.17.5.7');
ok(manifest.engineVersion === '23.19.5.6', 'manifest 23.17.5.7');
ok(manifest.firestoreRulesVersion === '23.13.80', 'rules unchanged');
ok(ui.includes("const TANO_AVATAR_SRC = 'assets/images/ui/tano.png';"), 'canonical tano.png path');
ok(ui.includes("setAvatarImageOrFallback(els.rivalAvatar, TANO_AVATAR_SRC"), 'solo uses tano.png');
ok(ui.includes("multiplayer ? `mp|${rivalPhotoURL}` : `solo|${TANO_AVATAR_SRC}`"), 'solo/mp identity separation');
ok(css.includes('width: 2.4rem;') && css.includes('height: 2.4rem;'), 'avatar circle stays 2.4rem');
ok(css.includes('.avatar img.tano-avatar-img'), 'tano image scoped class');
ok(diff.includes('reactiveStack:false') && (diff.match(/reactiveStack:true/g) || []).length === 2, 'reactiveStack medium+hard only');
ok(bot.includes("botHasCapability(state.botDifficulty, 'reactiveStack')"), 'reactive stack capability gate preserved');

console.log('TANO_AVATAR_23_17_5_7_OK path=assets/images/ui/tano.png size=2.4rem reactiveStack=medium+hard rules=23.13.80');
