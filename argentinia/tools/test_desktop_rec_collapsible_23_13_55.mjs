import assert from 'node:assert/strict';
import fs from 'node:fs';

const telemetry = fs.readFileSync(new URL('../js/telemetry.js', import.meta.url), 'utf8');
const style = fs.readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const mobile = fs.readFileSync(new URL('../js/mobileUI.js', import.meta.url), 'utf8');

assert.ok(telemetry.includes("recToggle.id = 'arg-mobile-telemetry-toggle'"), 'telemetry común debe crear el toggle REC');
assert.ok(telemetry.includes("panel.classList.toggle('arg-mobile-telemetry-expanded')"), 'toggle debe abrir/cerrar el mismo panel');
assert.ok(telemetry.includes("recToggle.textContent = expanded ? '✕ REC' : '🔴 REC'"), 'toggle debe reflejar estado visual');
assert.ok(telemetry.includes('panel.append(recToggle, statusEl, cloudEl, bugsEl, markBtn, uploadBtn)'), 'toggle debe ser parte del panel común');
assert.ok(style.includes('.telemetry-panel:not(.arg-mobile-telemetry-expanded) > :not(.arg-mobile-telemetry-toggle)'), 'desktop debe ocultar contenido cuando REC está cerrado');
assert.ok(style.includes('.telemetry-panel.arg-mobile-telemetry-expanded'), 'desktop debe tener estado expandido explícito');
assert.ok(mobile.includes("panel.querySelector('#arg-mobile-telemetry-toggle')"), 'mobile debe reutilizar el toggle común sin duplicarlo');

console.log('DESKTOP_REC_COLLAPSIBLE_23_13_55_OK');
