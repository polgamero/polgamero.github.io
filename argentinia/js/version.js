// js/version.js — fuente única de versión/build/protocolo multiplayer.
// ENTREGA 23.11.13: Activated Ability CR602 Target-First + Admin Test Pool + Silent Mobile Boot + Deploy Cleanup + Land Fill.
export const ENGINE_VERSION = '23.11.13';
export const ENGINE_VERSION_SHORT = '23.11.13';
export const ENGINE_PROTOCOL_VERSION = 'mp-23.10.0';
export const ENGINE_BUILD_LABEL = 'Entrega 23.11.13 CR602 Target-First + Admin Test Pool + Silent Mobile Boot + Deploy Cleanup + Land Fill + Pool 511';
export const ENGINE_BASELINE = 'Entrega 23.11.13 CR602 Target-First + Admin Test Pool + Silent Mobile Boot + Deploy Cleanup + Land Fill + Entrega 23.11.12 Mobile Blocker Tap + Card Geometry + News Anchor Polish + Entrega 23.11.11 UI Cleanup + Collapsible News + Entrega 23.11.10 Desktop Rival Hover + Mobile Board UI Polish + Entrega 23.11.9 Persistent Mobile Stack + Firebase Auth 12.16.0 Rollback + Entrega 23.11.8 Mobile Observer Stability + CSS Orientation Gate + Direct Auth Popup + Entrega 23.11.7 Portrait Gate + Solo Start Relief + Mobile Auth Prewarm + Entrega 23.11.6 Desktop Isolation + Staged Mobile Boot + Lazy Firebase + Entrega 23.11.5 Mobile Module Singleton + First-Paint Boot Recovery + Entrega 23.11.4 Priority Window Identity + Trigger Provenance + Mobile Boot Diagnostics + Entrega 23.11.3 Bot Legal Proposals + Mobile Boot Resilience + Entrega 23.11.2 Mobile Complex Overlays Phase 3 + Entrega 23.11.1 Mobile Touch Phase 2 + Entrega 23.11.0 Mobile Shell Phase 1 + Entrega 23.10.1 Private Effects + Anti-Peek + Pool 511 + Entrega 23.10 CR601 Casting + Universal Private Zones + QA Lab + Combat Declaration + Attack Restriction 23.9.3 + Loyalty to Stack 23.9.2 + HUD Compact 23.9.1 + Multiplayer Turn & Priority UX 23.9 + Single Boot Module Guard 23.8.5 + Image Audit Manifest 23.8.4 + Observability 23.8 + Multiplayer Interaction Integrity 23.7.2 + Visual Baseline 23.4';
export const BUILD_MANIFEST_URL = './build-manifest.json';

export function describeEngineVersion() {
  return `Argentinia ${ENGINE_VERSION} · protocolo ${ENGINE_PROTOCOL_VERSION}`;
}

export function isExactMultiplayerVersionCompatible(remoteVersion, remoteProtocol) {
  return remoteVersion === ENGINE_VERSION && remoteProtocol === ENGINE_PROTOCOL_VERSION;
}
