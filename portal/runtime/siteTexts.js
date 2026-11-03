import {gameText,applyGameTextOverrides,hasGameTextKey} from '/js/gameTexts.js';
import {portalServices} from './firebasePortal.js';

export function applySiteTexts(root=document) {
  for(const node of root.querySelectorAll('[data-site-text]')) {
    const key=node.dataset.siteText;
    if(!key?.startsWith('site.')||!hasGameTextKey(key))continue;
    let variables={};try{variables=JSON.parse(node.dataset.siteVars||'{}');}catch{continue;}
    const value=gameText(key,variables),attribute=node.dataset.siteAttribute;
    if(attribute==='placeholder')node.setAttribute(attribute,value);
    else node.textContent=value;
  }
}
export async function mountSiteTexts(root=document,{services=portalServices}={}) {
  try {
    applyGameTextOverrides(await (await services()).fetchGameTexts());
    applySiteTexts(root);
    root.documentElement?.setAttribute('data-site-texts','loaded');
  } catch {
    root.documentElement?.setAttribute('data-site-texts','fallback');
  }
}
if(typeof document!=='undefined')void mountSiteTexts();
