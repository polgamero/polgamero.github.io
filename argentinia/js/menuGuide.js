import { MENU_GUIDE_STEPS } from './tutorialContent.js';
import { editorialViewport } from './editorialFrames.js';
import { editorialFor } from './editorialModel.js';
import { applyEditorialFrame,renderEditorialPage } from './editorialRenderer.js';
import { gameText } from './gameTexts.js';

function styles(){if(document.getElementById('arg-menu-guide-styles'))return;const style=document.createElement('style');style.id='arg-menu-guide-styles';style.textContent=`.arg-menu-guide{position:fixed;inset:0;z-index:13000;isolation:isolate;touch-action:manipulation}.arg-menu-guide-ring{position:fixed;pointer-events:none;border:3px solid #ffe19c;border-radius:9px;box-shadow:0 0 0 9999px #000c;box-sizing:border-box}.arg-menu-guide-panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(530px,calc(100vw - 28px));max-height:calc(100dvh - 24px);overflow:auto;box-sizing:border-box;border:2px solid #d4af37;border-radius:15px;background:#0c1811;color:#f4e8c7;padding:18px;box-shadow:0 15px 60px #000;font:15px/1.5 system-ui}.arg-menu-guide-panel h2{margin:0 0 8px;color:#ffe19c;font-size:23px}.arg-menu-guide-panel p{white-space:pre-wrap;margin:10px 0}.arg-menu-guide-panel footer,.arg-menu-guide-pages{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;margin-top:12px}.arg-menu-guide-panel button{min-height:42px;padding:8px 12px;border:1px solid #c4a756;border-radius:7px;background:#23301c;color:#fff0c7;font:700 14px system-ui;cursor:pointer}.arg-menu-guide-panel button:disabled{opacity:.4}.arg-menu-guide-panel button:focus-visible{outline:3px solid #a7e4ff;outline-offset:2px}.arg-menu-guide-count{font-size:12px;color:#e2c67c;text-align:center}.arg-menu-guide-exit{display:block;margin:12px auto 0;background:transparent!important}@media(max-height:420px){.arg-menu-guide-panel{padding:12px;font-size:14px}.arg-menu-guide-panel h2{font-size:19px}.arg-menu-guide-panel p{margin:6px 0}.arg-menu-guide-panel footer{margin-top:8px}}.arg-menu-guide-panel[data-viewport=mobile]{width:clamp(170px,34vw,300px);padding:10px;font-size:12px;line-height:1.35}.arg-menu-guide-panel[data-viewport=mobile] h2{font-size:17px}.arg-menu-guide-panel[data-viewport=mobile] button{min-height:36px;padding:6px 9px;font-size:12px}.arg-menu-guide-panel[data-viewport=mobile] footer{gap:5px;margin-top:7px}.arg-menu-guide-panel[data-viewport=mobile] .arg-menu-guide-exit{margin-top:7px}.arg-menu-guide-panel[data-viewport=mobile] .arg-menu-guide-count{font-size:10px}`;document.head.append(style);}
const button=(label,action)=>{const n=document.createElement('button');n.type='button';n.textContent=label;n.addEventListener('click',action);return n;};

