// js/firebaseClient.js
//
// Fase 0 del multiplayer: conecta el SDK de Firebase (Auth + Firestore) y expone un puñado
// de funciones chicas para que el resto del juego no tenga que saber nada de Firebase por
// dentro — ni ui.js ni main.js importan nada de gstatic.com directamente, todo pasa por acá.
//
// Import vía CDN con <script type="module">, sin bundler — misma filosofía que el resto del
// proyecto (JS puro con módulos ES6). Referencia oficial: firebase.google.com/docs/web/setup
//
// Los valores de firebaseConfig son datos PÚBLICOS a propósito: viajan en el código que le
// llega a cualquier jugador en el navegador. Lo que protege la base de datos de verdad son
// las Reglas de Seguridad de Firestore (Fase 1 en adelante), no que esto esté "oculto".
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, runTransaction, serverTimestamp, onSnapshot, getDocs, collection } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { cardDb } from './cardLoader.js';
import { DECK_SIZE_EXACT, MAX_COPIES_PER_CARD, MAX_ENHANCED_CARDS_PER_DECK, ENHANCED_SUFFIX } from './store.js';

const firebaseConfig = {
  apiKey: "AIzaSyAAvUAaZ35_sF9uCsecLPg7zqhB7mLa7yo",
  authDomain: "argentinia-tcg.firebaseapp.com",
  projectId: "argentinia-tcg",
  storageBucket: "argentinia-tcg.firebasestorage.app",
  messagingSenderId: "624830573266",
  appId: "1:624830573266:web:55ff4c56665f33a5821b0b"
};

const app = initializeApp(firebaseConfig);

// Se exportan por si Fase 1 en adelante necesita usarlos directo (ej. leer/escribir la
// colección del jugador en Firestore) — hoy (Fase 0) nadie más los usa todavía.
export const auth = getAuth(app);
export const db = getFirestore(app);

// El scope de foto de perfil (photoURL) ya viene incluido en el perfil básico de Google —
// no hace falta pedir ningún permiso extra aparte, alcanza con el login estándar.
const googleProvider = new GoogleAuthProvider();

// Devuelve una Promise que resuelve con el UserCredential de Firebase, o rechaza si el
// jugador cerró el popup, lo bloqueó el navegador, o falló la red. Quien llama decide qué
// hacer con el error (Fase 0: solo mostrarlo, no hay nada más "grave" atado al login todavía).
export function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export function signOutUser() {
  return signOut(auth);
}

// onChange(user) se dispara solo, automáticamente, cada vez que el estado de sesión cambia
// (login, logout, o al recargar la página si ya había una sesión activa) — con el objeto de
// usuario de Firebase, o null si no hay nadie logueado. Devuelve la función de unsubscribe
// por si en el futuro hace falta cortar la escucha (hoy se usa una sola vez, en boot()).
export function onAuthChange(onChange) {
  return onAuthStateChanged(auth, onChange);
}

// ============================================================================
// FASE 1: perfil de jugador en Firestore (colección `users`, un documento por uid).
//
// Forma del documento:
//   { displayName, photoURL, email,
//     points: number,
//     collection: string[],   // IDs de carta, CON repetidos = copias que tenés
//     decks: [{ id, name, cardIds: string[], isDefault, createdAt }],  // hasta 5, el
//       primero ("starter") se crea solo con el mazo inicial random (Fase 3)
//     fichas: number,          // Fase 2: 1 por sobre comprado
//     enhancements: { [cardId]: keyword },  // Fase 2: mejoras permanentes por Ficha
//     createdAt, lastSeenAt }
//
// Nadie fuera de este archivo arma una referencia a `users/{uid}` a mano — todo pasa por
// estas 3 funciones, para que el resto del juego no tenga que saber nada de la forma real
// del documento ni de cómo está guardado.
// ============================================================================

// Devuelve el documento del jugador, o null si todavía no existe (recién se logueó por
// primera vez y nunca terminó de armar su colección inicial).
export async function loadUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

