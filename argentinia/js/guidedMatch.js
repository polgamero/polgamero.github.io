import { showGameChoice } from './gameDialogs.js';
import { GUIDED_MATCH_VERSION, LESSON_STEPS, BOARD_TOUR, lessonGoal } from './guidedMatchModel.js';
import { gameText } from './gameTexts.js';
const copy=(key,vars)=>gameText('guided.'+key,vars);
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
    html.arg-guided-board-tour :is(#local-lands,#rival-lands,#local-combat,#rival-combat,#local-support,#rival-support,#local-planeswalkers,#rival-planeswalkers){min-height:clamp(38px,9vh,96px)!important}
    .guided-match-ghosts{position:fixed;display:flex;align-items:center;justify-content:center;gap:5px;pointer-events:none;opacity:.65;overflow:hidden}
    .guided-match-ghosts[hidden]{display:none!important}
    .guided-match-ghosts .card{flex:none!important;width:var(--ghost-width)!important;min-width:var(--ghost-width)!important;max-width:var(--ghost-width)!important;height:var(--ghost-height)!important;transform:none!important;pointer-events:none!important;filter:saturate(.65)}
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
  // Presentation-only catalogue examples. Never inserted into engine zones, hands,
  // decks or inventories; their parent is inert and input remains locked by guard.
  const examples=[];
  for(const side of ['rival','local'])for(const [zone,ids] of Object.entries({lands:['tier_003','tier_005'],combat:['crea_010','crea_099'],support:['art_012','art_061'],planeswalkers:['pw_004','pw_004']})){
    const holder=document.createElement('div');holder.className='guided-match-ghosts';holder.inert=true;holder.setAttribute('aria-hidden','true');holder.hidden=true;
    for(const id of ids){const element=renderCard(id);if(element)holder.append(element);}
    shell.prepend(holder);examples.push({holder,selector:`#${side}-${zone}`});
  }
  let frame=0,closed=false,lastStep=null,allow=[],revealed='',tourPlacement=null;
  const dock=document.getElementById('solo-priority-shortcuts');
  const collapsed=dock?.classList.contains('is-collapsed');
  const setDock=next=>{
    if(!dock)return;dock.classList.toggle('is-collapsed',next);
    const toggle=dock.querySelector('#solo-priority-toggle');
    if(toggle){toggle.textContent=next?'+':'−';toggle.setAttribute('aria-expanded',String(!next));}
  };
  const current={state,stack,valid,onInvalid,steps:LESSON_STEPS,index:0,progress:{mulligan:'initial'},trace:[],confirmExit:false,fault:null,repaint:()=>paint(),
    cleanup:()=>{closed=true;cancelAnimationFrame(frame);for(const type of eventTypes)window.removeEventListener(type,guard,true);document.removeEventListener('visibilitychange',wake);window.removeEventListener('pageshow',wake);document.documentElement.classList.remove('arg-guided-match-active','arg-guided-board-tour');setDock(!!collapsed);shell.remove();},
    advance:()=>{if(current.index>=current.steps.length-1)return;const s=state();current.trace.push({step:current.steps[current.index].id,turn:s.turnCount,phase:s.phase,priority:s.priorityPlayer,stackDepth:stack().length,localHP:s.localHP,rivalHP:s.rivalHP});current.index++;
      if(current.steps[current.index].id==='sorcery-info')current.progress.sorceryHandBefore=s.rivalHand.length;
      paint();onResume();}
  };
  session=current;
  const exit=completed=>{if(closed)return;stopGuidedMatch();onExit({completed,trace:current.trace});};
  function paint(){
    if(closed)return;
    const step=current.steps[current.index];lastStep=step.id;tourPlacement=null;panel.dataset.lessonStep=step.id;panel.replaceChildren();panel.scrollTop=0;
    document.documentElement.classList.toggle('arg-guided-board-tour',BOARD_TOUR.some(row=>row.id===step.id));
    if(dock){dock.classList.remove('hidden');setDock(step.id==='smart'?false:!!collapsed);}
    const title=document.createElement('h2');title.id='guided-match-title';title.textContent=current.fault?copy('paused'):current.confirmExit?copy('exitTitle'):copy(`step.${step.id}.title`);panel.append(title);
    const body=document.createElement('p');body.textContent=current.fault?copy('fault',{reason:current.fault}):current.confirmExit?copy('exitBody'):copy(`step.${step.id}.body`);panel.append(body);
    if(!current.confirmExit&&step.preview){const holder=document.createElement('div');holder.className='guided-match-preview';holder.inert=true;const card=renderCard(step.preview);if(card)holder.append(card);panel.append(holder);}
    const status=document.createElement('small');status.dataset.guidedStatus='';status.setAttribute('role','status');panel.append(status);
    const footer=document.createElement('footer');
    if(current.fault){footer.append(button(copy('exit'),()=>exit(false)));}
    else if(current.confirmExit){footer.append(button(copy('continue'),()=>{current.confirmExit=false;paint();onResume();}),button(copy('exit'),()=>exit(false)));}
    else {
      if(step.kind==='info'){const next=button(step.finish?copy('finish'):copy('next'),()=>step.finish?exit(true):current.advance());next.dataset.guidedNext='';footer.append(next);}
      else {const instruction=document.createElement('p');instruction.className='guided-match-action';instruction.textContent=copy('action');panel.append(instruction);}
      const leave=button(copy('leave'),()=>{current.confirmExit=true;paint();});leave.dataset.guidedExit='';footer.append(leave);
    }
    panel.append(footer);panel.focus({preventScroll:true});
  }
  function geometry(){
    if(closed)return;tickGuidedMatch();if(closed)return;
    const step=current.steps[current.index],s=state();if(lastStep!==step.id)paint();
    for(const example of examples){
      const zone=document.querySelector(example.selector),r=zone?.getBoundingClientRect();
      const show=document.documentElement.classList.contains('arg-guided-board-tour')&&!!r&&r.width>0&&r.height>0;
      example.holder.hidden=!show;if(!show)continue;
      const height=Math.max(20,Math.min(r.height-6,(r.width-12)/(2*.714))),width=height*.714;
      Object.assign(example.holder.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
      example.holder.style.setProperty('--ghost-height',height+'px');example.holder.style.setProperty('--ghost-width',width+'px');
    }
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
    // One fixed dock above Smart Pass. Rival priority and transient animations
    // only change the ring; they can no longer move the explanation side to side.
    const margin=8,dockRect=dock?.getBoundingClientRect();
    const dockTop=dockRect?.height?dockRect.top:innerHeight*.5;
    panel.style.maxHeight=Math.max(90,Math.min(innerHeight-16,dockTop-16))+'px';
    panel.style.left=Math.max(margin,Math.min(dockRect?.left||margin,innerWidth-panel.offsetWidth-margin))+'px';
    panel.style.top=Math.max(margin,dockTop-panel.offsetHeight-margin)+'px';
    // The zone tour may need to expose the library underneath that dock. Choose
    // a clear place once per explanation, never in response to rival animations.
    if(document.documentElement.classList.contains('arg-guided-board-tour')&&target){
      const width=panel.offsetWidth,height=panel.offsetHeight,key=[step.id,innerWidth,innerHeight,width,height].join('|');
      if(tourPlacement?.key!==key){
        const preferred=[parseFloat(panel.style.left),parseFloat(panel.style.top)];
        const candidates=[preferred,[margin,margin],[innerWidth-width-margin,margin],[margin,innerHeight-height-margin],[innerWidth-width-margin,innerHeight-height-margin]];
        const overlap=([left,top])=>rects.reduce((sum,r)=>sum+Math.max(0,Math.min(left+width,r.right)-Math.max(left,r.left))*Math.max(0,Math.min(top+height,r.bottom)-Math.max(top,r.top)),0);
        candidates.sort((a,b)=>overlap(a)-overlap(b));tourPlacement={key,left:candidates[0][0],top:candidates[0][1]};
      }
      panel.style.left=Math.max(margin,tourPlacement.left)+'px';panel.style.top=Math.max(margin,tourPlacement.top)+'px';
    }
    const status=panel.querySelector('[data-guided-status]');
    const text=copy('progress',{current:current.index+1,total:current.steps.length,turn:s.turnCount,phase:s.phase})+(step.kind==='action'&&s.priorityPlayer==='rival'?copy('rivalPriority'):'')+(step.kind==='action'&&!selected.length?copy('waiting'):'');
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
  return showGameChoice({id:'first-game-choice',title:copy('choice.title'),message:copy('choice.body'),closeLabel:gameText('common.close'),cancelValue:'back',choices:[
    {id:'first-game-learn',label:copy('choice.learn'),value:'learn',primary:true},
    {id:'first-game-skip',label:copy('choice.skip'),value:'skip'}
  ]});
}
