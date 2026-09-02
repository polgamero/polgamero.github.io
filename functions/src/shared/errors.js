import { HttpsError } from 'firebase-functions/v2/https';

const MAP = Object.freeze({
  AUTH_REQUIRED: ['unauthenticated', 'Tenés que iniciar sesión.'],
  INVALID_OPERATION_ID: ['invalid-argument', 'operationId inválido.'],
  OPERATION_ID_PAYLOAD_MISMATCH: ['failed-precondition', 'Ese operationId ya fue usado con otro payload.'],
  ECONOMY_DISABLED: ['unavailable', 'La economía está temporalmente pausada.'],
  ECONOMY_CLIENT_TOO_OLD: ['failed-precondition', 'Actualizá Argentinia para usar esta operación económica.'],
  INVALID_ECONOMY_REQUEST: ['invalid-argument', 'Solicitud económica inválida.'],
  RATE_LIMITED: ['resource-exhausted', 'Demasiadas operaciones económicas. Esperá un momento e intentá de nuevo.'],
  USERNAME_TAKEN: ['already-exists', 'Ese nombre ya está usado.'],
  USERNAME_ALREADY_CONFIGURED: ['failed-precondition', 'La cuenta ya tiene un nombre configurado.'],
  USERNAME_REQUIRED: ['failed-precondition', 'Primero elegí tu nombre en Argentinia.'],
  USERNAME_LENGTH: ['invalid-argument', 'Usá entre 3 y 18 caracteres.'],
  USERNAME_CHARS: ['invalid-argument', 'Usá letras, números, espacios o guion bajo.'],
  USERNAME_KEY_LENGTH: ['invalid-argument', 'El nombre debe tener al menos 3 caracteres visibles.'],
  USERNAME_RESERVED: ['invalid-argument', 'Ese nombre está reservado por Argentinia.'],
  USERNAME_BLOCKED: ['invalid-argument', 'Ese nombre no está permitido.'],
  STARTER_IDENTITY_INVALID: ['invalid-argument', 'Elegí uno o dos colores válidos para el mazo inicial.'],
  STARTER_ALREADY_COMPLETED: ['failed-precondition', 'El mazo inicial ya fue asignado.'],
  STARTER_PROFILE_MISSING: ['failed-precondition', 'La cuenta todavía no está inicializada.'],
  STARTER_POOL_INVALID: ['internal', 'El pool trusted del servidor no pudo construir un starter válido.'],
  PROFILE_MISSING: ['failed-precondition', 'No se encontró tu perfil.'],
  CAMPAIGN_POLICY_UNAVAILABLE: ['unavailable', 'No se pudo validar la política de campañas. Probá de nuevo.'],
  STORE_INSUFFICIENT_POINTS: ['failed-precondition', 'No te alcanzan los puntos para este sobre.'],
  CRAFT_CARD_NOT_ELIGIBLE: ['invalid-argument', 'Por ahora sólo se pueden mejorar Criaturas.'],
  CRAFT_KEYWORD_INVALID: ['invalid-argument', 'Esa mejora no está habilitada.'],
  CRAFT_CARD_NOT_OWNED: ['failed-precondition', 'No tenés esa carta en tu colección.'],
  CRAFT_ALREADY_ENHANCED: ['failed-precondition', 'Esa carta ya tiene una mejora.'],
  CRAFT_INSUFFICIENT_FICHAS: ['failed-precondition', 'No te alcanzan las Fichas.'],
  PREBUILT_NOT_FOUND: ['not-found', 'Ese mazo prearmado no existe.'],
  PREBUILT_NAME_REQUIRED: ['invalid-argument', 'Elegí un nombre para el mazo.'],
  PREBUILT_NAME_TOO_LONG: ['invalid-argument', 'El nombre del mazo no puede tener más de 30 caracteres.'],
  PREBUILT_DECK_LIMIT: ['failed-precondition', 'Ya alcanzaste el máximo de mazos guardados.'],
  PREBUILT_ALREADY_PURCHASED: ['failed-precondition', 'Ese mazo prearmado ya fue comprado por esta cuenta.'],
  PREBUILT_INSUFFICIENT_FUNDS: ['failed-precondition', 'No te alcanzan los puntos o las Fichas.'],
  CLASSIFIEDS_WEEK_NOT_PUBLISHED: ['failed-precondition', 'Los Avisos Clasificados de esta semana todavía no fueron publicados.'],
  CLASSIFIEDS_SCHEDULE_INVALID: ['internal', 'La publicación de Avisos Clasificados no supera su contrato trusted.'],
  CLASSIFIEDS_CARD_NOT_OFFERED: ['failed-precondition', 'Esa carta no forma parte de los Avisos Clasificados de esta semana.'],
  CLASSIFIEDS_ALREADY_PURCHASED: ['failed-precondition', 'Esa carta ya la compraste esta semana.'],
  CLASSIFIEDS_INSUFFICIENT_FUNDS: ['failed-precondition', 'No te alcanzan los puntos o las Fichas para comprar esta carta.'],
  CLASSIFIEDS_SLOT_LIMIT_REACHED: ['failed-precondition', 'Ya alcanzaste el cupo semanal para esa rareza.'],
  USERNAME_ACTIVE_MATCH: ['failed-precondition', 'Terminá tu partida multiplayer antes de cambiar el nombre.'],
  USERNAME_SAME: ['failed-precondition', 'Ese ya es tu nombre actual.'],
  USERNAME_NOT_ENOUGH_FICHAS: ['failed-precondition', 'No tenés suficientes Fichas.'],
  USERNAME_REGISTRY_MISMATCH: ['failed-precondition', 'La reserva del nombre actual está inconsistente.'],
  INTERNAL: ['internal', 'Error interno de Economy Authority.']
});

export function economyError(code, details = undefined, overrideMessage = undefined) {
  const [httpsCode, defaultMessage] = MAP[code] || MAP.INTERNAL;
  const error = new HttpsError(httpsCode, overrideMessage || defaultMessage, { code, ...(details || {}) });
  error.argentiniaCode = code;
  return error;
}

export function errorCode(error) {
  return error?.argentiniaCode || error?.details?.code || error?.code || 'INTERNAL';
}
