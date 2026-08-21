// js/gameTexts.js — Entrega 23.13.29
// Fuente central de copy humano visible + overrides Admin (gameConfig/texts).
//
// CONTRATO:
// - módulo puro: NO importa Firebase y NO participa del boot crítico;
// - gameText() devuelve TEXTO PLANO, nunca HTML ejecutable;
// - los overrides sólo aceptan keys conocidas por esta build;
// - placeholders de cada key deben conservarse exactamente;
// - si Firestore falta/falla/schema no coincide, siempre gana el default local.

export const GAME_TEXTS_SCHEMA_VERSION = 1;
export const GAME_TEXT_MAX_LENGTH = 1200;

function definition(category, defaultText, description) {
  return Object.freeze({ category, defaultText, description });
}

// Etapa 5 — primera migración de copy. Se limita a navegación, cuenta, Tienda,
// Clasificados, Enciclopedia, Cofre/Recompensas y lobby Multiplayer. Prompts/decisiones
// dentro de una partida quedan deliberadamente para la Etapa 6.
export const GAME_TEXT_DEFINITIONS = Object.freeze({
  // General
  'common.back': definition('General', 'Volver', 'Acción genérica para regresar a la pantalla anterior.'),
  'common.cancel': definition('General', 'Cancelar', 'Acción genérica para cancelar sin guardar.'),
  'common.loading': definition('General', 'Cargando…', 'Estado genérico mientras una operación está en curso.'),
  'common.reset': definition('General', 'Restaurar', 'Acción genérica para volver al valor original.'),
  'common.save': definition('General', 'Guardar', 'Acción genérica para guardar cambios.'),
  'common.retry': definition('General', 'Reintentar', 'Acción genérica para intentar nuevamente.'),
  'common.close': definition('General', 'Cerrar', 'Acción genérica para cerrar una ventana.'),
  'common.update': definition('General', 'Actualizar', 'Acción genérica para refrescar información.'),

  // Menú principal
  'menu.play': definition('Menú', 'Jugar (Solitario)', 'Botón principal para iniciar una partida contra el bot.'),
  'menu.multiplayer': definition('Menú', 'Multijugador', 'Botón de acceso al lobby multijugador.'),
  'menu.myDecks': definition('Menú', 'Mis Mazos', 'Botón de acceso a los mazos guardados.'),
  'menu.encyclopedia': definition('Menú', 'Enciclopedia', 'Botón de acceso a la colección/enciclopedia.'),
  'menu.store': definition('Menú', 'Tienda', 'Botón de acceso a la Tienda.'),
  'menu.options': definition('Menú', 'Opciones', 'Botón de acceso a Opciones.'),
  'menu.news.title': definition('Menú', '📰 Noticias', 'Título del panel de noticias.'),
  'menu.news.loading': definition('Menú', 'Cargando…', 'Estado inicial del panel de noticias.'),
  'menu.news.empty': definition('Menú', 'Sin noticias por ahora.', 'Mensaje cuando no hay anuncios publicados.'),
  'menu.news.error': definition('Menú', 'No se pudieron cargar las noticias.', 'Mensaje cuando falla la carga de noticias.'),
  'menu.loginRequiredTooltip': definition('Menú', 'Iniciá sesión para acceder', 'Tooltip de funciones bloqueadas sin sesión.'),

  // Cuenta / username
  'account.admin': definition('Cuenta', '🛠️ Admin', 'Botón de acceso al Panel de Admin.'),
  'account.chest': definition('Cuenta', '🎁 Mi Cofre', 'Botón de acceso a Mi Cofre.'),
  'account.dailyRewards': definition('Cuenta', '🔥 Recompensas diarias', 'Botón de acceso a Recompensas diarias.'),
  'account.points': definition('Cuenta', '{points} puntos', 'Saldo de puntos mostrado junto al avatar.'),
  'account.rename': definition('Cuenta', '✏️ Cambiar nombre · {cost} Ficha', 'Botón para cambiar username.'),
  'account.logout': definition('Cuenta', 'Cerrar sesión', 'Botón para cerrar sesión.'),
  'account.loginGoogle': definition('Cuenta', '🔵 Iniciar sesión con Google', 'Botón de login Google.'),
  'account.connecting': definition('Cuenta', 'Conectando…', 'Estado del botón mientras se abre Auth.'),
  'account.loginError': definition('Cuenta', 'No se pudo iniciar sesión. Probá de nuevo.', 'Error visible de login.'),
  'account.renameActiveMatch': definition('Cuenta', 'Terminá tu partida multiplayer antes de cambiar el nombre.', 'Bloqueo de rename durante partida activa.'),
  'account.renameNeedFichas': definition('Cuenta', 'Necesitás {cost} Ficha para cambiar el nombre.', 'Bloqueo de rename por saldo insuficiente.'),

  'username.setup.title': definition('Cuenta', 'Elegí tu nombre en Argentinia', 'Título de primera elección de username.'),
  'username.setup.subtitle': definition('Cuenta', 'Este será el nombre que verán los demás jugadores. Es único en todo Argentinia.', 'Explicación de primera elección de username.'),
  'username.rename.title': definition('Cuenta', 'Cambiar nombre', 'Título del modal de rename.'),
  'username.rename.subtitle': definition('Cuenta', 'El cambio se aplica a todo el juego y cuesta 1 Ficha.', 'Explicación del rename.'),
  'username.rename.current': definition('Cuenta', 'Nombre actual: {username}', 'Username actual dentro del modal de rename.'),
  'username.input.placeholder': definition('Cuenta', 'Tu nombre', 'Placeholder del input de username.'),
  'username.input.hint': definition('Cuenta', '{min}–{max} caracteres · letras, números, espacios o _', 'Ayuda de formato del username.'),
  'username.rename.cost': definition('Cuenta', 'Disponibles: {available} Ficha(s) · Costo: {cost}', 'Resumen de Fichas en rename.'),
  'username.setup.exit': definition('Cuenta', 'Cerrar sesión', 'Salida del modal obligatorio de username.'),
  'username.rename.cancel': definition('Cuenta', 'Cancelar', 'Cancelar cambio de username.'),
  'username.setup.save': definition('Cuenta', 'USAR ESTE NOMBRE', 'Confirmar primera elección de username.'),
  'username.rename.save': definition('Cuenta', 'CAMBIAR · {cost} FICHA', 'Confirmar cambio pago de username.'),
  'username.error.taken': definition('Cuenta', 'Ese nombre ya está usado. Probá con otro.', 'Username ya reservado.'),
  'username.error.activeMatch': definition('Cuenta', 'Terminá tu partida multiplayer antes de cambiar el nombre.', 'Error de rename durante partida.'),
  'username.error.noFichas': definition('Cuenta', 'Necesitás {cost} Ficha para cambiar el nombre.', 'Error de rename sin Fichas.'),
  'username.error.same': definition('Cuenta', 'Ese ya es tu nombre actual.', 'Error al elegir el mismo username.'),
  'username.error.permission': definition('Cuenta', 'Firestore rechazó el cambio. Verificá que estén publicadas las Rules {rulesVersion}.', 'Error de permisos al persistir username.'),
  'username.error.generic': definition('Cuenta', 'No se pudo guardar el nombre. Revisá tu conexión e intentá de nuevo.', 'Error genérico de persistencia de username.'),
  'username.validation.length': definition('Cuenta', 'Usá entre {min} y {max} caracteres.', 'Validación de largo del username.'),
  'username.validation.chars': definition('Cuenta', 'Usá letras, números, espacios o guion bajo. No se permiten otros símbolos.', 'Validación de caracteres del username.'),
  'username.validation.keyLength': definition('Cuenta', 'El nombre debe tener al menos {min} caracteres visibles.', 'Validación del username normalizado.'),
  'username.validation.reserved': definition('Cuenta', 'Ese nombre está reservado por Argentinia. Elegí otro.', 'Username reservado.'),
  'username.validation.blocked': definition('Cuenta', 'Ese nombre no está permitido. Elegí otro.', 'Username bloqueado por moderación.'),

  // Tienda
  'store.title': definition('Tienda', 'Tienda', 'Título principal de la Tienda.'),
  'store.pointsHow.title': definition('Tienda', 'Cómo conseguir puntos', 'Título del panel explicativo de puntos.'),
  'store.pointsHow.winHard': definition('Tienda', 'Ganarle al Tano en Difícil — {points} puntos', 'Premio por victoria difícil.'),
  'store.pointsHow.winEasy': definition('Tienda', 'Ganarle al Tano en Fácil — {points} puntos', 'Premio por victoria fácil.'),
  'store.pointsHow.lossSolo': definition('Tienda', 'Perder una partida — {points} puntos igual, por animarte a jugar', 'Premio por derrota contra bot.'),
  'store.pointsHow.winPvp': definition('Tienda', 'Ganarle a un rival de verdad (Multijugador) — {points} puntos', 'Premio por victoria PvP.'),
  'store.pointsHow.lossPvp': definition('Tienda', 'Perder contra un rival de verdad — {points} puntos igual', 'Premio por derrota PvP.'),
  'store.pointsHow.abandon': definition('Tienda', 'Abandonar a mitad de partida — {points} puntos', 'Penalidad por abandono.'),
  'store.loginRequired': definition('Tienda', 'Iniciá sesión desde el menú principal para acceder a la Tienda — los puntos y la colección son por cuenta.', 'Mensaje de Tienda sin sesión.'),
  'store.profileMissing': definition('Tienda', 'Todavía no tenés un perfil guardado — jugá tu primera partida logueado para arrancar tu colección, y volvé acá.', 'Mensaje de Tienda sin perfil completo.'),
  'store.balance.points': definition('Tienda', 'Puntos', 'Etiqueta del saldo de Puntos.'),
  'store.balance.fichas': definition('Tienda', 'Fichas', 'Etiqueta del saldo de Fichas.'),
  'store.classifieds.title': definition('Tienda', '📰 Avisos Clasificados', 'Título del acceso a Clasificados.'),
  'store.classifieds.description': definition('Tienda', 'Siete cartas cambian cada lunes: 4 Comunes, 2 Poco Comunes y 1 Rara o Mítica. Cada aviso se puede comprar una sola vez por semana.', 'Explicación breve de Clasificados.'),
  'store.classifieds.open': definition('Tienda', 'Ver las 7 cartas de esta semana', 'Botón para abrir Clasificados.'),
  'store.pack.title': definition('Tienda', 'Sobre — {cost} puntos', 'Título de compra de sobre.'),
  'store.pack.description': definition('Tienda', 'La compra ya no abre el sobre automáticamente: queda guardado en Mi Cofre. Al abrirlo recibís 15 cartas + 1 Ficha.', 'Explicación de compra de sobre.'),
  'store.pack.buy': definition('Tienda', 'Comprar y guardar en Mi Cofre', 'Botón de compra de sobre.'),
  'store.pack.purchasedTitle': definition('Tienda', '✅ Sobre comprado', 'Título posterior a comprar un sobre.'),
  'store.pack.purchasedDescription': definition('Tienda', 'No se abrió todavía: quedó guardado en Mi Cofre para que lo abras cuando quieras.', 'Explicación posterior a comprar un sobre.'),
  'store.pack.goChest': definition('Tienda', 'Ir a Mi Cofre', 'Botón posterior a compra de sobre.'),
  'store.pack.backStore': definition('Tienda', '← Volver a la Tienda', 'Volver a la Tienda desde compra.'),
  'store.craft.title': definition('Tienda', 'Mejora permanente — {cost} Fichas', 'Título del crafting de mejoras.'),
  'store.craft.description': definition('Tienda', 'Elegí una carta que ya tengas (que todavía no esté mejorada) y dale una keyword para siempre, solo en tu colección.', 'Explicación del crafting.'),
  'store.craft.action': definition('Tienda', 'Craftear mejora', 'Botón para iniciar crafting.'),
  'store.craft.missing': definition('Tienda', 'Te faltan {count} Ficha(s)', 'Botón de crafting sin saldo.'),
  'store.craft.noneEligible': definition('Tienda', 'No te queda ninguna carta sin mejorar todavía en tu colección.', 'Mensaje cuando no hay carta elegible.'),
  'store.craft.chooseTitle': definition('Tienda', 'Elegí qué carta mejorar', 'Título del selector de carta a mejorar.'),
  'store.craft.chooseDescription': definition('Tienda', 'Esto gasta {cost} Fichas y es permanente — solo en tu colección.', 'Explicación del selector de crafting.'),

  // Avisos Clasificados
  'classifieds.title': definition('Clasificados', '📰 Avisos Clasificados', 'Título de la cartelera semanal.'),
  'classifieds.weekSubtitle': definition('Clasificados', 'Semana {weekKey} · 7 cartas · destacada {premium}', 'Resumen de la cartelera semanal.'),
  'classifieds.backStore': definition('Clasificados', '← Volver a la Tienda', 'Volver de Clasificados a Tienda.'),
  'classifieds.refresh': definition('Clasificados', 'Actualizar avisos', 'Refrescar oferta semanal.'),
  'classifieds.countdown': definition('Clasificados', 'Renuevan en {remaining} · {rotation}', 'Countdown hasta la próxima semana.'),
  'classifieds.rotating': definition('Clasificados', 'La semana acaba de cambiar · actualizando…', 'Mensaje durante rotación semanal.'),
  'classifieds.owned': definition('Clasificados', 'TENÉS: {count}', 'Cantidad de copias poseídas.'),
  'classifieds.purchased': definition('Clasificados', '✓ COMPRADA', 'Estado de una carta ya comprada.'),
  'classifieds.buy': definition('Clasificados', 'Comprar', 'Botón de compra disponible.'),
  'classifieds.noFunds': definition('Clasificados', 'No te alcanza', 'Botón deshabilitado por saldo insuficiente.'),
  'classifieds.buying': definition('Clasificados', 'Comprando…', 'Estado de compra en curso.'),
  'classifieds.loading': definition('Clasificados', 'Cargando Avisos Clasificados de esta semana…', 'Estado de carga de la cartelera.'),
  'classifieds.error.alreadyPurchased': definition('Clasificados', 'Esa carta ya figura como comprada esta semana.', 'Error de compra repetida.'),
  'classifieds.error.insufficientFunds': definition('Clasificados', 'No te alcanzan los puntos o las Fichas.', 'Error de saldo insuficiente.'),
  'classifieds.error.offerChanged': definition('Clasificados', 'La oferta cambió. Actualizando la semana vigente…', 'Error por rotación/cambio de oferta.'),
  'classifieds.error.notPublished': definition('Clasificados', 'Los Avisos Clasificados de esta semana todavía no fueron publicados.', 'Error de semana no publicada.'),
  'classifieds.error.generic': definition('Clasificados', 'No se pudo completar la compra.', 'Error genérico de compra.'),

  // Enciclopedia
  'encyclopedia.title': definition('Enciclopedia', 'Enciclopedia', 'Título de Enciclopedia.'),
  'encyclopedia.search.placeholder': definition('Enciclopedia', 'Buscar carta...', 'Placeholder del buscador.'),
  'encyclopedia.zoom.title': definition('Enciclopedia', 'Cambiar tamaño de las cartas', 'Tooltip del zoom.'),
  'encyclopedia.filter.sort': definition('Enciclopedia', 'Ordenar', 'Título del filtro de orden.'),
  'encyclopedia.filter.options': definition('Enciclopedia', 'Opciones', 'Título de opciones de propiedad.'),
  'encyclopedia.filter.all': definition('Enciclopedia', 'Mostrar todas', 'Filtro para mostrar todas las cartas.'),
  'encyclopedia.filter.owned': definition('Enciclopedia', 'Solo cartas que poseo', 'Filtro de cartas poseídas.'),
  'encyclopedia.filter.enhanced': definition('Enciclopedia', '✨ Solo mejoradas', 'Filtro de cartas mejoradas.'),
  'encyclopedia.filter.color': definition('Enciclopedia', 'Color', 'Título del filtro de color.'),
  'encyclopedia.filter.rarity': definition('Enciclopedia', 'Rareza', 'Título del filtro de rareza.'),
  'encyclopedia.filter.archetype': definition('Enciclopedia', 'Arquetipo', 'Título del filtro de arquetipo.'),
  'encyclopedia.empty': definition('Enciclopedia', 'No hay cartas que coincidan con estos filtros.', 'Estado vacío de Enciclopedia.'),

  // Cofre / Recompensas
  'chest.title': definition('Recompensas', 'Mi Cofre', 'Título de Mi Cofre.'),
  'chest.subtitle': definition('Recompensas', 'Tus recompensas e items quedan guardados acá hasta que decidas usarlos.', 'Explicación de Mi Cofre.'),
  'chest.loginRequired': definition('Recompensas', 'Iniciá sesión y completá tu perfil para usar Mi Cofre.', 'Mensaje de Cofre sin perfil.'),
  'chest.points.title': definition('Recompensas', 'Puntos', 'Título del item Puntos.'),
  'chest.points.description': definition('Recompensas', 'Tu moneda para comprar sobres en la Tienda.', 'Descripción de Puntos.'),
  'chest.fichas.title': definition('Recompensas', 'Fichas de mejora', 'Título del item Fichas.'),
  'chest.fichas.description': definition('Recompensas', 'Usalas para mejorar permanentemente una carta de tu colección.', 'Descripción de Fichas.'),
  'chest.fichas.action': definition('Recompensas', 'MEJORAR CARTA', 'Botón para usar Fichas.'),
  'chest.packs.title': definition('Recompensas', 'Sobres', 'Título del item Sobres.'),
  'chest.packs.description': definition('Recompensas', '15 cartas + 1 Ficha al abrir. Comprados y regalados usan el mismo inventario.', 'Descripción de Sobres.'),
  'chest.packs.action': definition('Recompensas', 'ABRIR', 'Botón para abrir un sobre.'),
  'chest.mythic.title': definition('Recompensas', 'Carta mítica asegurada', 'Título de recompensa Mythic.'),
  'chest.mythic.description': definition('Recompensas', 'Premio especial: al abrirlo recibís una mítica aleatoria real del pool.', 'Descripción de Mythic garantizada.'),
  'chest.mythic.action': definition('Recompensas', 'REVELAR', 'Botón para revelar Mythic garantizada.'),
  'chest.future': definition('Recompensas', 'El Cofre ya usa un inventario extensible: futuros cosméticos, tickets, regalos de eventos u otros items pueden sumarse sin rediseñar colección/puntos.', 'Nota explicativa del sistema de Cofre.'),

  'daily.title': definition('Recompensas', 'Recompensas diarias', 'Título de Recompensas diarias.'),
  'daily.subtitle': definition('Recompensas', 'Racha de 7 accesos consecutivos', 'Subtítulo de Recompensas diarias.'),
  'daily.loginRequired': definition('Recompensas', 'Iniciá sesión para participar del ciclo de recompensas.', 'Mensaje de Daily Rewards sin sesión.'),
  'daily.day': definition('Recompensas', 'Día {day}', 'Etiqueta de cada día.'),
  'daily.status.claimed': definition('Recompensas', '✓ Reclamado', 'Estado de premio reclamado.'),
  'daily.status.available': definition('Recompensas', 'Disponible', 'Estado de premio disponible.'),
  'daily.status.unlocked': definition('Recompensas', 'Desbloqueado', 'Estado de día desbloqueado.'),
  'daily.status.locked': definition('Recompensas', 'Bloqueado', 'Estado de día bloqueado.'),
  'daily.claim': definition('Recompensas', 'RECLAMAR', 'Botón de claim diario.'),
  'daily.streak': definition('Recompensas', '🔥 Racha actual: {streak} / 7', 'Resumen de racha actual.'),
  'daily.intro': definition('Recompensas', 'Tu primer acceso es siempre el Día 1. Cada día consecutivo avanzás un escalón; si faltás un día, tu próximo acceso vuelve inmediatamente al Día 1.', 'Explicación de la racha.'),
  'daily.cycle.pending': definition('Recompensas', 'Después de completar el Día 7, el acceso del día siguiente empieza un ciclo nuevo. Tenés {count} premio(s) para reclamar.', 'Explicación de ciclo con premios pendientes.'),
  'daily.cycle.none': definition('Recompensas', 'Después de completar el Día 7, el acceso del día siguiente empieza un ciclo nuevo. Tu premio del día aparecerá automáticamente en tu próximo acceso válido.', 'Explicación de ciclo sin premios pendientes.'),
  'daily.help': definition('Recompensas', 'El Día 6 entrega un sobre + 100 puntos. El Día 7 entrega una carta mítica aleatoria asegurada, guardada primero en Mi Cofre. La racha usa la fecha oficial de Firestore en Argentina/UTC−3, no el reloj del dispositivo.', 'Ayuda detallada de Recompensas diarias.'),

  // Lobby multiplayer — no incluye prompts/decisiones de gameplay.
  'multiplayer.title': definition('Multiplayer', 'Multijugador', 'Título del lobby multiplayer.'),
  'multiplayer.create.title': definition('Multiplayer', 'Crear partida', 'Título de creación de lobby.'),
  'multiplayer.create.description': definition('Multiplayer', 'Genera un código de 6 caracteres para compartir con quien quieras que juegue.', 'Explicación de creación de lobby.'),
  'multiplayer.create.action': definition('Multiplayer', 'Crear partida', 'Botón para crear lobby.'),
  'multiplayer.join.title': definition('Multiplayer', 'Unirse con un código', 'Título de unión a lobby.'),
  'multiplayer.join.placeholder': definition('Multiplayer', 'Código de 6 caracteres', 'Placeholder del código.'),
  'multiplayer.join.action': definition('Multiplayer', 'Unirse', 'Botón para unirse a lobby.'),
  'multiplayer.join.empty': definition('Multiplayer', 'Ingresá un código.', 'Error por código vacío.'),
  'multiplayer.create.error': definition('Multiplayer', 'No se pudo crear la partida. Probá de nuevo.', 'Error genérico al crear lobby.'),
  'multiplayer.join.error': definition('Multiplayer', 'No se pudo unir a la partida. Probá de nuevo.', 'Error genérico al unirse.'),
  'multiplayer.waiting.title': definition('Multiplayer', 'Esperando rival…', 'Título de sala de espera.'),
  'multiplayer.waiting.description': definition('Multiplayer', 'Compartí este código con quien quieras que se una a la partida.', 'Explicación de sala de espera.'),
  'multiplayer.incompatible.title': definition('Multiplayer', '⚠️ Versiones incompatibles', 'Título del bloqueo por versiones.'),
  'multiplayer.incompatible.description': definition('Multiplayer', 'Esta notebook usa {localVersion}, pero la partida informa {remoteVersion}. Actualizá ambas pestañas antes de jugar.', 'Explicación del bloqueo por versión.'),
  'multiplayer.matched.title': definition('Multiplayer', '🎉 ¡Emparejado con {rival}!', 'Título al encontrar rival.'),
  'multiplayer.matched.description': definition('Multiplayer', 'Elegí con qué mazo propio vas a jugar esta partida.', 'Explicación antes de elegir mazo.'),
  'multiplayer.matched.start': definition('Multiplayer', 'Elegir mazo y arrancar', 'Botón para continuar a selección de mazo.')
});

