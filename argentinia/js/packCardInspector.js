// 23.13.15 — inspección 3D de la carta revelada del sobre.
// Presentation-only: no conoce economía, colección ni Firestore. Trabaja exclusivamente
// sobre el shell ya renderizado por packOpening.js y usa Pointer Events para mouse/touch.

const INTRO_MS = 1200;
const DRAG_SENSITIVITY = 0.5;
const DRAG_THRESHOLD_PX = 5;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function bindPackCardInspector(shell, { frontFace = null, introMs = INTRO_MS } = {}) {
  if (!shell?.addEventListener) {
    return {
      startRevealIntro() {},
      reset() {},
      destroy() {},
      consumeClickSuppression() { return false; }
    };
  }

  shell.classList.add('arg-pack3d-shell');

  let shine = null;
  function ensureShine() {
    if (!frontFace?.appendChild) return null;
    shine = frontFace.querySelector?.('.arg-pack3d-shine') || null;
    if (!shine) {
      shine = document.createElement('div');
      shine.className = 'arg-pack3d-shine';
      frontFace.appendChild(shine);
    }
    return shine;
  }
  ensureShine();

  let isDragging = false;
  let isInteractive = false;
  let pointerId = null;
  let previousX = 0;
  let previousY = 0;
  let dragDistance = 0;
  let rotateX = 0;
  let rotateY = 0;
  let suppressNextClick = false;
  let introTimer = null;

  function setRotation(x, y) {
    rotateX = clamp(x, -85, 85);
    rotateY = y;
    shell.style.setProperty('--arg-pack3d-rx', `${rotateX}deg`);
    shell.style.setProperty('--arg-pack3d-ry', `${rotateY}deg`);
  }

  function clearShine() {
    if (shine) shine.style.background = 'none';
  }

  function updateShine(event) {
    ensureShine();
    if (!shine || !shell.getBoundingClientRect) return;
    const rect = shell.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);
    shine.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,.44) 0%, rgba(255,255,255,.16) 24%, rgba(255,255,255,0) 62%)`;
  }

  function settleToFront() {
    shell.classList.remove('arg-pack3d-dragging');
    shell.classList.add('arg-pack3d-settling');
    setRotation(0, 0);
    clearShine();
    window.setTimeout?.(() => shell.classList.remove('arg-pack3d-settling'), 650);
  }

  function onPointerDown(event) {
    if (!isInteractive || event.button > 0) return;
    isDragging = true;
    pointerId = event.pointerId;
    previousX = event.clientX;
    previousY = event.clientY;
    dragDistance = 0;
    shell.classList.remove('arg-pack3d-settling');
    shell.classList.add('arg-pack3d-dragging');
    shell.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!isDragging || (pointerId !== null && event.pointerId !== pointerId)) return;
    const dx = event.clientX - previousX;
    const dy = event.clientY - previousY;
    dragDistance += Math.abs(dx) + Math.abs(dy);
    setRotation(rotateX - dy * DRAG_SENSITIVITY, rotateY + dx * DRAG_SENSITIVITY);
    updateShine(event);
    previousX = event.clientX;
    previousY = event.clientY;
    event.preventDefault();
  }

  function finishDrag(event) {
    if (!isDragging || (pointerId !== null && event?.pointerId !== undefined && event.pointerId !== pointerId)) return;
    isDragging = false;
    shell.releasePointerCapture?.(pointerId);
    pointerId = null;
    if (dragDistance >= DRAG_THRESHOLD_PX) suppressNextClick = true;
    settleToFront();
  }

  shell.addEventListener('pointerdown', onPointerDown);
  shell.addEventListener('pointermove', onPointerMove);
  shell.addEventListener('pointerup', finishDrag);
  shell.addEventListener('pointercancel', finishDrag);

  function reset() {
    if (introTimer) window.clearTimeout?.(introTimer);
    introTimer = null;
    isDragging = false;
    isInteractive = false;
    suppressNextClick = false;
    pointerId = null;
    shell.classList.remove('arg-pack3d-intro', 'arg-pack3d-ready', 'arg-pack3d-dragging', 'arg-pack3d-settling');
    setRotation(0, 0);
    clearShine();
  }

  function startRevealIntro() {
    reset();
    ensureShine();
    shell.classList.add('arg-pack3d-intro');
    introTimer = window.setTimeout?.(() => {
      shell.classList.remove('arg-pack3d-intro');
      shell.classList.add('arg-pack3d-ready');
      isInteractive = true;
      introTimer = null;
    }, introMs) || null;
  }

  function consumeClickSuppression() {
    if (!suppressNextClick) return false;
    suppressNextClick = false;
    return true;
  }

  function destroy() {
    if (introTimer) window.clearTimeout?.(introTimer);
    shell.removeEventListener('pointerdown', onPointerDown);
    shell.removeEventListener('pointermove', onPointerMove);
    shell.removeEventListener('pointerup', finishDrag);
    shell.removeEventListener('pointercancel', finishDrag);
    reset();
  }

  return { startRevealIntro, reset, destroy, consumeClickSuppression };
}
