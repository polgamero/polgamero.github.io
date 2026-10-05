// Appearance Studio V1.1 Admin UI — Argentinia 23.22.0 HF3.3
// Editing is preview-only until the Admin explicitly publishes.

import {
  classicAppearanceConfig,
  normalizeAppearanceConfig,
  appearanceCssVariables,
  applyAppearanceVariablesToElement,
  loadPublishedAppearance,
  publishAppearanceConfig,
  rollbackAppearanceConfig
} from './appearance.js';

const SECTION_META = Object.freeze([
  ['global','Tema global','🎨'],
  ['mainMenu','Menú principal','🏠'],
  ['buttons','Botones','🔘'],
  ['panels','Paneles','▣'],
  ['modals','Modales','▤'],
  ['tabs','Pestañas','🗂️'],
  ['inputs','Campos y controles','⌨️'],
  ['badges','Badges / indicadores','🏷️'],
  ['notifications','Avisos / notificaciones','🔔']
]);

const SHADOW_OPTIONS = [['none','Sin sombra'],['soft','Suave'],['medium','Media'],['strong','Fuerte']];

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function getPath(obj, path) { return path.split('.').reduce((acc, key) => acc?.[key], obj); }
function setPath(obj, path, value) {
  const parts = path.split('.');
  let cursor = obj;
  while (parts.length > 1) { const key = parts.shift(); cursor[key] ||= {}; cursor = cursor[key]; }
  cursor[parts[0]] = value;
}
function fieldId(path) { return `appearance-${path.replace(/[^a-z0-9]+/gi,'-')}`; }

