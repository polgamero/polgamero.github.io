// js/version.js — fuente única de versión/build/protocolo multiplayer.
// ENTREGA 23.8.5: módulo main canónico sin query-string + guard global contra doble boot.
export const ENGINE_VERSION = '23.8.5';
export const ENGINE_VERSION_SHORT = '23.8.5';
export const ENGINE_PROTOCOL_VERSION = 'mp-23.8.5';
export const ENGINE_BUILD_LABEL = 'Entrega 23.8.5 Single Boot Module Guard';
export const ENGINE_BASELINE = 'Entrega 23.8.5 Single Boot Module Guard + Image Audit Manifest 23.8.4 + Observability 23.8 + Multiplayer Interaction Integrity 23.7.2 + Visual Baseline 23.4';
export const BUILD_MANIFEST_URL = './build-manifest.json';

export function describeEngineVersion() {
  return `Argentinia ${ENGINE_VERSION} · protocolo ${ENGINE_PROTOCOL_VERSION}`;
}

export function isExactMultiplayerVersionCompatible(remoteVersion, remoteProtocol) {
  return remoteVersion === ENGINE_VERSION && remoteProtocol === ENGINE_PROTOCOL_VERSION;
}
