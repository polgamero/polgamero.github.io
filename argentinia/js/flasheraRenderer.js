// Flasheras Stage28 — renderer visual canónico, presentation-only.
// No conoce economía, Firestore ni ownership: recibe una carta ya marcada como Flashera
// y aplica el mismo acabado visual en cualquier superficie del juego.

export const FLASHERA_RENDERER_VERSION = 1;
export const DEFAULT_FLASHERA_EFFECT_ID = 'prisma-federal';
export const FLASHERA_RENDER_MODES = Object.freeze(['full','standard','compact']);

export const FLASHERA_EFFECTS = Object.freeze([
  Object.freeze({ id:'prisma-federal', name:'Prisma Federal', motion:true }),
  Object.freeze({ id:'aurora-austral', name:'Aurora Austral', motion:true }),
  Object.freeze({ id:'metal-liquido', name:'Metal Líquido', motion:true }),
  Object.freeze({ id:'vidrio-tornasol', name:'Vidrio Tornasol', motion:true }),
  Object.freeze({ id:'cielo-estrellado', name:'Cielo Estrellado', motion:true }),
  Object.freeze({ id:'cristal-quebrado', name:'Cristal Quebrado', motion:false }),
  Object.freeze({ id:'fuego-fatuo', name:'Fuego Fatuo', motion:true }),
  Object.freeze({ id:'holograma-pampeano', name:'Holograma Pampeano', motion:true }),
  Object.freeze({ id:'tormenta-electrica', name:'Tormenta Eléctrica', motion:true }),
  Object.freeze({ id:'espejo-negro', name:'Espejo Negro', motion:true })
]);

const EFFECT_IDS = new Set(FLASHERA_EFFECTS.map(row => row.id));
const STYLE_ID = 'arg-flashera-renderer-v1-style';
const FX_CLASS = 'arg-flashera-fx';
let observer = null;
let globalEffectId = DEFAULT_FLASHERA_EFFECT_ID;
let globalVisualEnabled = true;
const boundCards = new WeakSet();

const clamp = (value,min,max) => Math.max(min,Math.min(max,Number(value)||0));
export function normalizeFlasheraEffectId(value, fallback=DEFAULT_FLASHERA_EFFECT_ID){
  const id=String(value||'').trim().toLowerCase();
  return EFFECT_IDS.has(id)?id:fallback;
}
export function normalizeFlasheraRenderMode(value, fallback='standard'){
  const mode=String(value||'').trim().toLowerCase();
  return FLASHERA_RENDER_MODES.includes(mode)?mode:fallback;
}
export function flasheraEffectDefinition(effectId){return FLASHERA_EFFECTS.find(row=>row.id===normalizeFlasheraEffectId(effectId))||FLASHERA_EFFECTS[0];}
export function listFlasheraEffects(){return FLASHERA_EFFECTS.map(row=>({...row}));}

