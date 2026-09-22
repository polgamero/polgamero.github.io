import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACHIEVEMENT_FAMILIES, ACHIEVEMENT_TIERS, defaultAchievementEntries, normalizeAchievementsConfig, achievementId, achievementTrophyFilename, achievementTrophyPath } from '../js/achievements.js';
import { getDefaultGameConfig, WORKSHOP_POLICY } from '../js/store.js';
import { beginEconomyAction, getPendingEconomyAction, clearPendingEconomyAction } from '../js/economyActionRecovery.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=path.resolve(__dirname,'..');
const repo=path.resolve(app,'..');
const read=(...parts)=>fs.readFileSync(path.join(...parts),'utf8');
const ui=read(app,'js','ui.js');
const texts=read(app,'js','gameTexts.js');
const client=read(app,'js','economyClient.js');
const impl=read(app,'js','firebaseClientImpl.js');
const stats=read(app,'js','statistics.js');
const functionsIndex=read(repo,'functions','src','index.js');
const achievementsServer=read(repo,'functions','src','economy','achievements.js');
const workshopServer=read(repo,'functions','src','economy','workshop.js');
const adminServer=read(repo,'functions','src','economy','admin.js');
const auditServer=read(repo,'functions','src','economy','audit.js');

assert.equal(ACHIEVEMENT_FAMILIES.length,10);
assert.deepEqual(ACHIEVEMENT_TIERS,['copper','bronze','silver','gold','diamond']);
const entries=defaultAchievementEntries();
assert.equal(Object.keys(entries).length,50);
const trophyFilenames=[];
for(const family of ACHIEVEMENT_FAMILIES) for(const tier of ACHIEVEMENT_TIERS){
  trophyFilenames.push(achievementTrophyFilename(family.id,tier));
  assert.equal(achievementTrophyPath(family.id,tier),`./assets/images/logros/${achievementTrophyFilename(family.id,tier)}`);
}
assert.equal(trophyFilenames.length,50);
assert.equal(new Set(trophyFilenames).size,50);
assert.ok(fs.existsSync(path.join(app,'assets','images','logros','README_TROFEOS.txt')));
const trophyManifest=JSON.parse(read(app,'assets','images','logros','trofeos_manifest.json'));
assert.equal(trophyManifest.count,50);
assert.deepEqual(trophyManifest.trophies.map(row=>row.filename),trophyFilenames);
for(const asset of ['esencia.png','menu_taller.png','maquina1.png','maquina2.png','maquina3.png','maquina4.png']){
  const full=path.join(app,'assets','images','ui',asset);
  assert.ok(fs.existsSync(full),`missing UI asset ${asset}`);
  assert.ok(fs.statSync(full).size>1024,`UI asset ${asset} looks empty`);
}
assert.equal(entries[achievementId('tournamentWins','copper')].target,1);
assert.equal(entries[achievementId('tournamentWins','diamond')].target,25);
assert.equal(entries[achievementId('soloWins','copper')].target,5);
assert.equal(entries[achievementId('gamesPlayed','diamond')].target,1000);
const normalized=normalizeAchievementsConfig({entries:{soloWins_copper:{target:0,points:-1,fichas:-2,essence:-3}}});
assert.equal(normalized.entries.soloWins_copper.target,5);
assert.equal(normalized.entries.soloWins_copper.points,0);
assert.equal(normalized.entries.soloWins_copper.essence,0);

const config=getDefaultGameConfig();
assert.equal(config.essenceConversionEnabled,true);
assert.equal(config.essenceConversionPoints,500);
assert.equal(config.essenceConversionFichas,5);
assert.equal(config.essenceConversionMaxPerOperation,10);
assert.equal(WORKSHOP_POLICY.essence.pointsPerUnit,500);
assert.equal(WORKSHOP_POLICY.essence.fichasPerUnit,5);

