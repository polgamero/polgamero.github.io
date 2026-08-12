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
import { getFirestore, doc, getDoc, setDoc, deleteDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { cardDb } from './cardLoader.js';
import { DECK_SIZE_EXACT, MAX_COPIES_PER_CARD } from './store.js';

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
    const requestedCounts = {};
    cardIds.forEach(id => { requestedCounts[id] = (requestedCounts[id] || 0) + 1; });
    for (const [id, count] of Object.entries(requestedCounts)) {
      if (count > (ownedCounts[id] || 0)) throw new Error('Estás usando más copias de una carta de las que tenés.');
      // Regla oficial 100.2a: máximo 4 copias de una misma carta, salvo Tierras básicas
      // (esas no tienen límite, ni acá ni en MTG real).
      const cardDef = cardDb.getById(id);
      const isBasicLand = cardDef && cardDef.type.includes('básica');
      if (!isBasicLand && count > MAX_COPIES_PER_CARD) {
        throw new Error(`No podés tener más de ${MAX_COPIES_PER_CARD} copias de la misma carta (salvo Tierras básicas)${cardDef ? `: ${cardDef.name}` : ''}.`);
      }
    }

    const newDeck = { id: `deck_${Date.now()}`, name: name.trim(), cardIds, isDefault: false, createdAt: Date.now() };
    const updated = { decks: [...decks, newDeck] };
    tx.update(ref, updated);
    return { ...data, ...updated };
  });
}
