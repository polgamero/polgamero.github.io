(() => {
  'use strict';

  const year = document.querySelector('#current-year');
  if (year) year.textContent = String(new Date().getFullYear());

  const navToggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('#main-nav');

  const closeNav = () => {
    if (!nav || !navToggle) return;
    nav.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
  };

  navToggle?.addEventListener('click', () => {
    const open = !nav.classList.contains('is-open');
    nav.classList.toggle('is-open', open);
    navToggle.setAttribute('aria-expanded', String(open));
  });

  nav?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeNav);
  });

  document.addEventListener('click', event => {
    if (!nav || !navToggle || !nav.classList.contains('is-open')) return;
    if (!nav.contains(event.target) && !navToggle.contains(event.target)) closeNav();
  });

  const lightbox = document.querySelector('#lightbox');
  const lightboxImage = document.querySelector('#lightbox-image');
  const lightboxClose = document.querySelector('.lightbox-close');
  let returnFocus = null;

  const closeLightbox = () => {
    if (!lightbox || lightbox.hidden) return;
    lightbox.hidden = true;
    lightboxImage?.removeAttribute('src');
    document.body.style.overflow = '';
    returnFocus?.focus?.();
    returnFocus = null;
  };

  document.querySelectorAll('.screen-card[data-screen]').forEach(card => {
    card.addEventListener('click', () => {
      if (!lightbox || !lightboxImage) return;
      returnFocus = card;
      lightboxImage.src = card.dataset.screen;
      lightbox.hidden = false;
      document.body.style.overflow = 'hidden';
      lightboxClose?.focus();
    });
  });

  lightboxClose?.addEventListener('click', closeLightbox);
  lightbox?.addEventListener('click', event => {
    if (event.target === lightbox) closeLightbox();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeLightbox();
      closeNav();
    }
  });

  const revealItems = [...document.querySelectorAll('.reveal')];
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    revealItems.forEach(el => el.classList.add('is-visible'));
  } else {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px' });

    revealItems.forEach(el => observer.observe(el));
  }

  // Si una captura todavía no fue subida, dejamos un placeholder limpio en vez del ícono roto.
  document.querySelectorAll('.screen-frame img').forEach((img, index) => {
    img.addEventListener('error', () => {
      img.style.display = 'none';
      const frame = img.closest('.screen-frame');
      if (!frame || frame.querySelector('.screen-placeholder')) return;
      const placeholder = document.createElement('span');
      placeholder.className = 'screen-placeholder';
      placeholder.textContent = `screen${index + 1}.png`;
      placeholder.style.cssText = [
        'position:absolute', 'inset:0', 'display:grid', 'place-items:center',
        'color:rgba(240,213,108,.72)', 'font-weight:800', 'letter-spacing:.08em'
      ].join(';');
      frame.appendChild(placeholder);
    });
  });
})();