// Se llama UNA sola vez por cuenta, la primera vez que alguien logueado termina de armar
// su primer mazo random — ESE mazo (60 cartas, con copias) se convierte en su colección
// inicial persistente. No se vuelve a llamar después: quien llama (initGame, main.js) ya
// se asegura de eso comprobando que loadUserProfile haya devuelto null antes de invocarla.
export async function createUserProfile(uid, profileFields, starterCardIds) {
  const data = {
    displayName: profileFields.displayName || '',
    photoURL: profileFields.photoURL || '',
    email: profileFields.email || '',
    points: 0,
    collection: starterCardIds,
    // El mazo inicial random TAMBIÉN queda guardado como un mazo de verdad, no solo como
    // colección suelta — así "Mis Mazos" ya tiene algo para mostrar desde el primer
    // momento (Fase 3, Etapa 1). Usa Date.now() en vez de serverTimestamp() a propósito:
    // los timestamps de servidor de Firestore NO se resuelven bien adentro de un array
    // (quedan en null), así que un timestamp de cliente es lo correcto acá.
    decks: [
      { id: 'starter', name: 'Mazo 1', cardIds: starterCardIds, isDefault: true, createdAt: Date.now() }
    ],
    fichas: 0,
    enhancements: {},
    // Fase 4, Etapa 6: null hasta que se crea/une a una partida multiplayer real —
    // ver setActiveMatchId/clearActiveMatchId, más abajo en este archivo.
    activeMatchId: null,
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp()
  };
  await setDoc(doc(db, 'users', uid), data);
  return data;
}

// Actualiza SOLO la marca de última conexión, sin tocar el resto del documento (merge:true)
// — se llama cada vez que un jugador YA existente vuelve a loguearse.
export function touchLastSeen(uid) {
  return setDoc(doc(db, 'users', uid), { lastSeenAt: serverTimestamp() }, { merge: true });
}

// Borra el documento completo del jugador — colección, puntos, Fichas, mazos, todo. Pensada
// para testing/desarrollo (reiniciar tu propia cuenta), pero cualquiera puede borrar LA
// SUYA — no hace falta un rol especial, las reglas de Firestore ya limitan esto a "tu
// propio documento". La confirmación (escribir "ELIMINAR") vive en la UI, no acá — esta
// función no vuelve a preguntar nada, ejecuta directo.
export function deleteUserProfile(uid) {
  return deleteDoc(doc(db, 'users', uid));
}

// ============================================================================
// FASE 2: economía (puntos, sobres, Fichas). Las 3 funciones de abajo usan una
// TRANSACCIÓN de Firestore cada una — no un simple "leer y después escribir" — para que
// dos escrituras casi simultáneas (ej. doble click comprando un sobre) no puedan pisarse
// entre sí ni gastar puntos/Fichas que ya no estaban. Firestore reintenta la transacción
// sola si detecta que el documento cambió en el medio.
// ============================================================================

// Suma (o resta) puntos de forma atómica, y nunca deja el total por debajo de 0 — se usa
// tanto para premiar victorias/derrotas como para penalizar abandonos (delta negativo).
// Devuelve el total de puntos ya actualizado.
export async function awardPoints(uid, delta) {
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? (snap.data().points || 0) : 0;
    const next = Math.max(0, current + delta);
    tx.update(ref, { points: next });
    return next;
  });
}

// Compra un sobre: valida DENTRO de la misma transacción que le alcancen los puntos (si no
// alcanzan, tira un error y no toca nada), descuenta el costo, y suma las cartas nuevas +
// 1 Ficha a la colección. Devuelve el perfil ya actualizado.
export async function purchasePack(uid, cost, newCardIds) {
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('No se encontró tu perfil.');
    const data = snap.data();
    const currentPoints = data.points || 0;
    if (currentPoints < cost) throw new Error('No te alcanzan los puntos para este sobre.');

    const updated = {
      points: currentPoints - cost,
      collection: [...(data.collection || []), ...newCardIds],
      fichas: (data.fichas || 0) + 1
    };
    tx.update(ref, updated);
    return { ...data, ...updated };
  });
}

