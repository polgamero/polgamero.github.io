// 23.13.7 — helper visual compartido por Enciclopedia/Deckbuilder y resumen de sobres.
// No conoce cartas ni economía: sólo normaliza el slider y escribe una CSS custom property.
export function clampCardZoom(value, { min = 8, max = 50, fallback = 12 } = {}) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : fallback;
  return Math.max(min, Math.min(max, safe));
}

export function applyCardZoom(root, value, {
  cssVar = '--card-w', unit = 'vh', min = 8, max = 50, fallback = 12
} = {}) {
  if (!root?.style?.setProperty) return clampCardZoom(value, { min, max, fallback });
  const numeric = clampCardZoom(value, { min, max, fallback });
  root.style.setProperty(cssVar, `${numeric}${unit}`);
  return numeric;
}

export function bindCardZoomControl({
  root, slider, valueLabel = null, cssVar = '--card-w', unit = 'vh',
  min = 8, max = 50, fallback = 12, onChange = null
} = {}) {
  if (!slider) return () => {};
  const sync = () => {
    const numeric = applyCardZoom(root, slider.value, { cssVar, unit, min, max, fallback });
    if (valueLabel) valueLabel.textContent = `${numeric}`;
    onChange?.(numeric);
  };
  slider.addEventListener('input', sync);
  sync();
  return () => slider.removeEventListener('input', sync);
}