function styles(){return `
/* === Argentinia · FLASHERAS Stage28 ======================================= */
.card.flashera-card{--arg-fl-x:50%;--arg-fl-y:50%;--arg-fl-tilt-x:0;--arg-fl-tilt-y:0;--arg-fl-intensity:1;}
.card.flashera-card>.card-inner{position:relative;isolation:isolate;}
.card.flashera-card>.card-inner>.${FX_CLASS}{position:absolute;inset:0;z-index:92;border-radius:inherit;overflow:hidden;pointer-events:none;mix-blend-mode:normal;opacity:var(--arg-fl-intensity);contain:paint;}
.card.flashera-card>.card-inner>.${FX_CLASS}::before,.card.flashera-card>.card-inner>.${FX_CLASS}::after{content:"";position:absolute;inset:-18%;pointer-events:none;border-radius:inherit;transform:translateZ(0);will-change:transform,background-position,opacity;}
.card.flashera-card[data-flashera-mode="standard"]{--arg-fl-intensity:.82;}
.card.flashera-card[data-flashera-mode="compact"]{--arg-fl-intensity:.54;}
.card.flashera-card[data-flashera-mode="compact"]>.card-inner>.${FX_CLASS}::after{display:none;}
.card.flashera-card[data-flashera-mode="compact"]>.card-inner>.${FX_CLASS}::before{animation:none!important;will-change:auto;}
.card.flashera-card[data-flashera-visual="off"]>.card-inner>.${FX_CLASS}{display:none!important;}

.card.flashera-card[data-flashera-effect="prisma-federal"]>.card-inner>.${FX_CLASS}::before{background:linear-gradient(118deg,rgba(255,40,80,.12),rgba(255,205,40,.22),rgba(60,255,160,.20),rgba(70,180,255,.22),rgba(155,80,255,.22),rgba(255,70,145,.16));background-size:220% 220%;background-position:var(--arg-fl-x) var(--arg-fl-y);mix-blend-mode:color-dodge;opacity:.68;animation:arg-fl-prisma 7s linear infinite;}
.card.flashera-card[data-flashera-effect="prisma-federal"]>.card-inner>.${FX_CLASS}::after{background:radial-gradient(circle at var(--arg-fl-x) var(--arg-fl-y),rgba(255,255,255,.58),rgba(255,255,255,.12) 17%,transparent 42%);mix-blend-mode:screen;opacity:.58;}
@keyframes arg-fl-prisma{0%{filter:hue-rotate(0deg);transform:translate3d(-2%,0,0) rotate(-1deg)}50%{filter:hue-rotate(24deg);transform:translate3d(2%,1%,0) rotate(1deg)}100%{filter:hue-rotate(0deg);transform:translate3d(-2%,0,0) rotate(-1deg)}}

.card.flashera-card[data-flashera-effect="aurora-austral"]>.card-inner>.${FX_CLASS}::before{background:radial-gradient(ellipse at 18% 90%,rgba(0,255,166,.52),transparent 44%),radial-gradient(ellipse at 74% 8%,rgba(97,92,255,.48),transparent 46%),radial-gradient(ellipse at var(--arg-fl-x) var(--arg-fl-y),rgba(235,83,255,.36),transparent 38%);mix-blend-mode:screen;filter:blur(7px);opacity:.72;animation:arg-fl-aurora 8s ease-in-out infinite alternate;}
.card.flashera-card[data-flashera-effect="aurora-austral"]>.card-inner>.${FX_CLASS}::after{background:linear-gradient(105deg,transparent 15%,rgba(125,255,215,.24) 38%,transparent 58%,rgba(137,100,255,.22) 76%,transparent);mix-blend-mode:overlay;opacity:.7;animation:arg-fl-drift 10s linear infinite;}
@keyframes arg-fl-aurora{to{transform:translate3d(8%,-5%,0) scale(1.07) rotate(3deg)}}

.card.flashera-card[data-flashera-effect="metal-liquido"]>.card-inner>.${FX_CLASS}::before{background:linear-gradient(112deg,transparent 18%,rgba(255,255,255,.10) 28%,rgba(255,255,255,.76) 42%,rgba(84,220,255,.18) 48%,rgba(255,255,255,.62) 55%,transparent 70%);background-size:250% 100%;background-position:calc(var(--arg-fl-x) * 1.2) 50%;mix-blend-mode:screen;opacity:.78;animation:arg-fl-metal 5.5s ease-in-out infinite;}
.card.flashera-card[data-flashera-effect="metal-liquido"]>.card-inner>.${FX_CLASS}::after{background:radial-gradient(circle at var(--arg-fl-x) var(--arg-fl-y),rgba(255,255,255,.68),rgba(160,220,240,.10) 24%,transparent 46%);mix-blend-mode:soft-light;opacity:.85;}
@keyframes arg-fl-metal{0%,100%{background-position:-90% 50%}50%{background-position:180% 50%}}

.card.flashera-card[data-flashera-effect="vidrio-tornasol"]>.card-inner>.${FX_CLASS}::before{background:conic-gradient(from 210deg at var(--arg-fl-x) var(--arg-fl-y),rgba(255,95,148,.28),rgba(255,217,92,.21),rgba(104,255,226,.28),rgba(112,159,255,.30),rgba(214,117,255,.28),rgba(255,95,148,.28));mix-blend-mode:color-dodge;opacity:.66;animation:arg-fl-spin 11s linear infinite;}
.card.flashera-card[data-flashera-effect="vidrio-tornasol"]>.card-inner>.${FX_CLASS}::after{background:linear-gradient(132deg,transparent 25%,rgba(255,255,255,.32) 44%,transparent 61%);mix-blend-mode:screen;opacity:.55;transform:translateX(calc((var(--arg-fl-tilt-y))*1%));}

.card.flashera-card[data-flashera-effect="cielo-estrellado"]>.card-inner>.${FX_CLASS}::before{background:radial-gradient(circle at 13% 18%,#fff 0 1px,transparent 1.7px),radial-gradient(circle at 76% 21%,#fff7b5 0 1.1px,transparent 1.9px),radial-gradient(circle at 38% 68%,#bce9ff 0 1px,transparent 1.8px),radial-gradient(circle at 87% 79%,#fff 0 1.2px,transparent 2px),radial-gradient(circle at 52% 43%,rgba(255,255,255,.9) 0 1px,transparent 1.8px);background-size:37px 41px,53px 49px,43px 47px,61px 57px,71px 67px;mix-blend-mode:screen;opacity:.74;animation:arg-fl-stars 9s linear infinite;}
.card.flashera-card[data-flashera-effect="cielo-estrellado"]>.card-inner>.${FX_CLASS}::after{background:radial-gradient(circle at var(--arg-fl-x) var(--arg-fl-y),rgba(175,215,255,.34),transparent 34%);mix-blend-mode:screen;opacity:.8;}
@keyframes arg-fl-stars{to{background-position:37px -41px,-53px 49px,43px -47px,-61px -57px,71px 67px}}

.card.flashera-card[data-flashera-effect="cristal-quebrado"]>.card-inner>.${FX_CLASS}::before{background:conic-gradient(from 8deg at 24% 31%,transparent 0 11deg,rgba(255,255,255,.36) 11.5deg 13deg,transparent 14deg 58deg,rgba(88,210,255,.28) 59deg 61deg,transparent 62deg 120deg),conic-gradient(from 190deg at 72% 63%,transparent 0 23deg,rgba(255,105,225,.22) 24deg 27deg,transparent 28deg 88deg,rgba(255,238,135,.28) 89deg 91deg,transparent 92deg);mix-blend-mode:screen;opacity:.72;}
.card.flashera-card[data-flashera-effect="cristal-quebrado"]>.card-inner>.${FX_CLASS}::after{background:radial-gradient(circle at var(--arg-fl-x) var(--arg-fl-y),rgba(255,255,255,.5),transparent 28%);mix-blend-mode:color-dodge;opacity:.45;}

.card.flashera-card[data-flashera-effect="fuego-fatuo"]>.card-inner>.${FX_CLASS}::before{background:radial-gradient(ellipse at 22% 88%,rgba(80,255,189,.56),transparent 31%),radial-gradient(ellipse at 58% 102%,rgba(71,167,255,.52),transparent 37%),radial-gradient(ellipse at 86% 91%,rgba(174,86,255,.48),transparent 27%);filter:blur(8px);mix-blend-mode:screen;opacity:.76;animation:arg-fl-wisp 5.8s ease-in-out infinite alternate;}
.card.flashera-card[data-flashera-effect="fuego-fatuo"]>.card-inner>.${FX_CLASS}::after{background:radial-gradient(circle at var(--arg-fl-x) var(--arg-fl-y),rgba(198,255,232,.32),transparent 30%);mix-blend-mode:screen;opacity:.7;}
@keyframes arg-fl-wisp{to{transform:translate3d(0,-11%,0) scaleX(1.08);filter:blur(11px) hue-rotate(18deg)}}

.card.flashera-card[data-flashera-effect="holograma-pampeano"]>.card-inner>.${FX_CLASS}::before{background:repeating-linear-gradient(117deg,rgba(255,75,120,.18) 0 7px,rgba(255,224,88,.18) 7px 14px,rgba(69,238,184,.18) 14px 21px,rgba(69,154,255,.20) 21px 28px,rgba(174,91,255,.18) 28px 35px),repeating-linear-gradient(27deg,transparent 0 11px,rgba(255,255,255,.17) 12px 13px,transparent 14px 24px);background-position:var(--arg-fl-x) var(--arg-fl-y);mix-blend-mode:color-dodge;opacity:.7;animation:arg-fl-holo 7s linear infinite;}
.card.flashera-card[data-flashera-effect="holograma-pampeano"]>.card-inner>.${FX_CLASS}::after{background:radial-gradient(circle at var(--arg-fl-x) var(--arg-fl-y),rgba(255,255,255,.48),transparent 38%);mix-blend-mode:screen;opacity:.5;}
@keyframes arg-fl-holo{to{background-position:180px -120px,-90px 130px}}

.card.flashera-card[data-flashera-effect="tormenta-electrica"]>.card-inner>.${FX_CLASS}::before{background:linear-gradient(104deg,transparent 0 38%,rgba(166,224,255,.65) 39% 40%,transparent 41% 62%,rgba(112,174,255,.42) 63% 64%,transparent 65%),radial-gradient(circle at var(--arg-fl-x) var(--arg-fl-y),rgba(121,190,255,.38),transparent 36%);mix-blend-mode:screen;opacity:.72;animation:arg-fl-storm 3.4s steps(1,end) infinite;}
.card.flashera-card[data-flashera-effect="tormenta-electrica"]>.card-inner>.${FX_CLASS}::after{background:linear-gradient(15deg,transparent 45%,rgba(255,255,255,.75) 46% 47%,transparent 48%);mix-blend-mode:screen;opacity:.35;animation:arg-fl-storm2 5.2s steps(1,end) infinite;}
@keyframes arg-fl-storm{0%,84%,100%{opacity:.18}85%{opacity:.9}87%{opacity:.28}90%{opacity:.72}92%{opacity:.22}}
@keyframes arg-fl-storm2{0%,63%,100%{opacity:.12}64%{opacity:.65}66%{opacity:.16}}

.card.flashera-card[data-flashera-effect="espejo-negro"]>.card-inner>.${FX_CLASS}::before{background:conic-gradient(from 230deg at var(--arg-fl-x) var(--arg-fl-y),rgba(0,0,0,.18),rgba(0,100,110,.26),rgba(106,27,118,.28),rgba(15,15,18,.42),rgba(126,83,25,.20),rgba(0,0,0,.18));mix-blend-mode:multiply;opacity:.72;animation:arg-fl-spin 16s linear infinite reverse;}
.card.flashera-card[data-flashera-effect="espejo-negro"]>.card-inner>.${FX_CLASS}::after{background:radial-gradient(circle at var(--arg-fl-x) var(--arg-fl-y),rgba(255,255,255,.36),rgba(35,190,188,.10) 19%,transparent 44%);mix-blend-mode:screen;opacity:.56;}

@keyframes arg-fl-spin{to{transform:rotate(360deg) scale(1.02)}}
@keyframes arg-fl-drift{to{background-position:130% 70%}}

@media (prefers-reduced-motion:reduce){
 .card.flashera-card>.card-inner>.${FX_CLASS}::before,.card.flashera-card>.card-inner>.${FX_CLASS}::after{animation:none!important;}
}
@media (max-width:850px){
 .card.flashera-card[data-flashera-mode="standard"]{--arg-fl-intensity:.72;}
 .card.flashera-card[data-flashera-mode="compact"]{--arg-fl-intensity:.48;}
}
`;}

