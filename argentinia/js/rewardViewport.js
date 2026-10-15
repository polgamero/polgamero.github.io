// Presentation only. Size the card AFTER reserving real headings/actions and safe area.
export function fitRewardCardToViewport({overlay,panel,host,card,sizeOwner=card,sizeVariable='--card-w',maxWidth=300,gutter=0}={}){
  if(!overlay||!panel||!host||!card)return ()=>{};
  let frame=null,stopped=false,lastWidth=-1;
  const pixels=value=>Number.parseFloat(value)||0;
  const stop=()=>{if(stopped)return;stopped=true;if(frame!==null)cancelAnimationFrame(frame);resize?.disconnect();removed?.disconnect();window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule);};
  const fit=()=>{
    frame=null;if(stopped)return;if(!overlay.isConnected){stop();return;}
    const outer=overlay.getBoundingClientRect(),p=getComputedStyle(panel),o=getComputedStyle(overlay),h=getComputedStyle(host);
    const viewHeight=Math.min(innerHeight,window.visualViewport?.height||innerHeight,outer.height);
    const viewWidth=Math.min(innerWidth,window.visualViewport?.width||innerWidth,outer.width);
    const padY=pixels(o.paddingTop)+pixels(o.paddingBottom),padX=pixels(o.paddingLeft)+pixels(o.paddingRight);
    const panelPadY=pixels(p.paddingTop)+pixels(p.paddingBottom)+pixels(p.borderTopWidth)+pixels(p.borderBottomWidth);
    const panelPadX=pixels(p.paddingLeft)+pixels(p.paddingRight)+pixels(p.borderLeftWidth)+pixels(p.borderRightWidth);
    const siblings=[...panel.children].filter(node=>node!==host&&getComputedStyle(node).display!=='none'&&!['absolute','fixed'].includes(getComputedStyle(node).position));
    const otherHeight=siblings.reduce((sum,node)=>{const s=getComputedStyle(node);return sum+node.getBoundingClientRect().height+pixels(s.marginTop)+pixels(s.marginBottom);},0);
    const gaps=pixels(p.rowGap)*(siblings.length);
    const hostPad=pixels(h.paddingTop)+pixels(h.paddingBottom)+pixels(h.marginTop)+pixels(h.marginBottom);
    const height=Math.max(0,viewHeight-padY-panelPadY-otherHeight-gaps-hostPad-gutter);
    const width=Math.max(0,Math.min(maxWidth,viewWidth-padX-panelPadX,panel.clientWidth-panelPadX,height/1.4));
    const next=Math.floor(width*2)/2;
    if(Math.abs(next-lastWidth)>.1){lastWidth=next;sizeOwner.style.setProperty(sizeVariable,`${next}px`);}
  };
  function schedule(){if(!stopped&&frame===null)frame=requestAnimationFrame(fit);}
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
  resize?.observe(overlay);resize?.observe(panel);
  for(const node of panel.children)if(node!==host)resize?.observe(node);
  const removed=typeof MutationObserver==='function'?new MutationObserver(()=>{if(!overlay.isConnected)stop();}):null;
  removed?.observe(document.body,{childList:true});
  window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);schedule();
  return stop;
}
