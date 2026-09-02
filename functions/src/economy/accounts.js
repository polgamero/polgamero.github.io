import { FieldValue } from 'firebase-admin/firestore';
import { buildCompetitiveDeck, validateCompetitiveDeck } from '../trusted/deckIntelligence.js';
import { TRUSTED_CARD_POOL, TRUSTED_CARD_POOL_FINGERPRINT } from '../trusted/cardCatalog.js';
import { seededRng } from '../shared/canonical.js';
import { economyError } from '../shared/errors.js';
import { validateUsername } from './usernames.js';

const VALID_COLORS = new Set(['W','U','B','R','G']);

export function normalizeStarterIdentity(value) {
  const identity = Array.isArray(value) ? [...new Set(value.map(v => String(v || '').toUpperCase().trim()).filter(Boolean))] : [];
  if (identity.length < 1 || identity.length > 2 || identity.some(c => !VALID_COLORS.has(c))) {
    throw economyError('STARTER_IDENTITY_INVALID');
  }
  return identity;
}

function defaultInventory() {
  return { standardPacks: 0, guaranteedMythics: 0 };
}
function defaultDailyRewards() {
  return {
    cycleStartDate: null,
    lastLoginDate: null,
    previousLoginDate: null,
    streak: 0,
    unlockedDays: [],
    claimedDays: [],
    lastClaimedDay: null,
    schemaVersion: 0,
    serverCycleStartDay: null,
    serverLastLoginDay: null,
    serverUpdatedAt: null
  };
}
function hasConfiguredIdentity(profile) {
  return !!(typeof profile?.username === 'string' && profile.username.trim() && typeof profile?.usernameKey === 'string' && profile.usernameKey.trim());
}

export async function bootstrapAccountTx({ db, tx, uid, authProfile, usernameRaw }) {
  const validated = validateUsername(usernameRaw);
  if (!validated.ok) throw economyError(validated.code);

  const userRef = db.collection('users').doc(uid);
  const nameRef = db.collection('usernames').doc(validated.usernameKey);
  const [userSnap, nameSnap] = await Promise.all([tx.get(userRef), tx.get(nameRef)]);
  if (nameSnap.exists && nameSnap.data()?.uid !== uid) throw economyError('USERNAME_TAKEN');

  const now = FieldValue.serverTimestamp();
  const identityPatch = { username: validated.username, usernameKey: validated.usernameKey, usernameUpdatedAt: now };
  let created = false;
  let current = userSnap.exists ? userSnap.data() : null;

  if (current) {
    if (hasConfiguredIdentity(current) && current.usernameKey !== validated.usernameKey) {
      throw economyError('USERNAME_ALREADY_CONFIGURED');
    }
    tx.set(userRef, { ...identityPatch, lastSeenAt: now }, { merge: true });
  } else {
    created = true;
    current = {
      displayName: authProfile.displayName || '',
      photoURL: authProfile.photoURL || '',
      email: authProfile.email || '',
      ...identityPatch,
      points: 0,
      collection: [],
      decks: [],
      fichas: 0,
      enhancements: {},
      inventory: defaultInventory(),
      dailyRewards: defaultDailyRewards(),
      activeMatchId: null,
      starterDeckPending: true,
      createdAt: now,
      lastSeenAt: now
    };
    tx.create(userRef, current);
  }

  tx.set(nameRef, {
    uid,
    username: validated.username,
    updatedAt: now,
    ...(nameSnap.exists ? {} : { createdAt: now })
  }, { merge: nameSnap.exists });

  return {
    created,
    username: validated.username,
    usernameKey: validated.usernameKey,
    starterDeckPending: current?.starterDeckPending !== false
  };
}

function shuffleWithRng(items, rng) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function buildTrustedStarterDeck(uid, operationId, identity) {
  const cleanIdentity = normalizeStarterIdentity(identity);
  const rng = seededRng(`${uid}|${operationId}|starter|${cleanIdentity.join('/')}`);
  const built = buildCompetitiveDeck(TRUSTED_CARD_POOL, cleanIdentity, {
    quality: 'starter',
    rng
  });
  const shuffled = shuffleWithRng(built.deck, rng);
  const validation = validateCompetitiveDeck(shuffled, cleanIdentity);
  if (!validation.ok || shuffled.length !== 60) {
    throw economyError('STARTER_POOL_INVALID', { errors: validation.errors || [], size: shuffled.length });
  }
  return {
    identity: cleanIdentity,
    cardIds: shuffled.map(card => card.id),
    archetypeId: built.report?.archetypeId || null,
    deckIntelligenceVersion: built.report?.engineVersion || null,
    trustedPoolFingerprint: TRUSTED_CARD_POOL_FINGERPRINT
  };
}

export async function completeStarterDeckTx({ db, tx, uid, operationId, identity }) {
  const userRef = db.collection('users').doc(uid);
  const userSnap = await tx.get(userRef);
  if (!userSnap.exists) throw economyError('STARTER_PROFILE_MISSING');
  const current = userSnap.data() || {};
  if (!hasConfiguredIdentity(current)) throw economyError('USERNAME_REQUIRED');
  if (current.starterDeckPending !== true) throw economyError('STARTER_ALREADY_COMPLETED');

  const starter = buildTrustedStarterDeck(uid, operationId, identity);
  const nowMs = Date.now();
  tx.update(userRef, {
    collection: starter.cardIds,
    decks: [{ id: 'starter', name: 'Mazo 1', cardIds: starter.cardIds, isDefault: true, createdAt: nowMs }],
    starterDeckPending: false,
    lastSeenAt: FieldValue.serverTimestamp()
  });

  return {
    completed: true,
    identity: starter.identity,
    starterCardIds: starter.cardIds,
    archetypeId: starter.archetypeId,
    deckIntelligenceVersion: starter.deckIntelligenceVersion,
    trustedPoolFingerprint: starter.trustedPoolFingerprint
  };
}
