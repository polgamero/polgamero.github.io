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
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

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
