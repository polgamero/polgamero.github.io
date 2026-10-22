import { showGameChoice, ensureGameDialogStyles } from './gameDialogs.js';
import { GUIDED_MATCH_VERSION, LESSON_STEPS, BOARD_TOUR, lessonGoal } from './guidedMatchModel.js';
import { gameText } from './gameTexts.js';
const copy=(key,vars)=>gameText('guided.'+key,vars);
let session=null;
export const guidedMatchActive=()=>!!session;
export const guidedMatchPaused=()=>!!(session&&(session.fault||session.confirmExit||session.explanationPending||session.steps[session.index]?.kind==='info'));
export const guidedMatchProgress=()=>session?.progress||null;
export function guidedCanPass(player){return !session||(!guidedMatchPaused()&&(player==='rival'||session.steps[session.index]?.selector==='#btn-end-turn'));}
export function notifyGuidedMulligan(stage){if(session)session.progress.mulligan=stage;tickGuidedMatch();}
export function getGuidedMatchStatus(){return session?{version:GUIDED_MATCH_VERSION,step:session.steps[session.index]?.id,index:session.index,paused:guidedMatchPaused(),fault:session.fault,autoAdvancing:session.autoAdvancing,explanationPending:session.explanationPending,explanationPage:session.explanationPage,explanationPages:session.explanationPages,trace:session.trace.map(row=>({...row}))}:null;}
export function failGuidedMatch(reason){if(session){session.fault=/^GUIDED_[A-Z_]+$/.test(reason||'')?reason:'ENGINE_ACTION_FAILED';session.repaint();}}
export function stopGuidedMatch(){const old=session;session=null;old?.cleanup();}
const visible=node=>!!node?.isConnected&&!!node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden';
function handCard(id){return `#local-hand .card[data-card-id="${id}"]`;}
export function guidedAllowedSelectors(s,step=session?.steps[session.index]){
  if(!step||step.kind==='info'||session?.explanationPending)return [];
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
  if(!current.fault&&!current.confirmExit&&!current.explanationPending&&step.kind==='action'&&lessonGoal(step.goal,s,stack,current.progress))current.advance();
}
function installStyles(){
  ensureGameDialogStyles();
  if(document.getElementById('guided-match-styles'))return;
  const style=document.createElement('style');style.id='guided-match-styles';
  style.textContent=`
    .guided-match{position:fixed;inset:0;z-index:14000;pointer-events:none;--guide-edge:max(8px,env(safe-area-inset-left))}
    .guided-match-ring{position:fixed;pointer-events:none;border:3px solid #ffe19c;border-radius:8px;box-shadow:0 0 0 9999px #0009;box-sizing:border-box}
    .guided-match-panel{position:fixed;pointer-events:auto;box-sizing:border-box;width:min(410px,44vw);height:auto;max-height:none;overflow:visible;border:2px solid #d4af37;border-radius:12px;background:#0c1811;color:#f4e8c7;padding:12px;box-shadow:0 8px 30px #000;font:15px/1.4 system-ui;overflow-wrap:anywhere}
    .guided-match-panel h2{font-size:20px;line-height:1.2;color:#ffe19c;margin:0 0 8px}
    .guided-match-panel p{margin:0;white-space:pre-wrap}
    .guided-match-copy p+p{margin-top:.35em}
    .guided-match-copy strong{color:#ffe19c;font-weight:700}
    .guided-match-controls{position:fixed;left:var(--guide-edge);bottom:max(8px,env(safe-area-inset-bottom));pointer-events:auto;color:#ead9a1;font:13px/1.35 system-ui;max-width:calc(100vw - 16px)}
    .guided-match-controls [data-guided-status]{display:block;width:fit-content;max-width:100%;padding:3px 7px;margin-bottom:5px;border-radius:5px;background:#08100ff2;text-shadow:0 1px 2px #000;overflow-wrap:anywhere}
    .guided-match-controls footer{display:flex;gap:10px;align-items:center}
    .guided-match-controls .arg-game-button{font-size:14px;padding:8px 14px;min-height:44px}
    .guided-match-controls .guided-match-next:disabled{opacity:1;background:#23301c;color:#d7c899;border-color:#9c894a;cursor:default;box-shadow:none}
    .guided-match-controls .guided-match-next:not(:disabled){background:#d4af37;color:#171d10;border-color:#ffe6a4;box-shadow:inset 0 0 0 1px #ffe8a780,inset 0 0 18px #fff1a94d,0 0 14px #e9b94470}
    .guided-match-controls .guided-match-exit{background:#52211d;color:#ffe6df;border-color:#b95145;box-shadow:inset 0 0 12px #a4342429}
    .guided-match-exit-confirm{position:absolute;bottom:calc(100% + 10px);left:0;box-sizing:border-box;width:min(360px,calc(100vw - 16px));border:2px solid #b95145;border-radius:12px;background:#1e100e;padding:12px;box-shadow:0 8px 30px #000;color:#ffe6df}
    .guided-match-exit-confirm h2{font-size:17px;margin:0 0 8px}.guided-match-exit-confirm p{font-size:13px;margin:0 0 12px}.guided-match-exit-confirm footer{flex-wrap:wrap}
    .guided-match-preview{position:fixed;pointer-events:none;overflow:visible}
    .guided-match-card-slot{position:relative;flex:none;pointer-events:none}
    #guided-match :is(.guided-match-card-slot)>.card{position:absolute;left:0;top:0;box-sizing:border-box;--card-w:180px;width:180px!important;min-width:180px!important;max-width:180px!important;height:252px!important;min-height:252px!important;max-height:252px!important;transform:scale(var(--guided-card-scale,1))!important;transform-origin:top left!important;pointer-events:none!important;transition:none!important}
    #guided-match .guided-match-card-slot>.card>.card-inner{box-sizing:border-box;width:180px!important;min-width:180px!important;max-width:180px!important;height:252px!important;min-height:252px!important;max-height:252px!important;transform:none!important;container-type:size}
    .guided-match-ghosts{position:fixed;display:flex;align-items:center;justify-content:center;gap:5px;pointer-events:none;opacity:.8;overflow:visible}
    .guided-match-ghosts[hidden]{display:none!important}
    html.arg-guided-board-tour :is(#local-lands,#rival-lands,#local-combat,#rival-combat,#local-support,#rival-support,#local-planeswalkers,#rival-planeswalkers){min-height:clamp(38px,9vh,96px)!important}
    html.arg-guided-match-active :is(#local-hand,.field-row) .card{transform:none!important;transition:none!important}
    html.arg-guided-match-active .field-row .card:not(.tapped) .card-inner{transform:none!important}
    html.arg-guided-match-active .field-row .card.tapped .card-inner{transform:rotate(90deg)!important;transform-origin:center center!important}
    html.arg-guided-match-active .field-row .card-inner{transition:none!important}
    html.arg-guided-match-active :is(.desktop-battlefield-hover-preview,.zone-card-hover-preview,.mulligan-card-hover-preview,#arg-mobile-fullscreen-retry){display:none!important}
    @media(max-height:500px){.guided-match-panel{width:min(360px,43vw);padding:9px;font-size:12px;line-height:1.35}.guided-match-panel h2{font-size:16px;margin-bottom:6px}.guided-match-controls{font-size:11px}.guided-match-controls .arg-game-button{font-size:12px;padding:7px 11px}}
  `;
  document.head.append(style);
}
const button=(label,fn)=>{const el=document.createElement('button');el.type='button';el.className='arg-game-button';el.textContent=label;el.addEventListener('click',fn);return el;};
export function startGuidedMatch({state,stack,valid,renderCard,onResume,onAdvancePriority=async()=>{},onExit,onInvalid=()=>{}}){
  stopGuidedMatch();installStyles();document.documentElement.classList.add('arg-guided-match-active');
  const shell=document.createElement('div');shell.className='guided-match';shell.id='guided-match';
  const ring=document.createElement('div');ring.className='guided-match-ring';ring.setAttribute('aria-hidden','true');
  const panel=document.createElement('section');panel.className='guided-match-panel';panel.tabIndex=-1;panel.setAttribute('role','dialog');panel.setAttribute('aria-labelledby','guided-match-title');
  const controls=document.createElement('nav');controls.className='guided-match-controls';controls.setAttribute('aria-label',copy('navigation'));
  const status=document.createElement('small');status.dataset.guidedStatus='';status.setAttribute('role','status');
  const footer=document.createElement('footer');controls.append(status,footer);
  const preview=document.createElement('div');preview.className='guided-match-preview';preview.inert=true;
  shell.append(ring,panel,preview,controls);document.body.append(shell);
  function cardSlot(id,context={}){const slot=document.createElement('div');slot.className='guided-match-card-slot';const card=renderCard(id,context);if(card)slot.append(card);return slot;}
  function sizeSlot(slot,height){slot.style.width=height*5/7+'px';slot.style.height=height+'px';slot.style.setProperty('--guided-card-scale',height/252);}
  const examples=[];
  for(const side of ['rival','local'])for(const [zone,ids] of Object.entries({lands:['tier_003','tier_005'],combat:['crea_010','crea_099'],support:['art_012','art_061'],planeswalkers:['pw_004']})){
    const holder=document.createElement('div');holder.className='guided-match-ghosts';holder.inert=true;holder.setAttribute('aria-hidden','true');holder.hidden=true;
    for(const id of ids)holder.append(cardSlot(id,{side,zone:zone==='lands'?'land':zone==='planeswalkers'?'planeswalker':zone}));
    shell.prepend(holder);examples.push({holder,selector:`#${side}-${zone}`,count:ids.length});
  }
  let frame=0,closed=false,lastStep=null,allow=[],revealed='',layoutKey='',layoutChoice=null,autoTimer=0,autoBusy=false,autoPasses=0;
  let heading=null,body=null,next=null;
  const dock=document.getElementById('solo-priority-shortcuts'),collapsed=dock?.classList.contains('is-collapsed');
  const setDock=value=>{if(!dock)return;dock.classList.toggle('is-collapsed',value);const toggle=dock.querySelector('#solo-priority-toggle');if(toggle){toggle.textContent=value?'+':'−';toggle.setAttribute('aria-expanded',String(!value));}};
  const current={state,stack,valid,onInvalid,steps:LESSON_STEPS,index:0,progress:{mulligan:'initial'},trace:[],confirmExit:false,fault:null,autoAdvancing:false,explanationPending:false,repaint:()=>paint(),
    cleanup:()=>{closed=true;cancelAnimationFrame(frame);clearTimeout(autoTimer);for(const type of eventTypes)window.removeEventListener(type,guard,true);document.removeEventListener('visibilitychange',wake);window.removeEventListener('pageshow',wake);document.documentElement.classList.remove('arg-guided-match-active','arg-guided-board-tour');setDock(!!collapsed);shell.remove();},
    advance:()=>{if(current.index>=current.steps.length-1)return;const s=state();current.trace.push({step:current.steps[current.index].id,turn:s.turnCount,phase:s.phase,priority:s.priorityPlayer,stackDepth:stack().length,localHP:s.localHP,rivalHP:s.rivalHP,automaticPriorityPasses:autoPasses});clearTimeout(autoTimer);current.autoAdvancing=false;autoPasses=0;current.index++;
      if(current.steps[current.index].id==='sorcery-info')current.progress.sorceryHandBefore=s.rivalHand.length;
      paint();onResume();}
  };
  session=current;
  const exit=completed=>{if(closed)return;stopGuidedMatch();onExit({completed,trace:current.trace});};
  function renderExplanation(text){
    body.replaceChildren();
    // Editable plain text, with paragraph breaks and labels. Never interpret HTML.
    for(const line of text.split(/\n+/)){
      const paragraph=document.createElement('p'),label=line.match(/^([^:]{1,40}:)\s*/);
      if(label){const strong=document.createElement('strong');strong.textContent=label[1];paragraph.append(strong,document.createTextNode(' '+line.slice(label[0].length)));}
      else paragraph.textContent=line;
      body.append(paragraph);
    }
  }
  function refreshNext(){
    const step=current.steps[current.index];
    current.explanationPage=1;current.explanationPages=1;
    if(!next)return;
    next.textContent=step.finish?copy('finish'):copy('next');
    next.disabled=!!current.fault||current.confirmExit||step.kind!=='info';
  }
  function paint(){
    if(closed)return;
    const step=current.steps[current.index],changed=lastStep!==step.id;lastStep=step.id;
    layoutKey='';layoutChoice=null;
    panel.dataset.lessonStep=step.id;panel.replaceChildren();preview.replaceChildren();footer.replaceChildren();controls.querySelector('.guided-match-exit-confirm')?.remove();
    document.documentElement.classList.toggle('arg-guided-board-tour',BOARD_TOUR.some(row=>row.id===step.id));
    if(dock){dock.classList.remove('hidden');setDock(step.id==='smart'?false:!!collapsed);}
    heading=document.createElement('h2');heading.id='guided-match-title';heading.textContent=current.fault?copy('paused'):copy(`step.${step.id}.title`);
    body=document.createElement('div');body.className='guided-match-copy';renderExplanation(current.fault?copy('fault',{reason:current.fault}):copy(`step.${step.id}.body`));panel.append(heading,body);
    if(step.preview&&!current.fault)preview.append(cardSlot(step.preview));
    next=button(copy('next'),()=>{if(step.kind==='info'){step.finish?exit(true):current.advance();}});next.dataset.guidedNext='';next.classList.add('guided-match-next');
    const leave=button(copy('leave'),()=>{current.confirmExit=true;paint();});leave.dataset.guidedExit='';leave.classList.add('guided-match-exit');footer.append(next,leave);refreshNext();
    if(current.confirmExit){
      const confirmation=document.createElement('section');confirmation.className='guided-match-exit-confirm';confirmation.setAttribute('role','alertdialog');confirmation.setAttribute('aria-labelledby','guided-exit-title');
      const title=document.createElement('h2');title.id='guided-exit-title';title.textContent=copy('exitTitle');const message=document.createElement('p');message.textContent=copy('exitBody');const actions=document.createElement('footer');
      const resume=button(copy('continue'),()=>{current.confirmExit=false;paint();onResume();scheduleAdvance();});const accept=button(copy('exit'),()=>exit(false));accept.classList.add('guided-match-exit');
      actions.append(resume,accept);confirmation.append(title,message,actions);controls.append(confirmation);resume.focus({preventScroll:true});
    }else panel.focus({preventScroll:true});
    if(changed)current.explanationPending=true;
  }
  function layoutExplanation(step,targets,anchored,left,margin,utility){
    // One complete explanation per lesson. Fit the box around real rendered
    // cards, rather than slicing text to fit an arbitrary highlight boundary.
    const obstacles=[];
    const add=node=>{if(visible(node)){const r=node.getBoundingClientRect();if(r.width&&r.height)obstacles.push(r);}};
    if(anchored){
      for(const node of document.querySelectorAll('#local-lands .card,#rival-lands .card,#local-combat .card,#rival-combat .card,#local-support .card,#rival-support .card,#local-planeswalkers .card,#rival-planeswalkers .card')){
        add(node);add(node.querySelector('.card-inner'));
      }
    }
    for(const node of targets){
      if(node.id==='board'||node.classList.contains('field-row'))continue;
      add(node);
    }
    for(const example of examples)if(example.selector===step.selector&&!example.holder.hidden)for(const slot of example.holder.children)add(slot);
    add(document.querySelector('#stack-container:not(.hidden)'));
    if(utility?.width&&utility.height<100)obstacles.push(utility);
    const nav=controls.getBoundingClientRect();obstacles.push(nav);
    const key=[step.id,innerWidth,innerHeight,current.fault,current.confirmExit,...obstacles.flatMap(r=>[r.left,r.top,r.right,r.bottom].map(Math.round))].join('|');
    if(key===layoutKey)return obstacles;
    layoutKey=key;
    const compact=innerHeight<500,baseFont=compact?12:15,minFont=compact?11:12;
    const defaultWidth=Math.min(compact?360:410,innerWidth*(compact?.43:.44)),minWidth=Math.min(180,defaultWidth);
    const preferredTop=anchored?Math.round(innerHeight*.30):Math.max(margin,compact?24:12,utility?.height<100?utility.bottom+margin:0);
    const widths=new Set([defaultWidth,defaultWidth*.85,defaultWidth*.7]);
    for(const r of obstacles)if(r.left-left-margin>=minWidth)widths.add(Math.min(defaultWidth,r.left-left-margin));
    const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right+margin)-Math.max(a.left,b.left-margin))*Math.max(0,Math.min(a.bottom,b.bottom+margin)-Math.max(a.top,b.top-margin));
    // Animation/render notifications must not shuffle an already clear panel.
    const existing=panel.getBoundingClientRect();
    if(layoutChoice?.viewport===innerWidth+'x'+innerHeight&&existing.left>=margin&&existing.top>=margin&&existing.right<=innerWidth-margin&&existing.bottom<=innerHeight-margin&&obstacles.every(r=>overlap(existing,r)===0))return obstacles;
    let best=null;
    for(let font=baseFont;font>=minFont;font--){
      panel.style.fontSize=font+'px';heading.style.fontSize=font*4/3+'px';
      for(const raw of widths){
        const width=Math.max(minWidth,Math.floor(raw));panel.style.width=width+'px';
        const height=panel.getBoundingClientRect().height;
        for(const side of step.id==='smart'?['right']:['left','right']){
          const x=side==='left'?left:innerWidth-margin-width;
          const ys=new Set([preferredTop,margin,nav.top-height-margin,innerHeight-height-margin]);
          for(const r of obstacles){ys.add(r.top-height-margin);ys.add(r.bottom+margin);}
          for(const rawY of ys){
            const y=Math.max(margin,Math.min(innerHeight-height-margin,rawY));
            const rect={left:x,top:y,right:x+width,bottom:y+height};
            const outside=Math.max(0,rect.bottom-innerHeight+margin)+Math.max(0,-rect.left)+Math.max(0,rect.right-innerWidth);
            const collision=obstacles.reduce((sum,r)=>sum+overlap(rect,r),0);
            const score=outside*1e8+collision*1e5+(baseFont-font)*250+(side==='right'&&step.id!=='smart'?1000:0)+Math.abs(y-preferredTop)+(defaultWidth-width)*.15;
            if(!best||score<best.score)best={x,y,width,font,side,score,collision,outside};
          }
        }
      }
    }
    Object.assign(panel.style,{left:best.x+'px',top:best.y+'px',width:best.width+'px',fontSize:best.font+'px'});heading.style.fontSize=best.font*4/3+'px';
    layoutChoice={viewport:innerWidth+'x'+innerHeight};
    panel.dataset.placement=best.side==='right'?'right':anchored?'smart-pass':'board-tour';
    panel.dataset.layoutClear=String(best.collision===0&&best.outside===0);
    const pending=current.explanationPending;current.explanationPending=false;refreshNext();
    if(pending){onResume();scheduleAdvance();}
    return obstacles;
  }
  function scheduleAdvance(){
    clearTimeout(autoTimer);if(closed||!current.autoAdvancing||guidedMatchPaused())return;
    autoTimer=setTimeout(drivePriority,160);
  }
  async function drivePriority(){
    if(closed||session!==current||!current.autoAdvancing||guidedMatchPaused()||autoBusy)return;
    tickGuidedMatch();if(closed||!current.autoAdvancing)return;
    const step=current.steps[current.index],s=state(),control=document.getElementById('btn-end-turn');
    if(!step.autoAdvance||!valid()||!s.isGuidedLearningMatch||s.currentMatch||s.currentTournamentMatch){current.autoAdvancing=false;return;}
    if(s.priorityPlayer==='local'&&control&&!control.disabled&&(s.consecutivePasses||0)<2){
      if(++autoPasses>128){failGuidedMatch('GUIDED_ADVANCE_STALLED');return;}
      autoBusy=true;try{await onAdvancePriority();}catch{failGuidedMatch('GUIDED_ADVANCE_FAILED');}finally{autoBusy=false;}
    }else if(s.priorityPlayer==='rival')onResume();
    if(!closed){tickGuidedMatch();scheduleAdvance();}
  }
  function geometry(){
    if(closed)return;tickGuidedMatch();if(closed)return;
    const step=current.steps[current.index],s=state();if(lastStep!==step.id)paint();
    for(const example of examples){
      const r=document.querySelector(example.selector)?.getBoundingClientRect();const show=document.documentElement.classList.contains('arg-guided-board-tour')&&!!r&&r.width>0&&r.height>0;
      example.holder.hidden=!show;if(!show)continue;
      const height=Math.max(8,Math.min(r.height-6,((r.width-8-(example.count-1)*5)/example.count)*7/5));
      Object.assign(example.holder.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});for(const slot of example.holder.children)sizeSlot(slot,height);
    }
    allow=current.confirmExit||current.fault||current.explanationPending?[]:guidedAllowedSelectors(s,step).filter(Boolean);
    const revealKey=step.id+'|'+allow.join('|');
    if(revealKey!==revealed){const anchor=document.querySelector(allow[0]||step.selector||'#board');if(visible(anchor)){anchor.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});revealed=revealKey;}}
    const selected=allow.flatMap(selector=>{try{return [...document.querySelectorAll(selector)].filter(visible);}catch{return [];}});
    let targets=step.kind==='action'&&selected.length?selected:[...document.querySelectorAll(step.selector||'#board')].filter(visible);
    if(step.kind==='action'&&s.priorityPlayer==='rival'&&current.progress.botHighlight)targets=[...document.querySelectorAll(current.progress.botHighlight)].filter(visible);
    if(current.confirmExit)targets=[];
    const rects=targets.map(el=>el.getBoundingClientRect());let target=null;
    if(rects.length)target={left:Math.max(2,Math.min(...rects.map(r=>r.left))-4),top:Math.max(2,Math.min(...rects.map(r=>r.top))-4),right:Math.min(innerWidth-2,Math.max(...rects.map(r=>r.right))+4),bottom:Math.min(innerHeight-2,Math.max(...rects.map(r=>r.bottom))+4)};
    ring.hidden=!target;shell.style.background=target?'transparent':'#0008';if(target)Object.assign(ring.style,{left:target.left+'px',top:target.top+'px',width:Math.max(0,target.right-target.left)+'px',height:Math.max(0,target.bottom-target.top)+'px'});
    const margin=8,dockRect=dock?.getBoundingClientRect(),left=Math.max(margin,dockRect?.left||margin);
    // Keep the middle-left preference after the board tour, but narrow/move the
    // complete explanation when a real card would be obscured.
    const anchored=current.index>=LESSON_STEPS.findIndex(row=>row.id==='land1');
    const utility=document.getElementById('argentinia-telemetry-panel')?.getBoundingClientRect();
    controls.style.left=left+'px';
    const text=copy('progress',{current:current.index+1,total:current.steps.length,turn:s.turnCount,phase:s.phase});
    if(status.textContent!==text)status.textContent=text;
    const protectedRects=layoutExplanation(step,targets,anchored,left,margin,utility);
    if(preview.firstElementChild){
      const height=Math.min(252,innerHeight-2*margin,innerHeight<500?innerHeight*.5:252),width=height*5/7;sizeSlot(preview.firstElementChild,height);
      const p=panel.getBoundingClientRect(),n=controls.getBoundingClientRect();
      const candidates=[[p.right+margin,p.top],[innerWidth*.55-width/2,margin],[innerWidth-width-margin,margin],[p.right+margin,innerHeight-height-margin]];
      const overlap=([x,y])=>[...protectedRects,p,n].reduce((sum,r)=>sum+Math.max(0,Math.min(x+width,r.right)-Math.max(x,r.left))*Math.max(0,Math.min(y+height,r.bottom)-Math.max(y,r.top)),0);
      candidates.sort((a,b)=>overlap(a)-overlap(b));Object.assign(preview.style,{left:Math.max(margin,Math.min(innerWidth-width-margin,candidates[0][0]))+'px',top:Math.max(margin,candidates[0][1])+'px',width:width+'px',height:height+'px'});
    }
    frame=requestAnimationFrame(geometry);
  }
  function guard(event){
    if(!session||closed)return;tickGuidedMatch();if(!session||closed){event.preventDefault();event.stopImmediatePropagation();return;}
    const step=current.steps[current.index];allow=current.confirmExit||current.fault||current.explanationPending?[]:guidedAllowedSelectors(state(),step).filter(Boolean);
    const target=event.target instanceof Element?event.target:null,inside=target?.closest('#guided-match .guided-match-panel,#guided-match .guided-match-controls');
    const permitted=inside||(!current.confirmExit&&allow.some(selector=>target?.closest(selector)?.isConnected));
    if(event.type==='click'&&permitted&&!current.confirmExit&&!current.fault&&target?.closest('#btn-end-turn')&&step.autoAdvance&&event.isTrusted){
      if(current.autoAdvancing){event.preventDefault();event.stopImmediatePropagation();return;}
      event.preventDefault();event.stopImmediatePropagation();current.autoAdvancing=true;autoPasses=0;autoBusy=true;
      Promise.resolve().then(()=>{if(!closed&&session===current&&!guidedMatchPaused())return onAdvancePriority();}).catch(()=>{if(!closed)failGuidedMatch('GUIDED_ADVANCE_FAILED');}).finally(()=>{autoBusy=false;if(!closed){tickGuidedMatch();scheduleAdvance();}});
      return;
    }
    if(event.type==='keydown'){
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();current.confirmExit=!current.confirmExit;paint();if(!current.confirmExit){onResume();scheduleAdvance();}return;}
      if(event.key==='Tab'){
        const nodes=[...controls.querySelectorAll('button:not(:disabled)'),...allow.flatMap(selector=>[...document.querySelectorAll(selector)].filter(visible))];const index=nodes.indexOf(document.activeElement);event.preventDefault();event.stopImmediatePropagation();const next=nodes[(index+(event.shiftKey?nodes.length-1:1)+nodes.length)%nodes.length];if(next){if(!next.matches('button'))next.tabIndex=0;next.focus({preventScroll:true});}return;
      }
      if(!permitted||!['Enter',' '].includes(event.key)||event.repeat){event.preventDefault();event.stopImmediatePropagation();return;}
      if(!inside&&target?.closest('.card')){event.preventDefault();event.stopImmediatePropagation();target.closest('.card').click();return;}
    }
    if(!permitted||['contextmenu','dblclick','dragstart'].includes(event.type)){event.preventDefault();event.stopImmediatePropagation();}
  }
  const eventTypes=['pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','click','dblclick','contextmenu','dragstart','keydown','keyup'];
  const wake=()=>{if(!closed&&document.visibilityState!=='hidden'){tickGuidedMatch();if(!closed){onResume();scheduleAdvance();}}};
  for(const type of eventTypes)window.addEventListener(type,guard,{capture:true,passive:false});document.addEventListener('visibilitychange',wake);window.addEventListener('pageshow',wake);
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
