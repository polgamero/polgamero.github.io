import test from 'node:test';
import assert from 'node:assert/strict';
import { TOURNAMENT_NPC_ROSTER } from '../src/trusted/tournamentRoster.js';
import { createTournamentBracket, normalizeTournamentPolicy, playerMatchForRound, simulateNpcMatchesForRound } from '../src/economy/tournamentCore.js';

test('23.20.0 tournament core builds a deterministic 16-player knockout', () => {
  assert.equal(TOURNAMENT_NPC_ROSTER.length, 40);
  assert.equal(new Set(TOURNAMENT_NPC_ROSTER.map(n => n.id)).size, 40);
  const policy = normalizeTournamentPolicy({});
  const run = createTournamentBracket({ uid:'u1', username:'Pablo', tournamentId:'t1', seed:'fixed', policy, rewardEligible:true, dayKey:'2026-09-05' });
  assert.equal(Object.keys(run.entrants).length, 16);
  assert.equal(Object.keys(run.matches).length, 15);
  assert.equal(run.entrants.player.name, 'Pablo');
  const first = playerMatchForRound(run);
  assert.ok(first);
  assert.ok([first.aEntrantId, first.bEntrantId].includes('player'));
  const completedNpcR16 = Object.values(run.matches).filter(m => m.roundKey === 'round16' && ![m.aEntrantId,m.bEntrantId].includes('player'));
  assert.equal(completedNpcR16.length, 7);
  assert.ok(completedNpcR16.every(m => m.status === 'completed' && m.winnerEntrantId));
  assert.deepEqual(policy.final, {points:500,packs:2,difficulty:'hard',deckQuality:'elite'});
  simulateNpcMatchesForRound(run, 0, 'again');
  assert.ok(completedNpcR16.every(m => m.winnerEntrantId));
});
