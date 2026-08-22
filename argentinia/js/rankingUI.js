// js/rankingUI.js — Entrega 23.13.37
import { fetchPublicPlayerStats } from './firebaseClient.js';
import { POOL_BASELINE } from './poolContract.js';
import { formatDuration, winRate } from './statistics.js';

function esc(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}
function n(value) { return Math.max(0, Math.floor(Number(value) || 0)); }

function injectStyles() {
  if (document.getElementById('global-ranking-styles')) return;
  const style = document.createElement('style');
  style.id = 'global-ranking-styles';
  style.textContent = `
    #global-ranking-overlay { position:fixed; inset:0; z-index:10020; background:radial-gradient(ellipse at center,#16211a 0%,#0b130e 100%); padding:24px 30px; box-sizing:border-box; display:flex; flex-direction:column; color:#eadfc5; }
    .ranking-header { display:flex; align-items:center; gap:18px; margin-bottom:16px; }
    .ranking-title { font-size:27px; font-weight:800; color:#f0e0b0; text-shadow:0 0 20px rgba(212,175,55,.35); }
    .ranking-subtitle { color:#a99d88; font-size:12px; margin-left:auto; text-align:right; }
    .ranking-back { background:linear-gradient(180deg,rgba(18,25,15,.92),rgba(11,19,14,.96)); border:2px solid #d4af37; border-radius:8px; color:#f0e0b0; font-weight:700; padding:8px 16px; cursor:pointer; }
    .ranking-wrap { flex:1; min-height:0; overflow:auto; border:1px solid rgba(212,175,55,.35); border-radius:12px; background:rgba(5,9,6,.58); }
    .ranking-table { width:100%; border-collapse:collapse; min-width:1160px; font-size:13px; }
    .ranking-table th { position:sticky; top:0; z-index:2; background:#1a241c; color:#f0e0b0; border-bottom:1px solid rgba(212,175,55,.45); padding:11px 10px; white-space:nowrap; }
    .ranking-table th[data-sort] { cursor:pointer; user-select:none; }
    .ranking-table th[data-sort]:hover { background:#263228; }
    .ranking-table td { padding:10px; border-bottom:1px solid rgba(212,175,55,.10); text-align:center; white-space:nowrap; }
    .ranking-table td.ranking-player { text-align:left; font-weight:750; color:#fff0b7; }
    .ranking-table tbody tr:hover { background:rgba(212,175,55,.06); }
    .ranking-rank { color:#d4af37; font-weight:800; }
    .ranking-empty { padding:34px; text-align:center; color:#a99d88; }
    .ranking-note { margin-top:10px; color:#8f887a; font-size:11px; line-height:1.45; }
    @media (max-width:700px) { #global-ranking-overlay { padding:12px; } .ranking-header { gap:9px; } .ranking-title { font-size:20px; } .ranking-subtitle { display:none; } .ranking-table { font-size:11px; } .ranking-table th,.ranking-table td { padding:8px 7px; } }
  `;
  document.head.appendChild(style);
}

const columns = [
  ['username','Jugador'],
  ['pointsEarned','Puntos ganados*'],
  ['fichasEarned','Fichas obtenidas*'],
  ['packsOpened','Sobres abiertos*'],
  ['uniqueCards','Cartas descubiertas'],
  ['gamesPlayed','Partidas'],
  ['wins','Victorias'],
  ['winRate','% victorias'],
  ['totalDurationMs','Tiempo jugado'],
  ['pointsCurrent','Puntos actuales'],
  ['fichasCurrent','Fichas actuales']
];

export function showGlobalRanking(onBack = () => {}) {
  injectStyles();
  document.querySelectorAll('#global-ranking-overlay').forEach(el => el.remove());
  const overlay = document.createElement('div');
  overlay.id = 'global-ranking-overlay';
  overlay.innerHTML = `
    <div class="ranking-header">
      <button class="ranking-back" id="ranking-back">← Volver</button>
      <div class="ranking-title">🏆 Ranking Global</div>
      <div class="ranking-subtitle">Coleccionismo · partidas · economía<br>Pool actual: ${POOL_BASELINE.total} cartas</div>
    </div>
    <div class="ranking-wrap" id="ranking-wrap"><div class="ranking-empty">Cargando ranking…</div></div>
    <div class="ranking-note">* Puntos ganados, Fichas obtenidas y sobres abiertos son acumuladores confiables desde la versión 23.13.37. Partidas y tiempo pueden incluir historial anterior reconstruido desde telemetría.</div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#ranking-back').addEventListener('click', () => { overlay.remove(); onBack(); });

  let rows = [];
  let sortKey = 'pointsEarned';
  let direction = 'desc';
  const valueFor = (row, key) => key === 'winRate' ? winRate(row) : (key === 'username' ? String(row.username || '').toLocaleLowerCase('es-AR') : n(row[key]));
  function render() {
    const sorted = [...rows].sort((a,b) => {
      const av=valueFor(a,sortKey), bv=valueFor(b,sortKey);
      let cmp = typeof av === 'string' ? av.localeCompare(bv,'es-AR') : av-bv;
      if (!cmp) cmp = n(a.uniqueCards)-n(b.uniqueCards);
      return direction === 'asc' ? cmp : -cmp;
    });
    const wrap=overlay.querySelector('#ranking-wrap');
    if (!sorted.length) { wrap.innerHTML='<div class="ranking-empty">Todavía no hay jugadores sincronizados al Ranking. Las cuentas se incorporan al volver a iniciar sesión; el Admin también puede sincronizar todas desde Estadísticas.</div>'; return; }
    const headers=columns.map(([key,label])=>`<th data-sort="${key}">${esc(label)}${sortKey===key?(direction==='asc'?' ↑':' ↓'):''}</th>`).join('');
    const body=sorted.map((r,i)=>`<tr>
      <td class="ranking-rank">${i+1}</td>
      <td class="ranking-player">${esc(r.username || 'Jugador')}</td>
      <td>${n(r.pointsEarned).toLocaleString('es-AR')}</td>
      <td>${n(r.fichasEarned).toLocaleString('es-AR')}</td>
      <td>${n(r.packsOpened).toLocaleString('es-AR')}</td>
      <td>${n(r.uniqueCards).toLocaleString('es-AR')} / ${POOL_BASELINE.total}</td>
      <td>${n(r.gamesPlayed).toLocaleString('es-AR')}</td>
      <td>${n(r.wins).toLocaleString('es-AR')}</td>
      <td>${winRate(r).toFixed(1)}%</td>
      <td>${formatDuration(r.totalDurationMs)}</td>
      <td>${n(r.pointsCurrent).toLocaleString('es-AR')}</td>
      <td>${n(r.fichasCurrent).toLocaleString('es-AR')}</td>
    </tr>`).join('');
    wrap.innerHTML=`<table class="ranking-table"><thead><tr><th>#</th>${headers}</tr></thead><tbody>${body}</tbody></table>`;
    wrap.querySelectorAll('th[data-sort]').forEach(th=>th.addEventListener('click',()=>{ const key=th.dataset.sort; if(sortKey===key) direction=direction==='asc'?'desc':'asc'; else {sortKey=key; direction=key==='username'?'asc':'desc';} render(); }));
  }
  fetchPublicPlayerStats().then(data=>{ rows=Array.isArray(data)?data:[]; render(); }).catch(err=>{ console.error('No se pudo cargar Ranking Global:',err); overlay.querySelector('#ranking-wrap').innerHTML=`<div class="ranking-empty">No se pudo cargar el ranking.<br>${esc(err?.message||err)}</div>`; });
}
