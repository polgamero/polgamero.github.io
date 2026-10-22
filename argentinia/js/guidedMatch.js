import { GUIDED_MATCH_VERSION, LESSON_STEPS, lessonGoal } from './guidedMatchModel.js';
let session=null;
export const guidedMatchActive=()=>!!session;
export const guidedMatchPaused=()=>!!(session&&(session.fault||session.confirmExit||session.steps[session.index]?.kind==='info'));
export const guidedMatchProgress=()=>session?.progress||null;
export function guidedCanPass(player){return !session||(!guidedMatchPaused()&&(player==='rival'||session.steps[session.index]?.selector==='#btn-end-turn'));}
export function notifyGuidedMulligan(stage){if(session)session.progress.mulligan=stage;tickGuidedMatch();}
export function getGuidedMatchStatus(){return session?{version:GUIDED_MATCH_VERSION,step:session.steps[session.index]?.id,index:session.index,paused:guidedMatchPaused(),fault:session.fault,trace:session.trace.map(row=>({...row}))}:null;}
export function failGuidedMatch(reason){if(session){session.fault=/^GUIDED_[A-Z_]+$/.test(reason||'')?reason:'ENGINE_ACTION_FAILED';session.repaint();}}
export function stopGuidedMatch(){const old=session;session=null;old?.cleanup();}
const visible=node=>!!node?.isConnected&&!!node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden';
function handCard(id){return `#local-hand .card[data-card-id="${id}"]`;}
export function guidedAllowedSelectors(s,step=session?.steps[session.index]){
  if(!step||step.kind==='info')return [];
  if(step.id==='bottom')return ['#mulligan-overlay .card[data-card-id="crea_098"]','#btn-confirm-bottom'];
  if(step.cast){
    const pending=!!s.pendingCastTransaction||s.pendingSpellIndex!==null||!!s.pendingTargetCard||!!s.pendingCost;
    if(!pending)return [handCard(step.cast)];
    if(s.pendingCastTransaction?.stage==='targets')return step.playerTarget?['.rival-card']:[];
    if(s.pendingCastTransaction&&s.pendingCastTransaction.stage!=='payment')return [];
    const sources=['#local-lands .card:not(.tapped)'];
    if(step.cast==='pw_004')sources.push('#local-support .card[data-card-id="art_012"]:not(.tapped)');
    if(step.playerTarget)sources.push('.rival-card');
    return sources;
  }
  if(step.block)return ['#local-combat .card[data-card-id="crea_010"]','#rival-combat .card[data-card-id="crea_099"]'];
  if(step.loyalty)return ['#local-planeswalkers .card[data-card-id="pw_004"]','.gy-modal-overlay .loyalty-ability-btn[data-idx="0"]','.rival-card'];
  return [step.selector];
}
export function tickGuidedMatch(){
  const current=session;if(!current)return;
  if(!current.valid()){
    // The guide may outlive a sign-out while an engine callback is awaiting.
    // Abort its own Solo practice; never tear down a subsequently opened PvP match.
    stopGuidedMatch();current.onInvalid();return;
  }
  const s=current.state(),stack=current.stack(),step=current.steps[current.index];
  if(s.gameOver&&!current.fault){failGuidedMatch('GUIDED_UNEXPECTED_GAME_OVER');return;}
  if(!current.fault&&!current.confirmExit&&step.kind==='action'&&lessonGoal(step.goal,s,stack,current.progress))current.advance();
}
function installStyles(){
  if(document.getElementById('guided-match-styles'))return;
  const style=document.createElement('style');style.id='guided-match-styles';
  style.textContent=`.guided-match{position:fixed;inset:0;z-index:14000;pointer-events:none}.guided-match-ring{position:fixed;pointer-events:none;border:3px solid #ffe19c;border-radius:8px;box-shadow:0 0 0 9999px #0009;box-sizing:border-box}.guided-match-panel{position:fixed;pointer-events:auto;box-sizing:border-box;width:min(390px,calc(100vw - 20px));max-height:calc(100dvh - 16px);overflow:auto;border:2px solid #d4af37;border-radius:12px;background:#0c1811;color:#f4e8c7;padding:14px;box-shadow:0 8px 30px #000;font:15px/1.4 system-ui}.guided-match-panel h2{font-size:20px;color:#ffe19c;margin:0 0 8px}.guided-match-panel p{margin:8px 0}.guided-match-panel footer{display:flex;gap:8px;flex-wrap:wrap}.guided-match-panel button{min-height:44px;padding:8px 12px;border:1px solid #c4a756;border-radius:6px;background:#23301c;color:#fff0c7;font:700 14px system-ui;cursor:pointer}.guided-match-panel small{display:block;color:#d8c68e;margin:7px 0}.guided-match-preview{display:flex;justify-content:center;pointer-events:none;margin:10px 0}.guided-match-preview>.card{width:180px!important;height:252px!important;min-width:180px!important;max-width:180px!important;transform:none!important}.guided-match-action{border-left:3px solid #e5ba57;padding-left:8px}@media(max-height:500px){.guided-match-panel{width:min(290px,38vw);padding:10px;font-size:12px;line-height:1.3}.guided-match-panel h2{font-size:16px}.guided-match-panel button{font-size:12px;padding:5px 8px}.guided-match-preview>.card{width:125px!important;min-width:125px!important;max-width:125px!important;height:175px!important}}`;
  // A battlefield hover can grow the selected blocker over the rival attacker,
  // changing the hit target while the user is moving between the two cards.
  // Lesson cards stay at their real footprints; the panel owns enlarged previews.
  style.textContent+=`
    html.arg-guided-match-active :is(#local-hand,.field-row) .card{transform:none!important;transition:none!important}
    html.arg-guided-match-active .field-row .card:not(.tapped) .card-inner{transform:none!important}
    html.arg-guided-match-active .field-row .card.tapped .card-inner{transform:rotate(90deg)!important;transform-origin:center center!important}
    html.arg-guided-match-active .field-row .card-inner{transition:none!important}
    html.arg-guided-match-active :is(.desktop-battlefield-hover-preview,.zone-card-hover-preview,.mulligan-card-hover-preview,#arg-mobile-fullscreen-retry){display:none!important}
  `;
  document.head.append(style);
}
const button=(label,fn)=>{const element=document.createElement('button');element.type='button';element.textContent=label;element.addEventListener('click',fn);return element;};
export function startGuidedMatch({state,stack,valid,renderCard,onResume,onExit,onInvalid=()=>{}}){
  stopGuidedMatch();installStyles();
  document.documentElement.classList.add('arg-guided-match-active');
  const shell=document.createElement('div');shell.className='guided-match';shell.id='guided-match';
  const ring=document.createElement('div');ring.className='guided-match-ring';ring.setAttribute('aria-hidden','true');
  const panel=document.createElement('section');panel.className='guided-match-panel';panel.tabIndex=-1;panel.setAttribute('role','dialog');panel.setAttribute('aria-labelledby','guided-match-title');
  shell.append(ring,panel);document.body.append(shell);
  let frame=0,closed=false,lastStep=null,allow=[],revealed='';
  const dock=document.getElementById('solo-priority-shortcuts');
  const collapsed=dock?.classList.contains('is-collapsed');
  const setDock=next=>{
    if(!dock)return;dock.classList.toggle('is-collapsed',next);
    const toggle=dock.querySelector('#solo-priority-toggle');
    if(toggle){toggle.textContent=next?'+':'−';toggle.setAttribute('aria-expanded',String(!next));}
  };
  const current={state,stack,valid,onInvalid,steps:LESSON_STEPS,index:0,progress:{mulligan:'initial'},trace:[],confirmExit:false,fault:null,repaint:()=>paint(),
    cleanup:()=>{closed=true;cancelAnimationFrame(frame);for(const type of eventTypes)window.removeEventListener(type,guard,true);document.removeEventListener('visibilitychange',wake);window.removeEventListener('pageshow',wake);document.documentElement.classList.remove('arg-guided-match-active');setDock(!!collapsed);shell.remove();},
    advance:()=>{if(current.index>=current.steps.length-1)return;const s=state();current.trace.push({step:current.steps[current.index].id,turn:s.turnCount,phase:s.phase,priority:s.priorityPlayer,stackDepth:stack().length,localHP:s.localHP,rivalHP:s.rivalHP});current.index++;
      if(current.steps[current.index].id==='depth2')current.progress.doubleHandBefore=s.rivalHand.length;
      if(current.steps[current.index].id==='sorcery-info')current.progress.sorceryHandBefore=s.rivalHand.length;
      paint();onResume();}
  };
  session=current;
  const exit=completed=>{if(closed)return;stopGuidedMatch();onExit({completed,trace:current.trace});};
  function paint(){
    if(closed)return;
    const step=current.steps[current.index];lastStep=step.id;panel.dataset.lessonStep=step.id;panel.replaceChildren();
    if(dock){dock.classList.remove('hidden');setDock(step.id==='smart'?false:!!collapsed);}
    const title=document.createElement('h2');title.id='guided-match-title';title.textContent=current.fault?'Práctica pausada':current.confirmExit?'¿Salir de la práctica?':step.title;panel.append(title);
    const body=document.createElement('p');body.textContent=current.fault?`El motor no confirmó la jugada preparada. No avanzamos con un resultado inventado. Diagnóstico: ${current.fault}. Podés salir sin penalidad y reiniciar desde el manual.`:current.confirmExit?'No perdés puntos. Podés volver a empezar desde el manual.':step.body;panel.append(body);
    if(!current.confirmExit&&step.preview){const holder=document.createElement('div');holder.className='guided-match-preview';holder.inert=true;const card=renderCard(step.preview);if(card)holder.append(card);panel.append(holder);}
    const status=document.createElement('small');status.dataset.guidedStatus='';status.setAttribute('role','status');panel.append(status);
    const footer=document.createElement('footer');
    if(current.fault){footer.append(button('Salir al menú',()=>exit(false)));}
    else if(current.confirmExit){footer.append(button('Seguir aprendiendo',()=>{current.confirmExit=false;paint();onResume();}),button('Salir al menú',()=>exit(false)));}
    else {
      if(step.kind==='info'){const next=button(step.finish?'Terminar práctica':'Siguiente',()=>step.finish?exit(true):current.advance());next.dataset.guidedNext='';footer.append(next);}
      else {const instruction=document.createElement('p');instruction.className='guided-match-action';instruction.textContent='Hacé la acción resaltada en la mesa. El tutorial continúa cuando el motor confirma el resultado.';panel.append(instruction);}
      const leave=button('Salir del tutorial',()=>{current.confirmExit=true;paint();});leave.dataset.guidedExit='';footer.append(leave);
    }
    panel.append(footer);panel.focus({preventScroll:true});
  }
  function geometry(){
    if(closed)return;tickGuidedMatch();if(closed)return;
    const step=current.steps[current.index],s=state();if(lastStep!==step.id)paint();
    allow=current.confirmExit||current.fault?[]:guidedAllowedSelectors(s,step).filter(Boolean);
    const revealKey=step.id+'|'+allow.join('|');
    if(revealKey!==revealed){
      // The London bottom card can be at the far end of a scrollable mobile row.
      // Reveal it without accepting a drag on an unrelated card.
      const anchor=document.querySelector(allow[0]||step.selector||'#board');
      if(visible(anchor)){anchor.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});revealed=revealKey;}
    }
    const selected=allow.map(selector=>{try{return [...document.querySelectorAll(selector)].filter(visible);}catch{return [];}}).flat();
    let targets=step.kind==='action'&&selected.length?selected:[...document.querySelectorAll(step.selector||'#board')].filter(visible);
    if(step.kind==='action'&&s.priorityPlayer==='rival'&&current.progress.botHighlight)targets=[...document.querySelectorAll(current.progress.botHighlight)].filter(visible);
    if(current.confirmExit)targets=[];
    const rects=targets.map(element=>element.getBoundingClientRect());
    let target=null;
    if(rects.length){target={left:Math.max(2,Math.min(...rects.map(r=>r.left))-4),top:Math.max(2,Math.min(...rects.map(r=>r.top))-4),right:Math.min(innerWidth-2,Math.max(...rects.map(r=>r.right))+4),bottom:Math.min(innerHeight-2,Math.max(...rects.map(r=>r.bottom))+4)};}
    ring.hidden=!target;shell.style.background=target?'transparent':'#0008';
    if(target)Object.assign(ring.style,{left:target.left+'px',top:target.top+'px',width:Math.max(0,target.right-target.left)+'px',height:Math.max(0,target.bottom-target.top)+'px'});
    const width=panel.offsetWidth,height=panel.offsetHeight,margin=8;
    const right=innerWidth-width-margin,bottom=innerHeight-height-margin,middleX=(innerWidth-width)/2,middleY=(innerHeight-height)/2;
    const candidates=[[margin,margin],[right,margin],[margin,bottom],[right,bottom],[margin,middleY],[right,middleY],[middleX,margin],[middleX,bottom]];
    // Score the actual controls, not the empty space between player target and
    // mana sources. This leaves the panel free to sit between two distant zones.
    const overlap=([left,top])=>rects.reduce((sum,r)=>sum+Math.max(0,Math.min(left+width,r.right)-Math.max(left,r.left))*Math.max(0,Math.min(top+height,r.bottom)-Math.max(top,r.top)),0);
    candidates.sort((a,b)=>overlap(a)-overlap(b));const [left,top]=candidates[0];
    panel.style.left=Math.max(margin,left)+'px';panel.style.top=Math.max(margin,top)+'px';
    const status=panel.querySelector('[data-guided-status]');
    const text=`Paso ${current.index+1}/${current.steps.length} · Turno ${s.turnCount} · ${s.phase}${step.kind==='action'&&s.priorityPlayer==='rival'?' · El Tano tiene prioridad':''}${step.kind==='action'&&!selected.length?' · Esperando el control del juego…':''}`;
    if(status.textContent!==text)status.textContent=text;
    frame=requestAnimationFrame(geometry);
  }
  function guard(event){
    if(!session||closed)return;
    tickGuidedMatch();if(!session||closed){event.preventDefault();event.stopImmediatePropagation();return;}
    // Recompute synchronously: a double-click can arrive before the next frame,
    // after render() has already confirmed a goal and advanced the lesson.
    allow=current.confirmExit||current.fault?[]:guidedAllowedSelectors(state(),current.steps[current.index]).filter(Boolean);
    const target=event.target instanceof Element?event.target:null;
    const inside=target?.closest('#guided-match .guided-match-panel');
    const permitted=inside||(!current.confirmExit&&allow.some(selector=>{const element=target?.closest(selector);return element?.isConnected;}));
    if(event.type==='keydown'){
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();current.confirmExit=true;paint();return;}
      if(event.key==='Tab'){
        const nodes=[...panel.querySelectorAll('button:not(:disabled)'),...allow.flatMap(selector=>[...document.querySelectorAll(selector)].filter(visible))];
        const index=nodes.indexOf(document.activeElement);event.preventDefault();event.stopImmediatePropagation();const next=nodes[(index+(event.shiftKey?nodes.length-1:1)+nodes.length)%nodes.length];if(next){if(!next.matches('button'))next.tabIndex=0;next.focus({preventScroll:true});}return;
      }
      if(!permitted||!['Enter',' '].includes(event.key)||event.repeat){event.preventDefault();event.stopImmediatePropagation();return;}
      if(!inside&&target?.closest('.card')){event.preventDefault();event.stopImmediatePropagation();target.closest('.card').click();return;}
    }
    if(!permitted||['contextmenu','dblclick','dragstart'].includes(event.type)){event.preventDefault();event.stopImmediatePropagation();}
  }
  const eventTypes=['pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','click','dblclick','contextmenu','dragstart','keydown','keyup'];
  const wake=()=>{if(!closed&&document.visibilityState!=='hidden'){tickGuidedMatch();if(!closed)onResume();}};
  for(const type of eventTypes)window.addEventListener(type,guard,{capture:true,passive:false});
  document.addEventListener('visibilitychange',wake);window.addEventListener('pageshow',wake);
  paint();geometry();return current;
}

