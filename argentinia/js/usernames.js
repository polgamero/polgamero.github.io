// js/usernames.js — Entrega 23.13.24
// Contrato puro de usernames de Argentinia: limpieza, clave canónica, validación y filtro.
// NO toca Firebase ni UI para poder probarse de forma aislada.

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 18;
export const USERNAME_RENAME_COST = 1;

const ALLOWED_USERNAME_RE = /^[A-Za-z0-9_ÁÉÍÓÚÜÑáéíóúüñ ]+$/u;
const RESERVED_KEYS = new Set([
  'admin', 'administrator', 'administrador', 'argentinia', 'soporte', 'support',
  'sistema', 'system', 'moderador', 'moderator', 'eltano', 'tano'
]);

// Lista deliberadamente acotada a insultos/palabras claramente ofensivas. Se evalúa por
// token (no por substring) para no bloquear nombres inocentes como "Computadora".
const BLOCKED_WORDS = new Set([
  'puta', 'puto', 'putas', 'putos', 'mierda', 'mierdas', 'concha', 'conchas',
  'orto', 'pija', 'pijas', 'verga', 'vergas', 'coger', 'cogida', 'cogido',
  'pelotudo', 'pelotuda', 'pelotudos', 'pelotudas', 'boludo', 'boluda',
  'boludos', 'boludas', 'forro', 'forra', 'forros', 'forras', 'gilipollas',
  'idiota', 'idiotas', 'imbecil', 'imbeciles', 'mogolico', 'mogolica',
  'mogolicos', 'mogolicas'
]);

function collapseSpaces(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeForProfanity(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's');
}

export function sanitizeUsernameInput(raw) {
  return collapseSpaces(raw);
}

// La key que reserva Firestore es case-insensitive y también ignora espacios. Así
// "El Pibe", "el pibe" y "ELPIBE" compiten por la MISMA identidad global.
// Se conservan acentos y guion bajo: "Jose" y "José" son nombres distintos.
export function usernameKeyFromName(raw) {
  return sanitizeUsernameInput(raw).toLocaleLowerCase('es-AR').replace(/ /g, '');
}

export function containsBlockedUsernameWord(raw) {
  const normalized = normalizeForProfanity(sanitizeUsernameInput(raw));
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some(token => BLOCKED_WORDS.has(token));
}

export function validateUsername(raw) {
  const username = sanitizeUsernameInput(raw);
  const usernameKey = usernameKeyFromName(username);

  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    return {
      ok: false,
      code: 'USERNAME_LENGTH',
      message: `Usá entre ${USERNAME_MIN_LENGTH} y ${USERNAME_MAX_LENGTH} caracteres.`,
      username,
      usernameKey
    };
  }

  if (!ALLOWED_USERNAME_RE.test(username)) {
    return {
      ok: false,
      code: 'USERNAME_CHARS',
      message: 'Usá letras, números, espacios o guion bajo. No se permiten otros símbolos.',
      username,
      usernameKey
    };
  }

  if (usernameKey.length < USERNAME_MIN_LENGTH) {
    return {
      ok: false,
      code: 'USERNAME_KEY_LENGTH',
      message: `El nombre debe tener al menos ${USERNAME_MIN_LENGTH} caracteres visibles.`,
      username,
      usernameKey
    };
  }

  if (RESERVED_KEYS.has(usernameKey)) {
    return {
      ok: false,
      code: 'USERNAME_RESERVED',
      message: 'Ese nombre está reservado por Argentinia. Elegí otro.',
      username,
      usernameKey
    };
  }

  if (containsBlockedUsernameWord(username)) {
    return {
      ok: false,
      code: 'USERNAME_BLOCKED',
      message: 'Ese nombre no está permitido. Elegí otro.',
      username,
      usernameKey
    };
  }

  return { ok: true, code: null, message: '', username, usernameKey };
}

export function isUsernameConfigured(profile) {
  return !!(
    profile
    && typeof profile.username === 'string'
    && profile.username.trim()
    && typeof profile.usernameKey === 'string'
    && profile.usernameKey.trim()
  );
}
