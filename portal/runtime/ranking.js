import {portalServices} from './firebasePortal.js';
import {publicRanking} from './rankingModel.js';
export function mountRanking(root,{services=portalServices}={}){
  const status=root.querySelector('[data-ranking-status]'),body=root.querySelector('tbody'),retry=root.querySelector('[data-ranking-retry]');let busy=false;
  const cell=(row,value)=>{const td=document.createElement('td');td.textContent=value;row.append(td);return td;};
  async function load(){
    if(busy)return;busy=true;retry.disabled=true;status.textContent='Cargando el ranking del juego…';root.setAttribute('aria-busy','true');body.replaceChildren();
    try{const rows=publicRanking(await(await services()).fetchRanking());
      rows.forEach((r,i)=>{const tr=document.createElement('tr');cell(tr,String(i+1));const name=cell(tr,r.username);name.className='ranking-player';cell(tr,r.eloRating.toLocaleString('es-AR')+(r.eloGames<10?'*':''));cell(tr,r.gamesPlayed.toLocaleString('es-AR'));cell(tr,r.wins.toLocaleString('es-AR'));cell(tr,r.tournamentChampionships.toLocaleString('es-AR'));body.append(tr);});
      status.textContent=rows.length?`Ranking consultado ahora · ${rows.length} jugadores.`:'Todavía no hay jugadores visibles en el ranking.';
    }catch{status.textContent='No pudimos consultar el ranking. Podés volver a intentarlo.';}
    finally{root.setAttribute('aria-busy','false');retry.disabled=false;busy=false;}
  }
  retry.addEventListener('click',load);load();return {reload:load};
}
const root=document.querySelector('[data-public-ranking]');if(root)mountRanking(root);
