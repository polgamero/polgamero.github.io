import {portalServices} from './firebasePortal.js';
import {mountRankingTable} from '/js/rankingTable.js';
export function mountRanking(root,{services=portalServices}={}){
  const status=root.querySelector('[data-ranking-status]'),retry=root.querySelector('[data-ranking-retry]');
  const table=mountRankingTable(root.querySelector('[data-ranking-table]'),{
    loadRows:async()=>await(await services()).fetchRanking(),
    onStatus:(state,count)=>{retry.disabled=state==='loading';status.textContent=state==='loading'?'Cargando ranking…':state==='error'?'No pudimos consultar el ranking. Reintentá.':count?`Ranking consultado ahora · ${count} jugadores.`:'Todavía no hay jugadores.';}
  });
  retry.addEventListener('click',table.reload);void table.reload();return table;
}
const root=document.querySelector('[data-public-ranking]');if(root)mountRanking(root);
