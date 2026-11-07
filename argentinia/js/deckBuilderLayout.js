// Deckbuilder-only presentation. No account, game, clock, persistence or wire state.
import {buildDeckStatistics} from './deckStatistics.js';
import {DECK_COMPOSITION_GROUPS} from './deckComposition.js';

const palette=['#79b985','#73add6','#d28d76','#b8a0d5','#c3b9a0','#d9bb59','#8ba998'];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// This is a filter over printed types, not an in-game permanent classification.
export function deckBuilderTypeKeys(card,categoryKey){
  const type=String(card?.type||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const pairs=[['criaturas','criatura'],['instantaneos','instantaneo'],['conjuros','conjuro'],['encantamientos','encantamiento'],['artefactos','artefacto'],['planeswalkers','planeswalker'],['tierras','tierra']];
  const keys=pairs.filter(([,word])=>type.includes(word)).map(([key])=>key);
  return keys.length?keys:(categoryKey?[categoryKey]:[]);
}

// Clone only the existing canonical renderer's frame/header, without its gameplay
// listeners or discarded art. The source is the persistent pool's actual card DOM.
export function cloneDeckCardHeading(source){
  const card=source.cloneNode(false),inner=source.querySelector('.card-inner').cloneNode(false);
  card.removeAttribute('id');card.classList.add('deckbuilder-row-card');
  inner.append(source.querySelector('.card-header').cloneNode(true));card.append(inner);
  return card;
}

export function ensureDeckBuilderLayoutStyles(){
  if(document.getElementById('deckbuilder-layout-styles'))return;
  const style=document.createElement('style');style.id='deckbuilder-layout-styles';style.textContent=`
  html body #deckbuilder-overlay.deckbuilder-v2{--deckbuilder-edge:30px;--deckbuilder-pad-y:18px;--deckbuilder-side-width:330px;--deckbuilder-column-gap:20px;padding:var(--deckbuilder-pad-y) calc(var(--deckbuilder-edge) + var(--deckbuilder-side-width) + var(--deckbuilder-column-gap)) var(--deckbuilder-pad-y) var(--deckbuilder-edge)!important;box-sizing:border-box;overflow:hidden;gap:10px}
  html body #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-side{position:fixed;top:0;bottom:0;right:var(--deckbuilder-edge);width:var(--deckbuilder-side-width)!important;height:auto;box-sizing:border-box;padding:var(--deckbuilder-pad-y) 0;min-height:0}
  html body #deckbuilder-overlay.deckbuilder-v2>.deckbuilder-header.arg-screen-navigation{display:grid!important;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:12px;margin:0!important;min-height:44px;flex:0 0 auto;width:100%}
  html body #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-header>button{height:44px!important;min-height:44px!important;max-height:44px!important;width:auto!important;min-width:0!important;margin:0!important;box-sizing:border-box;padding:6px 14px!important;white-space:nowrap;font-size:14px!important}
  html body #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-header #deckbuilder-cancel{width:112px!important;min-width:112px!important;max-width:112px!important}
  html body #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-header :is(.deckbuilder-name-input,.deckbuilder-name){width:100%;min-width:0!important;max-width:none!important;height:44px!important;box-sizing:border-box;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:20px!important}
  #deckbuilder-overlay.deckbuilder-v2 #deckbuilder-error:empty{display:none!important}
  #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-tools{display:grid;grid-template-columns:clamp(140px,20vw,340px) max-content max-content 200px;justify-content:start;align-items:center;gap:12px;flex:0 0 auto;min-width:0;overflow-x:auto;padding:2px 0 4px}
  #deckbuilder-overlay.deckbuilder-v2 #deckbuilder-search{margin:0!important;width:100%;min-width:0;box-sizing:border-box;height:38px;padding:7px 11px;font-size:14px}
  #deckbuilder-overlay .deckbuilder-mana-filters{display:flex;align-items:center;gap:5px}
  #deckbuilder-overlay .deckbuilder-mana-toggle{display:grid;place-items:center;width:34px;height:34px;flex:0 0 34px;padding:3px;border-radius:50%;border:1px solid #e2bf59;background:#1e3021;box-shadow:0 0 8px #d4af3733;cursor:pointer}
  #deckbuilder-overlay .deckbuilder-mana-toggle .mana-icon{width:26px;height:26px}
  #deckbuilder-overlay .deckbuilder-mana-toggle[aria-pressed=false]{background:#111a15;border-color:#4a554c;box-shadow:none}
  #deckbuilder-overlay .deckbuilder-mana-toggle[aria-pressed=false] .mana-icon{filter:grayscale(1) brightness(.38);opacity:.6}
  #deckbuilder-overlay .deckbuilder-filter-toggle{min-height:38px;border:1px solid #d4af37;border-radius:8px;background:linear-gradient(180deg,#283421,#101b13);color:#f0dfad;padding:7px 12px;font:inherit;font-weight:700;font-size:12px;cursor:pointer;white-space:nowrap}
  #deckbuilder-overlay .deckbuilder-filter-toggle[aria-expanded=true]{box-shadow:0 0 12px #d4af3755;border-color:#ffe39b}
  #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-tools .card-browser-zoom{margin:0!important;display:flex;align-items:center;gap:7px;min-width:0;font-size:12px}
  #deckbuilder-overlay .deckbuilder-tools input[type=range]{flex:1;min-width:0;width:100%;accent-color:#d4af37;cursor:pointer}
  #deckbuilder-overlay #deckbuilder-card-zoom-value{min-width:32px;text-align:right;font-size:11px;color:#e0d1a9}
  #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-body{margin-top:0;min-height:0;flex:1;min-width:0}
  #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-pool{min-width:0}
  #deckbuilder-overlay .deckbuilder-list-surface{display:flex;flex-direction:column;flex:1;min-height:0}
  #deckbuilder-overlay .deckbuilder-side.summary-open .deckbuilder-list-surface{visibility:hidden;pointer-events:none}
  #deckbuilder-overlay .deckbuilder-side-actions{padding-right:18px;box-sizing:border-box}
  #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-list{min-height:0}
  html body #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-list-item{padding:3px 0!important;gap:4px!important;min-width:0;border:0}
  #deckbuilder-overlay .deckbuilder-list-quantity{flex:0 0 30px;text-align:center;color:#f5e4b8;font-weight:800;font-size:13px;white-space:nowrap}
  #deckbuilder-overlay .deckbuilder-variant-mark{display:block;font-size:9px;line-height:1.1;color:#d5c18d}
  html body #deckbuilder-overlay.deckbuilder-v2 button.deckbuilder-list-card-name{display:block;flex:1;min-width:0;border:0;background:transparent;border-radius:5px;padding:0!important;overflow:hidden;cursor:pointer;text-align:left}
  html body #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-row-card.card{width:100%!important;height:32px!important;aspect-ratio:auto!important;min-width:0;max-width:100%;transform:none!important;margin:0!important;pointer-events:none;box-shadow:0 1px 3px #0008}
  #deckbuilder-overlay .deckbuilder-row-card>.card-inner{height:100%!important;min-height:0;box-sizing:border-box;border-width:1px;border-radius:5px;transform:none!important}
  #deckbuilder-overlay .deckbuilder-row-card .card-header{height:100%!important;width:100%;box-sizing:border-box;padding:2px 6px;gap:5px;border-bottom:0}
  #deckbuilder-overlay .deckbuilder-row-card .card-title{font-size:clamp(9px,4cqw,13px)!important;line-height:1.1;min-width:0}
  #deckbuilder-overlay .deckbuilder-row-card .card-cost{gap:2px}
  #deckbuilder-overlay .deckbuilder-row-card :is(.mana-icon-card-cost,.mana-symbol){width:clamp(10px,5.5cqw,17px);height:clamp(10px,5.5cqw,17px)}
  #deckbuilder-overlay .deckbuilder-list-item[data-enhanced=true] .deckbuilder-row-card{outline:1px solid #ddbf58}
  #deckbuilder-overlay .deckbuilder-list-item[data-flashera=true] .deckbuilder-row-card{outline:1px solid #8dc8ec}
  :is(#deckbuilder-overlay,#mydecks-detail-grid) .deckbuilder-variant-pills{position:absolute;top:calc(var(--card-w) * .12 + 4px);right:4px;z-index:24;display:flex;flex-direction:column;align-items:flex-end;gap:clamp(1px,calc(var(--card-w) * .015),3px);max-width:calc(100% - 8px);pointer-events:none}
  html body :is(#deckbuilder-overlay.deckbuilder-v2,#mydecks-detail-grid) .deckbuilder-variant-pills>:is(.deckbuilder-flashera-marker,.deckbuilder-enhanced-marker){position:static!important;inset:auto!important;width:auto!important;max-width:100%;box-sizing:border-box;display:block;margin:0;padding:clamp(0px,calc(var(--card-w) * .01),2px) clamp(1px,calc(var(--card-w) * .025),5px)!important;border:1px solid #b7d8ec;border-radius:5px;font-size:clamp(4px,calc(var(--card-w) * .045),10px)!important;line-height:1.15;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;z-index:auto}
  html body :is(#deckbuilder-overlay.deckbuilder-v2,#mydecks-detail-grid) .deckbuilder-variant-pills>.deckbuilder-enhanced-marker{background:rgba(44,35,12,.94);border-color:#d4af37;color:#f6e1a1}
  html body :is(#deckbuilder-overlay.deckbuilder-v2,#mydecks-detail-grid) .deckbuilder-variant-pills>.deckbuilder-evolved-marker{background:rgba(100,28,32,.96);border-color:#e29484;color:#ffe5dc}
  html body #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-list-remove{flex:0 0 24px;width:24px!important;height:28px!important;font-size:16px!important}
  #deckbuilder-overlay .deckbuilder-filters-panel{position:fixed!important;z-index:10080;width:min(360px,calc(100vw - 24px))!important;max-width:none!important;flex:none;height:auto!important;max-height:var(--deckbuilder-filter-height,70dvh);overflow:auto!important;overscroll-behavior:contain;box-sizing:border-box;padding:14px!important;margin:0!important;background:#142119;border:1px solid #d4af37a6;border-radius:11px;box-shadow:0 16px 50px #000b}
  #deckbuilder-overlay .deckbuilder-filters-panel[hidden]{display:none!important}
  #deckbuilder-overlay .deckbuilder-filter-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;color:#f2d482;font-weight:800;font-size:13px}
  #deckbuilder-overlay .deckbuilder-filter-close{width:32px;height:32px;min-height:32px;border:1px solid #b99e58;border-radius:50%;background:#18281d;color:#fff0bd;cursor:pointer;font-size:21px}
  #deckbuilder-overlay .deckbuilder-filters-panel .encyclopedia-filter-section-title{font-size:12px!important;margin-top:13px}
  #deckbuilder-overlay .deckbuilder-filters-panel .encyclopedia-filter-option{font-size:12px!important;min-height:29px;gap:6px;display:flex;align-items:center}
  #deckbuilder-overlay .deckbuilder-filters-panel .encyclopedia-filter-option input{width:16px!important;height:16px!important;accent-color:#d4af37}
  #deckbuilder-overlay .deckbuilder-filters-panel .card-browser-filter-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:3px 9px}
  #deckbuilder-overlay .deckbuilder-filters-panel .card-browser-filter-grid.archetypes{grid-template-columns:1fr}
  #deckbuilder-overlay .deckbuilder-mini-toggle{position:fixed;right:0;top:var(--deckbuilder-summary-top,130px);z-index:10050;width:30px;height:56px;padding:3px 0 3px 5px;border:1px solid #d4af37;border-right:0;border-radius:100% 0 0 100% / 50% 0 0 50%;background:linear-gradient(90deg,#463d1d,#1b281a);color:#ffdf83;box-shadow:-3px 2px 12px #0008;cursor:pointer;font-size:17px}
  #deckbuilder-overlay .deckbuilder-mini-toggle[aria-expanded=true]{background:linear-gradient(90deg,#766026,#344322);box-shadow:-4px 0 15px #d4af3744}
  #deckbuilder-overlay .deckbuilder-mini-stats{position:fixed;right:var(--deckbuilder-summary-right,0px);top:var(--deckbuilder-summary-top,0px);width:var(--deckbuilder-summary-width,330px);height:var(--deckbuilder-summary-height,100dvh);z-index:10030;box-sizing:border-box;padding:12px 14px;overflow:auto;overscroll-behavior:contain;background:radial-gradient(circle at 80% 0,#2b3a24,#101c14 70%);border:1px solid #b49a4f;border-right:0;border-radius:11px 0 0 11px;box-shadow:-8px 0 24px #0008;transform:translateX(100%);visibility:hidden;transition:transform .22s ease,visibility 0s linear .22s}
  #deckbuilder-overlay .deckbuilder-mini-stats.is-open{transform:translateX(0);visibility:visible;transition-delay:0s}
  #deckbuilder-overlay .deckbuilder-mini-stats>section+section{margin-top:18px}
  #deckbuilder-overlay .deckbuilder-mini-stats h3{font-size:12px;letter-spacing:.2px;color:#efda96;margin:0 0 10px;padding-right:12px}
  #deckbuilder-overlay .deckbuilder-mini-types{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);align-items:center;gap:9px;padding-right:8px}
  #deckbuilder-overlay .deckbuilder-mini-pie{width:100%;max-width:132px;aspect-ratio:1;border-radius:50%;background:#354037;box-shadow:inset 0 0 0 1px #d4af3740}
  #deckbuilder-overlay .deckbuilder-mini-legend{list-style:none;padding:0;margin:0;display:grid;gap:5px;min-width:0}
  #deckbuilder-overlay .deckbuilder-mini-legend li{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:5px;align-items:center;font-size:11px;color:#e7dbc1}
  #deckbuilder-overlay .deckbuilder-mini-legend i{width:8px;height:8px;border-radius:2px}
  #deckbuilder-overlay .deckbuilder-mini-legend span{overflow-wrap:anywhere}
  #deckbuilder-overlay .deckbuilder-mini-curve{display:flex;gap:5px;align-items:stretch;height:142px;margin:0;padding:0;list-style:none}
  #deckbuilder-overlay .deckbuilder-mini-curve li{display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:0;color:#d8caab;font-size:10px}
  #deckbuilder-overlay .deckbuilder-mini-bar-slot{flex:1;width:100%;display:flex;align-items:flex-end;background:#ffffff07;border-bottom:1px solid #92804b}
  #deckbuilder-overlay .deckbuilder-mini-bar{width:100%;height:var(--bar-height);background:linear-gradient(0deg,#8c7130,#edcb6e);border-radius:3px 3px 0 0}
  #deckbuilder-overlay .deckbuilder-mini-curve b{font-size:11px}
  #deckbuilder-overlay :is(.deckbuilder-mana-toggle,.deckbuilder-filter-toggle,.deckbuilder-mini-toggle,.deckbuilder-filter-close,.deckbuilder-list-card-name):focus-visible{outline:2px solid #a7e4ff;outline-offset:2px}
  @media(max-width:1050px),(max-height:600px){html body #deckbuilder-overlay.deckbuilder-v2{--deckbuilder-edge:max(12px,env(safe-area-inset-right));--deckbuilder-pad-y:12px;--deckbuilder-column-gap:8px;gap:7px}#deckbuilder-overlay.deckbuilder-v2 .deckbuilder-tools{grid-template-columns:clamp(110px,20vw,210px) max-content max-content 150px;gap:8px}#deckbuilder-overlay .deckbuilder-mana-toggle{width:28px;height:28px;flex-basis:28px;padding:2px}#deckbuilder-overlay .deckbuilder-mana-toggle .mana-icon{width:23px;height:23px}}
  html.argentinia-mobile body #deckbuilder-overlay.deckbuilder-v2{--deckbuilder-side-width:min(235px,30dvw)}
  html.argentinia-mobile body #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-header{gap:7px;min-height:32px}
  html.argentinia-mobile body #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-header>button{height:32px!important;min-height:32px!important;max-height:32px!important;padding:4px 9px!important;font-size:11px!important}
  html.argentinia-mobile body #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-header #deckbuilder-stats{height:32px!important;min-height:32px!important;max-height:32px!important;font-size:11px!important}
  html.argentinia-mobile body #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-header #deckbuilder-cancel{width:84px!important;min-width:84px!important;max-width:84px!important}
  html.argentinia-mobile body #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-header :is(.deckbuilder-name-input,.deckbuilder-name){height:32px!important;font-size:13px!important;padding:4px 7px!important}
  html.argentinia-mobile body #deckbuilder-overlay.deckbuilder-v2 #deckbuilder-search{height:32px;font-size:12px!important}
  html.argentinia-mobile #deckbuilder-overlay .deckbuilder-mana-filters{gap:3px}
  html.argentinia-mobile #deckbuilder-overlay .deckbuilder-filter-toggle{min-height:32px;font-size:11px;padding:5px 8px}
  html.argentinia-mobile #deckbuilder-overlay .deckbuilder-mini-curve{height:106px}
  html.argentinia-mobile #deckbuilder-overlay .deckbuilder-mini-stats{padding:10px}
  html.argentinia-mobile #deckbuilder-overlay .deckbuilder-mini-stats>section+section{margin-top:12px}
  html.argentinia-mobile #deckbuilder-overlay .deckbuilder-mini-legend li{font-size:10px;gap:3px}
  html.argentinia-mobile #deckbuilder-overlay .deckbuilder-mini-toggle{width:26px;height:44px;font-size:15px}
  html.argentinia-mobile body #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-list-quantity{flex-basis:24px;font-size:10px}
  html.argentinia-mobile body #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-row-card.card{height:28px!important}
  html.argentinia-mobile body #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-list-remove{flex-basis:20px;width:20px!important;height:26px!important;font-size:13px!important}
  @media(max-width:600px){html body #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-header{gap:5px}html body #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-header>button{font-size:10px!important;padding:3px 5px!important}html.argentinia-mobile body #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-header #deckbuilder-stats{font-size:10px!important}html body #deckbuilder-overlay.deckbuilder-v2 .deckbuilder-header #deckbuilder-cancel{width:65px!important;min-width:65px!important;max-width:65px!important}#deckbuilder-overlay .deckbuilder-mini-types{grid-template-columns:1fr;padding-right:0}#deckbuilder-overlay .deckbuilder-mini-pie{width:75%;margin:auto}#deckbuilder-overlay .deckbuilder-mini-curve{gap:2px}}
  @media(prefers-reduced-motion:reduce){#deckbuilder-overlay .deckbuilder-mini-stats{transition:none}}
  `;document.head.append(style);
}

function summaryHTML(entries){
  const stats=buildDeckStatistics(entries);
  const labels={criaturas:'Criaturas',instantaneos:'Instantáneos',conjuros:'Conjuros',encantamientos:'Encantamientos',artefactos:'Artefactos',planeswalkers:'Semidioses',tierras:'Tierras'};
  const types=DECK_COMPOSITION_GROUPS.map((g,i)=>({key:g.key,label:labels[g.key],count:stats.typeCounts[g.key]||0,color:palette[i]}));
  let cursor=0;const stops=types.filter(t=>t.count).map(t=>{const from=cursor;cursor+=t.count/stats.total*100;return `${t.color} ${from}% ${cursor}%`;});
  const max=Math.max(1,...Object.values(stats.curve));
  return `<section data-mini-chart="types"><h3>Tipos de carta</h3><div class="deckbuilder-mini-types"><div class="deckbuilder-mini-pie" role="img" aria-label="${esc(stats.total?types.filter(t=>t.count).map(t=>t.label+': '+t.count).join(', '):'Sin cartas en el mazo')}" style="${stops.length?'background:conic-gradient('+stops.join(',')+')':''}"></div><ul class="deckbuilder-mini-legend">${types.map(t=>`<li data-mini-type="${t.key}" data-count="${t.count}"><i style="background:${t.color}"></i><span>${t.label}</span><b>${t.count}</b></li>`).join('')}</ul></div></section><section data-mini-chart="curve"><h3>Curva de maná · sin tierras</h3><ol class="deckbuilder-mini-curve">${Object.entries(stats.curve).map(([mv,count])=>`<li data-mv="${mv}" data-count="${count}" aria-label="MV ${mv}: ${count}"><b>${count}</b><div class="deckbuilder-mini-bar-slot"><i class="deckbuilder-mini-bar" style="--bar-height:${count/max*100}%"></i></div><span>${mv}</span></li>`).join('')}</ol></section>`;
}

export function mountDeckBuilderLayout({overlay,valid=()=>overlay.isConnected,onDismissPreview=()=>{}}){
  ensureDeckBuilderLayoutStyles();
  const filters=overlay.querySelector('#deckbuilder-filters-panel'),filterButton=overlay.querySelector('#deckbuilder-filter-toggle');
  const side=overlay.querySelector('.deckbuilder-side'),surface=overlay.querySelector('.deckbuilder-list-surface');
  const summary=overlay.querySelector('#deckbuilder-mini-stats'),toggle=overlay.querySelector('#deckbuilder-mini-toggle');
  let disposed=false,summaryOpen=false,watch=null;
  function geometry(){
    if(disposed||!valid())return;
    const r=side.getBoundingClientRect();
    overlay.style.setProperty('--deckbuilder-summary-top',r.top+'px');overlay.style.setProperty('--deckbuilder-summary-width',r.width+'px');overlay.style.setProperty('--deckbuilder-summary-height',r.height+'px');overlay.style.setProperty('--deckbuilder-summary-right',Math.max(0,window.innerWidth-r.right)+'px');
    if(!filters.hidden){const a=filterButton.getBoundingClientRect(),top=Math.min(a.bottom+6,Math.max(8,window.innerHeight-100));filters.style.top=top+'px';filters.style.left=Math.max(12,Math.min(a.right-filters.offsetWidth,window.innerWidth-filters.offsetWidth-12))+'px';filters.style.setProperty('--deckbuilder-filter-height',Math.max(70,window.innerHeight-top-12)+'px');}
  }
  function closeFilters(restore=false){const open=!filters.hidden;filters.hidden=true;filterButton.setAttribute('aria-expanded','false');if(restore&&open&&valid())filterButton.focus();}
  function openFilters(){if(disposed||!valid())return;onDismissPreview();filters.hidden=false;filterButton.setAttribute('aria-expanded','true');geometry();filters.querySelector('input,select,button:not(.deckbuilder-filter-close)')?.focus();}
  function showList(restore=false){summaryOpen=false;side.classList.remove('summary-open');surface.inert=false;surface.removeAttribute('aria-hidden');summary.classList.remove('is-open');summary.inert=true;summary.setAttribute('aria-hidden','true');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Mostrar resumen de estadísticas del mazo');if(restore&&valid())toggle.focus();}
  function switchSummary(){if(disposed||!valid())return;closeFilters();onDismissPreview();if(summaryOpen){showList();return;}summaryOpen=true;geometry();side.classList.add('summary-open');surface.inert=true;surface.setAttribute('aria-hidden','true');summary.inert=false;summary.setAttribute('aria-hidden','false');summary.classList.add('is-open');toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-label','Volver a la lista de cartas del mazo');}
  const onToggleFilters=()=>filters.hidden?openFilters():closeFilters(true);
  const onCloseFilters=()=>closeFilters(true);
  const outside=e=>{if(!disposed&&!filters.hidden&&!filters.contains(e.target)&&!filterButton.contains(e.target))closeFilters();};
  const keys=e=>{if(disposed||e.key!=='Escape'||!overlay.contains(e.target))return;if(!filters.hidden){closeFilters(true);}else if(summaryOpen){showList(true);}else if(overlay.querySelector('.deckbuilder-card-preview.visible')){onDismissPreview();}else return;e.preventDefault();e.stopImmediatePropagation();};
  function dispose(){if(disposed)return;closeFilters();showList();onDismissPreview();disposed=true;clearInterval(watch);resize?.disconnect();observer.disconnect();window.removeEventListener('resize',geometry);document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',keys,true);filterButton.removeEventListener('click',onToggleFilters);filters.querySelector('.deckbuilder-filter-close').removeEventListener('click',onCloseFilters);toggle.removeEventListener('click',switchSummary);}
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(geometry):null;resize?.observe(side);resize?.observe(overlay);
  const observer=new MutationObserver(()=>{if(!overlay.isConnected)dispose();});observer.observe(document.body,{childList:true});
  filterButton.addEventListener('click',onToggleFilters);filters.querySelector('.deckbuilder-filter-close').addEventListener('click',onCloseFilters);toggle.addEventListener('click',switchSummary);
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',keys,true);window.addEventListener('resize',geometry);
  summary.inert=true;watch=setInterval(()=>{if(!valid())dispose();},250);geometry();
  return {openFilters,closeFilters,showList,dispose,update(entries){if(!disposed&&valid()){summary.innerHTML=summaryHTML(entries);geometry();}}};
}
