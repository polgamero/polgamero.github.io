import { ownerRoleForSide } from './zoneOwnership.js';

export function scheduleExtraTurn(state, isLocal) {
  const role = ownerRoleForSide(isLocal, state.currentMatch?.myRole);
  (state.extraTurnRoles ||= []).push(role);
}

export function takeNextTurn(state) {
  const myRole = state.currentMatch?.myRole;
  const localRole = ownerRoleForSide(true, myRole);
  const oppositeRole = ownerRoleForSide(state.activePlayer !== 'local', myRole);
  const extraRole = state.extraTurnRoles?.pop();
  if (extraRole) {
    // Preserve the normal successor of the interrupted turn sequence.
    state.nextRegularTurnRole ||= oppositeRole;
    return extraRole === localRole ? 'local' : 'rival';
  }
  const nextRole = state.nextRegularTurnRole || oppositeRole;
  state.nextRegularTurnRole = null;
  return nextRole === localRole ? 'local' : 'rival';
}
