// HF23.1 — Community moderation policy. Pure/testable and shared by Lobby + in-match chat.
// The built-in list is intentionally Argentine-aware; Admin can extend it server-side.
export const COMMUNITY_BLOCKED_WORDS_DEFAULT = Object.freeze([
  'boludo','boluda','pelotudo','pelotuda','forro','forra','sorete','mierda','puto','puta',
  'concha','conchudo','conchuda','pajero','pajera','mogolico','mogolica','imbecil','idiota',
  'pija','pijudo','pijuda','verga','poronga','orto','cajeta','culiado','culiada','forrito','forrita'
]);

export const COMMUNITY_BLOCKED_PHRASES_DEFAULT = Object.freeze([
  'hijo de puta','hija de puta','la concha de tu madre','andate a la mierda','chupame la pija'
]);

const LEET_MAP = Object.freeze({ '4':'a','@':'a','3':'e','1':'i','0':'o','5':'s','$':'s','7':'t' });

export function moderationCanonical(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split('').map(ch => LEET_MAP[ch] || ch).join('')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Repeated letters are a common bypass ("pijaaaa", "forrrro"). Compare a second
// normalized skeleton, and apply the same transform to policy terms to avoid asymmetry.
export function moderationSkeleton(value) {
  return moderationCanonical(value).replace(/([a-z0-9])\1+/g, '$1');
}

function normalizePolicyWords(words = []) {
  const canonical = new Set();
  const skeleton = new Set();
  for (const raw of words) {
    const word = moderationCanonical(raw);
    if (!word || word.includes(' ')) continue;
    canonical.add(word);
    skeleton.add(moderationSkeleton(word));
  }
  return { canonical, skeleton };
}

function normalizePolicyPhrases(phrases = []) {
  return [...new Set(phrases.map(moderationCanonical).filter(Boolean))];
}

function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function matchesSpacedObfuscation(text, word) {
  // Canonical text converts punctuation to spaces, so this catches p.i.j.a / p i j a / p-i-j-a
  // without turning "pijama" into a false positive: both ends remain real word boundaries.
  const chars = [...String(word || '')].map(escapeRegExp);
  if (chars.length < 2) return false;
  return new RegExp(`\\b${chars.join('\\s*')}\\b`, 'u').test(text);
}

export function communityContainsBlockedLanguage(value, extraWords = [], extraPhrases = []) {
  const canonical = moderationCanonical(value);
  if (!canonical) return false;
  const skeletonText = moderationSkeleton(value);
  const phrases = normalizePolicyPhrases([...COMMUNITY_BLOCKED_PHRASES_DEFAULT, ...(Array.isArray(extraPhrases) ? extraPhrases : [])]);
  if (phrases.some(phrase => canonical.includes(phrase) || skeletonText.includes(moderationSkeleton(phrase)))) return true;
  const policy = normalizePolicyWords([...COMMUNITY_BLOCKED_WORDS_DEFAULT, ...(Array.isArray(extraWords) ? extraWords : [])]);
  const tokens = canonical.split(' ');
  const skeletonTokens = skeletonText.split(' ');
  if (tokens.some(token => policy.canonical.has(token)) || skeletonTokens.some(token => policy.skeleton.has(token))) return true;
  return [...policy.skeleton].some(word => matchesSpacedObfuscation(skeletonText, word));
}

export function normalizeCommunityBlockedWords(words) {
  if (!Array.isArray(words)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of words) {
    const word = moderationCanonical(raw);
    if (!word || word.length > 40 || word.includes(' ') || seen.has(word)) continue;
    seen.add(word); out.push(word);
    if (out.length >= 200) break;
  }
  return out;
}
