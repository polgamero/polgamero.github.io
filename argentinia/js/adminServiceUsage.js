import { serviceUsageSnapshot } from './serviceUsage.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const number = value => Math.max(0, Number(value) || 0).toLocaleString('es-AR');
const colors = ['#e5ba57','#649ed5','#78b97b','#ce7971','#a18dc7','#66bcbc','#d29456','#aaa'];
export function usagePie(title, items) {
  const positive = items.filter(row => row.value > 0).sort((a,b) => b.value-a.value);
  const top = positive.slice(0,7);
  if (positive.length > 7) top.push({ label:'Otros', value:positive.slice(7).reduce((sum,row) => sum+row.value,0) });
  const total = top.reduce((sum,row) => sum+row.value,0);
  let at = 0;
  const segments = top.map((row,index) => { const from=at; at+=row.value/total*100; return `${colors[index]} ${from}% ${at}%`; });
  return `<section class="admin-chart-card"><h3>${escape(title)}</h3>${total ? `<div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap"><div role="img" aria-label="${escape(title)}; detalle en la tabla contigua" style="width:160px;height:160px;flex-shrink:0;border-radius:50%;background:conic-gradient(${segments.join(',')})"></div><table><thead><tr><th>Categoría</th><th>Cantidad</th><th>%</th></tr></thead><tbody>${top.map((row,i) => `<tr><td><span aria-hidden="true" style="color:${colors[i]}">●</span> ${escape(row.label)}</td><td>${number(row.value)}</td><td>${(row.value/total*100).toFixed(1)}%</td></tr>`).join('')}</tbody></table></div>` : '<p>Sin datos observados para esta métrica.</p>'}</section>`;
}
export function countryStatistics(profiles) {
  const countries = new Map();
  const seen = new Set();
  const names = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['es'], {type:'region'}) : null;
  for (const profile of profiles || []) {
    if (profile.isSystemBot) continue;
    if (profile.uid && seen.has(profile.uid)) continue;
    if (profile.uid) seen.add(profile.uid);
    const observation = profile.countryObservation;
    const code = observation?.source === 'geoip-country-v1' && /^[A-Z]{2}$/.test(observation.code || '') ? observation.code : '';
    const label = code ? (names?.of(code) || code) : 'Sin país observado';
    countries.set(label, (countries.get(label) || 0) + 1);
  }
  return usagePie('País de conexión aproximado · jugadores', [...countries].map(([label,value])=>({label,value})))
    + '<p class="admin-debug-summary">Primera conexión observada en registro o ingreso diario. No indica nacionalidad ni país de nacimiento. VPN/proxy pueden alterar el resultado. Las cuentas anteriores aparecen sin país hasta su próximo ingreso; no se infiere del idioma. Datos GeoLite2 de <a href="https://www.maxmind.com" target="_blank" rel="noopener">MaxMind</a>.</p>';
}
function bars(title, rows) {
  const max = Math.max(1,...rows.map(row=>row.value));
  return `<section class="admin-chart-card"><h3>${escape(title)}</h3>${rows.slice(0,20).map(row=>`<div class="admin-chart-row"><span class="admin-chart-label">${escape(row.label)}</span><div class="admin-chart-track"><div class="admin-chart-fill" style="width:${row.value/max*100}%"></div></div><span>${number(row.value)}</span></div>`).join('') || '<p>Sin datos.</p>'}</section>`;
}
export function mountServiceUsage(root, { loadGlobal, download }) {
  let global = null, busy = false;
  const metrics = { calls:'Invocaciones Functions', readRequests:'Solicitudes de lectura', transactionReads:'Lecturas en transacciones (cliente)', serverDocuments:'Documentos recibidos del servidor (consultas cliente)', documentsReturned:'Documentos devueltos (backend)', writeAttempts:'Intentos de escritura', deleteAttempts:'Intentos de borrado', errors:'Errores técnicos', blockedLocally:'Envíos evitados en el navegador (sin llamada)', rateLimited:'Bloqueos antispam del servidor', duplicateBlocked:'Mensajes repetidos bloqueados', transactionAttempts:'Intentos de transacción', aggregateQueries:'Consultas agregadas (backend)', batchCommits:'Commits de lotes (backend)', durationMs:'Duración acumulada de handlers (ms)', snapshotEvents:'Eventos de listeners', snapshotDocuments:'Documentos emitidos por listeners (incluye metadata)', listenerStarts:'Listeners iniciados', transferBytes:'Bytes transferidos observables', resources:'Recursos cargados' };
  root.innerHTML = `<h2 class="admin-section-title">AUDITORÍA FIREBASE / FIRESTORE</h2>
    <p class="admin-debug-summary">Consumo observado por capa. Los intentos y documentos devueltos no equivalen a operaciones facturadas. Incluye Admin. No se envía telemetría del navegador a Firestore.</p>
    <div class="admin-debug-toolbar"><label>Fuente <select id="admin-usage-source" class="admin-field-input"><option value="server">Servidor · ventana reciente de hasta 24 h</option><option value="browser">Este navegador · sesión de esta pestaña</option></select></label><label>Métrica <select id="admin-usage-metric" class="admin-field-input">${Object.entries(metrics).map(([key,label])=>`<option value="${key}">${escape(label)}</option>`).join('')}</select></label><button type="button" class="admin-save-btn" id="admin-usage-refresh">Actualizar</button><button type="button" class="admin-save-btn" id="admin-usage-export">Exportar JSON</button></div>
    <div id="admin-usage-status" role="status"></div><div id="admin-usage-global" class="admin-stats-grid"></div><div id="admin-usage-charts" class="admin-chart-grid"></div><div id="admin-usage-table" class="admin-debug-table-wrap"></div>
    <p class="admin-debug-summary">Cobertura: backend instrumentado y SDK de esta pestaña. Los listeners de otros jugadores, Auth/App Check, reintentos internos, índices, Rules, Storage y Hosting deben reconciliarse con métricas del proveedor. Los bytes Resource Timing pueden ser opacos o servidos desde caché. Las imágenes públicas del repositorio pertenecen a Hosting; el arte privado descargado desde Storage tiene otra fuente de gasto.</p>
    <p><a href="https://console.firebase.google.com/project/argentinia-tcg/firestore/usage" target="_blank" rel="noopener">Uso Firestore</a> · <a href="https://console.cloud.google.com/billing" target="_blank" rel="noopener">Facturación Google Cloud</a> · <a href="https://console.cloud.google.com/monitoring" target="_blank" rel="noopener">Cloud Monitoring</a></p>`;
  const source = root.querySelector('#admin-usage-source'), metric = root.querySelector('#admin-usage-metric');
  const render = () => {
    const local = source.value === 'browser';
    const data = local ? serviceUsageSnapshot() : global;
    const rows = (data?.rows || []).map(row=>({ ...row, value:Number(row.metrics?.[metric.value])||0 })).sort((a,b)=>b.value-a.value);
    const status = local ? 'Datos locales; no representan a todos los jugadores. Se conservan sólo en esta pestaña y no incluyen otras sesiones.'
      : busy ? 'Consultando servidor…' : !data ? 'Actualizá para consultar la ventana global.' : !data.available ? `Fuente global no disponible (${data.reason || 'backend pendiente'}). No se interpreta como consumo cero.`
      : `${data.from} — ${data.to}. ${data.events} eventos disponibles; puede haber demora de ingestión.${data.capped ? ' VENTANA TRUNCADA: sólo los eventos más recientes, no el total de 24 h.' : ''}`;
    root.querySelector('#admin-usage-status').textContent = status;
    root.querySelector('#admin-usage-global').innerHTML = !local ? (data?.global || []).map(row=>`<div class="admin-stat-card"><div>${escape(row.label)}</div><strong>${row.available ? `${row.capped?'≥ ':''}${number(row.value)}` : 'No disponible'}</strong><div class="admin-stat-sub">Cloud Monitoring · proyecto completo · 24 h</div></div>`).join('') : '';
    const grouped = new Map();
    for (const row of rows) { const label=`${row.actor === 'admin' ? 'Admin · ' : ''}${row.feature}`; grouped.set(label,(grouped.get(label)||0)+row.value); }
    const items = [...grouped].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
    root.querySelector('#admin-usage-charts').innerHTML = bars(metrics[metric.value],items) + usagePie(`Distribución · ${metrics[metric.value]}`,items);
    root.querySelector('#admin-usage-table').innerHTML = `<table class="admin-debug-table"><thead><tr><th>Capa / operación</th><th>Actor</th><th>${escape(metrics[metric.value])}</th><th>Errores</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${escape(row.feature)}</td><td>${escape(row.actor || 'sesión local')}</td><td>${number(row.value)}</td><td>${number(row.metrics.errors)}</td></tr>`).join('') || '<tr><td colspan="4">Sin datos observados. Esto no prueba ausencia de consumo.</td></tr>'}</tbody></table>`;
    root.querySelector('#admin-usage-refresh').disabled = busy;
  };
  const refresh = async () => {
    if (source.value === 'browser' || busy) { render(); return; }
    busy=true; render();
    try { global=await loadGlobal(); } catch { global={ available:false,reason:'BACKEND_O_PERMISOS_PENDIENTES',rows:[] }; }
    finally { busy=false; if(root.isConnected) render(); }
  };
  source.addEventListener('change', () => { metric.value=source.value==='browser'?'readRequests':'calls'; render(); });
  metric.addEventListener('change',render);
  root.querySelector('#admin-usage-refresh').addEventListener('click',refresh);
  root.querySelector('#admin-usage-export').addEventListener('click',()=>download(source.value==='browser'?serviceUsageSnapshot():global || {available:false},'ARG_AUDIT.json'));
  render();
  return { refresh };
}
