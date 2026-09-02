const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 18;
const ALLOWED_USERNAME_RE = /^[A-Za-z0-9_ÁÉÍÓÚÜÑáéíóúüñ ]+$/u;
const RESERVED_KEYS = new Set([
  'admin', 'administrator', 'administrador', 'argentinia', 'soporte', 'support',
  'sistema', 'system', 'moderador', 'moderator', 'eltano', 'tano'
]);
const BLOCKED_WORDS = new Set([
  'puta','puto','putas','putos','mierda','mierdas','concha','conchas','orto','pija','pijas','verga','vergas',
  'coger','cogida','cogido','pelotudo','pelotuda','pelotudos','pelotudas','boludo','boluda','boludos','boludas',
  'forro','forra','forros','forras','gilipollas','idiota','idiotas','imbecil','imbeciles','mogolico','mogolica',
  'mogolicos','mogolicas'
]);

function collapseSpaces(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
function normalizeForProfanity(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/0/g,'o').replace(/1/g,'i').replace(/3/g,'e').replace(/4/g,'a').replace(/5/g,'s')
    .replace(/7/g,'t').replace(/@/g,'a').replace(/\$/g,'s');
}
export function usernameKeyFromName(raw) { return collapseSpaces(raw).toLocaleLowerCase('es-AR').replace(/ /g,''); }
function containsBlocked(raw) {
  const tokens = normalizeForProfanity(collapseSpaces(raw)).split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some(token => BLOCKED_WORDS.has(token));
}
export function validateUsername(raw) {
  const username = collapseSpaces(raw);
  const usernameKey = usernameKeyFromName(username);
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) return {ok:false,code:'USERNAME_LENGTH',username,usernameKey};
  if (!ALLOWED_USERNAME_RE.test(username)) return {ok:false,code:'USERNAME_CHARS',username,usernameKey};
  if (usernameKey.length < USERNAME_MIN_LENGTH) return {ok:false,code:'USERNAME_KEY_LENGTH',username,usernameKey};
  if (RESERVED_KEYS.has(usernameKey)) return {ok:false,code:'USERNAME_RESERVED',username,usernameKey};
  if (containsBlocked(username)) return {ok:false,code:'USERNAME_BLOCKED',username,usernameKey};
  return {ok:true,code:null,username,usernameKey};
}
