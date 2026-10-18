// Data-only sizing contract. Dimensions describe the whole dialog, including controls.
export const EDITORIAL_FORMATS=Object.freeze(['desktop','notebook','mobile']);
const defaults=Object.freeze({
  popup:{desktop:{width:720,height:320},notebook:{width:620,height:300},mobile:{width:360,height:230}},
  guide:{desktop:{width:530,height:300},notebook:{width:500,height:300},mobile:{width:300,height:240}}
});
const dimension=(value,fallback,min,max)=>Number.isFinite(Number(value))?Math.round(Math.max(min,Math.min(max,Number(value)))):fallback;
export function normalizeEditorialFrames(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const frames={};
  for(const format of EDITORIAL_FORMATS){const row=raw[format];if(!row||typeof row!=='object')continue;
    frames[format]={width:dimension(row.width,defaults.popup[format].width,180,1920),height:dimension(row.height,defaults.popup[format].height,180,1080)};
  }
  return Object.keys(frames).length?frames:null;
}
export function editorialFrame(model,pageIndex=0,format='desktop',context='popup'){
  const key=EDITORIAL_FORMATS.includes(format)?format:'desktop';
  const frames=normalizeEditorialFrames(model?.pages?.[pageIndex]?.frames);
  return {...defaults[context==='guide'?'guide':'popup'][key],...(frames?.[key]||{})};
}
export function editorialViewport(win=window){
  if(win.document.documentElement.classList.contains('argentinia-mobile')||win.innerWidth<=1050||win.innerHeight<=600)return 'mobile';
  return win.innerWidth<=1400?'notebook':'desktop';
}
export function tutorialDocumentId(zone,step='welcome'){
  if(!/^[a-z]{1,30}$/.test(String(zone))||!/^\w{1,40}$/.test(String(step)))throw Error('Destino de tutorial inválido.');
  return `tutorial-content-${zone}${zone==='main'?'-'+step:''}`;
}
