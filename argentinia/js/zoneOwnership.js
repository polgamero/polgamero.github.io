// Argentinia 23.12.2 — identidad estable de PROPIETARIO de cartas que llegan al battlefield.
//
// `local/rival` cambia de significado entre clientes multiplayer, por eso nunca se persiste
// como identidad wire. En multiplayer usamos host/guest; en Solitario, donde sólo existe una
// perspectiva, local/rival sí es estable. El campo viaja con la carta cuando esa carta forma
// parte del estado público y permite que efectos de destino (mano/cementerio/exilio) respeten
// al propietario aunque la carta esté sobre el lado opuesto del tablero.

export function ownerRoleForSide(isLocal, myRole = null) {
  if (myRole === 'host' || myRole === 'guest') {
    return isLocal ? myRole : (myRole === 'host' ? 'guest' : 'host');
  }
  return isLocal ? 'local' : 'rival';
}

export function stampCardOwner(card, isLocal, myRole = null) {
  if (!card || typeof card !== 'object') return card;
  // Una vez conocida una identidad estable, nunca la reescribimos por cambiar de controlador.
  if (!card._ownerRole) card._ownerRole = ownerRoleForSide(!!isLocal, myRole);
  return card;
}

export function cardOwnerIsLocal(card, fallbackIsLocal, myRole = null) {
  const role = card?._ownerRole || null;
  if (myRole === 'host' || myRole === 'guest') {
    if (role === 'host' || role === 'guest') return role === myRole;
  } else if (role === 'local' || role === 'rival') {
    return role === 'local';
  }
  // Compatibilidad con partidas/objetos viejos sin metadata de owner. El pool actual no tiene
  // efectos de cambio de control, así que el lado del battlefield coincide con el propietario.
  return !!fallbackIsLocal;
}

export function zoneForCardOwner(card, localZone, rivalZone, fallbackIsLocal, myRole = null) {
  return cardOwnerIsLocal(card, fallbackIsLocal, myRole) ? localZone : rivalZone;
}
