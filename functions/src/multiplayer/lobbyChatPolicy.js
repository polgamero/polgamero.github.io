// Pure HF20 Lobby chat policy. Deliberately has no Firebase dependency so CI can unit-test
// moderation/rate semantics without installing the Functions runtime SDK.
export const LOBBY_CHAT_MAX_CHARS = 220;
export const LOBBY_CHAT_EVENT_CAP = 60;
export const LOBBY_CHAT_RETENTION_MS = 2 * 60 * 60 * 1000;
export const LOBBY_CHAT_MIN_INTERVAL_MS = 2500;
export const LOBBY_CHAT_BURST_WINDOW_MS = 30_000;
export const LOBBY_CHAT_BURST_MAX = 5;
export const LOBBY_CHAT_LONG_WINDOW_MS = 5 * 60_000;
export const LOBBY_CHAT_LONG_MAX = 20;
export const LOBBY_CHAT_DUPLICATE_WINDOW_MS = 45_000;

import { moderationCanonical, communityContainsBlockedLanguage } from '../community/moderationPolicy.js';

export { moderationCanonical };
export function lobbyChatContainsBlockedLanguage(value, extraWords = []) {
  return communityContainsBlockedLanguage(value, extraWords);
}
export function normalizeLobbyChatText(value, extraWords = []) {
  const text = String(value ?? '').replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text || text.length > LOBBY_CHAT_MAX_CHARS) return { ok:false, code:'MULTIPLAYER_CHAT_INVALID', details:{ maxChars:LOBBY_CHAT_MAX_CHARS } };
  if (lobbyChatContainsBlockedLanguage(text, extraWords)) return { ok:false, code:'LOBBY_CHAT_PROFANITY', details:{} };
  return { ok:true, text };
}
export function normalizeLobbyRate(raw = {}) {
  return {
    lastChatAtMs: Math.max(0, Math.floor(Number(raw.lastChatAtMs) || 0)),
    burstWindowAtMs: Math.max(0, Math.floor(Number(raw.burstWindowAtMs) || 0)),
    burstCount: Math.max(0, Math.floor(Number(raw.burstCount) || 0)),
    longWindowAtMs: Math.max(0, Math.floor(Number(raw.longWindowAtMs) || 0)),
    longCount: Math.max(0, Math.floor(Number(raw.longCount) || 0)),
    lastNormalizedText: String(raw.lastNormalizedText || '').slice(0, LOBBY_CHAT_MAX_CHARS),
    lastTextAtMs: Math.max(0, Math.floor(Number(raw.lastTextAtMs) || 0))
  };
}
export function evaluateLobbyChatRate(rawRate = {}, text = '', nowMs = Date.now()) {
  const rate = normalizeLobbyRate(rawRate);
  if (rate.lastChatAtMs && nowMs - rate.lastChatAtMs < LOBBY_CHAT_MIN_INTERVAL_MS) {
    return { ok:false, code:'LOBBY_CHAT_RATE_LIMIT', details:{ retryAfterMs:LOBBY_CHAT_MIN_INTERVAL_MS-(nowMs-rate.lastChatAtMs) } };
  }
  const normalizedText = moderationCanonical(text);
  if (normalizedText && rate.lastNormalizedText === normalizedText && rate.lastTextAtMs && nowMs-rate.lastTextAtMs < LOBBY_CHAT_DUPLICATE_WINDOW_MS) {
    return { ok:false, code:'LOBBY_CHAT_DUPLICATE', details:{ retryAfterMs:LOBBY_CHAT_DUPLICATE_WINDOW_MS-(nowMs-rate.lastTextAtMs) } };
  }
  const sameBurst = !!rate.burstWindowAtMs && nowMs-rate.burstWindowAtMs < LOBBY_CHAT_BURST_WINDOW_MS;
  const burstCount = sameBurst ? rate.burstCount : 0;
  if (burstCount >= LOBBY_CHAT_BURST_MAX) return { ok:false, code:'LOBBY_CHAT_RATE_LIMIT', details:{ retryAfterMs:Math.max(1,LOBBY_CHAT_BURST_WINDOW_MS-(nowMs-rate.burstWindowAtMs)) } };
  const sameLong = !!rate.longWindowAtMs && nowMs-rate.longWindowAtMs < LOBBY_CHAT_LONG_WINDOW_MS;
  const longCount = sameLong ? rate.longCount : 0;
  if (longCount >= LOBBY_CHAT_LONG_MAX) return { ok:false, code:'LOBBY_CHAT_RATE_LIMIT', details:{ retryAfterMs:Math.max(1,LOBBY_CHAT_LONG_WINDOW_MS-(nowMs-rate.longWindowAtMs)) } };
  return { ok:true, next:{
    lastChatAtMs:nowMs,
    burstWindowAtMs:sameBurst ? rate.burstWindowAtMs : nowMs,
    burstCount:burstCount+1,
    longWindowAtMs:sameLong ? rate.longWindowAtMs : nowMs,
    longCount:longCount+1,
    lastNormalizedText:normalizedText,
    lastTextAtMs:nowMs
  }};
}