// Craftea una mejora permanente: gasta `fichaCost` Fichas para taggear UNA carta que ya
// tenés (y que todavía no esté mejorada) con una keyword de la lista curada
// (ENHANCEMENT_KEYWORDS en store.js). Devuelve el perfil ya actualizado.
export async function craftEnhancement(uid, cardId, keyword, fichaCost) {
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('No se encontró tu perfil.');
    const data = snap.data();
    const currentFichas = data.fichas || 0;
    if (currentFichas < fichaCost) throw new Error('No te alcanzan las Fichas.');
    const enhancements = data.enhancements || {};
    if (enhancements[cardId]) throw new Error('Esa carta ya tiene una mejora.');
    if (!(data.collection || []).includes(cardId)) throw new Error('No tenés esa carta en tu colección.');

    const updated = {
      fichas: currentFichas - fichaCost,
      enhancements: { ...enhancements, [cardId]: keyword }
    };
    tx.update(ref, updated);
    return { ...data, ...updated };
  });
}

// FASE 3, ETAPA 2: crea un mazo nuevo (hasta 5 en total, contando el inicial). Todo
// validado DENTRO de la transacción — no confía en que el cliente ya haya chequeado esto,
// lo vuelve a comprobar del lado "servidor": máximo de mazos, nombre no vacío, al menos
// una carta, y que ninguna carta use más copias de las que realmente están en tu colección.
export async function createDeck(uid, name, cardIds) {
  const ref = doc(db, 'users', uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('No se encontró tu perfil.');
    const data = snap.data();
    const decks = data.decks || [];

    if (decks.length >= 5) throw new Error('Ya tenés el máximo de 5 mazos.');
    if (!name || !name.trim()) throw new Error('El mazo necesita un nombre.');
    // FASE 3, ETAPA 3: tamaño de mazo rígido — ni de más, ni de menos. (Sí, en el
    // reglamento real de MTG 60 es un PISO, no un tope — acá se decidió a propósito que
    // sea exacto para esta versión del juego.)
    if (!cardIds || cardIds.length !== DECK_SIZE_EXACT) {
      throw new Error(`El mazo tiene que tener exactamente ${DECK_SIZE_EXACT} cartas (tiene ${cardIds ? cardIds.length : 0}).`);
    }

    const ownedCounts = {};
    (data.collection || []).forEach(id => { ownedCounts[id] = (ownedCounts[id] || 0) + 1; });

    // FASE 3 (revisión): "crea_028::enhanced" representa la copia puntual mejorada por
    // Fichas — para el tope de copias/posesión cuenta como la MISMA carta base que
    // "crea_028" (no podés tener 4 planas + 1 mejorada = 5, seguiría violando la 100.2a),
    // pero se valida aparte que: 1) esa carta REALMENTE tenga una mejora crafteada, y
    // 2) nunca se pida más de 1 copia mejorada de la misma carta (solo existe 1).
    const enhancements = data.enhancements || {};
    const requestedCounts = {};
    const enhancedSlotCounts = {};
    cardIds.forEach(id => {
      const isEnhancedSlot = id.endsWith(ENHANCED_SUFFIX);
      const baseId = isEnhancedSlot ? id.slice(0, -ENHANCED_SUFFIX.length) : id;
      requestedCounts[baseId] = (requestedCounts[baseId] || 0) + 1;
      if (isEnhancedSlot) enhancedSlotCounts[baseId] = (enhancedSlotCounts[baseId] || 0) + 1;
    });

    for (const [baseId, count] of Object.entries(requestedCounts)) {
      if (count > (ownedCounts[baseId] || 0)) throw new Error('Estás usando más copias de una carta de las que tenés.');
      // Regla oficial 100.2a: máximo 4 copias de una misma carta, salvo Tierras básicas
      // (esas no tienen límite, ni acá ni en MTG real).
      const cardDef = cardDb.getById(baseId);
      const isBasicLand = cardDef && cardDef.type.includes('básica');
      if (!isBasicLand && count > MAX_COPIES_PER_CARD) {
        throw new Error(`No podés tener más de ${MAX_COPIES_PER_CARD} copias de la misma carta (salvo Tierras básicas)${cardDef ? `: ${cardDef.name}` : ''}.`);
      }
    }
    for (const [baseId, count] of Object.entries(enhancedSlotCounts)) {
      if (!enhancements[baseId]) throw new Error('Estás usando la copia mejorada de una carta que no tiene ninguna mejora crafteada.');
      if (count > 1) throw new Error('Solo puede haber una copia mejorada de la misma carta en el mazo.');
    }

    // Tope total de cartas mejoradas por mazo (admin-editable, default 3) — sin esto, un
    // jugador con muchas Fichas podría armar un mazo entero de bombas mejoradas.
    const totalEnhancedInDeck = Object.values(enhancedSlotCounts).reduce((sum, n) => sum + n, 0);
    if (totalEnhancedInDeck > MAX_ENHANCED_CARDS_PER_DECK) {
      throw new Error(`No podés tener más de ${MAX_ENHANCED_CARDS_PER_DECK} cartas mejoradas en el mismo mazo.`);
    }

    const newDeck = { id: `deck_${Date.now()}`, name: name.trim(), cardIds, isDefault: false, createdAt: Date.now() };
    const updated = { decks: [...decks, newDeck] };
    tx.update(ref, updated);
    return { ...data, ...updated };
  });
}

