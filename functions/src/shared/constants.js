export const ENGINE_VERSION = '23.20.0';
export const ECONOMY_PROTOCOL_VERSION = 'econ-23.19.5.6';
export const ECONOMY_SCHEMA_VERSION = 8;
export const ECONOMY_REGION = 'southamerica-east1';
export const ECONOMY_CONFIG_PATH = 'gameConfig/economy';
export const ECONOMY_OPERATIONS_COLLECTION = 'economyOperations';
export const ADMIN_EMAIL = 'pablogamero1@gmail.com';

export const ECONOMY_MODES = Object.freeze({
  SHADOW: 'shadow',
  SERVER_PREFERRED: 'server_preferred',
  SERVER_REQUIRED: 'server_required'
});

export const DEFAULT_ECONOMY_CONFIG = Object.freeze({
  enabled: true,
  mode: ECONOMY_MODES.SERVER_REQUIRED,
  minimumEconomyClientVersion: ECONOMY_PROTOCOL_VERSION
});

// Cost-safety contract remains deliberately conservative after the write-firewall cutover.
// Security hardening must not trade into surprise infrastructure spend.
export const FUNCTION_RUNTIME_OPTIONS = Object.freeze({
  region: ECONOMY_REGION,
  minInstances: 0,
  maxInstances: 1,
  concurrency: 10,
  timeoutSeconds: 30,
  memory: '256MiB',
  enforceAppCheck: false
});
