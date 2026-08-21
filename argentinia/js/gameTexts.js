// js/gameTexts.js — Entrega 23.13.22
// Infraestructura central de copy humano visible para Argentinia.
//
// IMPORTANTE:
// - Este módulo NO importa Firebase y NO participa del boot crítico.
// - Los textos hardcodeados existentes todavía NO fueron migrados en esta entrega.
// - Los overrides remotos son opcionales: si faltan, fallan o son inválidos, siempre gana
//   el default local de esta versión.
// - gameText() devuelve TEXTO PLANO. Los consumidores futuros deben usar textContent (o
//   escapeHtml si un contexto legacy obliga a interpolarlo dentro de innerHTML).

export const GAME_TEXTS_SCHEMA_VERSION = 1;
export const GAME_TEXT_MAX_LENGTH = 1200;

// Catálogo inicial mínimo. Las Etapas 5 y 6 ampliarán esta tabla al migrar copy real del
// juego. Arrancamos solamente con acciones neutras para probar la infraestructura sin
// modificar ninguna pantalla existente en 23.13.22.
export const GAME_TEXT_DEFINITIONS = Object.freeze({
  'common.back': Object.freeze({
    category: 'General',
    defaultText: 'Volver',
    description: 'Acción genérica para regresar a la pantalla anterior.'
  }),
  'common.cancel': Object.freeze({
    category: 'General',
    defaultText: 'Cancelar',
    description: 'Acción genérica para cancelar una operación sin guardar cambios.'
  }),
  'common.loading': Object.freeze({
    category: 'General',
    defaultText: 'Cargando…',
    description: 'Estado genérico mientras una operación está en curso.'
  }),
  'common.reset': Object.freeze({
    category: 'General',
    defaultText: 'Restaurar',
    description: 'Acción genérica para volver al valor original/default.'
  }),
  'common.save': Object.freeze({
    category: 'General',
    defaultText: 'Guardar',
    description: 'Acción genérica para confirmar y guardar cambios.'
  })
});

export const GAME_TEXT_DEFAULTS = Object.freeze(Object.fromEntries(
  Object.entries(GAME_TEXT_DEFINITIONS).map(([key, definition]) => [key, definition.defaultText])
));

let activeOverrides = Object.freeze({});
const warnedUnknownKeys = new Set();

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isValidTextValue(value) {
  return typeof value === 'string' && value.length <= GAME_TEXT_MAX_LENGTH;
}

function extractOverrideSource(documentData) {
  if (!isRecord(documentData)) return null;
  if (documentData.schemaVersion != null && documentData.schemaVersion !== GAME_TEXTS_SCHEMA_VERSION) return null;
  return isRecord(documentData.overrides) ? documentData.overrides : null;
}

// Normaliza un documento gameConfig/texts. Sólo acepta claves conocidas por ESTA build.
// Así un override viejo/stale nunca puede inventar copy para una key que ya no existe.
export function normalizeGameTextOverrides(documentData) {
  const source = extractOverrideSource(documentData);
  if (!source) return {};

  const normalized = {};
  for (const [key, value] of Object.entries(source)) {
    if (!hasOwn(GAME_TEXT_DEFAULTS, key)) continue;
    if (!isValidTextValue(value)) continue;
    normalized[key] = value;
  }
  return normalized;
}

export function applyGameTextOverrides(documentData) {
  activeOverrides = Object.freeze(normalizeGameTextOverrides(documentData));
  return getGameTextOverridesSnapshot();
}

export function resetGameTextOverrides() {
  activeOverrides = Object.freeze({});
}

export function getGameTextOverridesSnapshot() {
  return { ...activeOverrides };
}

export function hasGameTextKey(key) {
  return typeof key === 'string' && hasOwn(GAME_TEXT_DEFAULTS, key);
}

export function getGameTextDefault(key) {
  return hasGameTextKey(key) ? GAME_TEXT_DEFAULTS[key] : null;
}

export function getGameTextPlaceholders(text) {
  const found = new Set();
  String(text ?? '').replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_match, name) => {
    found.add(name);
    return _match;
  });
  return [...found];
}

export function interpolateGameText(text, variables = {}) {
  const source = String(text ?? '');
  const vars = isRecord(variables) ? variables : {};
  return source.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (match, name) => {
    if (!hasOwn(vars, name)) return match;
    const value = vars[name];
    return value == null ? '' : String(value);
  });
}

// Fuente única futura para copy visible. Una key inexistente se devuelve literalmente en
// vez de producir undefined/HTML roto; además se advierte una sola vez por key.
export function gameText(key, variables = {}) {
  const normalizedKey = String(key ?? '');
  if (!hasGameTextKey(normalizedKey)) {
    if (!warnedUnknownKeys.has(normalizedKey)) {
      warnedUnknownKeys.add(normalizedKey);
      try { console.warn(`[GAME_TEXT_UNKNOWN_KEY] ${normalizedKey}`); } catch {}
    }
    return normalizedKey;
  }

  const template = hasOwn(activeOverrides, normalizedKey)
    ? activeOverrides[normalizedKey]
    : GAME_TEXT_DEFAULTS[normalizedKey];
  return interpolateGameText(template, variables);
}

// Lo usará el futuro panel Admin para listar el catálogo sin conocer internamente cómo se
// guardan defaults/overrides. No expone referencias mutables.
export function getGameTextCatalog() {
  return Object.entries(GAME_TEXT_DEFINITIONS).map(([key, definition]) => ({
    key,
    category: definition.category,
    description: definition.description,
    defaultText: definition.defaultText,
    overrideText: hasOwn(activeOverrides, key) ? activeOverrides[key] : null,
    effectiveText: hasOwn(activeOverrides, key) ? activeOverrides[key] : definition.defaultText,
    placeholders: getGameTextPlaceholders(definition.defaultText)
  }));
}

// Payload listo para persistir en gameConfig/texts. updatedAt lo agrega la capa Firebase.
export function buildGameTextOverridesDocument(overrides = activeOverrides) {
  return {
    schemaVersion: GAME_TEXTS_SCHEMA_VERSION,
    overrides: normalizeGameTextOverrides({
      schemaVersion: GAME_TEXTS_SCHEMA_VERSION,
      overrides: isRecord(overrides) ? overrides : {}
    })
  };
}