// ============================================================================
// PANEL DE ADMIN: la configuración de balance vive en un documento aparte
// (gameConfig/settings), NO en el perfil de ningún jugador — cualquiera puede LEERLA (todo
// el mundo necesita los valores actuales para jugar, esté logueado o no), pero solo el
// admin puede ESCRIBIRLA. Ese "solo el admin puede escribir" NO se decide acá — lo decide
// firestore.rules del lado del servidor, que es lo que de verdad protege esto. El chequeo
// de "sos vos, Pablo" que hace la UI (ver ui.js) es solo para no mostrar el botón, no es
// seguridad real.
export async function loadGameConfig() {
  const snap = await getDoc(doc(db, 'gameConfig', 'settings'));
  return snap.exists() ? snap.data() : null;
}

export async function saveGameConfig(config) {
  await setDoc(doc(db, 'gameConfig', 'settings'), { ...config, updatedAt: serverTimestamp() });
}

// ============================================================================
// FASE 4: MATCHMAKING — cimiento del multiplayer. Resuelve "cómo se encuentran dos
// jugadores" (crear partida, unirse con un código, sala de espera en tiempo real). La
// sincronización de la partida EN SÍ (mano, campo, turnos) es la próxima etapa — acá
// todavía no hay ninguna jugada real que validar, por eso las reglas del documento público
// del match son permisivas (ver firestore.rules): el blindaje real que YA existe es el de
// matches/{matchId}/private/{uid}, donde en el futuro va a vivir la mano/mazo de cada uno.
// ============================================================================

// 6 caracteres, sin 0/O/1/I (se prestan a confusión al compartir el código de palabra o
// por mensaje) — de un alfabeto de 33 símbolos, 33^6 ≈ 1300 millones de combinaciones.
function generateMatchCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

