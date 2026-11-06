import { buildDeckStatistics, analyzeDeckHealth, simulateOpeningHands, openingHandProfile, compareDeckEntries } from './deckStatistics.js';
import { inferCardDeckProfile } from './deckIntelligence.js';
import { DECK_COMPOSITION_GROUPS } from './deckComposition.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const palette=['#d8b84e','#7cbf82','#7db5dc','#df9273','#b395cf','#c6bba1','#84c4b8','#c98fba'];
const colors=[['W','Blanco','#e7dcb1'],['U','Azul','#68a9d3'],['B','Negro','#b19bbc'],['R','Rojo','#dc8d73'],['G','Verde','#7db48c'],['C','Incoloro','#a9b4b9']];
const pct=n=>`${Number(n||0).toFixed(1)}%`;
const number=n=>Number(n||0).toFixed(1);

export function ensureDeckInsightsStyles(){
  if(document.getElementById('deck-insights-styles'))return;
  const style=document.createElement('style');style.id='deck-insights-styles';
  style.textContent=`
  #deckbuilder-overlay .deckbuilder-header #deckbuilder-stats{width:auto;margin:0;flex:0 0 auto;min-height:40px;box-shadow:0 0 16px #d4af373b;border-color:#f2d267;white-space:nowrap}
  #deckbuilder-overlay .deckbuilder-side-actions{display:flex;gap:6px;margin-bottom:10px}
  .deckbuilder-side-actions button{flex:1;min-height:36px;padding:6px;border:1px solid #d4af3766;border-radius:7px;background:#16231b;color:#e8dcae;cursor:pointer;font:inherit;font-size:11px}
  #deckbuilder-overlay button.deckbuilder-type-header{width:100%;text-align:left;cursor:pointer;font-family:inherit;border-top:0;border-right:0;border-bottom:0;min-height:38px;gap:7px}
  .deckbuilder-type-toggle{width:13px;flex:0 0 13px;color:#e1bf58}
  .deckbuilder-type-header-main{flex:1}
  .deckbuilder-type-body[hidden]{display:none!important}
  .deckbuilder-type-header:focus-visible,.deckbuilder-side-actions button:focus-visible,.deck-insights button:focus-visible{outline:2px solid #f0d26a;outline-offset:2px}
  .deckbuilder-list-item.deckbuilder-located{outline:2px solid #f0d26a;background:#d4af3726;border-radius:5px}
  .deck-insights .deck-stats-modal{width:min(1100px,96vw)}
  .deck-insights-toolbar{display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap;margin-bottom:14px}
  .deck-insights-views{display:flex;gap:12px;flex-wrap:wrap;border:1px solid #d4af3755;border-radius:9px;margin:0;padding:7px 12px;color:#e1d5af}
  .deck-insights-views legend{font-size:11px;padding:0 5px}
  .deck-insights-views label{display:flex;gap:5px;align-items:center;min-height:32px;cursor:pointer;font-size:13px}
  .deck-insights input[type=radio]{accent-color:#dbb64f;width:16px;height:16px}
  .deck-insights button.deck-insights-action{border:1px solid #d4af3777;background:#17281d;color:#f1e3b1;border-radius:7px;min-height:34px;padding:6px 10px;cursor:pointer;font:inherit;font-size:12px}
  .deck-insights .deck-stats-note{font-size:12px;line-height:1.5;color:#b4ab95}
  .deck-insights .deck-stats-panel h4{font-size:13px;letter-spacing:.3px}
  .deck-insights-chart{margin-top:10px}
  .deck-insights-bar-row{display:grid;grid-template-columns:minmax(70px,1fr) 2fr 38px;align-items:center;gap:9px;width:100%;padding:5px 0;border:0;color:#ece1c5;background:transparent;text-align:left;font:inherit;font-size:12px;cursor:pointer;min-height:32px}
  .deck-insights-bar-track{height:12px;background:#ffffff12;border-radius:8px;overflow:hidden}
  .deck-insights-bar-fill{height:100%;border-radius:8px;display:block}
  .deck-insights-chart-table{width:100%;border-collapse:collapse;font-size:12px;color:#e4d9bd}
  .deck-insights-chart-table td,.deck-insights-chart-table th{text-align:left;padding:7px 4px;border-bottom:1px solid #ffffff12}
  .deck-insights-chart-table th{font-weight:700;color:#cfc09c}
  .deck-insights-pie-wrap{display:flex;align-items:center;justify-content:center;gap:16px;flex-wrap:wrap}
  .deck-insights-pie{width:150px;height:150px;flex:0 0 150px;border-radius:50%;position:relative}
  .deck-insights-pie::after{content:attr(data-total);position:absolute;inset:34px;display:grid;place-items:center;border-radius:50%;background:#111d15;color:#f4e3ae;font-size:25px;font-weight:800}
  .deck-insights-legend{flex:1;min-width:135px;display:grid;gap:4px}
  .deck-insights-legend button{display:flex;align-items:center;gap:7px;text-align:left;min-height:30px;padding:4px;border:0;background:transparent;color:#e4d9bd;font:inherit;font-size:12px;cursor:pointer}
  .deck-insights-swatch{width:11px;height:11px;border-radius:3px;display:inline-block;flex:0 0 11px}
  .deck-insights [hidden]{display:none!important}
  .deck-insights-probabilities{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:10px}
  .deck-insights-probabilities div{border-radius:9px;padding:10px;text-align:center;background:#ffffff08;font-size:12px}
  .deck-insights-probabilities strong{display:block;font-size:23px;color:#f1d784;margin-bottom:3px}
  .deck-insights-roles{display:flex;flex-wrap:wrap;gap:7px}
  .deck-insights-change-summary{display:flex;gap:16px;flex-wrap:wrap;color:#e4d9bd;font-size:13px}
  .deck-insights-card-list{display:grid;gap:5px;margin-top:10px;max-height:260px;overflow:auto}
  .deck-insights-card-list button{display:flex;justify-content:space-between;gap:12px;border:1px solid #d4af3733;border-radius:6px;background:#122218;padding:8px 10px;color:#eee2c0;text-align:left;cursor:pointer;font:inherit;font-size:13px}
  .deck-insights-card-list small{white-space:nowrap;color:#c4b68e}
  .deck-insights-sources{display:grid;gap:5px}
  .deck-insights-source{display:grid;grid-template-columns:80px 1fr 28px;align-items:center;gap:8px;font-size:12px;color:#e4d9bd;min-height:27px}
  #deckbuilder-overlay .deckbuilder-recent-action{width:100%;margin:0 0 8px;min-height:36px;border:1px solid #d4af3766;border-radius:7px;background:#19271b;color:#e8dcae;cursor:pointer;font-size:11px}
  @media(max-width:700px){.deck-insights .deck-stats-grid{grid-template-columns:1fr}.deck-insights .deck-stats-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.deck-insights-probabilities{grid-template-columns:1fr}.deck-insights .deck-stats-title{font-size:18px}.deck-insights-toolbar{align-items:stretch}}
  html.argentinia-mobile #deckbuilder-overlay .deckbuilder-header{flex-wrap:wrap!important}
  html.argentinia-mobile #deckbuilder-overlay .deckbuilder-header #deckbuilder-stats{min-height:36px!important;margin:0!important;padding:5px 9px!important;font-size:10px!important}
  html.argentinia-mobile #deckbuilder-overlay button.deckbuilder-type-header{min-height:40px!important;padding:6px!important;font-size:9px!important}
  html.argentinia-mobile #deckbuilder-overlay .deckbuilder-side-actions button{min-height:40px;font-size:9px}
  html.argentinia-mobile .deck-insights .deck-stats-modal{max-height:94dvh!important;padding:10px!important}
  html.argentinia-mobile .deck-insights .deck-stats-panel h4{font-size:11px!important}
  html.argentinia-mobile .deck-insights .deck-stats-note{font-size:10px!important}
  html.argentinia-mobile .deck-insights .deck-stats-kpi span{font-size:9px!important}
  html.argentinia-mobile .deck-insights .deck-hand-metric span{font-size:10px!important}
  html.argentinia-mobile .deck-insights .deck-stats-close{width:36px!important;height:36px!important;font-size:20px!important}
  html.argentinia-mobile .deck-insights button{min-height:38px}
  html.argentinia-mobile .deck-insights-views label{min-height:38px;font-size:11px}
  html.argentinia-mobile .deck-insights-pie{width:125px;height:125px;flex-basis:125px}
  html.argentinia-mobile .deck-insights-pie::after{inset:28px}
  @media(max-width:600px){html.argentinia-mobile .deck-insights .deck-stats-grid{grid-template-columns:1fr!important}html.argentinia-mobile .deck-insights .deck-hand-results{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
  `;
  document.head.appendChild(style);
}

