// js/usernameUI.js — Entrega 23.13.24
// Modales autocontenidos para alta obligatoria y rename. La persistencia se inyecta por
// callback para mantener Firebase fuera del módulo y evitar ciclos con main/ui.

import {
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_RENAME_COST,
  validateUsername
} from './usernames.js';
import { FIRESTORE_RULES_VERSION } from './version.js';

function injectUsernameStyles() {
  if (document.getElementById('username-flow-styles')) return;
  const style = document.createElement('style');
  style.id = 'username-flow-styles';
  style.textContent = `
    .username-overlay {
      position:fixed; inset:0; z-index:20050; display:flex; align-items:center; justify-content:center;
      background:rgba(3,7,5,.93); backdrop-filter:blur(7px); padding:18px; box-sizing:border-box;
    }
    .username-panel {
      width:min(460px, 94vw); border:1px solid rgba(212,175,55,.55); border-radius:16px;
      background:linear-gradient(180deg, rgba(24,35,28,.98), rgba(8,15,11,.99));
      box-shadow:0 22px 70px rgba(0,0,0,.62), 0 0 30px rgba(212,175,55,.09);
      color:#efe7cf; padding:24px; box-sizing:border-box; font-family:system-ui,-apple-system,sans-serif;
    }
    .username-title { margin:0 0 8px; font:800 25px/1.15 Georgia,serif; color:#f0d98a; text-align:center; }
    .username-subtitle { margin:0 0 18px; color:#c9c3ad; font-size:13px; line-height:1.5; text-align:center; }
    .username-current { margin:0 0 14px; color:#d6c893; font-size:12px; text-align:center; }
    .username-input {
      width:100%; box-sizing:border-box; border:1px solid rgba(212,175,55,.45); border-radius:10px;
      background:#08100b; color:#fff7dc; font-size:19px; font-weight:700; text-align:center;
      padding:12px 14px; outline:none;
    }
    .username-input:focus { border-color:#e4c45f; box-shadow:0 0 0 2px rgba(212,175,55,.10); }
    .username-hint { margin:8px 0 0; color:#8f9a91; font-size:11px; text-align:center; }
    .username-error { min-height:18px; margin:10px 0 0; color:#ef8d79; font-size:12px; line-height:1.35; text-align:center; }
    .username-actions { display:flex; gap:10px; margin-top:14px; }
    .username-btn {
      flex:1; border-radius:10px; border:1px solid rgba(212,175,55,.5); padding:11px 12px;
      background:#b8912e; color:#0b100d; font-weight:900; cursor:pointer;
    }
    .username-btn.secondary { background:transparent; color:#d5cba9; border-color:rgba(255,255,255,.16); }
    .username-btn:disabled { opacity:.45; cursor:not-allowed; }
    .username-cost { margin:12px 0 0; text-align:center; color:#d7c27b; font-size:12px; }
    @media (max-width:560px) {
      .username-panel { padding:20px 16px; }
      .username-title { font-size:22px; }
      .username-actions { flex-direction:column; }
    }
  `;
  document.head.appendChild(style);
}

function friendlyPersistError(error) {
  const code = String(error?.code || '');
  if (code === 'USERNAME_TAKEN' || /USERNAME_TAKEN/.test(String(error?.message || ''))) {
    return 'Ese nombre ya está usado. Probá con otro.';
  }
  if (code === 'USERNAME_ACTIVE_MATCH') return 'Terminá tu partida multiplayer antes de cambiar el nombre.';
  if (code === 'USERNAME_NOT_ENOUGH_FICHAS') return `Necesitás ${USERNAME_RENAME_COST} Ficha para cambiar el nombre.`;
  if (code === 'USERNAME_SAME') return 'Ese ya es tu nombre actual.';
  if (code === 'permission-denied') return `Firestore rechazó el cambio. Verificá que estén publicadas las Rules ${FIRESTORE_RULES_VERSION}.`;
  return error?.message || 'No se pudo guardar el nombre. Revisá tu conexión e intentá de nuevo.';
}

function createUsernameModal({ mode, currentUsername = '', fichas = 0, onSave, onCancel = null, onSignOut = null }) {
  injectUsernameStyles();
  document.querySelectorAll('.username-overlay').forEach(el => el.remove());

  const isSetup = mode === 'setup';
  const overlay = document.createElement('div');
  overlay.className = 'username-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `
    <div class="username-panel">
      <h2 class="username-title">${isSetup ? 'Elegí tu nombre en Argentinia' : 'Cambiar nombre'}</h2>
      <p class="username-subtitle">${isSetup
        ? 'Este será el nombre que verán los demás jugadores. Es único en todo Argentinia.'
        : 'El cambio se aplica a todo el juego y cuesta 1 Ficha.'}</p>
      ${!isSetup ? `<div class="username-current">Nombre actual: <strong>${escapeText(currentUsername)}</strong></div>` : ''}
      <input class="username-input" id="username-input" type="text" maxlength="${USERNAME_MAX_LENGTH}" autocomplete="off" spellcheck="false" placeholder="Tu nombre">
      <div class="username-hint">${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} caracteres · letras, números, espacios o _</div>
      ${!isSetup ? `<div class="username-cost">Disponibles: ${Math.max(0, Number(fichas) || 0)} Ficha(s) · Costo: ${USERNAME_RENAME_COST}</div>` : ''}
      <div class="username-error" id="username-error"></div>
      <div class="username-actions">
        ${isSetup
          ? '<button class="username-btn secondary" id="username-exit">Cerrar sesión</button>'
          : '<button class="username-btn secondary" id="username-cancel">Cancelar</button>'}
        <button class="username-btn" id="username-save">${isSetup ? 'USAR ESTE NOMBRE' : 'CAMBIAR · 1 FICHA'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const input = overlay.querySelector('#username-input');
  const saveBtn = overlay.querySelector('#username-save');
  const errorBox = overlay.querySelector('#username-error');
  input.value = isSetup ? '' : currentUsername;
  input.focus();
  if (!isSetup) input.select();

  let busy = false;
  async function submit() {
    if (busy) return;
    const validated = validateUsername(input.value);
    if (!validated.ok) {
      errorBox.textContent = validated.message;
      return;
    }
    busy = true;
    saveBtn.disabled = true;
    input.disabled = true;
    errorBox.textContent = '';
    try {
      const result = await onSave(validated);
      overlay.remove();
      return result;
    } catch (error) {
      console.error('No se pudo guardar el username:', error);
      errorBox.textContent = friendlyPersistError(error);
      busy = false;
      saveBtn.disabled = false;
      input.disabled = false;
      input.focus();
    }
  }

  saveBtn.addEventListener('click', submit);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); submit(); }
  });
  input.addEventListener('input', () => { errorBox.textContent = ''; });

  if (isSetup) {
    overlay.querySelector('#username-exit').addEventListener('click', async () => {
      if (busy) return;
      try { await onSignOut?.(); } finally { overlay.remove(); }
    });
  } else {
    overlay.querySelector('#username-cancel').addEventListener('click', () => {
      if (busy) return;
      overlay.remove();
      onCancel?.();
    });
  }

  return overlay;
}

function escapeText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function showUsernameSetupModal(options) {
  return createUsernameModal({ ...options, mode: 'setup' });
}

export function showUsernameRenameModal(options) {
  return createUsernameModal({ ...options, mode: 'rename' });
}
