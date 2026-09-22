import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACHIEVEMENT_FAMILIES, ACHIEVEMENT_TIERS, defaultAchievementEntries, normalizeAchievementsConfig, achievementId } from '../js/achievements.js';
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

console.log('ACHIEVEMENTS_ESSENCE_23_21_6_HF23_3_13_OK families=10 milestones=50 tiers=COPPER+BRONZE+SILVER+GOLD+DIAMOND claims=SERVER+IDEMPOTENT essence=500P+5F_DEFAULT admin=CONFIG+GIFTS+STATS+AUDIT recovery=PASS functions=42');
