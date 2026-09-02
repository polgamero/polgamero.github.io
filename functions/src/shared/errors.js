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
