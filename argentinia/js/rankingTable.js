// Shared game ranking presentation. No Firebase, account boot or game engine.
import {POOL_BASELINE} from './poolContract.js';
import {formatDuration,winRate} from './statistics.js';
import {gameText} from './gameTexts.js';
function esc(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}
function n(value) { return Math.max(0, Math.floor(Number(value) || 0)); }
function elo(value) { const n0=Math.floor(Number(value)); return Number.isFinite(n0)&&n0>0?n0:1200; }
function eloLabel(row){ const rating=elo(row?.eloRating),games=n(row?.eloGames); return gameText(games<10?'ranking.elo.provisional':'ranking.elo.established',{rating}); }

export function injectRankingStyles() {
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
    .ranking-table { width:100%; border-collapse:collapse; min-width:1240px; font-size:13px; }
    .ranking-table th { position:sticky; top:0; z-index:2; background:#1a241c; color:#f0e0b0; border-bottom:1px solid rgba(212,175,55,.45); padding:11px 10px; white-space:nowrap; }
    .ranking-table th[data-sort] { cursor:pointer; user-select:none; }
    .ranking-table th[data-sort]:hover { background:#263228; }
    .ranking-table td { padding:10px; border-bottom:1px solid rgba(212,175,55,.10); text-align:center; white-space:nowrap; }
    .ranking-table td.ranking-player { text-align:left; font-weight:750; color:#fff0b7; }
    .ranking-profile-btn{border:0;background:none;padding:0;color:#fff0b7;font:inherit;font-weight:800;cursor:pointer;text-decoration:underline;text-decoration-color:rgba(212,175,55,.4);text-underline-offset:3px}.ranking-profile-btn:hover{color:#fff7d6;text-decoration-color:#d4af37}
    .ranking-table tbody tr:hover { background:rgba(212,175,55,.06); }
    .ranking-rank { color:#d4af37; font-weight:800; }
    .ranking-empty { padding:34px; text-align:center; color:#a99d88; }
    .ranking-note { margin-top:10px; color:#8f887a; font-size:11px; line-height:1.45; }
    @media (max-width:700px) { #global-ranking-overlay { padding:12px; } .ranking-header { gap:9px; } .ranking-title { font-size:20px; } .ranking-subtitle { display:none; } .ranking-table { font-size:11px; } .ranking-table th,.ranking-table td { padding:8px 7px; } }
  `;
  document.head.appendChild(style);
}

export const RANKING_COLUMNS = [
  ['username','ranking.col.player'],
  ['eloRating','ranking.col.elo'],
  ['tournamentChampionships','ranking.col.tournamentChampionships'],
  ['tournamentsPlayed','ranking.col.tournamentsPlayed'],
  ['tradesCompleted','ranking.col.tradesCompleted'],
  ['gamesPlayed','ranking.col.games'],
  ['wins','ranking.col.wins'],
  ['winRate','ranking.col.winRate'],
  ['pointsEarned','ranking.col.pointsEarned'],
  ['uniqueCards','ranking.col.uniqueCards'],
  ['uniqueFlasheras','ranking.col.uniqueFlasheras'],
  ['flasherasOwned','ranking.col.flasherasOwned'],
  ['totalDurationMs','ranking.col.timePlayed'],
  ['pointsCurrent','ranking.col.pointsCurrent'],
  ['fichasCurrent','ranking.col.fichasCurrent']
];


export function mountRankingTable(wrap,{loadRows,onProfile=null,onStatus=()=>{}}={}) {
  injectRankingStyles();let rows=[],sortKey='eloRating',direction='desc',active=true,busy=false;
  wrap.classList.add('ranking-wrap');wrap.tabIndex=0;wrap.setAttribute('aria-label','Ranking de jugadores');
  const valueFor = (row, key) => key === 'winRate' ? winRate(row) : (key === 'username' ? String(row.username || '').toLocaleLowerCase('es-AR') : (key==='eloRating'?elo(row[key]):n(row[key])));
  function render() {
    const sorted = [...rows].sort((a,b) => {
      const av=valueFor(a,sortKey), bv=valueFor(b,sortKey);
      let cmp = typeof av === 'string' ? av.localeCompare(bv,'es-AR') : av-bv;
      if (!cmp) cmp = n(a.uniqueCards)-n(b.uniqueCards);
      return direction === 'asc' ? cmp : -cmp;
    });
    const previousScroll=wrap.scrollLeft;
    if (!sorted.length) { wrap.innerHTML=`<div class="ranking-empty">${esc(gameText('ranking.empty'))}</div>`; return; }
    const headers=RANKING_COLUMNS.map(([key,textKey])=>`<th scope="col" tabindex="0" aria-sort="${sortKey===key?(direction==='asc'?'ascending':'descending'):'none'}" data-sort="${key}">${esc(gameText(textKey))}${sortKey===key?(direction==='asc'?' ↑':' ↓'):''}</th>`).join('');
    const body=sorted.map((r,i)=>`<tr>
      <td class="ranking-rank">${i+1}</td>
      <td class="ranking-player" title="${esc(eloLabel(r))}">${onProfile?`<button type="button" class="ranking-profile-btn" data-public-profile-uid="${esc(String(r.id||r.uid||''))}" title="${esc(gameText('publicProfile.view'))}">${esc(r.username || gameText('ranking.playerFallback'))}</button>`:esc(r.username || gameText('ranking.playerFallback'))}</td>
      <td><strong>${elo(r.eloRating).toLocaleString('es-AR')}</strong>${n(r.eloGames)<10?'*':''}</td>
      <td>${n(r.tournamentChampionships).toLocaleString('es-AR')}</td>
      <td>${n(r.tournamentsPlayed).toLocaleString('es-AR')}</td>
      <td>${n(r.tradesCompleted).toLocaleString('es-AR')}</td>
      <td>${n(r.gamesPlayed).toLocaleString('es-AR')}</td>
      <td>${n(r.wins).toLocaleString('es-AR')}</td>
      <td>${winRate(r).toFixed(1)}%</td>
      <td>${n(r.pointsEarned).toLocaleString('es-AR')}</td>
      <td>${n(r.uniqueCards).toLocaleString('es-AR')} / ${POOL_BASELINE.total}</td>
      <td>${n(r.uniqueFlasheras).toLocaleString('es-AR')}</td>
      <td>${n(r.flasherasOwned).toLocaleString('es-AR')}</td>
      <td>${formatDuration(r.totalDurationMs)}</td>
      <td>${n(r.pointsCurrent).toLocaleString('es-AR')}</td>
      <td>${n(r.fichasCurrent).toLocaleString('es-AR')}</td>
    </tr>`).join('');
    wrap.innerHTML=`<table class="ranking-table"><thead><tr><th>#</th>${headers}</tr></thead><tbody>${body}</tbody></table>`;
    wrap.scrollLeft=previousScroll;
    wrap.querySelectorAll('th[data-sort]').forEach(th=>th.addEventListener('click',()=>{ const key=th.dataset.sort; if(sortKey===key) direction=direction==='asc'?'desc':'asc'; else {sortKey=key; direction=key==='username'?'asc':'desc';} render(); }));
    wrap.querySelectorAll('th[data-sort]').forEach(th=>th.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();th.click();wrap.querySelector('th[data-sort="'+th.dataset.sort+'"]')?.focus();}}));
    wrap.querySelectorAll('[data-public-profile-uid]').forEach(btn=>btn.addEventListener('click',event=>{event.stopPropagation();const uid=btn.dataset.publicProfileUid||'';if(uid)onProfile?.(uid);}));
  }

  let drag=null,dragged=false;
  const down=e=>{if(e.button!==0||e.pointerType==='touch'||e.target.closest('button,a,input'))return;drag={x:e.clientX,left:wrap.scrollLeft};dragged=false;};
  const move=e=>{if(!drag)return;const delta=e.clientX-drag.x;if(Math.abs(delta)>6){dragged=true;wrap.setPointerCapture?.(e.pointerId);wrap.scrollLeft=drag.left-delta;e.preventDefault();}};
  const up=()=>{drag=null;};
  const click=e=>{if(dragged){e.preventDefault();e.stopPropagation();dragged=false;}};
  wrap.addEventListener('pointerdown',down);wrap.addEventListener('pointermove',move);wrap.addEventListener('pointerup',up);wrap.addEventListener('pointercancel',up);wrap.addEventListener('click',click,true);
  async function reload(){if(!active||busy)return;busy=true;wrap.setAttribute('aria-busy','true');onStatus('loading',0);
    try{const data=await loadRows();if(!active)return;rows=(Array.isArray(data)?data:[]).filter(row=>row?.excludeFromGlobalRanking!==true);render();onStatus('ready',rows.length);}
    catch(error){if(active){wrap.replaceChildren();const message=document.createElement('p');message.className='ranking-empty';message.textContent=gameText('ranking.error');wrap.append(message);onStatus('error',0,error);}}
    finally{busy=false;wrap.setAttribute('aria-busy','false');}}
  return {reload,destroy(){active=false;wrap.removeEventListener('pointerdown',down);wrap.removeEventListener('pointermove',move);wrap.removeEventListener('pointerup',up);wrap.removeEventListener('pointercancel',up);wrap.removeEventListener('click',click,true);}};
}
