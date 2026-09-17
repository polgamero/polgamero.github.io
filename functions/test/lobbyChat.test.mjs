import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOBBY_CHAT_MAX_CHARS, LOBBY_CHAT_EVENT_CAP, LOBBY_CHAT_RETENTION_MS, LOBBY_CHAT_MIN_INTERVAL_MS,
  lobbyChatContainsBlockedLanguage, normalizeLobbyChatText, evaluateLobbyChatRate
} from '../src/multiplayer/lobbyChatPolicy.js';

test('Lobby chat normalizes safe text and preserves legacy in-match communication validators', () => {
  assert.equal(LOBBY_CHAT_MAX_CHARS,220); assert.equal(LOBBY_CHAT_EVENT_CAP,60); assert.equal(LOBBY_CHAT_RETENTION_MS,2*60*60*1000); assert.equal(LOBBY_CHAT_MIN_INTERVAL_MS,2500);
  assert.deepEqual(normalizeLobbyChatText('  Buenas,   alguien? '),{ok:true,text:'Buenas, alguien?'});
  assert.equal(normalizeLobbyChatText('x'.repeat(221)).code,'MULTIPLAYER_CHAT_INVALID');
  const communicationSource = readFileSync(new URL('../src/multiplayer/communication.js', import.meta.url), 'utf8');
  assert.match(communicationSource, /function\s+cleanMatchId\s*\(/, 'legacy cleanMatchId validator must remain defined');
  assert.match(communicationSource, /export\s+function\s+normalizeChatText\s*\(/, 'legacy normalizeChatText validator must remain defined/exported');
  assert.match(communicationSource, /sendMultiplayerCommunication[\s\S]*cleanMatchId\(matchId\)/, 'match communication must still route through cleanMatchId');
  assert.match(communicationSource, /nowMs\s*-\s*LOBBY_CHAT_RETENTION_MS/, 'lobby persistence must prune the 2-hour window server-side');
  assert.match(communicationSource, /export\s+async\s+function\s+deleteLobbyCommunication/, 'server-owned lobby moderation delete must remain available');
});
test('Lobby chat basic profanity filter handles accents/leetspeak and token boundaries', () => {
  assert.equal(lobbyChatContainsBlockedLanguage('qué pelotudo'),true);
  assert.equal(lobbyChatContainsBlockedLanguage('sos un pel0tud0'),true);
  assert.equal(lobbyChatContainsBlockedLanguage('idiomático'),false);
  assert.equal(normalizeLobbyChatText('hijo de puta').code,'LOBBY_CHAT_PROFANITY');
  assert.equal(lobbyChatContainsBlockedLanguage('pija'),true);
  assert.equal(lobbyChatContainsBlockedLanguage('p1j4444'),true);
  assert.equal(lobbyChatContainsBlockedLanguage('porrrronga'),true);
  assert.equal(normalizeLobbyChatText('frutilla', ['frutilla']).code,'LOBBY_CHAT_PROFANITY','Admin list is applied server-side');
});
test('Lobby chat persistent rate policy handles min interval and duplicate window', () => {
  const t=1_000_000;
  const first=evaluateLobbyChatRate({},'Hola',t); assert.equal(first.ok,true);
  assert.equal(evaluateLobbyChatRate(first.next,'otro',t+1000).code,'LOBBY_CHAT_RATE_LIMIT');
  assert.equal(evaluateLobbyChatRate(first.next,'HÓLA!!!',t+3000).code,'LOBBY_CHAT_DUPLICATE');
  assert.equal(evaluateLobbyChatRate(first.next,'otro',t+3000).ok,true);
});