export function showDeckInsights({entries=[],beforeEntries=null,name='',chartMode='bars',onChartMode=()=>{},onLocate=()=>{},onRecent=()=>{},valid=()=>true}={}){
  ensureDeckInsightsStyles();
  const stats=buildDeckStatistics(entries),hand=openingHandProfile(entries);
  const profiles=new Map(entries.map(e=>[e.trackingKey||e.card.id,inferCardDeckProfile(e.card)]));
  const groups=new Map(),register=(key,label,list)=>{groups.set(key,{label,entries:list});return key;};
  const count=list=>list.reduce((n,e)=>n+e.count,0);
  const land=e=>e.categoryKey==='tierras'||/Tierra/i.test(e.card.type||'');
  const curve=['0','1','2','3','4','5','6+'].map((key,i)=>({label:`MV ${key}`,value:stats.curve[key],color:palette[i],group:register('curve-'+key,`Cartas de MV ${key}`,entries.filter(e=>!land(e)&&(key==='6+'?Number(e.card.cmc)>=6:Math.floor(Number(e.card.cmc)||0)===Number(key))))}));
  const types=DECK_COMPOSITION_GROUPS.map((g,i)=>({label:g.label,value:stats.typeCounts[g.key]||0,color:palette[i%palette.length],group:register('type-'+g.key,g.label,entries.filter(e=>e.categoryKey===g.key))})).filter(r=>r.value);
  for(const key of Object.keys(stats.typeCounts))if(!DECK_COMPOSITION_GROUPS.some(g=>g.key===key))types.push({label:'Otras',value:stats.typeCounts[key],color:'#a99a83',group:register('type-'+key,'Otras cartas',entries.filter(e=>e.categoryKey===key))});
  const demand=colors.map(([key,label,color])=>({label,value:stats.demand[key],color,group:register('color-'+key,`Costes con símbolo ${label}`,entries.filter(e=>!land(e)&&String(e.card.manaCost||'').includes('{'+key+'}')))}));
  const roles=[['threat','Presencia en mesa'],['interaction','Interacción'],['advantage','Robo y selección'],['ramp','Aceleración'],['protection','Protección']].map(([key,label])=>{
    const list=entries.filter(e=>{const r=profiles.get(e.trackingKey||e.card.id).roles;return key==='advantage'?r.includes('cardAdvantage')||r.includes('selection'):r.includes(key);});
    return {key:register('role-'+key,label,list),label,value:count(list)};
  });
  const comparison=beforeEntries===null?null:compareDeckEntries(beforeEntries,entries);
  if(comparison){register('added','Copias agregadas',comparison.added);register('removed','Copias retiradas',comparison.removed);}
  const modal=document.createElement('div');modal.className='deck-stats-overlay deck-insights';
  const priorFocus=document.activeElement;
  const health=analyzeDeckHealth(stats).map(h=>`<div class="deck-health-item ${esc(h.level)}"><strong>${esc(h.title)}</strong><span> — ${esc(h.detail)}</span></div>`).join('');
  const kpis=[[stats.total,'cartas'],[stats.lands,'tierras'],[stats.creatures,'criaturas'],[stats.nonlands,'no-tierras'],[number(stats.averageManaValue),'MV sin tierras']];
  modal.innerHTML=`<div class="deck-stats-modal" role="dialog" aria-modal="true" aria-labelledby="deck-insights-title">
    <div class="deck-stats-header"><div class="deck-stats-title" id="deck-insights-title">📊 Estadísticas — ${esc(name||'Mazo')}</div><button class="deck-stats-close" type="button" aria-label="Cerrar estadísticas">×</button></div>
    <div class="deck-insights-toolbar"><fieldset class="deck-insights-views"><legend>Mostrar gráficos como</legend>${[['bars','Barras'],['pie','Torta'],['table','Datos']].map(([key,label])=>`<label><input type="radio" name="deck-chart-view" value="${key}" ${chartMode===key?'checked':''}>${label}</label>`).join('')}</fieldset><button type="button" class="deck-insights-action" data-recent>🆕 Últimas obtenidas en tu colección</button></div>
    <div class="deck-stats-grid">
    <section class="deck-stats-panel wide"><h4>Tu lista actual</h4><div class="deck-stats-kpis">${kpis.map(([v,l])=>`<div class="deck-stats-kpi"><strong>${v}</strong><span>${l}</span></div>`).join('')}</div><p class="deck-stats-note">${stats.total===60?'Lista de 60 cartas.':'Mazo en construcción: los porcentajes usan las '+stats.total+' cartas actuales.'} Las estadísticas acompañan la edición, no cambian el mazo.</p></section>
    <section class="deck-stats-panel"><h4>Curva de maná</h4><div data-chart="curve"></div><p class="deck-stats-note">Sin tierras. Tocá un dato o su leyenda para revisar las cartas.${stats.xCards?' '+stats.xCards+' carta(s) con X: se usa su MV impreso.':''}</p></section>
    <section class="deck-stats-panel"><h4>Composición por sección</h4><div data-chart="types"></div><p class="deck-stats-note">Cada copia pertenece a una sección del editor.</p></section>
    <section class="deck-stats-panel"><h4>Símbolos de coste</h4><div data-chart="demand"></div><p class="deck-stats-note">Cuenta símbolos fijos, no cartas ni probabilidades de pago.${stats.flexibleSymbols?' Hay '+stats.flexibleSymbols+' símbolo(s) híbridos o de pago flexible, mostrados aparte de este reparto.':''}</p></section>
    <section class="deck-stats-panel"><h4>Fuentes de maná por color</h4><div class="deck-insights-sources">${colors.map(([key,label,color])=>`<div class="deck-insights-source"><span>${label}</span><span class="deck-insights-bar-track"><i class="deck-insights-bar-fill" style="width:${stats.manaSourceCards?Math.min(100,stats.sources[key]/stats.manaSourceCards*100):0}%;background:${color}"></i></span><b>${stats.sources[key]}</b></div>`).join('')}</div><p class="deck-stats-note">${stats.manaSourceCards} carta(s) con producción de maná detectada, incluyendo artefactos y criaturas. ${stats.flexibleSources} flexible(s). Una fuente flexible cuenta en varios colores: estas cantidades no se suman como una torta. No evalúa activaciones, mareo, costes ni maná disponible en una partida.</p></section>
    <section class="deck-stats-panel wide"><h4>Funciones presentes</h4><div class="deck-insights-roles">${roles.map(r=>`<button type="button" class="deck-insights-action" data-inspect="${r.key}">${r.label} · ${r.value}</button>`).join('')}</div><p class="deck-stats-note">Lectura orientativa de los efectos y textos ya conocidos. Una carta puede cumplir varias funciones. No predice enfrentamientos ni recomienda cambios automáticos.</p></section>
    <section class="deck-stats-panel wide"><h4>Primera mano · ${hand.draws} cartas</h4><div class="deck-insights-probabilities"><div><strong>${pct(hand.twoFourLands)}</strong>Con 2–4 tierras</div><div><strong>${pct(hand.atLeastOneEarly)}</strong>Con alguna carta de MV 1–2</div><div><strong>${pct(hand.atLeastOneCreature)}</strong>Con alguna criatura</div></div><p class="deck-stats-note">Probabilidades exactas de robar cartas de esta lista, sin mulligan. Tener una carta no garantiza poder pagarla o jugarla.</p><button type="button" class="deck-hand-sim-btn">🎲 Simular 100 manos</button><div class="deck-hand-results" hidden></div><div data-chart="simulation" hidden></div><p class="deck-stats-note" data-simulation-note hidden>Experimento aleatorio de 100 manos: puede variar en cada intento. Las etiquetas describen composición, no jugadas legales ni decisiones de mulligan.</p></section>
    <section class="deck-stats-panel wide"><h4>Comparar con el mazo guardado</h4>${comparison?`<div class="deck-insights-change-summary"><button type="button" class="deck-insights-action" data-inspect="added">+${count(comparison.added)} copias agregadas</button><button type="button" class="deck-insights-action" data-inspect="removed">−${count(comparison.removed)} copias retiradas</button><span>Tierras: ${comparison.before.lands} → ${stats.lands}</span><span>MV sin tierras: ${number(comparison.before.averageManaValue)} → ${number(stats.averageManaValue)}</span></div><p class="deck-stats-note">Comparación con la lista al abrir esta edición; no guarda cambios.</p>`:'<p class="deck-stats-note">Mazo nuevo: la comparación estará disponible al editar una lista guardada.</p>'}</section>
    <section class="deck-stats-panel wide" data-inspector hidden><h4 data-inspector-title></h4><p class="deck-stats-note">Elegí una carta para ubicarla en la lista del editor. Las copias retiradas se muestran sólo como referencia.</p><div class="deck-insights-card-list"></div></section>
    <section class="deck-stats-panel wide"><h4>Señales para revisar · orientativo</h4><div class="deck-health-list">${health}</div><p class="deck-stats-note">Son puntos de partida para explorar tu lista. No bloquean el guardado ni describen un único estilo correcto.</p></section>
    </div></div>`;
  let mode=['bars','pie','table'].includes(chartMode)?chartMode:'bars',simulation=null,closed=false,watch=null;
  const close=()=>{if(closed)return;closed=true;clearInterval(watch);document.removeEventListener('keydown',keys,true);modal.remove();if(priorFocus?.isConnected)priorFocus.focus({preventScroll:true});};
  const keys=e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}
    if(e.key==='Tab'){const nodes=[...modal.querySelectorAll('button,input')].filter(n=>!n.disabled&&!n.closest('[hidden]'));const i=nodes.indexOf(document.activeElement);if(nodes.length){e.preventDefault();e.stopImmediatePropagation();nodes[(i+(e.shiftKey?nodes.length-1:1)+nodes.length)%nodes.length].focus();}}
  };
  function chart(rows,unit=''){
    const total=rows.reduce((n,r)=>n+r.value,0),max=Math.max(1,...rows.map(r=>r.value));
    if(!total)return '<p class="deck-stats-note">Sin datos en esta lista.</p>';
    const action=r=>r.group?`data-inspect="${esc(r.group)}"`:'';
    if(mode==='table')return `<table class="deck-insights-chart-table"><thead><tr><th scope="col">Grupo</th><th scope="col">${unit?'Frecuencia':'Cantidad'}</th><th scope="col">Del total</th></tr></thead><tbody>${rows.map(r=>`<tr><th scope="row">${r.group?`<button type="button" class="deck-insights-action" ${action(r)}>${esc(r.label)}</button>`:esc(r.label)}</th><td>${r.value}${unit}</td><td>${pct(r.value/total*100)}</td></tr>`).join('')}</tbody></table>`;
    if(mode==='pie'){
      let cursor=0;const stops=rows.filter(r=>r.value>0).map(r=>{const from=cursor;cursor+=r.value/total*100;return `${r.color} ${from}% ${cursor}%`;}).join(',');
      return `<div class="deck-insights-pie-wrap"><div class="deck-insights-pie" role="img" aria-label="Reparto de ${number(total)}${unit}: ver cantidades en la leyenda" data-total="${Number.isInteger(total)?total:number(total)}${unit}" style="background:conic-gradient(${stops})"></div><div class="deck-insights-legend">${rows.map(r=>r.group?`<button type="button" ${action(r)}><i class="deck-insights-swatch" style="background:${r.color}"></i>${esc(r.label)} · ${r.value}${unit} (${pct(r.value/total*100)})</button>`:`<div><i class="deck-insights-swatch" style="background:${r.color}"></i>${esc(r.label)} · ${r.value}${unit}</div>`).join('')}</div></div>`;
    }
    return rows.map(r=>`<${r.group?'button type="button"':'div'} class="deck-insights-bar-row" ${action(r)} aria-label="${esc(r.label)}: ${r.value}${unit}"><span>${esc(r.label)}</span><span class="deck-insights-bar-track"><i class="deck-insights-bar-fill" style="width:${r.value/max*100}%;background:${r.color}"></i></span><b>${r.value}${unit}</b></${r.group?'button':'div'}>`).join('');
  }
  function renderCharts(){
    for(const [key,rows] of Object.entries({curve,types,demand}))modal.querySelector(`[data-chart="${key}"]`).innerHTML=chart(rows);
    if(simulation)modal.querySelector('[data-chart="simulation"]').innerHTML=chart(simulation.landHistogram.map((value,i)=>({label:i+' tierras',value,color:palette[i]})),'%');
  }
  modal.addEventListener('change',e=>{if(e.target.name==='deck-chart-view'){mode=e.target.value;onChartMode(mode);renderCharts();}});
  modal.addEventListener('click',e=>{if(!valid()){e.preventDefault();e.stopImmediatePropagation();close();}},true);
  modal.addEventListener('click',e=>{
    const target=e.target.closest('[data-inspect]');if(!target)return;
    const group=groups.get(target.dataset.inspect);if(!group)return;
    const panel=modal.querySelector('[data-inspector]');panel.hidden=false;panel.querySelector('h4').textContent=group.label;
    const list=panel.querySelector('.deck-insights-card-list');list.replaceChildren();
    if(!group.entries.length){const p=document.createElement('p');p.className='deck-stats-note';p.textContent='No hay cartas en este grupo.';list.append(p);}
    for(const entry of group.entries){const button=document.createElement('button');button.type='button';const label=document.createElement('span');label.textContent=`${entry.count}× ${entry.card.name}`;const detail=document.createElement('small');detail.textContent=`MV ${entry.card.cmc??0} · Ver en lista`;button.append(label,detail);
      if(!entries.some(e=>(e.trackingKey||e.card.id)===(entry.trackingKey||entry.card.id))){button.disabled=true;detail.textContent='Retirada del borrador';}
      button.addEventListener('click',()=>{close();onLocate(entry);});list.append(button);}
    panel.scrollIntoView({block:'nearest'});
  });
  modal.querySelector('.deck-hand-sim-btn').addEventListener('click',()=>{
    simulation=simulateOpeningHands(entries,100);const result=modal.querySelector('.deck-hand-results');result.hidden=false;
    const metrics=[['2–4 tierras y carta MV ≤3',pct(simulation.balancedPct)],['2–4 tierras y carta MV 1–2',pct(simulation.earlyPlayPct)],['0–1 o 6–7 tierras',pct(simulation.mulliganPct)],['3–4 tierras',pct(simulation.threeFourLandsPct)],['0 tierras',pct(simulation.zeroLandPct)],['1 tierra',pct(simulation.oneLandPct)],['5+ tierras',pct(simulation.fivePlusLandsPct)],['Promedio de tierras',simulation.averageLands.toFixed(2)],['Promedio de criaturas',simulation.averageCreatures.toFixed(2)],['Con criatura',pct(simulation.creatureHandPct)]];
    result.innerHTML=metrics.map(([label,value])=>`<div class="deck-hand-metric"><strong>${value}</strong><span>${label}</span></div>`).join('');
    modal.querySelector('[data-chart="simulation"]').hidden=false;modal.querySelector('[data-simulation-note]').hidden=false;renderCharts();
  });
  modal.querySelector('.deck-hand-sim-btn').disabled=stats.total<7;
  if(stats.total<7)modal.querySelector('.deck-hand-sim-btn').title='Agregá al menos 7 cartas para simular manos completas.';
  modal.querySelector('[data-recent]').addEventListener('click',()=>{close();onRecent();});
  modal.querySelector('.deck-stats-close').addEventListener('click',close);
  modal.addEventListener('click',e=>{if(e.target===modal)close();});
  document.body.append(modal);document.addEventListener('keydown',keys,true);renderCharts();modal.querySelector('.deck-stats-close').focus();
  watch=setInterval(()=>{if(!modal.isConnected||!valid())close();},125);
  return {element:modal,close};
}