export function ensureFlasheraRendererStyles(){
  if(typeof document==='undefined')return false;
  if(document.getElementById(STYLE_ID))return true;
  const style=document.createElement('style');style.id=STYLE_ID;style.textContent=styles();document.head.appendChild(style);return true;
}

function asCard(node){
  if(!node||node.nodeType!==1)return null;
  if(node.matches?.('.card'))return node;
  return node.querySelector?.('.card')||null;
}
function ensureFx(card){
  const inner=card?.querySelector?.(':scope > .card-inner')||card?.querySelector?.('.card-inner');if(!inner)return null;
  let fx=inner.querySelector?.(`:scope > .${FX_CLASS}`)||null;
  if(!fx){fx=document.createElement('div');fx.className=FX_CLASS;fx.setAttribute('aria-hidden','true');inner.appendChild(fx);}return fx;
}
function applyPointerLight(card,event){
  if(!card?.getBoundingClientRect)return;
  const rect=card.getBoundingClientRect();if(!rect.width||!rect.height)return;
  const x=clamp(((event.clientX-rect.left)/rect.width)*100,0,100),y=clamp(((event.clientY-rect.top)/rect.height)*100,0,100);
  card.style.setProperty('--arg-fl-x',`${x.toFixed(2)}%`);card.style.setProperty('--arg-fl-y',`${y.toFixed(2)}%`);
  card.style.setProperty('--arg-fl-tilt-y',((x-50)/50).toFixed(3));card.style.setProperty('--arg-fl-tilt-x',((50-y)/50).toFixed(3));
}
function resetPointerLight(card){card?.style?.setProperty('--arg-fl-x','50%');card?.style?.setProperty('--arg-fl-y','50%');card?.style?.setProperty('--arg-fl-tilt-x','0');card?.style?.setProperty('--arg-fl-tilt-y','0');}
function bindPointerLight(card){
  if(boundCards.has(card))return;boundCards.add(card);
  card.addEventListener?.('pointermove',event=>{if(card.dataset.flasheraMode==='compact')return;applyPointerLight(card,event);},{passive:true});
  card.addEventListener?.('pointerleave',()=>resetPointerLight(card),{passive:true});
}

