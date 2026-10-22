// Bounded, local diagnostics. No payloads, document IDs, URLs, UIDs or network writes.
const rows = new Map();
const startedAt = new Date().toISOString();
const KEY = 'argentinia.serviceUsage.v1';
let stored = [];
try { stored = JSON.parse(sessionStorage.getItem(KEY) || '[]').slice(0, 300); } catch {}
for (const row of stored) if (row && typeof row.key === 'string') rows.set(row.key, row);
let saveTimer;
export function recordServiceUsage(feature, metric, amount = 1) {
  try {
    if (!/^[a-zA-Z0-9_. /·:-]{1,100}$/.test(feature) || !/^[a-zA-Z]{1,40}$/.test(metric)) return;
    const hour = new Date().toISOString().slice(0, 13);
    const key = `${hour}|${feature}`;
    if (!rows.has(key)) {
      if (rows.size >= 300) rows.delete(rows.keys().next().value);
      rows.set(key, { key, hour, feature, metrics: {} });
    }
    const row = rows.get(key);
    row.metrics[metric] = (row.metrics[metric] || 0) + Math.max(0, Number(amount) || 0);
    if (!saveTimer) saveTimer = setTimeout(() => {
      saveTimer = null;
      try { sessionStorage.setItem(KEY, JSON.stringify([...rows.values()])); } catch {}
    }, 10000);
  } catch { /* Diagnostics never change a game operation. */ }
}
export function serviceUsageSnapshot() {
  return { source: 'browser-session', startedAt, exportedAt: new Date().toISOString(), rows: [...rows.values()].map(row => ({ ...row, metrics: { ...row.metrics } })) };
}
const ROOTS = Object.freeze({ users: 'Perfiles', matches: 'Multiplayer', lobbyCommunications: 'Chat lobby', matchCommunications: 'Chat partida', playerPresence:'Presencia lobby', telemetrySessions: 'Telemetria', gameConfig: 'Configuracion', economyEvents: 'Auditoria economica', adminActions: 'Admin', playerStats: 'Ranking' });
export function firestoreFeature(ref, query = false) {
  // Only a root collection label leaves this function; never a private identity/path.
  const root = String(ref?.path || '').split('/')[0];
  return `Firestore / ${query && root === 'users' ? 'Admin perfiles' : (ROOTS[root] || 'Otras colecciones')}`;
}
export function observeResourceUsage() {
  if (typeof PerformanceObserver !== 'function') return;
  try {
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const url = new URL(entry.name, location.href);
        const feature = /(^|\.)firebasestorage\.googleapis\.com$|(^|\.)storage\.googleapis\.com$/.test(url.hostname)
          ? 'Storage / recursos' : url.origin === location.origin
            ? `Hosting / ${entry.initiatorType === 'img' ? 'imagenes' : 'otros recursos'}`
            : url.hostname === 'www.gstatic.com' ? 'CDN / SDK Google' : 'Otros / recursos externos';
        // SDK transport bytes are opaque; avoid falsely attributing them to images.
        if (/firestore\.googleapis\.com$|cloudfunctions\.net$|\.run\.app$/.test(url.hostname)) continue;
        recordServiceUsage(feature, 'resources');
        if (entry.transferSize > 0) recordServiceUsage(feature, 'transferBytes', entry.transferSize);
        else recordServiceUsage(feature, 'opaqueOrCachedResources');
      }
    });
    observer.observe({ type: 'resource', buffered: true });
  } catch {}
}
