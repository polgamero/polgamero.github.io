// Appearance Studio V1 — Argentinia 23.22.0 HF3.2
// Public visual configuration lives in gameConfig/appearance.
// This module intentionally accepts typed values only: no CSS selectors, HTML or arbitrary CSS.

import { loadPublicGameConfigDocument, saveAdminGameConfigDocument } from './firebaseClient.js';

export const APPEARANCE_DOCUMENT_ID = 'appearance';
export const APPEARANCE_SCHEMA_VERSION = 1;

const SHADOWS = Object.freeze({
  none: 'none',
  soft: '0 3px 10px rgba(0,0,0,.26)',
  medium: '0 4px 16px rgba(0,0,0,.40)',
  strong: '0 8px 28px rgba(0,0,0,.58)'
});

const CLASSIC = Object.freeze({
  schemaVersion: APPEARANCE_SCHEMA_VERSION,
  preset: 'classic',
  global: Object.freeze({
    enabled: true,
    accent: '#d4af37',
    text: '#f0e0b0',
    mutedText: '#c7c4b8',
    panelBackground: '#111a13',
    panelBorder: '#d4af37',
    baseRadius: 10,
    shadowPreset: 'medium'
  }),
  mainMenu: Object.freeze({
    enabled: false,
    desktop: Object.freeze({
      buttonWidth: 230,
      buttonHeight: 40,
      gap: 10,
      left: 5,
      bottom: 8,
      logoTop: 5,
      logoMaxWidth: 55,
      logoMaxHeight: 32,
      radius: 10,
      borderWidth: 2,
      fontSize: 17,
      primaryFontSize: 18,
      fontWeight: 700,
      letterSpacing: 0.5,
      paddingY: 7,
      paddingX: 10,
      iconImageInset: 4,
      iconRadius: 10
    }),
    mobile: Object.freeze({
      buttonWidth: 210,
      buttonHeight: 34,
      gap: 4,
      left: 3,
      bottom: 4,
      logoTop: 2,
      logoMaxWidth: 43,
      logoMaxHeight: 26,
      radius: 7,
      borderWidth: 2,
      fontSize: 15,
      primaryFontSize: 15,
      paddingY: 5,
      paddingX: 8,
      iconImageInset: 4,
      iconRadius: 7
    }),
    colors: Object.freeze({
      backgroundTop: '#12190f',
      backgroundBottom: '#0b130e',
      primaryTop: '#57491c',
      text: '#f0e0b0',
      border: '#d4af37',
      primaryBorder: '#f0e0b0',
      hoverTint: '#d4af37'
    }),
    textAlign: 'left',
    shadowPreset: 'medium',
    hover: Object.freeze({ translateX: 6, translateYIcon: -2, brightness: 1.06 })
  }),
  buttons: Object.freeze({
    enabled: false,
    background: '#1a241b',
    text: '#f0e0b0',
    border: '#d4af37',
    radius: 9,
    borderWidth: 1,
    fontSize: 13,
    shadowPreset: 'soft'
  }),
  panels: Object.freeze({
    enabled: false,
    background: '#111a13',
    text: '#f0e0b0',
    border: '#d4af37',
    radius: 16,
    borderWidth: 1,
    opacity: 0.96,
    shadowPreset: 'strong'
  }),
  modals: Object.freeze({
    enabled: false,
    background: '#111a13',
    text: '#f0e0b0',
    border: '#d4af37',
    radius: 16,
    borderWidth: 1,
    opacity: 0.98,
    overlayOpacity: 0.84,
    shadowPreset: 'strong'
  }),
  tabs: Object.freeze({
    enabled: false,
    background: '#12190f',
    activeBackground: '#332c16',
    text: '#c7c4b8',
    activeText: '#f0e0b0',
    border: '#d4af37',
    radius: 8,
    borderWidth: 1,
    fontSize: 12,
    height: 34,
    gap: 6
  }),
  inputs: Object.freeze({
    enabled: false,
    background: '#0b130e',
    text: '#f0e0b0',
    border: '#6d6b55',
    focus: '#d4af37',
    radius: 8,
    borderWidth: 1,
    fontSize: 13,
    height: 36
  }),
  badges: Object.freeze({
    enabled: false,
    radius: 999,
    borderWidth: 1,
    fontSize: 11,
    paddingX: 6,
    paddingY: 2,
    shadowPreset: 'none'
  }),
  notifications: Object.freeze({
    enabled: false,
    radius: 10,
    borderWidth: 1,
    shadowPreset: 'strong'
  })
});

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function num(value, fallback, min, max, decimals = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.min(max, Math.max(min, parsed));
  const factor = 10 ** decimals;
  return Math.round(clamped * factor) / factor;
}
function bool(value, fallback = false) { return typeof value === 'boolean' ? value : fallback; }
function choice(value, allowed, fallback) { return allowed.includes(value) ? value : fallback; }
function hex(value, fallback) {
  const raw = String(value || '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(raw) ? raw : fallback;
}
function shadow(value, fallback = 'medium') { return choice(value, Object.keys(SHADOWS), fallback); }
function section(raw, fallback) { return raw && typeof raw === 'object' ? raw : fallback; }

export function classicAppearanceConfig() { return clone(CLASSIC); }

export function normalizeAppearanceConfig(raw = {}) {
  const source = raw?.current && typeof raw.current === 'object' ? raw.current : raw;
  const c = CLASSIC;
  const g = section(source.global, c.global);
  const mm = section(source.mainMenu, c.mainMenu);
  const mmd = section(mm.desktop, c.mainMenu.desktop);
  const mmm = section(mm.mobile, c.mainMenu.mobile);
  const mmc = section(mm.colors, c.mainMenu.colors);
  const buttons = section(source.buttons, c.buttons);
  const panels = section(source.panels, c.panels);
  const modals = section(source.modals, c.modals);
  const tabs = section(source.tabs, c.tabs);
  const inputs = section(source.inputs, c.inputs);
  const badges = section(source.badges, c.badges);
  const notifications = section(source.notifications, c.notifications);

  return {
    schemaVersion: APPEARANCE_SCHEMA_VERSION,
    preset: source.preset === 'classic' ? 'classic' : 'custom',
    global: {
      enabled: bool(g.enabled, true), accent: hex(g.accent, c.global.accent), text: hex(g.text, c.global.text),
      mutedText: hex(g.mutedText, c.global.mutedText), panelBackground: hex(g.panelBackground, c.global.panelBackground),
      panelBorder: hex(g.panelBorder, c.global.panelBorder), baseRadius: num(g.baseRadius, c.global.baseRadius, 0, 28, 0),
      shadowPreset: shadow(g.shadowPreset, c.global.shadowPreset)
    },
    mainMenu: {
      enabled: bool(mm.enabled, true),
      desktop: {
        buttonWidth: num(mmd.buttonWidth, c.mainMenu.desktop.buttonWidth, 160, 420, 0),
        buttonHeight: num(mmd.buttonHeight, c.mainMenu.desktop.buttonHeight, 30, 72, 0),
        gap: num(mmd.gap, c.mainMenu.desktop.gap, 0, 30, 0), left: num(mmd.left, c.mainMenu.desktop.left, 0, 40, 1),
        bottom: num(mmd.bottom, c.mainMenu.desktop.bottom, 0, 40, 1), logoTop: num(mmd.logoTop, c.mainMenu.desktop.logoTop, 0, 30, 1),
        logoMaxWidth: num(mmd.logoMaxWidth, c.mainMenu.desktop.logoMaxWidth, 20, 85, 1), logoMaxHeight: num(mmd.logoMaxHeight, c.mainMenu.desktop.logoMaxHeight, 10, 60, 1),
        radius: num(mmd.radius, c.mainMenu.desktop.radius, 0, 30, 0), borderWidth: num(mmd.borderWidth, c.mainMenu.desktop.borderWidth, 0, 5, 0),
        fontSize: num(mmd.fontSize, c.mainMenu.desktop.fontSize, 11, 28, 0), primaryFontSize: num(mmd.primaryFontSize, c.mainMenu.desktop.primaryFontSize, 11, 30, 0),
        fontWeight: choice(Number(mmd.fontWeight), [400,500,600,700,800,900], c.mainMenu.desktop.fontWeight),
        letterSpacing: num(mmd.letterSpacing, c.mainMenu.desktop.letterSpacing, -1, 3, 1), paddingY: num(mmd.paddingY, c.mainMenu.desktop.paddingY, 2, 18, 0),
        paddingX: num(mmd.paddingX, c.mainMenu.desktop.paddingX, 4, 30, 0), iconImageInset: num(mmd.iconImageInset, c.mainMenu.desktop.iconImageInset, 0, 12, 0),
        iconRadius: num(mmd.iconRadius, c.mainMenu.desktop.iconRadius, 0, 30, 0)
      },
      mobile: {
        buttonWidth: num(mmm.buttonWidth, c.mainMenu.mobile.buttonWidth, 130, 260, 0), buttonHeight: num(mmm.buttonHeight, c.mainMenu.mobile.buttonHeight, 28, 52, 0),
        gap: num(mmm.gap, c.mainMenu.mobile.gap, 0, 16, 0), left: num(mmm.left, c.mainMenu.mobile.left, 0, 18, 1), bottom: num(mmm.bottom, c.mainMenu.mobile.bottom, 0, 20, 1),
        logoTop: num(mmm.logoTop, c.mainMenu.mobile.logoTop, 0, 16, 1), logoMaxWidth: num(mmm.logoMaxWidth, c.mainMenu.mobile.logoMaxWidth, 20, 65, 1),
        logoMaxHeight: num(mmm.logoMaxHeight, c.mainMenu.mobile.logoMaxHeight, 10, 45, 1), radius: num(mmm.radius, c.mainMenu.mobile.radius, 0, 22, 0),
        borderWidth: num(mmm.borderWidth, c.mainMenu.mobile.borderWidth, 0, 4, 0), fontSize: num(mmm.fontSize, c.mainMenu.mobile.fontSize, 10, 20, 0),
        primaryFontSize: num(mmm.primaryFontSize, c.mainMenu.mobile.primaryFontSize, 10, 22, 0), paddingY: num(mmm.paddingY, c.mainMenu.mobile.paddingY, 2, 12, 0),
        paddingX: num(mmm.paddingX, c.mainMenu.mobile.paddingX, 3, 18, 0), iconImageInset: num(mmm.iconImageInset, c.mainMenu.mobile.iconImageInset, 0, 10, 0),
        iconRadius: num(mmm.iconRadius, c.mainMenu.mobile.iconRadius, 0, 22, 0)
      },
      colors: {
        backgroundTop: hex(mmc.backgroundTop, c.mainMenu.colors.backgroundTop), backgroundBottom: hex(mmc.backgroundBottom, c.mainMenu.colors.backgroundBottom),
        primaryTop: hex(mmc.primaryTop, c.mainMenu.colors.primaryTop), text: hex(mmc.text, c.mainMenu.colors.text), border: hex(mmc.border, c.mainMenu.colors.border),
        primaryBorder: hex(mmc.primaryBorder, c.mainMenu.colors.primaryBorder), hoverTint: hex(mmc.hoverTint, c.mainMenu.colors.hoverTint)
      },
      textAlign: choice(mm.textAlign, ['left','center','right'], c.mainMenu.textAlign), shadowPreset: shadow(mm.shadowPreset, c.mainMenu.shadowPreset),
      hover: { translateX: num(mm?.hover?.translateX, c.mainMenu.hover.translateX, -12, 12, 0), translateYIcon: num(mm?.hover?.translateYIcon, c.mainMenu.hover.translateYIcon, -8, 8, 0), brightness: num(mm?.hover?.brightness, c.mainMenu.hover.brightness, 0.8, 1.3, 2) }
    },
    buttons: {
      enabled: bool(buttons.enabled, false), background: hex(buttons.background, c.buttons.background), text: hex(buttons.text, c.buttons.text), border: hex(buttons.border, c.buttons.border),
      radius: num(buttons.radius, c.buttons.radius, 0, 24, 0), borderWidth: num(buttons.borderWidth, c.buttons.borderWidth, 0, 4, 0), fontSize: num(buttons.fontSize, c.buttons.fontSize, 10, 22, 0), shadowPreset: shadow(buttons.shadowPreset, c.buttons.shadowPreset)
    },
    panels: {
      enabled: bool(panels.enabled, false), background: hex(panels.background, c.panels.background), text: hex(panels.text, c.panels.text), border: hex(panels.border, c.panels.border),
      radius: num(panels.radius, c.panels.radius, 0, 32, 0), borderWidth: num(panels.borderWidth, c.panels.borderWidth, 0, 5, 0), opacity: num(panels.opacity, c.panels.opacity, 0.55, 1, 2), shadowPreset: shadow(panels.shadowPreset, c.panels.shadowPreset)
    },
    modals: {
      enabled: bool(modals.enabled, false), background: hex(modals.background, c.modals.background), text: hex(modals.text, c.modals.text), border: hex(modals.border, c.modals.border),
      radius: num(modals.radius, c.modals.radius, 0, 32, 0), borderWidth: num(modals.borderWidth, c.modals.borderWidth, 0, 5, 0), opacity: num(modals.opacity, c.modals.opacity, 0.6, 1, 2),
      overlayOpacity: num(modals.overlayOpacity, c.modals.overlayOpacity, 0.35, 0.96, 2), shadowPreset: shadow(modals.shadowPreset, c.modals.shadowPreset)
    },
    tabs: {
      enabled: bool(tabs.enabled, false), background: hex(tabs.background, c.tabs.background), activeBackground: hex(tabs.activeBackground, c.tabs.activeBackground), text: hex(tabs.text, c.tabs.text),
      activeText: hex(tabs.activeText, c.tabs.activeText), border: hex(tabs.border, c.tabs.border), radius: num(tabs.radius, c.tabs.radius, 0, 24, 0), borderWidth: num(tabs.borderWidth, c.tabs.borderWidth, 0, 4, 0),
      fontSize: num(tabs.fontSize, c.tabs.fontSize, 9, 20, 0), height: num(tabs.height, c.tabs.height, 26, 56, 0), gap: num(tabs.gap, c.tabs.gap, 0, 18, 0)
    },
    inputs: {
      enabled: bool(inputs.enabled, false), background: hex(inputs.background, c.inputs.background), text: hex(inputs.text, c.inputs.text), border: hex(inputs.border, c.inputs.border), focus: hex(inputs.focus, c.inputs.focus),
      radius: num(inputs.radius, c.inputs.radius, 0, 20, 0), borderWidth: num(inputs.borderWidth, c.inputs.borderWidth, 0, 4, 0), fontSize: num(inputs.fontSize, c.inputs.fontSize, 10, 20, 0), height: num(inputs.height, c.inputs.height, 28, 54, 0)
    },
    badges: {
      enabled: bool(badges.enabled, false), radius: num(badges.radius, c.badges.radius, 0, 999, 0), borderWidth: num(badges.borderWidth, c.badges.borderWidth, 0, 4, 0), fontSize: num(badges.fontSize, c.badges.fontSize, 8, 18, 0),
      paddingX: num(badges.paddingX, c.badges.paddingX, 0, 18, 0), paddingY: num(badges.paddingY, c.badges.paddingY, 0, 10, 0), shadowPreset: shadow(badges.shadowPreset, c.badges.shadowPreset)
    },
    notifications: {
      enabled: bool(notifications.enabled, false), radius: num(notifications.radius, c.notifications.radius, 0, 24, 0), borderWidth: num(notifications.borderWidth, c.notifications.borderWidth, 0, 4, 0), shadowPreset: shadow(notifications.shadowPreset, c.notifications.shadowPreset)
    }
  };
}

function hexRgb(value) {
  const safe = hex(value, '#000000').slice(1);
  return `${parseInt(safe.slice(0,2),16)},${parseInt(safe.slice(2,4),16)},${parseInt(safe.slice(4,6),16)}`;
}

export function appearanceCssVariables(configLike) {
  const c = normalizeAppearanceConfig(configLike);
  const d = c.mainMenu.desktop, m = c.mainMenu.mobile;
  const vars = {
    '--arg-ui-accent': c.global.accent, '--arg-ui-text': c.global.text, '--arg-ui-muted': c.global.mutedText,
    '--arg-ui-panel-bg': c.global.panelBackground, '--arg-ui-panel-border': c.global.panelBorder, '--arg-ui-base-radius': `${c.global.baseRadius}px`, '--arg-ui-shadow': SHADOWS[c.global.shadowPreset],
    '--arg-menu-button-width': `${d.buttonWidth}px`, '--arg-menu-button-height': `${d.buttonHeight}px`, '--arg-menu-gap': `${d.gap}px`, '--arg-menu-left': `${d.left}vw`, '--arg-menu-bottom': `${d.bottom}vh`,
    '--arg-menu-logo-top': `${d.logoTop}vh`, '--arg-menu-logo-max-width': `${d.logoMaxWidth}vw`, '--arg-menu-logo-max-height': `${d.logoMaxHeight}vh`, '--arg-menu-radius': `${d.radius}px`, '--arg-menu-border-width': `${d.borderWidth}px`,
    '--arg-menu-font-size': `${d.fontSize}px`, '--arg-menu-primary-font-size': `${d.primaryFontSize}px`, '--arg-menu-font-weight': `${d.fontWeight}`, '--arg-menu-letter-spacing': `${d.letterSpacing}px`, '--arg-menu-padding-y': `${d.paddingY}px`, '--arg-menu-padding-x': `${d.paddingX}px`,
    '--arg-menu-icon-inset': `${d.iconImageInset}px`, '--arg-menu-icon-radius': `${d.iconRadius}px`, '--arg-menu-bg-top': c.mainMenu.colors.backgroundTop, '--arg-menu-bg-bottom': c.mainMenu.colors.backgroundBottom,
    '--arg-menu-primary-top': c.mainMenu.colors.primaryTop, '--arg-menu-text': c.mainMenu.colors.text, '--arg-menu-border': c.mainMenu.colors.border, '--arg-menu-primary-border': c.mainMenu.colors.primaryBorder,
    '--arg-menu-hover-rgb': hexRgb(c.mainMenu.colors.hoverTint), '--arg-menu-text-align': c.mainMenu.textAlign, '--arg-menu-shadow': SHADOWS[c.mainMenu.shadowPreset], '--arg-menu-hover-x': `${c.mainMenu.hover.translateX}px`, '--arg-menu-icon-hover-y': `${c.mainMenu.hover.translateYIcon}px`, '--arg-menu-hover-brightness': `${c.mainMenu.hover.brightness}`,
    '--arg-menu-mobile-button-width': `${m.buttonWidth}px`, '--arg-menu-mobile-button-height': `${m.buttonHeight}px`, '--arg-menu-mobile-gap': `${m.gap}px`, '--arg-menu-mobile-left': `${m.left}dvw`, '--arg-menu-mobile-bottom': `${m.bottom}dvh`,
    '--arg-menu-mobile-logo-top': `${m.logoTop}dvh`, '--arg-menu-mobile-logo-max-width': `${m.logoMaxWidth}dvw`, '--arg-menu-mobile-logo-max-height': `${m.logoMaxHeight}dvh`, '--arg-menu-mobile-radius': `${m.radius}px`, '--arg-menu-mobile-border-width': `${m.borderWidth}px`, '--arg-menu-mobile-font-size': `${m.fontSize}px`, '--arg-menu-mobile-primary-font-size': `${m.primaryFontSize}px`, '--arg-menu-mobile-padding-y': `${m.paddingY}px`, '--arg-menu-mobile-padding-x': `${m.paddingX}px`, '--arg-menu-mobile-icon-inset': `${m.iconImageInset}px`, '--arg-menu-mobile-icon-radius': `${m.iconRadius}px`,
    '--arg-button-bg': c.buttons.background, '--arg-button-text': c.buttons.text, '--arg-button-border': c.buttons.border, '--arg-button-radius': `${c.buttons.radius}px`, '--arg-button-border-width': `${c.buttons.borderWidth}px`, '--arg-button-font-size': `${c.buttons.fontSize}px`, '--arg-button-shadow': SHADOWS[c.buttons.shadowPreset],
    '--arg-panel-bg-rgb': hexRgb(c.panels.background), '--arg-panel-opacity': `${c.panels.opacity}`, '--arg-panel-text': c.panels.text, '--arg-panel-border': c.panels.border, '--arg-panel-radius': `${c.panels.radius}px`, '--arg-panel-border-width': `${c.panels.borderWidth}px`, '--arg-panel-shadow': SHADOWS[c.panels.shadowPreset],
    '--arg-modal-bg-rgb': hexRgb(c.modals.background), '--arg-modal-opacity': `${c.modals.opacity}`, '--arg-modal-overlay-opacity': `${c.modals.overlayOpacity}`, '--arg-modal-text': c.modals.text, '--arg-modal-border': c.modals.border, '--arg-modal-radius': `${c.modals.radius}px`, '--arg-modal-border-width': `${c.modals.borderWidth}px`, '--arg-modal-shadow': SHADOWS[c.modals.shadowPreset],
    '--arg-tab-bg': c.tabs.background, '--arg-tab-active-bg': c.tabs.activeBackground, '--arg-tab-text': c.tabs.text, '--arg-tab-active-text': c.tabs.activeText, '--arg-tab-border': c.tabs.border, '--arg-tab-radius': `${c.tabs.radius}px`, '--arg-tab-border-width': `${c.tabs.borderWidth}px`, '--arg-tab-font-size': `${c.tabs.fontSize}px`, '--arg-tab-height': `${c.tabs.height}px`, '--arg-tab-gap': `${c.tabs.gap}px`,
    '--arg-input-bg': c.inputs.background, '--arg-input-text': c.inputs.text, '--arg-input-border': c.inputs.border, '--arg-input-focus': c.inputs.focus, '--arg-input-radius': `${c.inputs.radius}px`, '--arg-input-border-width': `${c.inputs.borderWidth}px`, '--arg-input-font-size': `${c.inputs.fontSize}px`, '--arg-input-height': `${c.inputs.height}px`,
    '--arg-badge-radius': `${c.badges.radius}px`, '--arg-badge-border-width': `${c.badges.borderWidth}px`, '--arg-badge-font-size': `${c.badges.fontSize}px`, '--arg-badge-padding-x': `${c.badges.paddingX}px`, '--arg-badge-padding-y': `${c.badges.paddingY}px`, '--arg-badge-shadow': SHADOWS[c.badges.shadowPreset],
    '--arg-notification-radius': `${c.notifications.radius}px`, '--arg-notification-border-width': `${c.notifications.borderWidth}px`, '--arg-notification-shadow': SHADOWS[c.notifications.shadowPreset]
  };
  return { config: c, vars };
}

const STYLE_ID = 'arg-appearance-v1-style';
function ensureAppearanceStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
html[data-arg-appearance-global="1"] { --gold: var(--arg-ui-accent, #d4af37); }
html[data-arg-appearance-main-menu="1"] #main-menu-overlay .main-menu-buttons { left:var(--arg-menu-left)!important; bottom:var(--arg-menu-bottom)!important; gap:var(--arg-menu-gap)!important; --main-menu-button-width:var(--arg-menu-button-width)!important; --main-menu-button-height:var(--arg-menu-button-height)!important; }
html[data-arg-appearance-main-menu="1"] #main-menu-overlay .main-menu-logo-wrap { top:var(--arg-menu-logo-top)!important; }
html[data-arg-appearance-main-menu="1"] #main-menu-overlay .main-menu-logo { max-width:var(--arg-menu-logo-max-width)!important; max-height:var(--arg-menu-logo-max-height)!important; }
html[data-arg-appearance-main-menu="1"] #main-menu-overlay .main-menu-btn { background:linear-gradient(180deg,var(--arg-menu-bg-top),var(--arg-menu-bg-bottom))!important; border-width:var(--arg-menu-border-width)!important; border-color:var(--arg-menu-border)!important; border-radius:var(--arg-menu-radius)!important; color:var(--arg-menu-text)!important; font-size:var(--arg-menu-font-size)!important; font-weight:var(--arg-menu-font-weight)!important; letter-spacing:var(--arg-menu-letter-spacing)!important; padding:var(--arg-menu-padding-y) var(--arg-menu-padding-x)!important; text-align:var(--arg-menu-text-align)!important; box-shadow:var(--arg-menu-shadow)!important; }
html[data-arg-appearance-main-menu="1"] #main-menu-overlay .main-menu-btn-primary { background:linear-gradient(180deg,var(--arg-menu-primary-top),var(--arg-menu-bg-bottom))!important; border-color:var(--arg-menu-primary-border)!important; font-size:var(--arg-menu-primary-font-size)!important; }
html[data-arg-appearance-main-menu="1"] #main-menu-overlay .main-menu-btn:not(.main-menu-btn-disabled):hover { transform:translateX(var(--arg-menu-hover-x))!important; filter:brightness(var(--arg-menu-hover-brightness)); background:linear-gradient(180deg,rgba(var(--arg-menu-hover-rgb),.18),var(--arg-menu-bg-bottom))!important; }
html[data-arg-appearance-main-menu="1"] #main-menu-overlay .main-menu-icon-btn { border-width:var(--arg-menu-border-width)!important; border-color:var(--arg-menu-border)!important; border-radius:var(--arg-menu-icon-radius)!important; color:var(--arg-menu-text)!important; background:linear-gradient(180deg,var(--arg-menu-bg-top),var(--arg-menu-bg-bottom))!important; box-shadow:var(--arg-menu-shadow)!important; }
html[data-arg-appearance-main-menu="1"] #main-menu-overlay .main-menu-icon-btn:hover { transform:translateY(var(--arg-menu-icon-hover-y))!important; filter:brightness(var(--arg-menu-hover-brightness)); }
html[data-arg-appearance-main-menu="1"] #main-menu-overlay .main-menu-icon-image { inset:var(--arg-menu-icon-inset)!important; width:calc(100% - (var(--arg-menu-icon-inset) * 2))!important; height:calc(100% - (var(--arg-menu-icon-inset) * 2))!important; }
html.argentinia-mobile[data-arg-appearance-main-menu="1"] #main-menu-overlay .main-menu-logo-wrap { top:var(--arg-menu-mobile-logo-top)!important; }
html.argentinia-mobile[data-arg-appearance-main-menu="1"] #main-menu-overlay .main-menu-logo { max-width:var(--arg-menu-mobile-logo-max-width)!important; max-height:var(--arg-menu-mobile-logo-max-height)!important; }
html.argentinia-mobile[data-arg-appearance-main-menu="1"] #main-menu-overlay .main-menu-buttons { left:max(var(--arg-menu-mobile-left),var(--arg-safe-left))!important; bottom:max(var(--arg-menu-mobile-bottom),var(--arg-safe-bottom))!important; gap:var(--arg-menu-mobile-gap)!important; width:max-content!important; --main-menu-button-width:min(var(--arg-menu-mobile-button-width),42dvw)!important; --main-menu-button-height:var(--arg-menu-mobile-button-height)!important; }
html.argentinia-mobile[data-arg-appearance-main-menu="1"] #main-menu-overlay .main-menu-btn { min-height:var(--arg-menu-mobile-button-height)!important; padding:var(--arg-menu-mobile-padding-y) var(--arg-menu-mobile-padding-x)!important; font-size:var(--arg-menu-mobile-font-size)!important; border-radius:var(--arg-menu-mobile-radius)!important; border-width:var(--arg-menu-mobile-border-width)!important; }
html.argentinia-mobile[data-arg-appearance-main-menu="1"] #main-menu-overlay .main-menu-btn-primary { font-size:var(--arg-menu-mobile-primary-font-size)!important; }
html.argentinia-mobile[data-arg-appearance-main-menu="1"] #main-menu-overlay .main-menu-icon-btn { width:var(--arg-menu-mobile-button-height)!important; height:var(--arg-menu-mobile-button-height)!important; flex-basis:var(--arg-menu-mobile-button-height)!important; border-radius:var(--arg-menu-mobile-icon-radius)!important; border-width:var(--arg-menu-mobile-border-width)!important; }
html.argentinia-mobile[data-arg-appearance-main-menu="1"] #main-menu-overlay .main-menu-icon-image { inset:var(--arg-menu-mobile-icon-inset)!important; width:calc(100% - (var(--arg-menu-mobile-icon-inset) * 2))!important; height:calc(100% - (var(--arg-menu-mobile-icon-inset) * 2))!important; }
html[data-arg-appearance-buttons="1"] :is(.admin-save-btn,.encyclopedia-back-btn,.store-buy-btn,.workshop-action-btn,.trade-btn,.tournament-btn,.notif-btn,.arg-mobile-enter-btn) { background:var(--arg-button-bg)!important; color:var(--arg-button-text)!important; border-color:var(--arg-button-border)!important; border-width:var(--arg-button-border-width)!important; border-radius:var(--arg-button-radius)!important; font-size:var(--arg-button-font-size)!important; box-shadow:var(--arg-button-shadow)!important; }
html[data-arg-appearance-panels="1"] :is(.admin-section,.options-menu-panel,.store-loading-panel,.trade-main-panel,.trade-panel,.tournament-panel,.workshop-panel,.daily-login-panel,.deck-select-panel,.mulligan-panel,.telemetry-panel,.classifieds-preview-panel,.prebuilt-preview-panel,.reward-reveal-panel,.mp-live-panel) { background:rgba(var(--arg-panel-bg-rgb),var(--arg-panel-opacity))!important; color:var(--arg-panel-text)!important; border-color:var(--arg-panel-border)!important; border-width:var(--arg-panel-border-width)!important; border-radius:var(--arg-panel-radius)!important; box-shadow:var(--arg-panel-shadow)!important; }
html[data-arg-appearance-modals="1"] :is(.gy-modal-content,.trade-modal-panel,.damage-modal-box,.mana-choice-modal,.trigger-order-modal,.deck-stats-panel,.achievement-claim-success-modal,.workshop-enhancement-success-modal,.workshop-evolution-success-modal,.workshop-mixer-success-modal,.trade-confirm-panel,.trade-preview-panel) { background:rgba(var(--arg-modal-bg-rgb),var(--arg-modal-opacity))!important; color:var(--arg-modal-text)!important; border-color:var(--arg-modal-border)!important; border-width:var(--arg-modal-border-width)!important; border-radius:var(--arg-modal-radius)!important; box-shadow:var(--arg-modal-shadow)!important; }
html[data-arg-appearance-tabs="1"] :is(.encyclopedia-tabs,.trade-tabs) { gap:var(--arg-tab-gap)!important; }
html[data-arg-appearance-tabs="1"] :is(.encyclopedia-tab,.trade-tab) { min-height:var(--arg-tab-height)!important; background:var(--arg-tab-bg)!important; color:var(--arg-tab-text)!important; border-color:var(--arg-tab-border)!important; border-width:var(--arg-tab-border-width)!important; border-radius:var(--arg-tab-radius)!important; font-size:var(--arg-tab-font-size)!important; }
html[data-arg-appearance-tabs="1"] :is(.encyclopedia-tab,.trade-tab).active { background:var(--arg-tab-active-bg)!important; color:var(--arg-tab-active-text)!important; }
html[data-arg-appearance-inputs="1"] :is(.admin-field-input,.options-menu-panel input,.options-menu-panel select,.trade-main-panel input,.trade-main-panel select) { min-height:var(--arg-input-height)!important; background:var(--arg-input-bg)!important; color:var(--arg-input-text)!important; border-color:var(--arg-input-border)!important; border-width:var(--arg-input-border-width)!important; border-radius:var(--arg-input-radius)!important; font-size:var(--arg-input-font-size)!important; }
html[data-arg-appearance-inputs="1"] :is(.admin-field-input,.options-menu-panel input,.options-menu-panel select,.trade-main-panel input,.trade-main-panel select):focus { border-color:var(--arg-input-focus)!important; outline-color:var(--arg-input-focus)!important; }
html[data-arg-appearance-badges="1"] :is(.badge,.counter-badge,.pile-badge,.priority-owner-badge,.stack-badge,.turn-phase-badge,.tournament-badge,.dfc-face-badge,.workshop-machine-badge,.main-menu-reward-badge) { border-radius:var(--arg-badge-radius)!important; border-width:var(--arg-badge-border-width)!important; font-size:var(--arg-badge-font-size)!important; padding:var(--arg-badge-padding-y) var(--arg-badge-padding-x)!important; box-shadow:var(--arg-badge-shadow)!important; }
html[data-arg-appearance-notifications="1"] :is(.notification,.mp-lobby-toast,.trade-notification-panel) { border-radius:var(--arg-notification-radius)!important; border-width:var(--arg-notification-border-width)!important; box-shadow:var(--arg-notification-shadow)!important; }
`;
  document.head.appendChild(style);
}

export function applyAppearanceVariablesToElement(element, configLike) {
  if (!element) return normalizeAppearanceConfig(configLike);
  const { config, vars } = appearanceCssVariables(configLike);
  for (const [key, value] of Object.entries(vars)) element.style.setProperty(key, value);
  return config;
}

let cachedPublished = classicAppearanceConfig();
let cachedRawDocument = null;
let loadPromise = null;

export function getCachedPublishedAppearance() { return clone(cachedPublished); }
export function getCachedAppearanceDocument() { return cachedRawDocument ? clone(cachedRawDocument) : null; }

export function applyAppearanceConfig(configLike, { target = document.documentElement } = {}) {
  ensureAppearanceStyle();
  const config = applyAppearanceVariablesToElement(target, configLike);
  const map = {
    global: config.global.enabled,
    mainMenu: config.mainMenu.enabled,
    buttons: config.buttons.enabled,
    panels: config.panels.enabled,
    modals: config.modals.enabled,
    tabs: config.tabs.enabled,
    inputs: config.inputs.enabled,
    badges: config.badges.enabled,
    notifications: config.notifications.enabled
  };
  target.dataset.argAppearance = 'v1';
  target.dataset.argAppearancePreset = config.preset;
  for (const [key, enabled] of Object.entries(map)) target.dataset[`argAppearance${key[0].toUpperCase()}${key.slice(1)}`] = enabled ? '1' : '0';
  return config;
}

export function applyCachedPublishedAppearance() { return applyAppearanceConfig(cachedPublished); }

export async function loadPublishedAppearance({ force = false, apply = true } = {}) {
  if (!force && loadPromise) {
    const result = await loadPromise;
    if (apply) applyCachedPublishedAppearance();
    return result;
  }
  loadPromise = (async () => {
    let raw = null;
    try { raw = await loadPublicGameConfigDocument(APPEARANCE_DOCUMENT_ID); }
    catch (error) { console.warn('[Appearance V1] No se pudo leer gameConfig/appearance; se conserva Clásico Argentinia.', error); }
    cachedRawDocument = raw && typeof raw === 'object' ? raw : null;
    cachedPublished = normalizeAppearanceConfig(raw || CLASSIC);
    return { config: clone(cachedPublished), document: cachedRawDocument ? clone(cachedRawDocument) : null };
  })();
  const result = await loadPromise;
  if (apply) applyCachedPublishedAppearance();
  return result;
}

function nextRevision(raw) { return Math.max(0, Math.floor(Number(raw?.revision) || 0)) + 1; }

export async function publishAppearanceConfig(configLike) {
  const currentDoc = await loadPublicGameConfigDocument(APPEARANCE_DOCUMENT_ID).catch(() => null);
  const current = normalizeAppearanceConfig(configLike);
  const previous = currentDoc?.current ? normalizeAppearanceConfig(currentDoc.current) : normalizeAppearanceConfig(currentDoc || CLASSIC);
  const payload = { schemaVersion: APPEARANCE_SCHEMA_VERSION, revision: nextRevision(currentDoc), current, previous };
  await saveAdminGameConfigDocument(APPEARANCE_DOCUMENT_ID, payload);
  cachedRawDocument = payload;
  cachedPublished = current;
  loadPromise = Promise.resolve({ config: clone(current), document: clone(payload) });
  return clone(payload);
}

export async function rollbackAppearanceConfig() {
  const currentDoc = await loadPublicGameConfigDocument(APPEARANCE_DOCUMENT_ID).catch(() => null);
  if (!currentDoc?.previous) throw new Error('APPEARANCE_NO_PREVIOUS_REVISION');
  const current = normalizeAppearanceConfig(currentDoc.previous);
  const previous = normalizeAppearanceConfig(currentDoc.current || CLASSIC);
  const payload = { schemaVersion: APPEARANCE_SCHEMA_VERSION, revision: nextRevision(currentDoc), current, previous };
  await saveAdminGameConfigDocument(APPEARANCE_DOCUMENT_ID, payload);
  cachedRawDocument = payload;
  cachedPublished = current;
  loadPromise = Promise.resolve({ config: clone(current), document: clone(payload) });
  return clone(payload);
}

// Apply the immutable classic defaults immediately. This is local-only and performs no I/O.
if (typeof document !== 'undefined') applyAppearanceConfig(CLASSIC);
