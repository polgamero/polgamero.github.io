import { economyError } from './errors.js';

export function requireAuth(request) {
  const uid = String(request?.auth?.uid || '').trim();
  if (!uid) throw economyError('AUTH_REQUIRED');
  return {
    uid,
    token: request.auth.token || {},
    appCheckPresent: !!request?.app
  };
}

export function trustedProfileFields(authContext) {
  const token = authContext?.token || {};
  return {
    displayName: typeof token.name === 'string' ? token.name : '',
    photoURL: typeof token.picture === 'string' ? token.picture : '',
    email: typeof token.email === 'string' ? token.email : ''
  };
}