export function inferFlasheraModeForZone(zone=''){
  const z=String(zone||'').toLowerCase();
  if(['pack-opening','preview','flashera-preview'].includes(z))return 'full';
  if(['hand','combat','support','land','planeswalker','stack','mulligan'].includes(z))return 'compact';
  return 'standard';
}

export function decorateFlasheraCard(node,{effectId=null,mode=null,visualEnabled=null,lockEffect=false}={}){
  if(typeof document==='undefined')return node;
  ensureFlasheraRendererStyles();
  const card=asCard(node);if(!card)return node;
  if(!card.classList.contains('flashera-card'))card.classList.add('flashera-card');if(card.dataset.flashera!=='1')card.dataset.flashera='1';
  const resolvedMode=normalizeFlasheraRenderMode(mode||card.dataset.flasheraMode||inferFlasheraModeForZone(card.dataset.zone));card.dataset.flasheraMode=resolvedMode;
  const resolvedEffect=normalizeFlasheraEffectId(effectId||card.dataset.flasheraEffect||globalEffectId);card.dataset.flasheraEffect=resolvedEffect;
  if(lockEffect)card.dataset.flasheraEffectLocked='1';
  const enabled=visualEnabled==null?globalVisualEnabled:visualEnabled!==false;card.dataset.flasheraVisual=enabled?'on':'off';
  ensureFx(card);bindPointerLight(card);return node;
}
export function undecorateFlasheraCard(node){const card=asCard(node);if(!card)return node;card.classList.remove('flashera-card');delete card.dataset.flashera;delete card.dataset.flasheraMode;delete card.dataset.flasheraEffect;delete card.dataset.flasheraEffectLocked;delete card.dataset.flasheraVisual;card.querySelector?.(`.${FX_CLASS}`)?.remove?.();resetPointerLight(card);return node;}

