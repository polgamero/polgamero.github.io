// js/newsPanel.js — 23.11.11: interacción aislada del panel Noticias del menú.
// No importa main.js/ui.js ni toca estado de juego. Observa childList sólo hasta encontrar
// #main-menu-news, se desconecta y desde entonces trabaja exclusivamente sobre ese nodo.

const BOUND_ATTR = 'data-arg-news-bound';
const COLLAPSED_CLASS = 'arg-news-collapsed';
const AUTO_COLLAPSE_MS = 5000;

function bindNewsPanel(panel) {
  if (!panel || panel.hasAttribute(BOUND_ATTR)) return false;
  panel.setAttribute(BOUND_ATTR, '1');
  const title = panel.querySelector('.main-menu-news-title');
  if (!title) return false;

  const hoverCapable = Boolean(globalThis.matchMedia?.('(hover: hover) and (pointer: fine)').matches);
  let autoTimer = null;

  const setCollapsed = (collapsed) => {
    if (!panel.isConnected) return;
    panel.classList.toggle(COLLAPSED_CLASS, Boolean(collapsed));
    title.setAttribute('aria-expanded', String(!collapsed));
  };
  const collapse = () => setCollapsed(true);
  const expand = () => setCollapsed(false);
  const toggle = event => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    clearTimeout(autoTimer);
    setCollapsed(!panel.classList.contains(COLLAPSED_CLASS));
  };

  title.setAttribute('role', 'button');
  title.setAttribute('tabindex', '0');
  title.setAttribute('aria-expanded', 'true');
  title.setAttribute('aria-label', 'Noticias. Tocar para expandir o colapsar.');
  title.addEventListener('click', toggle);
  title.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') toggle(event);
  });

  // El rectángulo collapsed completo vuelve a abrir el panel, no sólo las letras.
  panel.addEventListener('click', event => {
    if (panel.classList.contains(COLLAPSED_CLASS) && !event.target.closest('.main-menu-news-title')) expand();
  });

  if (hoverCapable) {
    // Desktop: una vez expandido, salir físicamente de Noticias lo vuelve a liberar.
    panel.addEventListener('mouseleave', () => {
      clearTimeout(autoTimer);
      collapse();
    });
  } else {
    // Touch: equivalente a mouseleave = tocar fuera del panel.
    document.addEventListener('pointerdown', event => {
      if (!panel.isConnected || panel.contains(event.target)) return;
      collapse();
    });
  }

  // Primero se ve completo para enseñar que existe; cinco segundos después se contrae.
  autoTimer = setTimeout(() => {
    if (hoverCapable && panel.matches(':hover')) return;
    collapse();
  }, AUTO_COLLAPSE_MS);
  return true;
}

function attachWhenAvailable() {
  if (bindNewsPanel(document.getElementById('main-menu-news'))) return;
  const observer = new MutationObserver(() => {
    if (bindNewsPanel(document.getElementById('main-menu-news'))) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachWhenAvailable, { once: true });
} else {
  attachWhenAvailable();
}
