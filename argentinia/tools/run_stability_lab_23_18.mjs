#!/usr/bin/env node
// Argentinia 23.18 — Stability Lab
// Fuzz determinista del RNG/deck builder/replay kernel/invariants. No reemplaza E2E browser;
// es el gate rápido y masivo que puede correrse en CI o localmente con --seeds 1000.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSeededRng } from '../js/gameRng.js';
import { buildCompetitiveDeck, validateCompetitiveDeck } from '../js/deckIntelligence.js';
import { replayHash, replayStateChangeEvents, snapshotInvariantFindings } from '../js/replayKernel.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const argSeeds = process.argv.indexOf('--seeds');
const seedCount = argSeeds >= 0 ? Math.max(1, Number(process.argv[argSeeds + 1]) || 20) : 20;

const dataFiles = ['criaturas.json','instantaneos.json','conjuros.json','encantamientos.json','artefactos.json','tierras.json','planeswalkers.json'];
const cards = dataFiles.flatMap(name => JSON.parse(fs.readFileSync(path.join(root, 'assets/data', name), 'utf8')));
const identities = [['W','U'],['U','B'],['B','R'],['R','G'],['G','W'],['W','B'],['U','R'],['B','G'],['R','W'],['G','U']];

// 1) RNG reproducible.
for (let i = 0; i < Math.min(seedCount, 100); i++) {
  const a = createSeededRng(`rng-${i}`), b = createSeededRng(`rng-${i}`);
  for (let j = 0; j < 200; j++) {
    if (a() !== b()) throw new Error(`RNG_DIVERGENCE seed=${i} draw=${j}`);
  }
}

// 2) Deck builder reproducible y válido en múltiples seeds/identidades.
let deckBuilds = 0;
const qualities = ['good','strong','elite']; // Fácil / Medio / Difícil
for (let i = 0; i < seedCount; i++) {
  const identity = identities[i % identities.length];
  for (const quality of qualities) {
    const seed = `deck-${quality}-${i}-${identity.join('')}`;
    const rngA = createSeededRng(seed);
    const rngB = createSeededRng(seed);
    const a = buildCompetitiveDeck(cards, identity, { quality, rng: rngA, candidateCount: 12, goldfishIterations: 12 });
    const b = buildCompetitiveDeck(cards, identity, { quality, rng: rngB, candidateCount: 12, goldfishIterations: 12 });
    const idsA = a.deck.map(c => c.id);
    const idsB = b.deck.map(c => c.id);
    if (JSON.stringify(idsA) !== JSON.stringify(idsB)) throw new Error(`DECK_REPLAY_DIVERGENCE seed=${seed}`);
    const valid = validateCompetitiveDeck(a.deck, identity);
    if (!valid.ok) throw new Error(`INVALID_DECK seed=${seed} ${valid.errors.join(',')}`);
    deckBuilds += 1;
  }
}

function baseSnapshot() {
  return {
    turn:{turnCount:1,phase:'main1',activePlayer:'local',priorityPlayer:'local',consecutivePasses:0,gameOver:false,abandonedBy:null},
    mode:{kind:'solo',difficulty:'medium'},
    local:{hp:20,poison:0,manaPool:{W:0,U:0,B:0,R:0,G:0,C:0},deck:{count:53},hand:{count:7,cards:[]},lands:[],combat:[],support:[],planeswalkers:[],graveyard:[],exile:[],landPlayedThisTurn:false,attackersDeclaredThisTurn:0},
    rival:{hp:20,poison:0,manaPool:{W:0,U:0,B:0,R:0,G:0,C:0},deck:{count:53,cards:[]},hand:{count:7,cards:[]},lands:[],combat:[],support:[],planeswalkers:[],graveyard:[],exile:[],landPlayedThisTurn:false,attackersDeclaredThisTurn:0},
    stack:[],shared:{combatDamagePrevented:false,activeEffects:[],scheduledReturns:[],triggerStackSerial:0},pending:{}
  };
}

// 3) Replay hash/diff reconstruction.
const s0 = baseSnapshot();
const s1 = structuredClone(s0); s1.turn.priorityPlayer='rival'; s1.turn.consecutivePasses=1;
const s2 = structuredClone(s1); s2.local.hp=17;
const events = [
  {seq:1,type:'state_change',data:{reason:'session_start',changes:[{path:'$',before:null,after:s0}],beforeHash:null,afterHash:replayHash(s0)}},
  {seq:2,type:'state_change',data:{reason:'pass',changes:[{path:'turn.priorityPlayer',before:'local',after:'rival'},{path:'turn.consecutivePasses',before:0,after:1}],beforeHash:replayHash(s0),afterHash:replayHash(s1)}},
  {seq:3,type:'state_change',data:{reason:'damage',changes:[{path:'local.hp',before:20,after:17}],beforeHash:replayHash(s1),afterHash:replayHash(s2)}}
];
const replay = replayStateChangeEvents(events, 3);
if (replay.hashMismatches.length || replayHash(replay.snapshot) !== replayHash(s2)) throw new Error('REPLAY_KERNEL_DIVERGENCE');

// 4) Invariant mutation fuzz: cada mutación rota debe ser cazada.
const mutators = [
  s => { s.turn.turnCount = 0; },
  s => { s.turn.activePlayer = 'nobody'; },
  s => { s.turn.priorityPlayer = 'nobody'; },
  s => { s.turn.consecutivePasses = 9; },
  s => { s.local.hp = NaN; },
  s => { s.rival.poison = -1; },
  s => { s.local.manaPool.G = -2; },
  s => { s.stack = [{id:7},{id:7}]; }
];
let invariantMutations = 0;
for (let i = 0; i < seedCount * 4; i++) {
  const s = baseSnapshot();
  mutators[i % mutators.length](s);
  if (!snapshotInvariantFindings(s).length) throw new Error(`INVARIANT_MISSED mutation=${i % mutators.length}`);
  invariantMutations += 1;
}
if (snapshotInvariantFindings(baseSnapshot()).length) throw new Error('VALID_SNAPSHOT_FALSE_POSITIVE');

console.log(`STABILITY_LAB_23_18_OK seeds=${seedCount} deckBuilds=${deckBuilds} qualities=${qualities.join(',')} rngDraws=${Math.min(seedCount,100)*200} invariantMutations=${invariantMutations} replayHashes=3 pool=${cards.length}`);