export function setActiveFlasheraEffect(effectId,{root=null}={}){
  globalEffectId=normalizeFlasheraEffectId(effectId);if(typeof document==='undefined')return globalEffectId;
  (root||document).querySelectorAll?.('.card.flashera-card')?.forEach(card=>{if(card.dataset.flasheraEffectLocked!=='1')card.dataset.flasheraEffect=globalEffectId;});
  document.documentElement.dataset.argFlasheraEffect=globalEffectId;
  document.dispatchEvent(new CustomEvent('argentinia:flashera-effect-changed',{detail:{effectId:globalEffectId}}));return globalEffectId;
}
export function getActiveFlasheraEffect(){return globalEffectId;}
export function setFlasheraVisualEnabled(enabled,{root=null}={}){
  globalVisualEnabled=enabled!==false;if(typeof document==='undefined')return globalVisualEnabled;
  (root||document).querySelectorAll?.('.card.flashera-card')?.forEach(card=>{card.dataset.flasheraVisual=globalVisualEnabled?'on':'off';});
  document.documentElement.dataset.argFlasheraVisual=globalVisualEnabled?'on':'off';return globalVisualEnabled;
}
export function getFlasheraVisualEnabled(){return globalVisualEnabled;}

export function updateFlasheraLighting(root,{x=50,y=50,tiltX=0,tiltY=0}={}){
  if(typeof document==='undefined'||!root?.querySelectorAll)return;
  const cards=[];if(root.matches?.('.card.flashera-card'))cards.push(root);root.querySelectorAll('.card.flashera-card').forEach(card=>cards.push(card));
  cards.forEach(card=>{card.style.setProperty('--arg-fl-x',`${clamp(x,0,100).toFixed(2)}%`);card.style.setProperty('--arg-fl-y',`${clamp(y,0,100).toFixed(2)}%`);card.style.setProperty('--arg-fl-tilt-x',String(clamp(tiltX,-1,1)));card.style.setProperty('--arg-fl-tilt-y',String(clamp(tiltY,-1,1)));});
}
export function resetFlasheraLighting(root){updateFlasheraLighting(root,{x:50,y:50,tiltX:0,tiltY:0});}

function maybeDecorate(node){
  if(!node||node.nodeType!==1)return;
  const candidates=[];
  if(node.matches?.('.card[data-flashera="1"],.card.flashera-card'))candidates.push(node);
  node.querySelectorAll?.('.card[data-flashera="1"],.card.flashera-card')?.forEach(card=>candidates.push(card));
  candidates.forEach(card=>decorateFlasheraCard(card));
}
export function installFlasheraRenderer({root=null}={}){
  if(typeof document==='undefined')return()=>{};ensureFlasheraRendererStyles();const target=root||document.documentElement;maybeDecorate(target);
  if(!observer&&typeof MutationObserver!=='undefined'){
    observer=new MutationObserver(records=>{for(const record of records){if(record.type==='attributes'){maybeDecorate(record.target);continue;}for(const node of record.addedNodes||[])maybeDecorate(node);}});
    observer.observe(target,{subtree:true,childList:true,attributes:true,attributeFilter:['data-flashera','class']});
  }
  document.documentElement.dataset.argFlasheraEffect=globalEffectId;document.documentElement.dataset.argFlasheraVisual=globalVisualEnabled?'on':'off';
  return()=>{observer?.disconnect?.();observer=null;};
}