assert.match(ui,/id="menu-achievements"/);
assert.match(ui,/injectEncyclopediaStyles\(\); \/\/ botones\/titular estándar: independiente del orden de navegación/);
assert.match(ui,/class="encyclopedia-title">\$\{gameTextHtml\('achievements\.title'\)\}/);
assert.match(ui,/achievementTrophyHtml\(family\.id,tier\)/);
assert.match(ui,/achievementTrophyHtml\(found\.family\.id,found\.tier\)/);
assert.match(ui,/className='gy-modal-overlay'/);
assert.match(ui,/injectMulliganStyles\(\); \/\/ modal\/botones estándar: no depende de haber abierto Taller u otra pantalla/);
assert.match(ui,/mulligan-btn mulligan-btn-keep" id="achievement-notice-open"/);
assert.match(ui,/mulligan-btn mulligan-btn-mull" id="achievement-notice-close"/);
assert.doesNotMatch(ui,/className='achievement-notice'/);
assert.match(ui,/const ESSENCE_ICON_HTML = `<img class="essence-icon" src="\.\/assets\/images\/ui\/esencia\.png"/);
assert.match(ui,/\$\{ESSENCE_ICON_HTML\}<span>\$\{gameTextHtml\('workshop\.wallet\.essence'/);
assert.match(ui,/showAchievementsScreen/);
assert.match(ui,/data-claim-achievement/);
assert.match(ui,/withEconomyButtonPending\(btn,\(\)=>claimAchievement/);
assert.match(ui,/withEconomyButtonPending\(btn,\(\)=>convertEssence/);
assert.match(ui,/admin\.tab\.achievements/);
assert.match(ui,/saveAdminGameConfigDocument\('achievements'/);
assert.match(ui,/value="essence"/);
assert.match(ui,/admin\.stats\.essence\.current/);
assert.match(ui,/row\.essenceDelta/);

for(const key of [
  'account.achievements','achievements.title','achievements.claim','achievements.claiming','achievements.unlocked.title',
  'achievements.tier.copper','achievements.tier.bronze','achievements.tier.silver','achievements.tier.gold','achievements.tier.diamond',
  'admin.tab.achievements','admin.achievements.title','admin.achievements.col.enabled','admin.achievements.col.achievement','admin.achievements.col.trophy',
  'workshop.wallet.essence','workshop.essence.open','workshop.essence.pending','admin.workshop.essenceTitle','admin.stats.essence.current',
  'admin.audit.kpi.essence','admin.movements.currentEssence'
]) assert.ok(texts.includes(`'${key}'`),`missing Game Text ${key}`);

assert.match(client,/action:\s*'claimAchievement'/);
assert.match(client,/action:\s*'convertEssence'/);
assert.match(impl,/achievementClaim:\s*'achievement\.claim'/);
assert.match(impl,/essenceConvert:\s*'essence\.convert'/);
assert.match(impl,/achievementClaim:\s*'achievement-claim'/);
assert.match(impl,/essenceConvert:\s*'essence-convert'/);
assert.match(stats,/essenceEarned:\s*0/);
assert.match(stats,/essenceSpent:\s*0/);
assert.match(stats,/essenceCurrent:\s*0/);
assert.match(stats,/achievementClaims:\s*0/);

for(const type of ['achievementClaim','essenceConvert']){
  const mem=new Map();
  globalThis.localStorage={getItem:key=>mem.has(key)?mem.get(key):null,setItem:(key,value)=>mem.set(key,String(value)),removeItem:key=>mem.delete(key)};
  const req=type==='achievementClaim'?{achievementId:'soloWins_copper'}:{quantity:1};
  const op=`${type}:contract-op`;
  beginEconomyAction('achievement-user',type,op,req);
  assert.equal(getPendingEconomyAction('achievement-user',type,req)?.operationId,op);
  assert.equal(clearPendingEconomyAction('achievement-user',type,req,op),true);
}

assert.equal([...functionsIndex.matchAll(/export const \w+\s*=\s*onCall\(/g)].length,42);
assert.match(functionsIndex,/action === 'claimAchievement'/);
assert.match(functionsIndex,/type:'achievement\.claim'/);
assert.match(functionsIndex,/action === 'convertEssence'/);
assert.match(functionsIndex,/type:'essence\.convert'/);
assert.match(achievementsServer,/ACHIEVEMENT_FAMILIES/);
assert.match(achievementsServer,/mythicCardsOwned/);
assert.match(achievementsServer,/tx\.update\(userRef/);
assert.match(workshopServer,/essenceConversionPoints \?\? 500/);
assert.match(workshopServer,/essenceConversionFichas \?\? 5/);
assert.match(adminServer,/GRANT_KINDS=new Set\(\['points','fichas','essence','standardPacks','guaranteedMythics'\]\)/);
assert.match(auditServer,/case 'achievement\.claim'/);
assert.match(auditServer,/case 'essence\.convert'/);
assert.match(auditServer,/essenceDelta/);

console.log('ACHIEVEMENTS_ESSENCE_23_21_6_HF23_3_13_OK families=10 milestones=50 trophies=50_ASSET_SLOTS+EMOJI_FALLBACK styles=ORDER_INDEPENDENT_SHARED_UI essence=OFFICIAL_PNG claims=SERVER+IDEMPOTENT admin=CONFIG+GIFTS+STATS+AUDIT recovery=PASS functions=42');
