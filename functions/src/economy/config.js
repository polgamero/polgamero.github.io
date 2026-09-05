import { DEFAULT_ECONOMY_CONFIG, ECONOMY_CONFIG_PATH, ECONOMY_MODES, ECONOMY_PROTOCOL_VERSION } from '../shared/constants.js';
import { economyError } from '../shared/errors.js';

export function normalizeEconomyConfig(raw = {}) {
  // 23.19.5.6 cutover is intentionally one-way from the browser perspective. Historical
  // gameConfig/economy documents may still say shadow/server_preferred, but Rules 23.13.80
  // already deny direct economic writes. Coerce authority + minimum protocol here so a stale
  // config document cannot silently resurrect a client mutation path.
  void raw?.mode;
  void raw?.minimumEconomyClientVersion;
  return {
    enabled: raw?.enabled !== false,
    mode: ECONOMY_MODES.SERVER_REQUIRED,
    minimumEconomyClientVersion: ECONOMY_PROTOCOL_VERSION
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
