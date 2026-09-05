import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSeededRng, normalizeGameSeed, GAME_RNG_VERSION } from '../js/gameRng.js';
import { replayHash, replayStateChangeEvents, auditTelemetryReplay, REPLAY_FORMAT_VERSION } from '../js/replayKernel.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const a=createSeededRng('argentinia'), b=createSeededRng('argentinia');
for(let i=0;i<1000;i++) if(a()!==b()) throw new Error(`rng divergence ${i}`);
if(GAME_RNG_VERSION!=='mulberry32-v1' || normalizeGameSeed('abc')===normalizeGameSeed('abd')) throw new Error('rng contract');

const s0={turn:{turnCount:1,activePlayer:'local',priorityPlayer:'local',consecutivePasses:0},local:{hp:20,poison:0,manaPool:{W:0,U:0,B:0,R:0,G:0,C:0}},rival:{hp:20,poison:0,manaPool:{W:0,U:0,B:0,R:0,G:0,C:0}},stack:[]};
const s1=structuredClone(s0); s1.local.hp=19;
const events=[
 {seq:1,type:'state_change',data:{changes:[{path:'$',after:s0}],afterHash:replayHash(s0)}},
 {seq:2,type:'ui_click',data:{id:'x'}},
 {seq:3,type:'state_change',data:{changes:[{path:'local.hp',after:19}],beforeHash:replayHash(s0),afterHash:replayHash(s1)}},
 {seq:4,type:'manual_bug_marker',data:{note:'fixture'}}
];
const rebuilt=replayStateChangeEvents(events,4);
if(rebuilt.hashMismatches.length || rebuilt.snapshot.local.hp!==19) throw new Error('replay rebuild');
const audit=auditTelemetryReplay({telemetryVersion:'23.17.5.4',events},{marker:1});
if(audit.marker?.note!=='fixture' || audit.snapshot.local.hp!==19 || REPLAY_FORMAT_VERSION!==1) throw new Error('legacy replay audit');


// Circuito real de Telemetría: el primer snapshot profundo debe sobrevivir la serialización
// sin MaxDepth y conservar exactamente el hash que Replay valida.
const telemetryMod = await import('../js/telemetry.js');
const rngMod = await import('../js/gameRng.js');
rngMod.beginGameRngSession({seed:12345,label:'test'});
const mana={W:0,U:0,B:0,R:0,G:0,C:0};
const liveState={turnCount:1,phase:'main1',activePlayer:'local',priorityPlayer:'local',consecutivePasses:0,gameOver:false,botDifficulty:'medium',localHP:20,localPoison:0,localManaPool:{...mana},localDeck:[],localHand:[{id:'fixture_card',name:'Fixture',type:'Criatura',cmc:1}],localLands:[],localCombat:[],localSupport:[],localPlaneswalkers:[],localGraveyard:[],localExile:[],localLandPlayedThisTurn:false,rivalHP:20,rivalPoison:0,rivalManaPool:{...mana},rivalDeck:[],rivalHand:[],rivalLands:[],rivalCombat:[],rivalSupport:[],rivalPlaneswalkers:[],rivalGraveyard:[],rivalExile:[],rivalLandPlayedThisTurn:false,activeEffects:[],scheduledReturns:[],triggerStackSerial:0};
telemetryMod.initTelemetry({getState:()=>liveState,getStack:()=>[],isSoloGameplayReady:()=>false});
telemetryMod.startTelemetrySession({mode:'solo',replayRng:rngMod.getGameRngSnapshot()});
const liveSession=telemetryMod.__telemetryTest.getCurrentSession();
const liveReplay=replayStateChangeEvents(liveSession.events);
if(liveReplay.hashMismatches.length || liveReplay.snapshot?.local?.hand?.cards?.[0]?.name!=='Fixture') throw new Error('real telemetry replay serialization');

const telemetry=read('js/telemetry.js');
if(!telemetry.includes('TELEMETRY_SCHEMA_VERSION = 5')) throw new Error('schema 5 missing');
if(!telemetry.includes('afterHash') || !telemetry.includes('recordReplayCheckpoint')) throw new Error('replay telemetry missing');
const main=read('js/main.js');
if(!main.includes('beginGameRngSession') || !main.includes('gameSeedFromLocation')) throw new Error('rng bootstrap missing');
if(!main.includes("seed: gameSeedFromLocation(), label: tournamentMatch ? `tournament:${tournamentMatch.tournamentId}:${tournamentMatch.matchId}` : 'solo'")) throw new Error('solo/tournament forced seed hook missing');
if(main.includes("seed: gameSeedFromLocation(), label: `multiplayer:")) throw new Error('multiplayer must ignore URL-forced game seed');
const recovery=read('js/soloRecovery.js');
if(!recovery.includes('SOLO_RECOVERY_SCHEMA_VERSION = 2') || !recovery.includes('rngState')) throw new Error('recovery rng missing');
const workflow=read('../.github/workflows/pages.yml');
const fastManifest=read('tools/ci_fast_contract_manifest_23_20_0.txt');
if(!workflow.includes('ci_fast_contract_manifest_23_20_0.txt')) throw new Error('canonical CI gate missing');
if(!fastManifest.includes('tools/test_stability_replay_foundation_23_18.mjs')) throw new Error('stability contract missing from canonical manifest');
if(!workflow.includes('run_stability_lab_23_18.mjs --seeds 10')) throw new Error('dynamic stability lab missing');

console.log('STABILITY_REPLAY_FOUNDATION_23_18_OK rng=deterministic replay=legacy+v1 telemetrySchema=5 recoverySchema=2');
process.exit(0);
