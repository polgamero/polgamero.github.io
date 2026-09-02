export const ENGINE_VERSION = '23.19.5.2';
export const ECONOMY_PROTOCOL_VERSION = 'econ-23.19.5.2';
export const ECONOMY_SCHEMA_VERSION = 3;
export const ECONOMY_REGION = 'southamerica-east1';
export const ECONOMY_CONFIG_PATH = 'gameConfig/economy';
export const ECONOMY_OPERATIONS_COLLECTION = 'economyOperations';

export const ECONOMY_MODES = Object.freeze({
  SHADOW: 'shadow',
  SERVER_PREFERRED: 'server_preferred',
  SERVER_REQUIRED: 'server_required'
});

export const DEFAULT_ECONOMY_CONFIG = Object.freeze({
  enabled: true,
  mode: ECONOMY_MODES.SHADOW,
  minimumEconomyClientVersion: ECONOMY_PROTOCOL_VERSION
});

// Cost-safety contract: low concurrency + one max instance. This is deliberately
// conservative while Argentinia is in Economy Authority migration.
export const FUNCTION_RUNTIME_OPTIONS = Object.freeze({
  region: ECONOMY_REGION,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 10,
  timeoutSeconds: 30,
  memory: '256MiB',
  enforceAppCheck: false
});