export function learningPreference(uid){try{return localStorage.getItem(`${GUIDED_MATCH_VERSION}:${uid||'guest'}`)||'';}catch{return '';}}
export function rememberLearningPreference(uid,value){try{localStorage.setItem(`${GUIDED_MATCH_VERSION}:${uid||'guest'}`,value);}catch{}}
export function showFirstGameChoice(){
  installStyles();return new Promise(resolve=>{
    const overlay=document.createElement('div');overlay.id='first-game-choice';overlay.className='guided-match';overlay.style.cssText+='pointer-events:auto;background:#000b;z-index:15000';
    const panel=document.createElement('section');panel.className='guided-match-panel';panel.style.cssText='left:50%;top:50%;transform:translate(-50%,-50%);width:min(430px,calc(100vw - 24px))';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.tabIndex=-1;
    const heading=document.createElement('h2');heading.id='first-game-title';heading.textContent='¿Primera vez que jugás?';panel.setAttribute('aria-labelledby',heading.id);
    const copy=document.createElement('p');copy.textContent='Aprendé jugando una práctica corta y dirigida contra El Tano, con mazos preparados y sin premios ni penalidades.';
    const finish=value=>{overlay.remove();window.removeEventListener('keydown',keys,true);resolve(value);};
    const quick=button('Quiero aprender rápido',()=>finish('learn'));quick.id='first-game-learn';
    const skip=button('Ya sé jugar',()=>finish('skip'));skip.id='first-game-skip';
    const back=button('Volver',()=>finish('back'));
    const keys=event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finish('back');}else if(event.key==='Tab'){const nodes=[quick,skip,back],i=nodes.indexOf(document.activeElement);event.preventDefault();nodes[(i+(event.shiftKey?2:1)+3)%3].focus();}else event.stopPropagation();};
    window.addEventListener('keydown',keys,true);panel.append(heading,copy,quick,skip,back);overlay.append(panel);document.body.append(overlay);quick.focus();
  });
}