// Crea una partida nueva y te suma como el primer jugador ("host"). Reintenta con un
// código nuevo si por casualidad ya existe uno igual (con 6 caracteres de ~33 posibles, la
// chance de choque es insignificante, pero por las dudas no se asume que nunca va a pasar).
export async function createMatch(uid, profileFields) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateMatchCode();
    const ref = doc(db, 'matches', code);
    const existing = await getDoc(ref);
    if (existing.exists()) continue; // choque rarísimo — probamos con otro código

    const data = {
      status: 'waiting', // 'waiting' | 'active' | 'cancelled'
      hostUid: uid,
      guestUid: null,
      players: {
        [uid]: { displayName: profileFields.displayName || '', photoURL: profileFields.photoURL || '' }
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(ref, data);
    // FASE 4, ETAPA 6: guardo el código en MI PROPIO perfil — así, si recargo la página a
    // mitad de partida, boot() (main.js) sabe que hay algo para reconectar sin necesitar
    // una consulta cruzada de colecciones (solo lee mi perfil, que ya carga de entrada).
    await setActiveMatchId(uid, code);
    return { code, ...data };
  }
  throw new Error('No se pudo generar un código de partida único. Probá de nuevo.');
}

// Se une a una partida existente por su código — rechaza si no existe, si ya está llena, si
// ya no está esperando, o si intentás unirte a tu propia partida.
export async function joinMatchByCode(uid, rawCode, profileFields) {
  const code = rawCode.trim().toUpperCase();
  const ref = doc(db, 'matches', code);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('No existe ninguna partida con ese código.');
  const data = snap.data();
  if (data.hostUid === uid) throw new Error('No podés unirte a tu propia partida.');
  if (data.status !== 'waiting') throw new Error('Esa partida ya no está esperando jugadores.');
  if (data.guestUid) throw new Error('Esa partida ya tiene 2 jugadores.');

  const updated = {
    status: 'active',
    guestUid: uid,
    players: {
      ...data.players,
      [uid]: { displayName: profileFields.displayName || '', photoURL: profileFields.photoURL || '' }
    },
    updatedAt: serverTimestamp()
  };
  await setDoc(ref, updated, { merge: true });
  await setActiveMatchId(uid, code); // mismo motivo que en createMatch
  return { code, ...data, ...updated };
}

// FASE 4, ETAPA 6: activeMatchId vive en MI PROPIO perfil (users/{uid}), no en el match en
// sí — así lo puedo leer apenas cargo mi perfil al arrancar, sin una consulta aparte.
export async function setActiveMatchId(uid, matchId) {
  await setDoc(doc(db, 'users', uid), { activeMatchId: matchId }, { merge: true });
}

export async function clearActiveMatchId(uid) {
  await setDoc(doc(db, 'users', uid), { activeMatchId: null }, { merge: true });
}

// Trae todo lo necesario para reconectarme a una partida en curso: mi documento privado
// (mano/mazo reales) + el documento público (todo lo demás). Devuelve null si cualquiera de
// los dos ya no existe, o si la partida ya terminó — no tiene sentido ofrecer reconectarse
// a algo que ya no está en curso.
export async function fetchMatchForReconnect(matchId, uid) {
  const [publicSnap, privateSnap] = await Promise.all([
    getDoc(doc(db, 'matches', matchId)),
    getDoc(doc(db, 'matches', matchId, 'private', uid))
  ]);
  if (!publicSnap.exists() || !privateSnap.exists()) return null;
  const publicDoc = publicSnap.data();
  if (publicDoc.gameOver) return null;
  return { publicDoc, privateDoc: privateSnap.data() };
}

// Escucha cambios en tiempo real de una partida — así la sala de espera se entera sola
// apenas alguien se une, sin tener que refrescar nada a mano. Devuelve la función de
// unsubscribe (cortar la escucha al salir de la pantalla, para no dejarla corriendo de más).
export function listenToMatch(code, onUpdate) {
  const ref = doc(db, 'matches', code.trim().toUpperCase());
  return onSnapshot(ref, (snap) => {
    onUpdate(snap.exists() ? snap.data() : null);
  });
}

// Cancela/borra una partida propia — pensada para cuando el host se cansa de esperar antes
// de que se una nadie. No tiene sentido dejar códigos de partidas abandonadas dando vueltas.
export async function cancelMatch(code) {
  await deleteDoc(doc(db, 'matches', code.trim().toUpperCase()));
}

