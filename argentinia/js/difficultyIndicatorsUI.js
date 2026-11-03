import { gameText } from './gameTexts.js';
import { difficultyRate } from './difficultyIndicators.js';

const text=(key,vars)=>gameText('difficulty.'+key,vars);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number(value||0).toLocaleString('es-AR');
const percentage=value=>value==null?text('noData'):Number(value).toLocaleString('es-AR',{maximumFractionDigits:1})+' %';
const dateLabel=ms=>new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Argentina/Buenos_Aires'}).format(ms);
function dateInput(ms){const parts=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/Argentina/Buenos_Aires'}).formatToParts(ms);const get=key=>parts.find(x=>x.type===key)?.value;return `${get('year')}-${get('month')}-${get('day')}`;}
function style(root){
  if(root.ownerDocument.getElementById('difficulty-indicators-style'))return;
  const node=root.ownerDocument.createElement('style');node.id='difficulty-indicators-style';
  node.textContent=`.difficulty-indicators{min-width:0}.difficulty-indicators p{font-size:12px;line-height:1.5;color:#bcb0c4}.difficulty-filters{display:flex;flex-wrap:wrap;gap:10px;align-items:end}.difficulty-filters label{display:grid;gap:4px;font-size:11px;color:#d6c3dd}.difficulty-filters input,.difficulty-filters select{max-width:290px;min-height:32px;background:#160d1c;color:#eadfee;border:1px solid #60436b;border-radius:5px;padding:5px;font:inherit}.difficulty-filters .difficulty-check{display:flex;align-items:center;gap:6px}.difficulty-filters input[type=checkbox]{min-height:0}.difficulty-indicators button{cursor:pointer}.difficulty-actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.difficulty-scroll{overflow-x:auto;margin-block:10px}.difficulty-indicators table{width:100%;border-collapse:collapse;font-size:11px}.difficulty-indicators th,.difficulty-indicators td{padding:9px 8px;border-bottom:1px solid #51365b;text-align:left;vertical-align:top}.difficulty-indicators th{color:#dbc2e5}.difficulty-indicators small{display:block;color:#ad9bb5;font-size:10px;line-height:1.45;min-width:110px}.difficulty-status{color:#ddc9a3;font-size:12px;margin-block:10px}.difficulty-indicators h4{font-size:14px;color:#e0c7eb;margin:18px 0 8px}.difficulty-funnel{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0}.difficulty-funnel span{padding:8px;border:1px solid #51365b;border-radius:5px;font-size:12px}.difficulty-summary-note{margin-block:8px}@media(max-width:600px){.difficulty-filters label{flex:1 1 140px}.difficulty-filters input,.difficulty-filters select{max-width:100%;width:100%}.difficulty-filters input[type=checkbox]{width:auto}}`;
  root.ownerDocument.head.append(node);
}
function rateHTML(rate){return rate?.percent==null?esc(text('noData')):`${esc(percentage(rate.percent))}<small>${esc(text('ratio',{wins:number(rate.wins),total:number(rate.total)}))}<br>${esc(text('interval',{low:Number(rate.low).toFixed(1),high:Number(rate.high).toFixed(1)}))}</small>`;}
function card(label,value,sub=''){return `<div class="admin-stat-card"><div class="admin-stat-label">${esc(label)}</div><div class="admin-stat-value">${esc(value)}</div><div class="admin-stat-sub">${esc(sub)}</div></div>`;}
function rateCard(label,rate){return card(label,percentage(rate.percent),text('ratio',{wins:number(rate.wins),total:number(rate.total)})+(rate.percent==null?'':' · '+text('interval',{low:Number(rate.low).toFixed(1),high:Number(rate.high).toFixed(1)})));}
function table(headers,rows){return `<div class="difficulty-scroll"><table class="admin-debug-table"><thead><tr>${headers.map(key=>`<th>${esc(text(key))}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.join(''):`<tr><td colspan="${headers.length}">${esc(text('noData'))}</td></tr>`}</tbody></table></div>`;}
function combination(value){const [level,quality]=String(value).split('/');return `${text(['easy','medium','hard','mixed'].includes(level)?level:'unknown')} / ${text(['good','strong','elite'].includes(quality)?quality:'unknown')}`;}
function policyLabel(value){const list=String(value).split('|');return text('tournamentPolicy',Object.fromEntries(['round16','quarter','semi','final'].map((key,i)=>[key,combination(list[i])])));}
function resultsTable(rows,rounds=false){
  const headers=[rounds?'rounds':'solo',...(rounds?['combination']:[]),'games','wins','losses','abandoned','interrupted','uncategorized','naturalRate','inclusiveRate','abandonRate','players','playerMean','duration'];
  return table(headers,rows.map(row=>`<tr><td>${esc(text(row.key))}</td>${rounds?`<td>${esc((row.combinations||[]).map(combination).join(' · ')||text('unknown'))}</td>`:''}<td>${number(row.games)}</td><td>${number(row.wins)}</td><td>${number(row.losses)}</td><td>${number(row.abandoned)}</td><td>${number(row.interrupted)}</td><td>${number(row.unknown)}</td><td>${rateHTML(row.naturalRate)}</td><td>${rateHTML(row.inclusiveRate)}</td><td>${rateHTML(row.abandonRate)}</td><td>${number(row.players)}</td><td>${esc(percentage(row.naturalRate.playerMean))}</td><td>${esc(row.averageDurationMs==null?text('noData'):text('durationValue',{minutes:(row.averageDurationMs/60000).toFixed(1)}))}<small>${esc(text('durationSamples',{count:row.durationSamples}))}</small></td></tr>`));
}
function retryHTML(label,row){return `<h4>${esc(label)}</h4><div class="admin-stats-grid">${rateCard(text('retry'),row.rate)}${rateCard(text('nextResult'),row.nextResultRate)}</div><p>${esc(text('retryPending',{count:number(row.pending)}))}</p>`;}
export function difficultyCsvRows(snapshot){
  if(!snapshot)return [];
  const rows=[[text('exportTitle')],[text('exportGenerated'),new Date(snapshot.generatedAtMs).toISOString()],
    [text('from'),snapshot.filters.fromMs?new Date(snapshot.filters.fromMs).toISOString():text('allTime')],
    [text('to'),new Date(snapshot.filters.toMs).toISOString()],
    [text('filters'),JSON.stringify(snapshot.filters)],
    [text('coverage'),snapshot.complete?text('complete'):text('partial')],
    [text('exportPopulation'),text('exportMetric'),text('exportValue'),text('wins'),text('games'),text('exportLower'),text('exportUpper')]];
  const add=(group,label,rate)=>rows.push([group,label,rate.percent??'',rate.wins,rate.total,rate.low??'',rate.high??'']);
  const tour=snapshot.tournaments;
  if(tour.available){
    for(const key of ['started','open','closed','champions','defeated','abandoned','interrupted','players'])rows.push([text('tournaments'),text(key),tour[key]]);
    for(const key of ['perStartRate','closedRate','playedRate'])add(text('tournaments'),text(key),tour[key]);
    for(const row of tour.funnel)rows.push([text('funnel'),text(row.key),row.reached]);
  }
  for(const [group,list,available] of [[text('solo'),snapshot.solo.rows,snapshot.solo.available],[text('rounds'),tour.rounds,tour.available]]){
    if(!available)continue;
    for(const row of list){const label=`${group} · ${text(row.key)}`;add(label,text('naturalRate'),row.naturalRate);add(label,text('inclusiveRate'),row.inclusiveRate);add(label,text('abandonRate'),row.abandonRate);
      for(const key of ['wins','losses','abandoned','interrupted','unknown','players','averageDurationMs'])rows.push([label,text(key==='averageDurationMs'?'exportDurationMs':key),row[key]??'']);
      rows.push([label,text('playerMean'),row.naturalRate.playerMean??'']);
      if(row.retries){add(label,text('retry'),row.retries.rate);add(label,text('nextResult'),row.retries.nextResultRate);}
    }
  }
  if(tour.available)add(text('tournaments'),text('retry'),tour.retries.rate);
  for(const row of snapshot.versions||[]){const group=`${text('versionComparison')} · ${row.key}`;if(snapshot.solo.available)add(group,text('naturalRate'),row.solo.naturalRate);if(tour.available)add(group,text('closedRate'),row.championshipRate);}
  for(const row of snapshot.timeSeries||[]){const group=`${text('weekly')} · ${dateInput(row.atMs)}`;if(snapshot.solo.available)add(group,text('naturalRate'),row.solo.naturalRate);if(tour.available)add(group,text('closedRate'),row.championshipRate);}
  return rows;
}
function download(root,snapshot){
  const cell=value=>{let s=String(value??'');if(/^[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  const blob=new Blob(['\uFEFF'+difficultyCsvRows(snapshot).map(row=>row.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=root.ownerDocument.createElement('a');a.href=url;a.download='Argentinia_Indicadores_Dificultad.csv';a.hidden=true;root.ownerDocument.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
}
export function mountDifficultyIndicators(root,{load,state={},lifetime={}}){
  style(root);
  const now=Date.now();
  const defaults={from:dateInput(now-30*86400000),to:dateInput(now),botVersion:'',buildId:'',experience:'',rewardMode:'',policy:'',includeTests:false};
  state.form={...defaults,...state.form};
  const values=state.form;
  const field=(key,control)=>`<label>${esc(text(key))}${control}</label>`;
  const select=(key,options)=>field(key,`<select name="${key}"><option value="">${esc(text('all'))}</option>${options.map(value=>`<option value="${esc(value)}" ${values[key]===value?'selected':''}>${esc(text(value))}</option>`).join('')}</select>`);
  root.className='admin-dashboard-group difficulty-indicators';
  root.innerHTML=`<div class="admin-dashboard-group-title">${esc(text('title'))}</div><p>${esc(text('intro'))}</p><form class="difficulty-filters">${field('from',`<input name="from" type="date" value="${esc(values.from)}">`)}${field('to',`<input name="to" type="date" value="${esc(values.to)}">`)}${select('botVersion',[])}${select('buildId',[])}${select('experience',['new','experienced','unknown'])}${select('rewardMode',['rewarded','practice','unknown'])}${select('policy',[])}<label class="difficulty-check"><input name="includeTests" type="checkbox" ${values.includeTests?'checked':''}>${esc(text('includeTests'))}</label><button class="admin-save-btn" type="submit">${esc(text('update'))}</button></form><div class="difficulty-actions">${[7,30,90,0].map(days=>`<button type="button" class="admin-save-btn" data-days="${days}">${esc(days?text('lastDays',{days}):text('allTime'))}</button>`).join('')}<button type="button" class="admin-save-btn" data-export disabled>${esc(text('export'))}</button></div><div class="difficulty-status" role="status" aria-live="polite"></div><div data-results></div>`;
  const form=root.querySelector('form'),status=root.querySelector('.difficulty-status'),output=root.querySelector('[data-results]'),exportButton=root.querySelector('[data-export]');
  const applyOptions=snapshot=>{
    for(const [key,options,label] of [['botVersion',snapshot.options.botVersions,value=>['unknown','mixed'].includes(value)?text(value):value],['buildId',snapshot.options.buildIds,value=>['unknown','mixed'].includes(value)?text(value):value.slice(0,12)],['policy',snapshot.options.policies,policyLabel]]){
      const current=form.elements[key].value||state.form[key];
      form.elements[key].innerHTML=`<option value="">${esc(text('all'))}</option>`+[...new Set([...options,...(current?[current]:[])])].map(value=>`<option value="${esc(value)}" ${current===value?'selected':''}>${esc(label(value))}</option>`).join('');
    }
  };
  function render(snapshot){
    const tour=snapshot.tournaments,solo=snapshot.solo;
    let html=`<p>${esc(text('updated',{date:dateLabel(snapshot.generatedAtMs)}))}</p>`;
    if(!snapshot.complete)html+=`<p class="difficulty-status">${esc(text('partial'))}</p>`;
    if(tour.available){
      html+=`<h4>${esc(text('tournaments'))}</h4><div class="admin-stats-grid">${['started','open','closed','champions','defeated','abandoned','interrupted','players'].map(key=>card(text(key),number(tour[key]))).join('')}${['perStartRate','closedRate','playedRate'].map(key=>rateCard(text(key),tour[key])).join('')}</div><p>${esc(text('openNote'))}</p><h4>${esc(text('funnel'))}</h4><div class="difficulty-funnel">${tour.funnel.map(row=>`<span>${esc(text(row.key))}: <strong>${number(row.reached)}</strong></span>`).join('')}<span>${esc(text('champions'))}: <strong>${number(tour.champions)}</strong></span></div><h4>${esc(text('rounds'))}</h4>${resultsTable(tour.rounds,true)}<p>${esc(text('roundsNote'))}</p><p>${esc(text('prizeSummary',{rewarded:tour.rewards[0].started,rewardedWins:tour.rewards[0].champions,practice:tour.rewards[1].started,practiceWins:tour.rewards[1].champions}))}</p>`;
      html+=`<p>${esc(text('prizeUnknown',{count:tour.rewards[2]?.started||0}))}</p>`;
      html+=`<div class="admin-stats-grid">${card(text('championshipPlayerMean'),percentage(tour.playedRate.playerMean))}${card(text('uncategorized'),number(tour.unknown))}</div>`;
      html+=retryHTML(text('retryTournament'),tour.retries);
    }else html+=`<h4>${esc(text('tournaments'))}</h4><p>${esc(text('notAvailable'))}</p>`;
    if(solo.available){
      html+=`<h4>${esc(text('solo'))}</h4>${resultsTable(solo.rows)}<p>${esc(text('naturalNote'))}</p>`;
      for(const row of solo.rows.filter(row=>['easy','medium','hard'].includes(row.key)))html+=retryHTML(`${text('retrySolo')} · ${text(row.key)}`,row.retries);
    }else html+=`<h4>${esc(text('solo'))}</h4><p>${esc(text('notAvailable'))}</p>`;
    const comparisonRows=(items,label)=>table([label,'games','naturalRate','started','closedRate'],items.map(row=>`<tr><td>${esc(label==='week'?dateInput(row.atMs):['unknown','mixed'].includes(row.key)?text(row.key):row.key)}</td><td>${number(row.solo.games)}</td><td>${solo.available?rateHTML(row.solo.naturalRate):esc(text('notAvailable'))}</td><td>${number(row.tournaments)}</td><td>${tour.available?rateHTML(row.championshipRate):esc(text('notAvailable'))}</td></tr>`));
    html+=`<h4>${esc(text('versionComparison'))}</h4>${comparisonRows(snapshot.versions||[],'botVersion')}<details><summary>${esc(text('weekly'))}</summary>${comparisonRows(snapshot.timeSeries||[],'week')}</details>`;
    html+=`<h4>${esc(text('coverage'))}</h4><p>${esc(text('coverageText',{known:solo.knownDifficulty,mixed:solo.mixed,unknown:solo.unknownDifficulty,starts:solo.observationStarts}))}</p><p>${esc(text('sourceCounts',{games:snapshot.coverage.soloReceiptGames,runs:snapshot.coverage.runs,sessions:snapshot.coverage.sessions}))}</p><p>${esc(text('missingDates',{solo:snapshot.coverage.missingSoloDates,runs:snapshot.coverage.missingRunDates}))}</p><p>${esc(text('missingAccounts',{count:snapshot.coverage.accountsMissing}))}</p><p>${esc(text('dateCoverage'))}</p><p>${esc(text('historicalUnknown'))}</p><p>${esc(text('accountExclusions'))}</p><p>${esc(text('interpretation'))}</p><p>${esc(text('retryNote'))}</p><p>${esc(text('cohortNote'))}</p><p>${esc(text('sampleCaution'))}</p>`;
    output.innerHTML=html;applyOptions(snapshot);exportButton.disabled=false;
  }
  async function refresh(){
    const token=state.request=(state.request||0)+1;
    const fields=Object.fromEntries(new FormData(form));fields.includeTests=form.elements.includeTests.checked;
    state.form=fields;
    const fromMs=fields.from?Date.parse(fields.from+'T00:00:00-03:00'):0;
    const toMs=fields.to?Date.parse(fields.to+'T00:00:00-03:00')+86400000:Date.now();
    if(!Number.isFinite(fromMs)||!Number.isFinite(toMs)||fromMs<0||fromMs>=toMs||fromMs>Date.now()){status.textContent=text('invalidDates');return;}
    const button=form.querySelector('button');button.disabled=true;exportButton.disabled=true;status.textContent=text('loading');
    try{
      const snapshot=await load({fromMs,toMs,botVersion:fields.botVersion,buildId:fields.buildId,experience:fields.experience,rewardMode:fields.rewardMode,policy:fields.policy,includeTests:fields.includeTests});
      if(state.request!==token||!root.isConnected)return;
      state.snapshot=snapshot;render(snapshot);status.textContent=snapshot.complete?text('complete'):text('partial');
    }catch{
      if(state.request!==token||!root.isConnected)return;
      state.snapshot=null;status.textContent=text('unavailable');
      const starts=Number(lifetime.tournamentsPlayed)||0,wins=Number(lifetime.tournamentChampionships)||0;
      output.innerHTML=`<h4>${esc(text('historical'))}</h4><div class="admin-stats-grid">${card(text('started'),number(starts))}${card(text('champions'),number(wins))}${rateCard(text('perStartRate'),difficultyRate(wins,starts))}</div><p>${esc(text('historicalNote'))}</p>`;
    }finally{if(state.request===token&&root.isConnected)button.disabled=false;}
  }
  form.addEventListener('submit',event=>{event.preventDefault();void refresh();});
  form.addEventListener('change',()=>{status.textContent=text('pendingFilters');exportButton.disabled=true;});
  root.querySelectorAll('[data-days]').forEach(button=>button.addEventListener('click',()=>{const days=Number(button.dataset.days);form.elements.from.value=days?dateInput(Date.now()-days*86400000):'';form.elements.to.value=dateInput(Date.now());void refresh();}));
  exportButton.addEventListener('click',()=>{if(state.snapshot)download(root,state.snapshot);});
  if(state.snapshot)applyOptions(state.snapshot);
  void refresh();
  return {refresh};
}
