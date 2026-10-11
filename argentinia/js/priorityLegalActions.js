// Stage C — proof-of-absence, NOT a heuristic about mana/cards.
// False-negative (manual hold) is acceptable; false-positive (skipped legal play) is NOT.
// Only a very narrow, auditable state is considered devoid of relevant actions.
const BASIC_LAND_IDS = new Set(['tier_001','tier_002','tier_003','tier_004','tier_005',
  'tier_006','tier_007','tier_008','tier_009','tier_010','tier_036']);
const LOCAL_ACTION_ZONES = Object.freeze([
  'localHand','localCombat','localSupport','localPlaneswalkers',
  'localGraveyard','localExile'
]);
const EXOTIC_ACTION_STATES = Object.freeze([
  'activeEffects','localSuspended','suspendedCards','suspendedSpells',
  'localAdventureCards','localForetellCards','localCommandZone',
  'localPlayPermissions','exilePlayPermissions','exilePlayPermissionLedger',
  'scheduledReturns','deferredLandManaTriggers'
]);
const ZERO_POOL_KEYS = Object.freeze(['W','U','B','R','G','C','colorless','generic','white','blue','black','red','green']);
function emptyOrZeroPool(pool) {
  if (!pool || typeof pool !== 'object' || Array.isArray(pool)) return false;
  for (const [key,value] of Object.entries(pool)) {
    if (!ZERO_POOL_KEYS.includes(key) || !Number.isFinite(Number(value)) || Number(value)!==0) return false;
  }
  return true;
}
export function proveNoRelevantLegalActions(s,{stackDepth=NaN}={}) {
  if (!s || s.currentMatch || !Number.isSafeInteger(stackDepth) || stackDepth !== 0)
    return Object.freeze({legalActions:'unknown',reason:'nonlocal_or_stack'});
  for (const zone of LOCAL_ACTION_ZONES) {
    if (!Array.isArray(s[zone])) return Object.freeze({legalActions:'unknown',reason:'unverified_zone'});
    if (s[zone].length) return Object.freeze({legalActions:'unknown',reason:'possible_zone_action'});
  }
  for (const key of EXOTIC_ACTION_STATES) {
    if (s[key] && (!Array.isArray(s[key]) || s[key].length))
      return Object.freeze({legalActions:'unknown',reason:'exotic_permission_or_effect'});
  }
  if (!emptyOrZeroPool(s.localManaPool)) return Object.freeze({legalActions:'unknown',reason:'floating_mana_or_unknown_pool'});
  if (!Array.isArray(s.localLands)) return Object.freeze({legalActions:'unknown',reason:'unverified_lands'});
  // Tapped basic lands are the only permitted permanents. Any nonbasic/untapped/
  // enchantment/animated or granted ability retains manual priority.
  for (const item of s.localLands) {
    const type = String(item?.card?.type ?? '').toLowerCase();
    if (item?.tapped !== true || !/^tierra\s+básica(?:\s|—|$)/i.test(type) ||
        !BASIC_LAND_IDS.has(String(item?.card?.id ?? '')) ||
        item.isAnimatedLand || item.grantedAbilities?.length || item.tempEffects?.length ||
        item.card?.activatedAbilities?.length || item.card?.abilities?.length)
      return Object.freeze({legalActions:'unknown',reason:'possible_land_action'});
  }
  return Object.freeze({legalActions:'none',reason:'provably_empty_local_actions'});
}