// ============================================================================
// FASE 4, ETAPA 2: publicar mi mitad del estado — cada cliente escribe SOLO su propia
// mitad (ver matchSync.js: buildMyPublicPatch/buildMyPrivatePatch ya arman exactamente eso,
// nada del rival). merge:true en ambas para no pisar la mitad del otro jugador ni el resto
// del documento (players, status, etc.) que no forma parte de este patch.
// ============================================================================

// Escribe mi mitad del estado PÚBLICO de la partida (mi campo de batalla, vida, fase,
// turno — todo lo que el rival puede ver legítimamente, pero NUNCA el contenido de mi mano
// ni mi mazo, solo la cantidad — ver buildMyPublicPatch).
export async function publishMyPublicState(matchId, publicPatch) {
  await setDoc(doc(db, 'matches', matchId), publicPatch, { merge: true });
}

// Escribe mi mano y mazo REALES en mi documento privado — el único que solo yo puedo leer
// (ver firestore.rules: matches/{matchId}/private/{uid}).
export async function publishMyPrivateState(matchId, uid, privatePatch) {
  await setDoc(doc(db, 'matches', matchId, 'private', uid), privatePatch, { merge: true });
}

// ============================================================================
// PANEL DE ADMIN: "regalar puntos/Fichas" — la protección real de todo esto vive en
// firestore.rules (users/{userId}: el admin solo puede tocar points/fichas, nunca otro
// campo, garantizado con diff().affectedKeys().hasOnly([...])), no acá. Estas funciones
// asumen que quien las llama YA pasó ese chequeo del servidor — si no es el admin, Firestore
// va a rechazar el pedido igual, pase lo que pase de este lado.
// ============================================================================

// Trae TODOS los perfiles de usuario, para el desplegable de destinatarios — solo el admin
// tiene permiso de leer esto (ver firestore.rules); para cualquier otra cuenta, esta
// consulta la rechaza el servidor directo.
export async function fetchAllUserProfiles() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

// Le da (o le quita, si amount es negativo) puntos o Fichas a UN usuario puntual. Usa una
// transacción para no pisar un cambio concurrente (ej. el jugador comprando un sobre justo
// en ese momento) — mismo patrón que awardPoints/purchasePack. Nunca deja el valor en
// negativo, sea cual sea el monto pedido.
export async function adminGrantCurrency(targetUid, currencyField, amount) {
  const ref = doc(db, 'users', targetUid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Esa cuenta no existe.');
    const current = snap.data()[currencyField] || 0;
    const newValue = Math.max(0, current + amount);
    tx.update(ref, { [currencyField]: newValue });
    return newValue;
  });
}

// Le da lo mismo a TODOS los usuarios — trae la lista completa y aplica adminGrantCurrency
// a cada uno. No es una única transacción atómica gigante (Firestore no está pensado para
// eso con potencialmente cientos de cuentas) — cada cuenta se actualiza en su propia
// transacción chica, en paralelo. Devuelve cuántas tuvieron éxito y cuántas fallaron, para
// que la UI pueda avisar si algo no se pudo aplicar.
export async function adminGrantCurrencyToAll(currencyField, amount) {
  const profiles = await fetchAllUserProfiles();
  const results = await Promise.allSettled(
    profiles.map(p => adminGrantCurrency(p.uid, currencyField, amount))
  );
  const failed = results.filter(r => r.status === 'rejected').length;
  return { total: profiles.length, succeeded: profiles.length - failed, failed };
}

// Registro liviano de auditoría — a quién, cuánto, de qué, y por qué (si se puso un
// motivo). No bloquea ni condiciona el regalo en sí (que ya se aplicó antes de llamar a
// esto) — es solo trazabilidad, mejor esfuerzo: si esto falla, el regalo ya se hizo igual.
export async function logAdminAction(action) {
  await setDoc(doc(collection(db, 'adminActions')), { ...action, timestamp: serverTimestamp() });
}
