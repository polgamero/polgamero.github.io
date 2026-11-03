import {portalServices} from './firebasePortal.js';
import {mountRankingTable} from '/js/rankingTable.js';
import {gameText} from '/js/gameTexts.js';
export function mountRanking(root,{services=portalServices}={}){
  const status=root.querySelector('[data-ranking-status]'),retry=root.querySelector('[data-ranking-retry]');
  const table=mountRankingTable(root.querySelector('[data-ranking-table]'),{
    loadRows:async()=>await(await services()).fetchRanking(),
    onStatus:(state,count)=>{
      retry.disabled=state==='loading';
      const key='site.ranking.'+(state==='loading'?'loading':state==='error'?'error':count?'loaded':'empty');
      const variables=key==='site.ranking.loaded'?{count}:{};
      status.dataset.siteText=key;status.dataset.siteVars=JSON.stringify(variables);
      status.textContent=gameText(key,variables);
    }
  });
  retry.addEventListener('click',table.reload);void table.reload();return table;
}
const root=document.querySelector('[data-public-ranking]');if(root)mountRanking(root);
