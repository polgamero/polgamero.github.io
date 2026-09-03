// js/economyPending.js — v23.19.5.4
// Feedback UX centralizado para operaciones económicas server-authoritative.
// No altera saldos de forma optimista: sólo confirma visualmente que el click fue recibido.

const STYLE_ID = 'economy-pending-styles-23-19-5-4';

export function ensureEconomyPendingStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes economy-pending-spin { to { transform:rotate(360deg); } }
    .economy-pending-content { display:inline-flex; align-items:center; justify-content:center; gap:8px; }
    .economy-pending-spinner {
      width:14px; height:14px; box-sizing:border-box; border-radius:50%;
      border:2px solid currentColor; border-right-color:transparent;
      animation:economy-pending-spin .72s linear infinite; flex:0 0 auto;
    }
    button[aria-busy="true"] { cursor:progress !important; }
    @media (prefers-reduced-motion: reduce) { .economy-pending-spinner { animation-duration:1.4s; } }
  `;
  document.head.appendChild(style);
}

function pendingHtml(label) {
  const safe = String(label || 'PROCESANDO...')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  return `<span class="economy-pending-content"><span class="economy-pending-spinner" aria-hidden="true"></span><span>${safe}</span></span>`;
}

export async function withEconomyButtonPending(button, task, {
  pendingLabel = 'PROCESANDO...',
  slowLabel = 'CONECTANDO CON EL SERVIDOR...',
  slowAfterMs = 2800,
  disablePeers = []
} = {}) {
  if (typeof task !== 'function') throw new TypeError('ECONOMY_PENDING_TASK_REQUIRED');
  if (!button) return task();
  ensureEconomyPendingStyles();

  // Segundo click: no dispara una segunda intención económica.
  if (button.dataset?.economyPending === '1') return undefined;
  const original = { html:button.innerHTML, disabled:!!button.disabled, ariaBusy:button.getAttribute('aria-busy') };
  const peers = [...new Set((disablePeers || []).filter(Boolean))].map(node => ({ node, disabled:!!node.disabled }));
  button.dataset.economyPending = '1';
  button.disabled = true;
  button.setAttribute('aria-busy','true');
  button.innerHTML = pendingHtml(pendingLabel);
  for (const {node} of peers) node.disabled = true;

  let slowTimer = null;
  if (Number(slowAfterMs) > 0) {
    slowTimer = setTimeout(() => {
      if (button.isConnected && button.dataset?.economyPending === '1') button.innerHTML = pendingHtml(slowLabel);
    }, Number(slowAfterMs));
  }

  try {
    return await task();
  } finally {
    if (slowTimer) clearTimeout(slowTimer);
    for (const {node,disabled} of peers) if (node?.isConnected) node.disabled = disabled;
    if (button.isConnected) {
      button.innerHTML = original.html;
      button.disabled = original.disabled;
      if (original.ariaBusy == null) button.removeAttribute('aria-busy'); else button.setAttribute('aria-busy', original.ariaBusy);
      delete button.dataset.economyPending;
    }
  }
}