export const GAME_TEXT_DEFAULTS = Object.freeze(Object.fromEntries(
  Object.entries(GAME_TEXT_DEFINITIONS).map(([key, def]) => [key, def.defaultText])
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

function sameStringSet(a, b) {
  const aa = [...new Set(a)].sort();
  const bb = [...new Set(b)].sort();
  return aa.length === bb.length && aa.every((value, index) => value === bb[index]);
}

function extractOverrideSource(documentData) {
  if (!isRecord(documentData)) return null;
  if (documentData.schemaVersion != null && documentData.schemaVersion !== GAME_TEXTS_SCHEMA_VERSION) return null;
  return isRecord(documentData.overrides) ? documentData.overrides : null;
}

export function getGameTextPlaceholders(text) {
  const found = new Set();
  String(text ?? '').replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (_match, name) => {
    found.add(name);
    return _match;
  });
  return [...found];
}

export function validateGameTextOverride(key, value) {
  if (!hasOwn(GAME_TEXT_DEFAULTS, key)) return { ok: false, code: 'UNKNOWN_KEY', message: 'La clave no existe en esta versión.' };
  if (typeof value !== 'string') return { ok: false, code: 'NOT_STRING', message: 'El texto debe ser texto plano.' };
  if (value.length > GAME_TEXT_MAX_LENGTH) return { ok: false, code: 'TOO_LONG', message: `Máximo ${GAME_TEXT_MAX_LENGTH} caracteres.` };

  const expected = getGameTextPlaceholders(GAME_TEXT_DEFAULTS[key]);
  const actual = getGameTextPlaceholders(value);
  if (!sameStringSet(expected, actual)) {
    return {
      ok: false,
      code: 'PLACEHOLDERS',
      message: expected.length
        ? `Conservá exactamente estas variables: ${expected.map(name => `{${name}}`).join(', ')}.`
        : 'Este texto no admite variables entre llaves.'
    };
  }
  return { ok: true, code: null, message: '' };
}

// Sólo acepta claves conocidas y overrides válidos para ESTA build. Un documento viejo,
// alterado o con placeholders incompatibles simplemente cae al default local.
export function normalizeGameTextOverrides(documentData) {
  const source = extractOverrideSource(documentData);
  if (!source) return {};

  const normalized = {};
  for (const [key, value] of Object.entries(source)) {
    if (!isValidTextValue(value)) continue;
    if (!validateGameTextOverride(key, value).ok) continue;
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

export function interpolateGameText(text, variables = {}) {
  const source = String(text ?? '');
  const vars = isRecord(variables) ? variables : {};
  return source.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (match, name) => {
    if (!hasOwn(vars, name)) return match;
    const value = vars[name];
    return value == null ? '' : String(value);
  });
}

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

export function getGameTextCatalog() {
  return Object.entries(GAME_TEXT_DEFINITIONS).map(([key, def]) => ({
    key,
    category: def.category,
    description: def.description,
    defaultText: def.defaultText,
    overrideText: hasOwn(activeOverrides, key) ? activeOverrides[key] : null,
    effectiveText: hasOwn(activeOverrides, key) ? activeOverrides[key] : def.defaultText,
    placeholders: getGameTextPlaceholders(def.defaultText)
  }));
}

export function buildGameTextOverridesDocument(overrides = activeOverrides) {
  return {
    schemaVersion: GAME_TEXTS_SCHEMA_VERSION,
    overrides: normalizeGameTextOverrides({
      schemaVersion: GAME_TEXTS_SCHEMA_VERSION,
      overrides: isRecord(overrides) ? overrides : {}
    })
  };
}