function field(label, path, value, opts = {}) {
  const id = fieldId(path);
  const help = opts.help ? `<div class="appearance-field-help">${esc(opts.help)}</div>` : '';
  if (opts.type === 'checkbox') {
    return `<label class="appearance-field appearance-field-check" for="${id}"><span><strong>${esc(label)}</strong>${help}</span><input id="${id}" data-appearance-path="${esc(path)}" type="checkbox" ${value ? 'checked' : ''}></label>`;
  }
  if (opts.type === 'color') {
    return `<label class="appearance-field" for="${id}"><span><strong>${esc(label)}</strong>${help}</span><div class="appearance-color-row"><input id="${id}" data-appearance-path="${esc(path)}" type="color" value="${esc(value)}"><code>${esc(value)}</code></div></label>`;
  }
  if (opts.type === 'select') {
    const options = (opts.options || []).map(([v,t]) => `<option value="${esc(v)}" ${String(value) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('');
    return `<label class="appearance-field" for="${id}"><span><strong>${esc(label)}</strong>${help}</span><select id="${id}" data-appearance-path="${esc(path)}">${options}</select></label>`;
  }
  const type = opts.type || 'number';
  const min = opts.min != null ? ` min="${opts.min}"` : '';
  const max = opts.max != null ? ` max="${opts.max}"` : '';
  const step = opts.step != null ? ` step="${opts.step}"` : '';
  const suffix = opts.suffix ? `<span class="appearance-field-suffix">${esc(opts.suffix)}</span>` : '';
  return `<label class="appearance-field" for="${id}"><span><strong>${esc(label)}</strong>${help}</span><div class="appearance-number-row"><input id="${id}" data-appearance-path="${esc(path)}" type="${type}" value="${esc(value)}"${min}${max}${step}>${suffix}</div></label>`;
}

function sectionHeader(title, copy = '') {
  return `<div class="appearance-section-heading"><div><h3>${esc(title)}</h3>${copy ? `<p>${esc(copy)}</p>` : ''}</div><button type="button" class="appearance-mini-btn" data-appearance-reset-section>Restaurar sección</button></div>`;
}
function group(title, fields) { return `<div class="appearance-control-group"><div class="appearance-control-group-title">${esc(title)}</div><div class="appearance-control-grid">${fields.join('')}</div></div>`; }

function controlsFor(sectionKey, c) {
  if (sectionKey === 'global') return [
    sectionHeader('Tema global','Tokens compartidos. No altera colores semánticos de combate, rareza ni estados.'),
    group('Base',[
      field('Activar tema global','global.enabled',c.global.enabled,{type:'checkbox'}),
      field('Color de acento','global.accent',c.global.accent,{type:'color'}),
      field('Texto principal','global.text',c.global.text,{type:'color'}),
      field('Texto secundario','global.mutedText',c.global.mutedText,{type:'color'}),
      field('Fondo de panel','global.panelBackground',c.global.panelBackground,{type:'color'}),
      field('Borde de panel','global.panelBorder',c.global.panelBorder,{type:'color'}),
      field('Radio base','global.baseRadius',c.global.baseRadius,{min:0,max:28,step:1,suffix:'px'}),
      field('Sombra base','global.shadowPreset',c.global.shadowPreset,{type:'select',options:SHADOW_OPTIONS})
    ])
  ].join('');
  if (sectionKey === 'mainMenu') return [
    sectionHeader('Menú principal','Control independiente Desktop/Mobile con límites seguros para evitar clipping.'),
    group('General',[
      field('Activar personalización','mainMenu.enabled',c.mainMenu.enabled,{type:'checkbox'}),
      field('Alineación de texto','mainMenu.textAlign',c.mainMenu.textAlign,{type:'select',options:[['left','Izquierda'],['center','Centro'],['right','Derecha']]}),
      field('Sombra','mainMenu.shadowPreset',c.mainMenu.shadowPreset,{type:'select',options:SHADOW_OPTIONS}),
      field('Hover horizontal','mainMenu.hover.translateX',c.mainMenu.hover.translateX,{min:-12,max:12,step:1,suffix:'px'}),
      field('Hover íconos vertical','mainMenu.hover.translateYIcon',c.mainMenu.hover.translateYIcon,{min:-8,max:8,step:1,suffix:'px'}),
      field('Brillo hover','mainMenu.hover.brightness',c.mainMenu.hover.brightness,{min:.8,max:1.3,step:.01,suffix:'×'})
    ]),
    group('Colores',[
      field('Fondo superior','mainMenu.colors.backgroundTop',c.mainMenu.colors.backgroundTop,{type:'color'}), field('Fondo inferior','mainMenu.colors.backgroundBottom',c.mainMenu.colors.backgroundBottom,{type:'color'}),
      field('Primario superior','mainMenu.colors.primaryTop',c.mainMenu.colors.primaryTop,{type:'color'}), field('Texto','mainMenu.colors.text',c.mainMenu.colors.text,{type:'color'}),
      field('Borde','mainMenu.colors.border',c.mainMenu.colors.border,{type:'color'}), field('Borde primario','mainMenu.colors.primaryBorder',c.mainMenu.colors.primaryBorder,{type:'color'}),
      field('Tinte hover','mainMenu.colors.hoverTint',c.mainMenu.colors.hoverTint,{type:'color'})
    ]),
    group('Desktop',[
      field('Ancho botón','mainMenu.desktop.buttonWidth',c.mainMenu.desktop.buttonWidth,{min:160,max:420,step:1,suffix:'px'}), field('Alto botón','mainMenu.desktop.buttonHeight',c.mainMenu.desktop.buttonHeight,{min:30,max:72,step:1,suffix:'px'}),
      field('Separación','mainMenu.desktop.gap',c.mainMenu.desktop.gap,{min:0,max:30,step:1,suffix:'px'}), field('Posición izquierda','mainMenu.desktop.left',c.mainMenu.desktop.left,{min:0,max:40,step:.5,suffix:'vw'}),
      field('Posición inferior','mainMenu.desktop.bottom',c.mainMenu.desktop.bottom,{min:0,max:40,step:.5,suffix:'vh'}), field('Radio','mainMenu.desktop.radius',c.mainMenu.desktop.radius,{min:0,max:30,step:1,suffix:'px'}),
      field('Borde','mainMenu.desktop.borderWidth',c.mainMenu.desktop.borderWidth,{min:0,max:5,step:1,suffix:'px'}), field('Fuente','mainMenu.desktop.fontSize',c.mainMenu.desktop.fontSize,{min:11,max:28,step:1,suffix:'px'}),
      field('Fuente primarios','mainMenu.desktop.primaryFontSize',c.mainMenu.desktop.primaryFontSize,{min:11,max:30,step:1,suffix:'px'}), field('Peso','mainMenu.desktop.fontWeight',c.mainMenu.desktop.fontWeight,{type:'select',options:[[400,'400'],[500,'500'],[600,'600'],[700,'700'],[800,'800'],[900,'900']]}),
      field('Letter spacing','mainMenu.desktop.letterSpacing',c.mainMenu.desktop.letterSpacing,{min:-1,max:3,step:.1,suffix:'px'}), field('Padding vertical','mainMenu.desktop.paddingY',c.mainMenu.desktop.paddingY,{min:2,max:18,step:1,suffix:'px'}),
      field('Padding horizontal','mainMenu.desktop.paddingX',c.mainMenu.desktop.paddingX,{min:4,max:30,step:1,suffix:'px'}), field('Inset imagen ícono','mainMenu.desktop.iconImageInset',c.mainMenu.desktop.iconImageInset,{min:0,max:12,step:1,suffix:'px'}),
      field('Radio ícono','mainMenu.desktop.iconRadius',c.mainMenu.desktop.iconRadius,{min:0,max:30,step:1,suffix:'px'}), field('Logo: top','mainMenu.desktop.logoTop',c.mainMenu.desktop.logoTop,{min:0,max:30,step:.5,suffix:'vh'}),
      field('Logo: ancho máx.','mainMenu.desktop.logoMaxWidth',c.mainMenu.desktop.logoMaxWidth,{min:20,max:85,step:1,suffix:'vw'}), field('Logo: alto máx.','mainMenu.desktop.logoMaxHeight',c.mainMenu.desktop.logoMaxHeight,{min:10,max:60,step:1,suffix:'vh'})
    ]),
    group('Mobile horizontal',[
      field('Ancho botón','mainMenu.mobile.buttonWidth',c.mainMenu.mobile.buttonWidth,{min:130,max:260,step:1,suffix:'px'}), field('Alto botón','mainMenu.mobile.buttonHeight',c.mainMenu.mobile.buttonHeight,{min:28,max:52,step:1,suffix:'px'}),
      field('Separación','mainMenu.mobile.gap',c.mainMenu.mobile.gap,{min:0,max:16,step:1,suffix:'px'}), field('Posición izquierda','mainMenu.mobile.left',c.mainMenu.mobile.left,{min:0,max:18,step:.5,suffix:'dvw'}),
      field('Posición inferior','mainMenu.mobile.bottom',c.mainMenu.mobile.bottom,{min:0,max:20,step:.5,suffix:'dvh'}), field('Radio','mainMenu.mobile.radius',c.mainMenu.mobile.radius,{min:0,max:22,step:1,suffix:'px'}),
      field('Borde','mainMenu.mobile.borderWidth',c.mainMenu.mobile.borderWidth,{min:0,max:4,step:1,suffix:'px'}), field('Fuente','mainMenu.mobile.fontSize',c.mainMenu.mobile.fontSize,{min:10,max:20,step:1,suffix:'px'}),
      field('Fuente primarios','mainMenu.mobile.primaryFontSize',c.mainMenu.mobile.primaryFontSize,{min:10,max:22,step:1,suffix:'px'}), field('Padding vertical','mainMenu.mobile.paddingY',c.mainMenu.mobile.paddingY,{min:2,max:12,step:1,suffix:'px'}),
      field('Padding horizontal','mainMenu.mobile.paddingX',c.mainMenu.mobile.paddingX,{min:3,max:18,step:1,suffix:'px'}), field('Inset imagen ícono','mainMenu.mobile.iconImageInset',c.mainMenu.mobile.iconImageInset,{min:0,max:10,step:1,suffix:'px'}),
      field('Radio ícono','mainMenu.mobile.iconRadius',c.mainMenu.mobile.iconRadius,{min:0,max:22,step:1,suffix:'px'}), field('Logo: top','mainMenu.mobile.logoTop',c.mainMenu.mobile.logoTop,{min:0,max:16,step:.5,suffix:'dvh'}),
      field('Logo: ancho máx.','mainMenu.mobile.logoMaxWidth',c.mainMenu.mobile.logoMaxWidth,{min:20,max:65,step:1,suffix:'dvw'}), field('Logo: alto máx.','mainMenu.mobile.logoMaxHeight',c.mainMenu.mobile.logoMaxHeight,{min:10,max:45,step:1,suffix:'dvh'})
    ])
  ].join('');
  if (sectionKey === 'buttons') return [sectionHeader('Botones','Aplica a botones internos de Argentinia. El botón de Google queda excluido.'),group('Familia general',[
    field('Personalizar','buttons.enabled',c.buttons.enabled,{type:'checkbox'}),field('Fondo','buttons.background',c.buttons.background,{type:'color'}),field('Texto','buttons.text',c.buttons.text,{type:'color'}),field('Borde','buttons.border',c.buttons.border,{type:'color'}),field('Radio','buttons.radius',c.buttons.radius,{min:0,max:24,step:1,suffix:'px'}),field('Borde','buttons.borderWidth',c.buttons.borderWidth,{min:0,max:4,step:1,suffix:'px'}),field('Fuente','buttons.fontSize',c.buttons.fontSize,{min:10,max:22,step:1,suffix:'px'}),field('Sombra','buttons.shadowPreset',c.buttons.shadowPreset,{type:'select',options:SHADOW_OPTIONS})
  ])].join('');
  if (sectionKey === 'panels') return [sectionHeader('Paneles','Superficies principales. No altera tablero ni frames de cartas.'),group('Apariencia',[
    field('Personalizar','panels.enabled',c.panels.enabled,{type:'checkbox'}),field('Fondo','panels.background',c.panels.background,{type:'color'}),field('Texto','panels.text',c.panels.text,{type:'color'}),field('Borde','panels.border',c.panels.border,{type:'color'}),field('Opacidad','panels.opacity',c.panels.opacity,{min:.55,max:1,step:.01}),field('Radio','panels.radius',c.panels.radius,{min:0,max:32,step:1,suffix:'px'}),field('Borde','panels.borderWidth',c.panels.borderWidth,{min:0,max:5,step:1,suffix:'px'}),field('Sombra','panels.shadowPreset',c.panels.shadowPreset,{type:'select',options:SHADOW_OPTIONS})
  ])].join('');
  if (sectionKey === 'modals') return [sectionHeader('Modales','Personaliza cajas modales; mantiene su lógica, tamaño funcional y jerarquía.'),group('Apariencia',[
    field('Personalizar','modals.enabled',c.modals.enabled,{type:'checkbox'}),field('Fondo','modals.background',c.modals.background,{type:'color'}),field('Texto','modals.text',c.modals.text,{type:'color'}),field('Borde','modals.border',c.modals.border,{type:'color'}),field('Opacidad','modals.opacity',c.modals.opacity,{min:.6,max:1,step:.01}),field('Oscurecimiento exterior','modals.overlayOpacity',c.modals.overlayOpacity,{min:.35,max:.96,step:.01}),field('Radio','modals.radius',c.modals.radius,{min:0,max:32,step:1,suffix:'px'}),field('Borde','modals.borderWidth',c.modals.borderWidth,{min:0,max:5,step:1,suffix:'px'}),field('Sombra','modals.shadowPreset',c.modals.shadowPreset,{type:'select',options:SHADOW_OPTIONS})
  ])].join('');
  if (sectionKey === 'tabs') return [sectionHeader('Pestañas','Pestañas de Enciclopedia, Admin y Mercado.'),group('Apariencia',[
    field('Personalizar','tabs.enabled',c.tabs.enabled,{type:'checkbox'}),field('Fondo','tabs.background',c.tabs.background,{type:'color'}),field('Fondo activo','tabs.activeBackground',c.tabs.activeBackground,{type:'color'}),field('Texto','tabs.text',c.tabs.text,{type:'color'}),field('Texto activo','tabs.activeText',c.tabs.activeText,{type:'color'}),field('Borde','tabs.border',c.tabs.border,{type:'color'}),field('Radio','tabs.radius',c.tabs.radius,{min:0,max:24,step:1,suffix:'px'}),field('Borde','tabs.borderWidth',c.tabs.borderWidth,{min:0,max:4,step:1,suffix:'px'}),field('Fuente','tabs.fontSize',c.tabs.fontSize,{min:9,max:20,step:1,suffix:'px'}),field('Alto mínimo','tabs.height',c.tabs.height,{min:26,max:56,step:1,suffix:'px'}),field('Separación','tabs.gap',c.tabs.gap,{min:0,max:18,step:1,suffix:'px'})
  ])].join('');
  if (sectionKey === 'inputs') return [sectionHeader('Campos y controles','Inputs/selects de superficies de configuración y mercado.'),group('Apariencia',[
    field('Personalizar','inputs.enabled',c.inputs.enabled,{type:'checkbox'}),field('Fondo','inputs.background',c.inputs.background,{type:'color'}),field('Texto','inputs.text',c.inputs.text,{type:'color'}),field('Borde','inputs.border',c.inputs.border,{type:'color'}),field('Focus','inputs.focus',c.inputs.focus,{type:'color'}),field('Radio','inputs.radius',c.inputs.radius,{min:0,max:20,step:1,suffix:'px'}),field('Borde','inputs.borderWidth',c.inputs.borderWidth,{min:0,max:4,step:1,suffix:'px'}),field('Fuente','inputs.fontSize',c.inputs.fontSize,{min:10,max:20,step:1,suffix:'px'}),field('Alto mínimo','inputs.height',c.inputs.height,{min:28,max:54,step:1,suffix:'px'})
  ])].join('');
  if (sectionKey === 'badges') return [sectionHeader('Badges / indicadores','Sólo geometría/tipografía; conserva colores semánticos y de estado.'),group('Apariencia',[
    field('Personalizar','badges.enabled',c.badges.enabled,{type:'checkbox'}),field('Radio','badges.radius',c.badges.radius,{min:0,max:999,step:1,suffix:'px'}),field('Borde','badges.borderWidth',c.badges.borderWidth,{min:0,max:4,step:1,suffix:'px'}),field('Fuente','badges.fontSize',c.badges.fontSize,{min:8,max:18,step:1,suffix:'px'}),field('Padding horizontal','badges.paddingX',c.badges.paddingX,{min:0,max:18,step:1,suffix:'px'}),field('Padding vertical','badges.paddingY',c.badges.paddingY,{min:0,max:10,step:1,suffix:'px'}),field('Sombra','badges.shadowPreset',c.badges.shadowPreset,{type:'select',options:SHADOW_OPTIONS})
  ])].join('');
  return [sectionHeader('Avisos / notificaciones','Conserva colores de éxito/error/advertencia; sólo modifica forma y sombra.'),group('Apariencia',[
    field('Personalizar','notifications.enabled',c.notifications.enabled,{type:'checkbox'}),field('Radio','notifications.radius',c.notifications.radius,{min:0,max:24,step:1,suffix:'px'}),field('Borde','notifications.borderWidth',c.notifications.borderWidth,{min:0,max:4,step:1,suffix:'px'}),field('Sombra','notifications.shadowPreset',c.notifications.shadowPreset,{type:'select',options:SHADOW_OPTIONS})
  ])].join('');
}

function contrastRatio(hexA, hexB) {
  const rgb = hex => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255).map(v => v <= .03928 ? v/12.92 : ((v+.055)/1.055)**2.4);
  const lum = hex => { const [r,g,b] = rgb(hex); return .2126*r+.7152*g+.0722*b; };
  const a = lum(hexA), b = lum(hexB), hi = Math.max(a,b), lo = Math.min(a,b);
  return (hi+.05)/(lo+.05);
}

function previewHtml(c, viewport, sectionKey) {
  const { vars } = appearanceCssVariables(c);
  const style = Object.entries(vars).map(([k,v]) => `${k}:${v}`).join(';');
  const disabled = key => c[key]?.enabled === false ? '<span class="appearance-preview-inherit">HEREDA CLÁSICO</span>' : '';
  const section = String(sectionKey || 'mainMenu');
  let body = '';

  if (section === 'global') {
    body = `<div class="appearance-preview-single appearance-preview-global">
      <div class="appearance-preview-global-mark">ARGENTINIA</div>
      <div class="appearance-preview-global-line"></div>
      <strong>Tema global</strong>
      <span>Texto principal · <em>Texto secundario</em></span>
      ${disabled('global')}
    </div>`;
  } else if (section === 'mainMenu') {
    body = `<div class="appearance-preview-single appearance-preview-menu-stage">
      <div class="appearance-preview-logo">ARGENTINIA</div>
      <div class="appearance-preview-menu">
        <button class="primary">PARTIDA SIMPLE</button><button>TORNEO</button><button>MULTIJUGADOR</button><button>MIS MAZOS</button><button>ENCICLOPEDIA</button>
        <div class="appearance-preview-bottom"><button>OPCIONES</button><button class="icon">🛒</button><button class="icon">📊</button><button class="icon">🔄</button></div>
      </div>
      ${disabled('mainMenu')}
    </div>`;
  } else if (section === 'buttons') {
    body = `<div class="appearance-preview-single appearance-preview-center"><div class="appearance-preview-button-showcase">
      <button class="appearance-preview-button hero">BOTÓN PRINCIPAL</button>
      <button class="appearance-preview-button">BOTÓN SECUNDARIO</button>
      <button class="appearance-preview-button" disabled>DESHABILITADO</button>
      ${disabled('buttons')}
    </div></div>`;
  } else if (section === 'panels') {
    body = `<div class="appearance-preview-single appearance-preview-center"><section class="appearance-preview-panel appearance-preview-large-component">
      <div class="appearance-preview-caption">PANEL DE EJEMPLO</div><h3>Contenido del panel</h3><p>Esta vista muestra únicamente geometría, borde, fondo, texto y sombra del panel.</p>${disabled('panels')}
    </section></div>`;
  } else if (section === 'modals') {
    body = `<div class="appearance-preview-single appearance-preview-modal-stage"><div class="appearance-preview-modal appearance-preview-large-component">
      <strong>MODAL DE EJEMPLO</strong><p>Vista previa exclusiva del modal. Los cambios se reflejan en tiempo real.</p><div class="appearance-preview-modal-actions"><button class="appearance-preview-button">ACEPTAR</button><button class="appearance-preview-button">CANCELAR</button></div>${disabled('modals')}
    </div></div>`;
  } else if (section === 'tabs') {
    body = `<div class="appearance-preview-single appearance-preview-center"><div class="appearance-preview-tabs appearance-preview-tabs-large"><span class="active">ACTIVA</span><span>CRIATURAS</span><span>ARTEFACTOS</span><span>OTRA</span></div>${disabled('tabs')}</div>`;
  } else if (section === 'inputs') {
    body = `<div class="appearance-preview-single appearance-preview-center"><div class="appearance-preview-form">
      <label>Campo de texto<input value="Valor de ejemplo" readonly></label><label>Selector<select><option>Opción seleccionada</option></select></label><label class="appearance-preview-check"><input type="checkbox" checked> Control activado</label>${disabled('inputs')}
    </div></div>`;
  } else if (section === 'badges') {
    body = `<div class="appearance-preview-single appearance-preview-center"><div class="appearance-preview-badge-showcase"><span class="appearance-preview-badge">NUEVO</span><span class="appearance-preview-badge warn">PENDIENTE</span><span class="appearance-preview-badge info">ADMIN</span>${disabled('badges')}</div></div>`;
  } else if (section === 'notifications') {
    body = `<div class="appearance-preview-single appearance-preview-center"><div class="appearance-preview-notification-showcase">
      <div class="appearance-preview-notice">✓ Operación completada</div><div class="appearance-preview-notice warning">⚠ Atención requerida</div><div class="appearance-preview-notice error">✕ Ocurrió un error</div>${disabled('notifications')}
    </div></div>`;
  }

  return `<div class="appearance-preview-shell viewport-${esc(viewport)} preview-section-${esc(section)}" style="${esc(style)}">${body}</div>`;
}
const STYLE_ID = 'arg-appearance-admin-v1-style';
function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style'); style.id = STYLE_ID;
  style.textContent = `
.appearance-studio{max-width:1500px;margin:0 auto;padding:4px 0 30px}.appearance-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;padding:12px;border:1px solid rgba(212,175,55,.32);border-radius:12px;background:rgba(5,9,6,.52)}.appearance-toolbar .spacer{flex:1}.appearance-toolbar-status{font-size:12px;color:#c7c4b8;min-width:180px}.appearance-action{min-height:34px;padding:7px 11px;border:1px solid #d4af37;border-radius:8px;background:#172018;color:#f0e0b0;font-weight:800;cursor:pointer}.appearance-action.primary{background:#6f5a18;border-color:#f0e0b0}.appearance-action.danger{border-color:#b75e5e;color:#ffd8d8}.appearance-action:disabled{opacity:.42;cursor:not-allowed}.appearance-preset{min-height:34px;border:1px solid #536057;border-radius:7px;background:#0c140e;color:#f0e0b0;padding:5px 8px}.appearance-section-picker{display:flex;align-items:center;gap:8px;min-height:34px;padding:0 8px;border:1px solid rgba(212,175,55,.38);border-radius:8px;background:#0c140e;color:#d7c98c;font-size:11px;font-weight:900}.appearance-section-picker select{min-width:200px;border:0;background:#0c140e;color:#fff3c3;font-weight:900;outline:none;padding:6px 4px}.appearance-studio-grid{display:grid;grid-template-columns:minmax(520px,1.16fr) minmax(420px,.84fr);gap:14px;align-items:start}.appearance-controls{min-width:0}.appearance-section-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}.appearance-section-heading h3{margin:0;color:#f0e0b0;font-size:20px}.appearance-section-heading p{margin:4px 0 0;color:#a9b3aa;font-size:12px;line-height:1.45}.appearance-mini-btn{border:1px solid rgba(212,175,55,.5);border-radius:7px;background:#101912;color:#d7c98c;padding:6px 8px;cursor:pointer;white-space:nowrap}.appearance-control-group{margin-bottom:12px;padding:12px;border:1px solid rgba(212,175,55,.22);border-radius:10px;background:rgba(10,15,11,.72)}.appearance-control-group-title{font-weight:900;color:#d4af37;font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px}.appearance-control-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.appearance-field{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:48px;padding:7px 8px;border:1px solid rgba(255,255,255,.06);border-radius:8px;background:rgba(255,255,255,.02)}.appearance-field>span:first-child{min-width:0}.appearance-field strong{display:block;font-size:12px;color:#e6e2d2}.appearance-field-help{margin-top:2px;font-size:10px;color:#849087}.appearance-field input[type=number],.appearance-field select{width:105px;min-height:31px;border:1px solid #4e5a50;border-radius:6px;background:#071009;color:#f0e0b0;padding:4px 6px}.appearance-field input[type=color]{width:38px;height:31px;padding:2px;border:1px solid #4e5a50;border-radius:6px;background:#071009}.appearance-number-row,.appearance-color-row{display:flex;align-items:center;gap:5px}.appearance-color-row code{font-size:10px;color:#b8c2b8}.appearance-field-suffix{font-size:10px;color:#859086;min-width:20px}.appearance-field-check input{width:20px;height:20px}.appearance-preview-column{position:sticky;top:8px;min-width:0}.appearance-preview-toolbar{display:flex;gap:6px;align-items:center;margin-bottom:8px}.appearance-preview-toolbar button{padding:6px 8px;border:1px solid #465248;border-radius:6px;background:#0d150f;color:#bfc8c0;cursor:pointer}.appearance-preview-toolbar button.active{border-color:#d4af37;color:#fff3c3}.appearance-warning{margin:8px 0;padding:8px 10px;border:1px solid #946f2d;border-radius:8px;background:#2b2212;color:#ffd98a;font-size:11px;line-height:1.4}.appearance-preview-shell{width:100%;border:1px solid rgba(212,175,55,.35);border-radius:12px;overflow:hidden;background:#050806;box-shadow:0 12px 36px rgba(0,0,0,.45);min-height:360px}.appearance-preview-shell.viewport-desktop{aspect-ratio:16/10}.appearance-preview-shell.viewport-android{aspect-ratio:20/9}.appearance-preview-shell.viewport-iphone{aspect-ratio:19.5/9}.appearance-preview-single{box-sizing:border-box;position:relative;width:100%;height:100%;min-height:360px;overflow:hidden;background:radial-gradient(circle at 55% 28%,rgba(var(--arg-menu-hover-rgb),.10),transparent 32%),linear-gradient(135deg,#111b14,#050806);display:flex}.appearance-preview-center{align-items:center;justify-content:center;padding:8%}.appearance-preview-global{flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--arg-global-text);background:rgba(var(--arg-global-panel-bg-rgb),.96)}.appearance-preview-global-mark{font-size:clamp(28px,5vw,54px);font-weight:1000;letter-spacing:.15em;color:var(--arg-global-accent)}.appearance-preview-global-line{height:2px;width:42%;background:var(--arg-global-accent)}.appearance-preview-global span{color:var(--arg-global-muted-text)}.appearance-preview-global em{font-style:normal}.appearance-preview-menu-stage{display:block}.appearance-preview-logo{position:absolute;top:9%;left:0;right:0;text-align:center;color:var(--arg-menu-primary-border);font-weight:1000;letter-spacing:.18em;font-size:clamp(22px,4vw,44px);text-shadow:0 4px 16px #000}.appearance-preview-menu{position:absolute;left:7%;bottom:9%;display:flex;flex-direction:column;gap:min(var(--arg-menu-gap),10px);width:min(50%,var(--arg-menu-button-width))}.appearance-preview-menu button{min-height:min(var(--arg-menu-button-height),46px);border:var(--arg-menu-border-width) solid var(--arg-menu-border);border-radius:var(--arg-menu-radius);background:linear-gradient(180deg,var(--arg-menu-bg-top),var(--arg-menu-bg-bottom));color:var(--arg-menu-text);font-size:min(var(--arg-menu-font-size),16px);font-weight:var(--arg-menu-font-weight);text-align:var(--arg-menu-text-align);padding:6px 10px;box-shadow:var(--arg-menu-shadow);overflow:hidden;white-space:nowrap}.appearance-preview-menu button.primary{border-color:var(--arg-menu-primary-border);background:linear-gradient(180deg,var(--arg-menu-primary-top),var(--arg-menu-bg-bottom));font-size:min(var(--arg-menu-primary-font-size),17px)}.appearance-preview-bottom{display:flex;gap:5px}.appearance-preview-bottom>button:first-child{flex:1}.appearance-preview-bottom .icon{flex:0 0 38px;width:38px;text-align:center}.appearance-preview-large-component{width:min(82%,560px);box-sizing:border-box;padding:24px}.appearance-preview-panel{border:var(--arg-panel-border-width) solid var(--arg-panel-border);border-radius:var(--arg-panel-radius);background:rgba(var(--arg-panel-bg-rgb),var(--arg-panel-opacity));color:var(--arg-panel-text);box-shadow:var(--arg-panel-shadow);font-size:14px}.appearance-preview-panel h3{font-size:22px;margin:12px 0}.appearance-preview-caption{color:#d4af37;font-weight:900}.appearance-preview-modal-stage{align-items:center;justify-content:center;padding:7%;background:rgba(0,0,0,.68)}.appearance-preview-modal{border:var(--arg-modal-border-width) solid var(--arg-modal-border);border-radius:var(--arg-modal-radius);background:rgba(var(--arg-modal-bg-rgb),var(--arg-modal-opacity));color:var(--arg-modal-text);box-shadow:var(--arg-modal-shadow);font-size:15px}.appearance-preview-modal>strong{font-size:22px}.appearance-preview-modal p{margin:14px 0;line-height:1.45}.appearance-preview-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}.appearance-preview-button-showcase{width:min(80%,430px);display:flex;flex-direction:column;gap:14px}.appearance-preview-button{padding:12px 18px;background:var(--arg-button-bg);color:var(--arg-button-text);border:var(--arg-button-border-width) solid var(--arg-button-border);border-radius:var(--arg-button-radius);box-shadow:var(--arg-button-shadow);font-size:14px;font-weight:900}.appearance-preview-button.hero{font-size:18px;padding:15px 20px}.appearance-preview-button:disabled{opacity:.45}.appearance-preview-tabs{display:flex;gap:var(--arg-tab-gap)}.appearance-preview-tabs span{padding:10px 16px;border:var(--arg-tab-border-width) solid var(--arg-tab-border);border-radius:var(--arg-tab-radius);background:var(--arg-tab-bg);color:var(--arg-tab-text);font-size:13px;font-weight:900}.appearance-preview-tabs span.active{background:var(--arg-tab-active-bg);color:var(--arg-tab-active-text)}.appearance-preview-tabs-large{flex-wrap:wrap;justify-content:center}.appearance-preview-form{width:min(78%,500px);display:grid;gap:14px;color:#d8d8ce}.appearance-preview-form label{display:grid;gap:6px;font-size:12px;font-weight:800}.appearance-preview-form input:not([type=checkbox]),.appearance-preview-form select{box-sizing:border-box;width:100%;min-height:var(--arg-input-height);background:var(--arg-input-bg);color:var(--arg-input-text);border:var(--arg-input-border-width) solid var(--arg-input-border);border-radius:var(--arg-input-radius);padding:7px 10px;font-size:var(--arg-input-font-size)}.appearance-preview-check{display:flex!important;grid-template-columns:auto 1fr!important;align-items:center}.appearance-preview-badge-showcase{display:flex;gap:18px;align-items:center;justify-content:center;flex-wrap:wrap}.appearance-preview-badge{padding:var(--arg-badge-padding-y) var(--arg-badge-padding-x);border:var(--arg-badge-border-width) solid #2f8d55;border-radius:var(--arg-badge-radius);background:#123d24;color:#bff0cd;font-size:var(--arg-badge-font-size);box-shadow:var(--arg-badge-shadow);font-weight:900}.appearance-preview-badge.warn{border-color:#a67d25;background:#4b3910;color:#ffe099}.appearance-preview-badge.info{border-color:#6d55a8;background:#251841;color:#e4d7ff}.appearance-preview-notification-showcase{width:min(82%,560px);display:grid;gap:15px}.appearance-preview-notice{padding:16px 18px;border:var(--arg-notification-border-width) solid #3e9b66;border-radius:var(--arg-notification-radius);background:#11341f;color:#bff0cd;box-shadow:var(--arg-notification-shadow);font-weight:800}.appearance-preview-notice.warning{border-color:#a67d25;background:#3b2d0e;color:#ffe099}.appearance-preview-notice.error{border-color:#a74747;background:#3a1212;color:#ffc7c7}.appearance-preview-inherit{display:inline-block;margin-top:8px;padding:4px 7px;border-radius:999px;background:rgba(255,255,255,.06);font-size:9px;color:#8f998f;font-weight:800}.appearance-schema-note{margin-top:9px;font-size:10px;color:#7f8b81;line-height:1.4}@media(max-width:1100px){.appearance-studio-grid{grid-template-columns:1fr}.appearance-preview-column{position:static}.appearance-preview-shell{max-width:820px;margin:0 auto}}@media(max-width:760px){.appearance-control-grid{grid-template-columns:1fr}.appearance-section-picker{width:100%;box-sizing:border-box}.appearance-section-picker select{min-width:0;flex:1}.appearance-preview-shell{min-height:300px}.appearance-preview-single{min-height:300px}}
`
  document.head.appendChild(style);
}

export function mountAppearanceAdminPane(root) {
  if (!root) return { load: async()=>{} };
  ensureStyles();
  let published = classicAppearanceConfig();
  let draft = clone(published);
  let previous = null;
  let revision = 0;
  let activeSection = 'mainMenu';
  let viewport = 'desktop';
  let loaded = false;
  let busy = false;

  function renderShell() {
    root.innerHTML = `<div class="appearance-studio">
      <div class="appearance-toolbar">
        <select class="appearance-preset" data-appearance-preset><option value="classic">Clásico Argentinia</option><option value="custom">Personalizado</option></select>
        <label class="appearance-section-picker"><span>ELEMENTO</span><select data-appearance-section-select>${SECTION_META.map(([key,label,icon])=>`<option value="${key}">${icon} ${esc(label)}</option>`).join('')}</select></label>
        <button class="appearance-action" data-appearance-undo>Deshacer cambios locales</button>
        <button class="appearance-action danger" data-appearance-rollback>↩ Volver a revisión anterior</button>
        <span class="spacer"></span><span class="appearance-toolbar-status" data-appearance-status></span>
        <button class="appearance-action primary" data-appearance-publish>💾 PUBLICAR APARIENCIA</button>
      </div>
      <div class="appearance-studio-grid">
        <div class="appearance-controls" data-appearance-controls></div>
        <aside class="appearance-preview-column"><div class="appearance-preview-toolbar"><strong style="margin-right:auto;color:#d4af37">Preview</strong><button data-appearance-viewport="desktop">Desktop</button><button data-appearance-viewport="android">Android</button><button data-appearance-viewport="iphone">iPhone</button></div><div data-appearance-warning></div><div data-appearance-preview></div><div class="appearance-schema-note">Preview local: mover controles no escribe Firestore. Publicar guarda una sola revisión en <code>gameConfig/appearance</code>. Las dimensiones se normalizan server/client-side por esquema; no se acepta CSS libre.</div></aside>
      </div>
    </div>`;
    bindShell(); renderAll();
  }

  function status(text, kind = '') {
    const el = root.querySelector('[data-appearance-status]'); if (!el) return;
    el.textContent = text || ''; el.style.color = kind === 'error' ? '#ff9898' : kind === 'ok' ? '#9be3ae' : '#c7c4b8';
  }

  function renderAll() {
    const normalized = normalizeAppearanceConfig(draft); draft = normalized;
    const sectionSelect = root.querySelector('[data-appearance-section-select]'); if (sectionSelect) sectionSelect.value = activeSection;
    root.querySelector('[data-appearance-controls]').innerHTML = controlsFor(activeSection, draft);
    const preset = root.querySelector('[data-appearance-preset]'); if (preset) preset.value = draft.preset === 'classic' ? 'classic' : 'custom';
    const rollback = root.querySelector('[data-appearance-rollback]'); if (rollback) rollback.disabled = !previous || busy;
    const publish = root.querySelector('[data-appearance-publish]'); if (publish) publish.disabled = busy;
    root.querySelectorAll('[data-appearance-viewport]').forEach(btn => btn.classList.toggle('active', btn.dataset.appearanceViewport === viewport));
    bindControlInputs(); renderPreview();
  }

  function renderPreview() {
    const preview = root.querySelector('[data-appearance-preview]'); if (!preview) return;
    preview.innerHTML = previewHtml(draft, viewport, activeSection);
    const shell = preview.firstElementChild; if (shell) applyAppearanceVariablesToElement(shell, draft);
    const ratio = contrastRatio(draft.mainMenu.colors.text, draft.mainMenu.colors.backgroundBottom);
    const warning = root.querySelector('[data-appearance-warning]');
    const warnings = [];
    if (activeSection === 'mainMenu' && ratio < 4.5) warnings.push(`Contraste del menú bajo (${ratio.toFixed(2)}:1). Recomendado ≥ 4.5:1.`);
    if (activeSection === 'mainMenu' && draft.mainMenu.mobile.buttonWidth > 230) warnings.push('Ancho mobile alto: el motor lo limita además a 42dvw para evitar overflow.');
    if (activeSection === 'mainMenu' && draft.mainMenu.mobile.fontSize > 18) warnings.push('Fuente mobile grande: revisar iPhone horizontal antes de publicar.');
    warning.innerHTML = warnings.length ? `<div class="appearance-warning">⚠ ${warnings.map(esc).join('<br>')}</div>` : '';
  }

  function bindControlInputs() {
    root.querySelectorAll('[data-appearance-path]').forEach(el => {
      const event = el.type === 'number' ? 'input' : 'change';
      el.addEventListener(event, () => {
        let value = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
        const path = el.dataset.appearancePath;
        setPath(draft, path, value);
        const section = path.split('.')[0];
        if (path !== `${section}.enabled` && draft?.[section] && typeof draft[section] === 'object' && 'enabled' in draft[section]) draft[section].enabled = true;
        draft.preset = 'custom'; draft = normalizeAppearanceConfig(draft);
        const colorCode = el.closest('.appearance-color-row')?.querySelector('code'); if (colorCode) colorCode.textContent = el.value;
        const preset = root.querySelector('[data-appearance-preset]'); if (preset) preset.value = 'custom';
        renderPreview();
      });
    });
    root.querySelector('[data-appearance-reset-section]')?.addEventListener('click', () => {
      const classic = classicAppearanceConfig(); draft[activeSection] = clone(classic[activeSection]); draft.preset = 'custom'; renderAll(); status('Sección restaurada localmente. Falta publicar.');
    });
  }

  function bindShell() {
    root.querySelector('[data-appearance-section-select]')?.addEventListener('change', e => { activeSection = e.target.value; renderAll(); });
    root.querySelectorAll('[data-appearance-viewport]').forEach(btn => btn.addEventListener('click', () => { viewport = btn.dataset.appearanceViewport; renderAll(); }));
    root.querySelector('[data-appearance-preset]')?.addEventListener('change', e => {
      if (e.target.value === 'classic') { draft = classicAppearanceConfig(); renderAll(); status('Preset Clásico cargado localmente. Falta publicar.'); }
      else { draft.preset = 'custom'; renderAll(); }
    });
    root.querySelector('[data-appearance-undo]')?.addEventListener('click', () => { draft = clone(published); renderAll(); status('Cambios locales descartados.'); });
    root.querySelector('[data-appearance-publish]')?.addEventListener('click', async () => {
      if (busy) return; busy = true; renderAll(); status('Publicando…');
      try {
        const doc = await publishAppearanceConfig(draft); previous = doc.previous ? normalizeAppearanceConfig(doc.previous) : previous; published = normalizeAppearanceConfig(doc.current); draft = clone(published); revision = Number(doc.revision)||revision+1;
        status(`Publicado · revisión ${revision}. Se aplicará al volver al menú o al reabrir la app.`, 'ok');
      } catch (err) { console.error('[Appearance V1] Publish failed:', err); status(`No se pudo publicar: ${err?.message || err}`, 'error'); }
      finally { busy = false; renderAll(); }
    });
    root.querySelector('[data-appearance-rollback]')?.addEventListener('click', async () => {
      if (busy || !previous) return;
      if (!window.confirm('¿Publicar la revisión anterior de Apariencia? La revisión actual quedará como rollback disponible.')) return;
      busy = true; renderAll(); status('Restaurando revisión anterior…');
      try {
        const doc = await rollbackAppearanceConfig(); previous = normalizeAppearanceConfig(doc.previous); published = normalizeAppearanceConfig(doc.current); draft = clone(published); revision = Number(doc.revision)||revision+1;
        status(`Rollback publicado · revisión ${revision}.`, 'ok');
      } catch (err) { console.error('[Appearance V1] Rollback failed:', err); status(`No se pudo restaurar: ${err?.message || err}`, 'error'); }
      finally { busy = false; renderAll(); }
    });
  }

  async function load() {
    if (busy) return; busy = true;
    if (!loaded) renderShell();
    status('Cargando apariencia publicada…');
    try {
      const result = await loadPublishedAppearance({ force: true, apply: false });
      const doc = result.document;
      published = normalizeAppearanceConfig(result.config); draft = clone(published); previous = doc?.previous ? normalizeAppearanceConfig(doc.previous) : null; revision = Number(doc?.revision)||0; loaded = true;
      status(doc ? `Revisión publicada ${revision}.` : 'Sin documento publicado: usando Clásico Argentinia.');
    } catch (err) { console.error('[Appearance V1] Admin load failed:', err); published = classicAppearanceConfig(); draft = clone(published); previous = null; status('No se pudo leer Firestore; preview en Clásico.', 'error'); }
    finally { busy = false; renderAll(); }
  }

  return { load, getDraft: () => clone(draft) };
}
