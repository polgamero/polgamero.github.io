// Same ranking table is mounted in the game and the public site.
import {fetchPublicPlayerStats} from './firebaseClient.js';
import {POOL_BASELINE} from './poolContract.js';
import {gameText} from './gameTexts.js';
import {showPublicPlayerProfile} from './publicProfileUI.js';
import {injectRankingStyles,mountRankingTable} from './rankingTable.js';
function esc(value){const div=document.createElement('div');div.textContent=String(value??'');return div.innerHTML;}
export function showGlobalRanking(onBack=()=>{}) {
  injectRankingStyles();
  document.querySelectorAll('#global-ranking-overlay').forEach(el => el.remove());
  const overlay = document.createElement('div');
  overlay.id = 'global-ranking-overlay';
  overlay.innerHTML = `
    <div class="ranking-header">
      <button class="ranking-back" id="ranking-back">← ${esc(gameText('common.back'))}</button>
      <div class="ranking-title">${esc(gameText('ranking.title'))}</div>
      <div class="ranking-subtitle">${esc(gameText('ranking.subtitle', { total: POOL_BASELINE.total }))}</div>
    </div>
    <div class="ranking-wrap" id="ranking-wrap"><div class="ranking-empty">${esc(gameText('ranking.loading'))}</div></div>
    <div class="ranking-note">${esc(gameText('ranking.note'))}</div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#ranking-back').addEventListener('click', () => { table.destroy(); overlay.remove(); onBack(); });

  const table=mountRankingTable(overlay.querySelector('#ranking-wrap'),{loadRows:fetchPublicPlayerStats,onProfile:showPublicPlayerProfile});
  void table.reload();
}
