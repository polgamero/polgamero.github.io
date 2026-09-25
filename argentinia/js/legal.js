// js/legal.js — HF23.3.16.2.12
// Contrato versionado de documentos legales para onboarding. El backend vuelve a
// validar estas versiones: este módulo sólo mantiene al cliente y la UI sincronizados.

export const LEGAL_TERMS_VERSION = '2026-09-10';
export const LEGAL_PRIVACY_VERSION = '2026-09-10';
export const LEGAL_TERMS_URL = '/terminos/';
export const LEGAL_PRIVACY_URL = '/privacidad/';

export function buildCurrentLegalAcceptance() {
  return {
    accepted: true,
    termsVersion: LEGAL_TERMS_VERSION,
    privacyVersion: LEGAL_PRIVACY_VERSION
  };
}

export function isCurrentLegalAcceptance(value) {
  return !!(
    value && typeof value === 'object' && !Array.isArray(value)
    && value.accepted === true
    && String(value.termsVersion || '') === LEGAL_TERMS_VERSION
    && String(value.privacyVersion || '') === LEGAL_PRIVACY_VERSION
  );
}
