import { DEFAULT_ECONOMY_CONFIG, ECONOMY_CONFIG_PATH, ECONOMY_MODES, ECONOMY_PROTOCOL_VERSION } from '../shared/constants.js';
import { economyError } from '../shared/errors.js';

export function normalizeEconomyConfig(raw = {}) {
  const mode = Object.values(ECONOMY_MODES).includes(raw?.mode) ? raw.mode : DEFAULT_ECONOMY_CONFIG.mode;
  return {
    enabled: raw?.enabled !== false,
    mode,
    minimumEconomyClientVersion: typeof raw?.minimumEconomyClientVersion === 'string' && raw.minimumEconomyClientVersion.trim()
      ? raw.minimumEconomyClientVersion.trim()
      : DEFAULT_ECONOMY_CONFIG.minimumEconomyClientVersion
  };
}

function protocolNumber(value) {
  const match = String(value || '').match(/^econ-(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  return match.slice(1).map(n => Number(n || 0));
}

export function compareEconomyProtocol(a, b) {
  const aa = protocolNumber(a), bb = protocolNumber(b);
  if (!aa || !bb) return String(a || '').localeCompare(String(b || ''));
  for (let i=0;i<4;i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
  return 0;
}

export async function loadEconomyConfig(db, tx = null) {
  const ref = db.doc(ECONOMY_CONFIG_PATH);
  const snap = tx ? await tx.get(ref) : await ref.get();
  return normalizeEconomyConfig(snap.exists ? snap.data() : null);
}

export function assertEconomyAvailable(config, clientProtocol = ECONOMY_PROTOCOL_VERSION) {
  if (config.enabled === false) throw economyError('ECONOMY_DISABLED');
  if (compareEconomyProtocol(clientProtocol, config.minimumEconomyClientVersion) < 0) {
    throw economyError('ECONOMY_CLIENT_TOO_OLD', { minimum: config.minimumEconomyClientVersion, received: clientProtocol });
  }
}
