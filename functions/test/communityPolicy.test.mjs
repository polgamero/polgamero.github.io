import test from 'node:test';
import assert from 'node:assert/strict';
import { moderationCanonical, moderationSkeleton, communityContainsBlockedLanguage, normalizeCommunityBlockedWords } from '../src/community/moderationPolicy.js';

test('HF23.1 Argentine moderation catches lunfardo, leetspeak and repeated-letter bypasses', () => {
  assert.equal(moderationCanonical('PÍJ4!!'), 'pija');
  assert.equal(moderationSkeleton('forrrro'), 'foro');
  for (const sample of ['pija','p1j4444','p.i.j.a','p i j a','PORRRONGA','conchudoooo','chupame la p1ja']) assert.equal(communityContainsBlockedLanguage(sample), true, sample);
  assert.equal(communityContainsBlockedLanguage('La pijama está lista'), false, 'token boundary avoids substring false positive');
});

test('HF23.1 Admin blocked-word extension is normalized, deduplicated and bounded', () => {
  assert.deepEqual(normalizeCommunityBlockedWords(['  FRUTÍLLA  ','frutilla','otra palabra','']), ['frutilla']);
  assert.equal(communityContainsBlockedLanguage('esa frut1lla', ['frutilla']), true);
});