// Visual guidance only. Never clicks a game/menu action or moves an original control.
export function showMenuGuide({menu,overrides={},valid=()=>true}={}) {
  styles();if(!menu?.isConnected)return Promise.resolve('abandoned');
  return new Promise(resolve=>{
    const previousFocus=document.activeElement,wasInert=menu.inert,places=menu.classList.contains('places-open');
    const windowScroll={x:window.scrollX,y:window.scrollY};
    const initialPanel=['menu-today-toggle','menu-news-toggle'].find(id=>menu.querySelector('#'+id)?.getAttribute('aria-expanded')==='true');
    const scrolls=[menu,...menu.querySelectorAll('*')].map(node=>({node,top:node.scrollTop,left:node.scrollLeft}));
    const shell=document.createElement('div');shell.className='arg-menu-guide';
    const ring=document.createElement('div');ring.className='arg-menu-guide-ring';ring.setAttribute('aria-hidden','true');
    const panel=document.createElement('section');panel.className='arg-menu-guide-panel';panel.tabIndex=-1;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','arg-menu-guide-title');shell.append(ring,panel);
    let index=0,page=0,closed=false,frame=0,target=null;
    const restorePresentation=()=>{menu.__setMenuPanel?.('menu-today-toggle',false,false);menu.__setMenuPanel?.('menu-news-toggle',false,false);if(initialPanel)menu.__setMenuPanel?.(initialPanel,true,false);menu.__setMenuPlaces?.(places,false);};
    const close=outcome=>{if(closed)return;closed=true;cancelAnimationFrame(frame);document.removeEventListener('keydown',keydown,true);shell.remove();window.removeEventListener('resize',resize);menu.inert=wasInert;
      if(menu.isConnected){restorePresentation();for(const s of scrolls)if(s.node.isConnected){s.node.scrollTop=s.top;s.node.scrollLeft=s.left;}if(valid()){window.scrollTo(windowScroll.x,windowScroll.y);if(previousFocus?.isConnected)previousFocus.focus?.({preventScroll:true});}}resolve(outcome);
    };
    const geometry=()=>{
      if(closed)return;if(!valid()||!menu.isConnected||!menu.getClientRects().length){close('abandoned');return;}
      const step=MENU_GUIDE_STEPS[index];target=step.selector?menu.querySelector(step.selector):null;
      if(target?.getClientRects().length){const r=target.getBoundingClientRect(),left=Math.max(2,r.left-4),top=Math.max(2,r.top-4);ring.hidden=false;shell.style.background='transparent';Object.assign(ring.style,{left:left+'px',top:top+'px',width:Math.max(0,Math.min(innerWidth-2,r.right+4)-left)+'px',height:Math.max(0,Math.min(innerHeight-2,r.bottom+4)-top)+'px'});}
      else {ring.hidden=true;shell.style.background='#000c';}
      frame=requestAnimationFrame(geometry);
    };
    const render=()=>{
      restorePresentation();const step=MENU_GUIDE_STEPS[index];
      if(step.reveal==='today')menu.__setMenuPanel?.('menu-today-toggle',true,false);
      if(step.reveal==='news')menu.__setMenuPanel?.('menu-news-toggle',true,false);
      if(step.reveal==='places'&&!menu.querySelector(step.selector)?.getClientRects().length)menu.__setMenuPlaces?.(true,false);
      const anchor=step.selector&&menu.querySelector(step.selector);anchor?.scrollIntoView?.({block:'nearest',inline:'nearest',behavior:'instant'});
      panel.style.display='flex';panel.style.flexDirection='column';panel.style.overflow='hidden';
      const custom=overrides[step.id],model=custom?editorialFor(custom):{pages:[{}]},viewport=editorialViewport();
      applyEditorialFrame(panel,model,{pageIndex:page,viewport,context:'guide'});
      panel.replaceChildren();const title=document.createElement('h2');title.style.flexShrink='0';title.id='arg-menu-guide-title';title.textContent=step.title;panel.append(title);
      // A designed page owns its heading. Keep only the hidden accessible label
      // on the dialog instead of nesting the default title around the design.
      title.hidden=!!custom;
      if(custom){page=Math.min(page,model.pages.length-1);const stage=document.createElement('div');stage.style.cssText='flex:1;min-height:0';renderEditorialPage(stage,model,{pageIndex:page,viewport,fill:true});panel.append(stage);
        if(model.pages.length>1){const pages=document.createElement('div');pages.className='arg-menu-guide-pages';const prev=button(gameText('campaign.popup.previous'),()=>{page--;render();}),next=button(gameText('campaign.popup.next'),()=>{page++;render();});prev.disabled=page===0;next.disabled=page===model.pages.length-1;const count=document.createElement('span');count.textContent=`${page+1}/${model.pages.length}`;pages.append(prev,count,next);panel.append(pages);}
      }else {const body=document.createElement('p');body.style.cssText='flex:1;min-height:0;overflow:auto';body.textContent=step.body;panel.append(body);}
      const count=document.createElement('div');count.className='arg-menu-guide-count';count.style.flexShrink='0';count.setAttribute('aria-live','polite');count.textContent=gameText('tutorial.stepCount',{current:index+1,total:MENU_GUIDE_STEPS.length,remaining:MENU_GUIDE_STEPS.length-index-1});panel.append(count);
      const actions=document.createElement('footer');actions.style.flexShrink='0';const prev=button(gameText('campaign.popup.previous'),()=>{index--;page=0;render();}),next=button(index===MENU_GUIDE_STEPS.length-1?gameText('tutorial.finish'):gameText('campaign.popup.next'),()=>{if(index===MENU_GUIDE_STEPS.length-1)close('completed');else{index++;page=0;render();}});prev.disabled=index===0;prev.dataset.guidePrev='';next.dataset.guideNext='';actions.append(prev,next);panel.append(actions);
      const exit=button(gameText('tutorial.exit'),()=>close('abandoned'));exit.className='arg-menu-guide-exit';exit.style.flexShrink='0';exit.dataset.guideExit='';panel.append(exit);panel.focus({preventScroll:true});
    };
    const keydown=event=>{if(closed)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close('abandoned');}else if(event.key==='Tab'){const nodes=[...panel.querySelectorAll('button:not(:disabled)')],i=nodes.indexOf(document.activeElement);event.preventDefault();event.stopPropagation();nodes[(i+(event.shiftKey?nodes.length-1:1))%nodes.length]?.focus();}};
    const resize=()=>{if(!closed)render();};window.addEventListener('resize',resize);
    menu.inert=true;document.addEventListener('keydown',keydown,true);document.body.append(shell);render();geometry();
  });
}
