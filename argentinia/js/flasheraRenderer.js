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
  Object.freeze({ id:'espejo-negro', name:'Espejo Negro', motion:true }),
  Object.freeze({ id:'nebulosa-criolla', name:'Nebulosa Criolla', motion:true }),
  Object.freeze({ id:'solar-andino', name:'Solar Andino', motion:true }),
  Object.freeze({ id:'cometa-del-litoral', name:'Cometa del Litoral', motion:true }),
  Object.freeze({ id:'mar-de-nacar', name:'Mar de Nácar', motion:true }),
  Object.freeze({ id:'relampago-del-plata', name:'Relámpago del Plata', motion:true }),
  Object.freeze({ id:'vitral-celeste', name:'Vitral Celeste', motion:true }),
  Object.freeze({ id:'cromo-huracan', name:'Cromo Huracán', motion:true }),
  Object.freeze({ id:'polvo-de-estrellas', name:'Polvo de Estrellas', motion:true }),
  Object.freeze({ id:'tornado-prismatico', name:'Tornado Prismático', motion:true }),
  Object.freeze({ id:'llama-boreal', name:'Llama Boreal', motion:true })
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

.card.flashera-card[data-flashera-effect="prisma-federal"]>.card-inner>.${FX_CLASS}::before{background:linear-gradient(118deg,rgba(255,40,80,.12),rgba(255,205,40,.22),rgba(60,255,160,.20),rgba(70,180,255,.22),rgba(155,80,255,.22),rgba(255,70,145,.16));background-size:220% 220%;background-position:var(--arg-fl-x) var(--arg-fl-y);mix-blend-mode:color-dodge;opacity:.68;animation:arg-fl-prisma 9s ease-in-out infinite;}
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

/* === Stage42A · Diez acabados adicionales · bucles autónomos ================= */
/* 11 Nebulosa Criolla: gas volumétrico, estallidos y desplazamiento cruzado. */
.card.flashera-card[data-flashera-effect="nebulosa-criolla"]>.card-inner>.${FX_CLASS}::before{background:radial-gradient(ellipse 55% 62% at 18% 72%,rgba(255,45,181,.49),transparent 77%),radial-gradient(ellipse 53% 62% at 82% 19%,rgba(31,228,255,.48),transparent 75%),radial-gradient(ellipse 47% 48% at 61% 77%,rgba(118,60,255,.45),transparent 80%),radial-gradient(circle at 41% 26%,rgba(255,245,197,.48),transparent 19%);background-size:115% 115%,128% 122%,110% 112%,105% 105%;mix-blend-mode:screen;filter:saturate(1.45);opacity:.87;animation:arg-fl-nebula 9s ease-in-out infinite;}
.card.flashera-card[data-flashera-effect="nebulosa-criolla"]>.card-inner>.${FX_CLASS}::after{background:radial-gradient(circle at 22% 39%,rgba(255,255,255,.94) 0 1px,transparent 2px),radial-gradient(circle at 79% 67%,rgba(135,246,255,.86) 0 1px,transparent 2px),radial-gradient(circle at 48% 82%,rgba(255,184,244,.88) 0 1.5px,transparent 2.7px),linear-gradient(116deg,transparent 28%,rgba(255,255,255,.19) 49%,transparent 67%);background-size:49px 67px,75px 61px,61px 87px,240% 100%;mix-blend-mode:screen;opacity:.65;animation:arg-fl-nebula-dust 12s linear infinite;}
@keyframes arg-fl-nebula{0%,100%{transform:translate3d(-5%,2%,0) scale(1.03) rotate(-3deg);filter:saturate(1.25) hue-rotate(0deg)}50%{transform:translate3d(5%,-5%,0) scale(1.18) rotate(3deg);filter:saturate(1.7) hue-rotate(28deg)}}
@keyframes arg-fl-nebula-dust{0%{background-position:0 0,0 0,0 0,-85% 50%}100%{background-position:49px -67px,-75px 61px,61px -87px,185% 50%}}

/* 12 Solar Andino: corona giratoria y onda dorada cálida. */
.card.flashera-card[data-flashera-effect="solar-andino"]>.card-inner>.${FX_CLASS}::before{background:repeating-conic-gradient(from 8deg at 50% 51%,transparent 0deg 13deg,rgba(255,237,139,.26) 15deg 18deg,transparent 20deg 34deg),radial-gradient(circle at 50% 53%,rgba(255,252,197,.65),rgba(255,161,32,.34) 26%,rgba(225,60,0,.09) 49%,transparent 71%);mix-blend-mode:screen;opacity:.84;animation:arg-fl-solar-corona 17s linear infinite;}
.card.flashera-card[data-flashera-effect="solar-andino"]>.card-inner>.${FX_CLASS}::after{background:radial-gradient(circle at 50% 53%,transparent 16%,rgba(255,247,180,.62) 19%,transparent 26%,rgba(255,198,75,.32) 38%,transparent 48%),linear-gradient(125deg,transparent 19%,rgba(255,255,228,.48) 40%,transparent 61%);background-size:100% 100%,240% 100%;mix-blend-mode:screen;opacity:.69;animation:arg-fl-solar-wave 5.8s ease-in-out infinite;}
@keyframes arg-fl-solar-corona{to{transform:rotate(360deg)}}
@keyframes arg-fl-solar-wave{0%,100%{transform:scale(.82);opacity:.39;background-position:50% 50%,-95% 0}50%{transform:scale(1.09);opacity:.84;background-position:50% 50%,155% 0}}

/* 13 Cometa del Litoral: estelas desfasadas, barridos continuos. */
.card.flashera-card[data-flashera-effect="cometa-del-litoral"]>.card-inner>.${FX_CLASS}::before{background:repeating-linear-gradient(135deg,transparent 0 30px,rgba(42,255,235,.08) 34px 36px,transparent 39px 74px),linear-gradient(132deg,transparent 16%,rgba(170,255,255,.64) 33%,rgba(22,198,255,.27) 35%,transparent 43%,rgba(255,255,255,.7) 59%,rgba(43,228,255,.17) 61%,transparent 69%);background-size:190% 190%,280% 100%;mix-blend-mode:screen;opacity:.79;animation:arg-fl-comet-trail 4.1s linear infinite;}
.card.flashera-card[data-flashera-effect="cometa-del-litoral"]>.card-inner>.${FX_CLASS}::after{background:radial-gradient(ellipse 3% 5% at 20% 70%,rgba(255,255,255,.95),transparent),radial-gradient(ellipse 4% 6% at 75% 30%,rgba(157,255,241,.95),transparent),repeating-linear-gradient(136deg,transparent 0 46px,rgba(196,255,255,.27) 49px 51px,transparent 53px 103px);background-size:200% 140%;mix-blend-mode:screen;opacity:.65;animation:arg-fl-comet-sparks 6.4s linear infinite;}
@keyframes arg-fl-comet-trail{0%{background-position:-130px 125px,-130% 50%}100%{background-position:130px -135px,165% 50%}}
@keyframes arg-fl-comet-sparks{0%{background-position:-95px 95px}100%{background-position:95px -95px}}

/* 14 Mar de Nácar: interferencia iridiscente que ondula sin cortes. */
.card.flashera-card[data-flashera-effect="mar-de-nacar"]>.card-inner>.${FX_CLASS}::before{background:repeating-radial-gradient(ellipse at 28% 95%,rgba(250,231,255,.24) 0 8px,rgba(91,241,232,.19) 14px 24px,rgba(255,136,204,.15) 32px 43px,transparent 50px 68px),linear-gradient(142deg,rgba(246,169,222,.27),rgba(100,244,226,.33),rgba(242,233,184,.26),rgba(160,143,254,.26));background-size:120% 150%,240% 240%;mix-blend-mode:screen;opacity:.8;animation:arg-fl-nacre-tide 10s ease-in-out infinite;}
.card.flashera-card[data-flashera-effect="mar-de-nacar"]>.card-inner>.${FX_CLASS}::after{background:linear-gradient(113deg,transparent 22%,rgba(255,255,255,.52) 37%,rgba(149,255,242,.30) 44%,transparent 61%);background-size:230% 110%;mix-blend-mode:soft-light;opacity:.76;animation:arg-fl-nacre-sheen 6.8s linear infinite;}
@keyframes arg-fl-nacre-tide{0%,100%{transform:translate3d(-4%,0,0) skewY(-2deg);filter:hue-rotate(0deg)}50%{transform:translate3d(5%,-6%,0) skewY(3deg);filter:hue-rotate(38deg)}}
@keyframes arg-fl-nacre-sheen{0%{background-position:-120% 0}100%{background-position:180% 0}}

/* 15 Relámpago del Plata: arcos finos móviles sobre atmósfera azul. */
.card.flashera-card[data-flashera-effect="relampago-del-plata"]>.card-inner>.${FX_CLASS}::before{background:linear-gradient(124deg,transparent 0 32%,rgba(219,247,255,.74) 32.5% 33.2%,transparent 34% 56%,rgba(97,211,255,.65) 56.5% 57.1%,transparent 58%),linear-gradient(71deg,transparent 0 41%,rgba(255,255,255,.4) 41.3% 42.1%,transparent 43%),radial-gradient(ellipse at 56% 32%,rgba(65,175,255,.43),transparent 62%);background-size:230% 230%,200% 200%,100% 100%;mix-blend-mode:screen;opacity:.76;animation:arg-fl-rayo-flow 4.8s linear infinite;}
.card.flashera-card[data-flashera-effect="relampago-del-plata"]>.card-inner>.${FX_CLASS}::after{background:repeating-linear-gradient(12deg,transparent 0 22px,rgba(204,242,255,.15) 23px 24px,transparent 27px 49px),radial-gradient(ellipse at var(--arg-fl-x) var(--arg-fl-y),rgba(233,255,255,.68),transparent 30%);mix-blend-mode:screen;opacity:.62;animation:arg-fl-rayo-hum 3.7s ease-in-out infinite;}
@keyframes arg-fl-rayo-flow{0%{background-position:-100% 80%,125% 60%,0 0}100%{background-position:160% -85%,-135% -50%,0 0}}
@keyframes arg-fl-rayo-hum{0%,100%{opacity:.3;transform:translateX(-2%)}50%{opacity:.78;transform:translateX(2%)}}

/* 16 Vitral Celeste: facetas irregulares con luz que rota por capas. */
.card.flashera-card[data-flashera-effect="vitral-celeste"]>.card-inner>.${FX_CLASS}::before{background:conic-gradient(from 18deg at 26% 36%,rgba(68,229,255,.29) 0 41deg,rgba(255,218,112,.25) 41deg 94deg,rgba(129,105,255,.30) 94deg 188deg,rgba(255,108,207,.20) 188deg 270deg,rgba(37,238,190,.29) 270deg 360deg),conic-gradient(from 85deg at 79% 70%,rgba(255,255,255,.24) 0 52deg,transparent 52deg 57deg,rgba(72,206,255,.32) 57deg 160deg,rgba(255,213,108,.19) 160deg 236deg,rgba(166,109,255,.27) 236deg 360deg);mix-blend-mode:screen;opacity:.76;animation:arg-fl-vitral-light 13s ease-in-out infinite;}
.card.flashera-card[data-flashera-effect="vitral-celeste"]>.card-inner>.${FX_CLASS}::after{background:repeating-linear-gradient(37deg,transparent 0 37px,rgba(255,255,255,.16) 38px 39px,transparent 40px 73px),linear-gradient(108deg,transparent 31%,rgba(255,255,255,.51) 48%,transparent 65%);background-size:145% 145%,235% 100%;mix-blend-mode:overlay;opacity:.72;animation:arg-fl-vitral-rim 7s linear infinite;}
@keyframes arg-fl-vitral-light{0%,100%{transform:translate3d(-3%,2%,0) rotate(-2deg);filter:hue-rotate(0deg)}50%{transform:translate3d(4%,-3%,0) rotate(3deg);filter:hue-rotate(52deg)}}
@keyframes arg-fl-vitral-rim{0%{background-position:0 0,-105% 50%}100%{background-position:73px -73px,165% 50%}}

/* 17 Cromo Huracán: metal espectral pulido y barridos asimétricos. */
.card.flashera-card[data-flashera-effect="cromo-huracan"]>.card-inner>.${FX_CLASS}::before{background:linear-gradient(106deg,transparent 4%,rgba(255,255,255,.15) 13%,rgba(225,252,255,.86) 23%,rgba(26,159,226,.29) 28%,transparent 36%,rgba(185,133,255,.27) 50%,rgba(255,255,255,.7) 63%,rgba(59,204,255,.33) 68%,transparent 78%),linear-gradient(12deg,rgba(5,24,43,.18),transparent 35%,rgba(231,247,255,.19) 68%,rgba(20,24,75,.16));background-size:325% 100%,100% 100%;mix-blend-mode:screen;opacity:.88;animation:arg-fl-chrome-streak 4.9s linear infinite;}
.card.flashera-card[data-flashera-effect="cromo-huracan"]>.card-inner>.${FX_CLASS}::after{background:repeating-linear-gradient(0deg,transparent 0 8px,rgba(255,255,255,.11) 9px 10px,transparent 11px 26px),radial-gradient(circle at var(--arg-fl-x) var(--arg-fl-y),rgba(255,255,255,.79),transparent 29%);mix-blend-mode:screen;opacity:.46;animation:arg-fl-chrome-shimmer 3.3s ease-in-out infinite;}
@keyframes arg-fl-chrome-streak{0%{background-position:-145% 50%,0 0}100%{background-position:185% 50%,0 0}}
@keyframes arg-fl-chrome-shimmer{0%,100%{transform:translateY(-3%);opacity:.35}50%{transform:translateY(3%);opacity:.7}}

/* 18 Polvo de Estrellas: tres densidades de partículas en parallax. */
.card.flashera-card[data-flashera-effect="polvo-de-estrellas"]>.card-inner>.${FX_CLASS}::before{background:radial-gradient(circle at 19% 17%,rgba(255,255,255,.96) 0 1px,transparent 1.9px),radial-gradient(circle at 83% 73%,rgba(255,208,122,.93) 0 1.5px,transparent 2.4px),radial-gradient(circle at 37% 58%,rgba(133,245,255,.95) 0 1.2px,transparent 2.3px),radial-gradient(circle at 63% 35%,rgba(255,139,229,.92) 0 1px,transparent 2px);background-size:29px 37px,47px 53px,59px 61px,73px 79px;mix-blend-mode:screen;opacity:.86;animation:arg-fl-stardust-fall 13s linear infinite;}
.card.flashera-card[data-flashera-effect="polvo-de-estrellas"]>.card-inner>.${FX_CLASS}::after{background:radial-gradient(circle at 24% 63%,rgba(243,223,255,.63),transparent 27%),radial-gradient(circle at 77% 21%,rgba(83,215,255,.5),transparent 31%),radial-gradient(circle at var(--arg-fl-x) var(--arg-fl-y),rgba(255,255,255,.45),transparent 32%);mix-blend-mode:screen;opacity:.65;animation:arg-fl-stardust-pulse 6.4s ease-in-out infinite;}
@keyframes arg-fl-stardust-fall{0%{background-position:0 0,0 0,0 0,0 0}100%{background-position:29px -37px,-47px 53px,59px -61px,-73px 79px}}
@keyframes arg-fl-stardust-pulse{0%,100%{opacity:.34;transform:scale(.91)}50%{opacity:.77;transform:scale(1.08)}}

/* 19 Tornado Prismático: remolino espiralado y cintas acentuadas. */
.card.flashera-card[data-flashera-effect="tornado-prismatico"]>.card-inner>.${FX_CLASS}::before{background:repeating-conic-gradient(from 30deg at 50% 52%,transparent 0deg 23deg,rgba(255,85,201,.24) 25deg 37deg,transparent 40deg 64deg,rgba(97,238,255,.26) 67deg 80deg,transparent 83deg 101deg,rgba(255,226,87,.19) 105deg 119deg,transparent 122deg 144deg),radial-gradient(ellipse at 50% 52%,transparent 7%,rgba(179,110,255,.30) 43%,transparent 71%);mix-blend-mode:screen;opacity:.79;animation:arg-fl-tornado-vortex 14s linear infinite;}
.card.flashera-card[data-flashera-effect="tornado-prismatico"]>.card-inner>.${FX_CLASS}::after{background:repeating-radial-gradient(ellipse at 49% 53%,transparent 0 15px,rgba(255,255,255,.20) 17px 18px,transparent 20px 34px),linear-gradient(123deg,transparent 34%,rgba(255,255,255,.39) 49%,transparent 64%);mix-blend-mode:screen;opacity:.66;animation:arg-fl-tornado-rings 8s ease-in-out infinite;}
@keyframes arg-fl-tornado-vortex{to{transform:rotate(360deg) scale(1.1);filter:hue-rotate(360deg)}}
@keyframes arg-fl-tornado-rings{0%,100%{transform:scale(.82) rotate(-9deg);opacity:.37}50%{transform:scale(1.15) rotate(9deg);opacity:.76}}

/* 20 Llama Boreal: lenguas de luz fría oscilantes desde la base. */
.card.flashera-card[data-flashera-effect="llama-boreal"]>.card-inner>.${FX_CLASS}::before{background:radial-gradient(ellipse 19% 77% at 16% 103%,rgba(55,255,199,.75),transparent 95%),radial-gradient(ellipse 22% 91% at 42% 111%,rgba(38,164,255,.68),transparent 91%),radial-gradient(ellipse 20% 80% at 68% 106%,rgba(222,83,255,.57),transparent 94%),radial-gradient(ellipse 17% 65% at 91% 108%,rgba(142,255,123,.57),transparent 93%);mix-blend-mode:screen;filter:blur(4px);opacity:.88;animation:arg-fl-boreal-flame 5.4s ease-in-out infinite;}
.card.flashera-card[data-flashera-effect="llama-boreal"]>.card-inner>.${FX_CLASS}::after{background:repeating-linear-gradient(82deg,transparent 0 19px,rgba(204,255,245,.19) 20px 22px,transparent 24px 41px),radial-gradient(ellipse at var(--arg-fl-x) var(--arg-fl-y),rgba(190,255,240,.35),transparent 36%);mix-blend-mode:screen;opacity:.56;animation:arg-fl-boreal-embers 7.3s linear infinite;}
@keyframes arg-fl-boreal-flame{0%,100%{transform:translate3d(-3%,6%,0) skewX(-3deg) scaleY(.9);filter:blur(5px) hue-rotate(0deg)}50%{transform:translate3d(4%,-9%,0) skewX(5deg) scaleY(1.18);filter:blur(7px) hue-rotate(33deg)}}
@keyframes arg-fl-boreal-embers{0%{background-position:0 80px,50% 50%}100%{background-position:43px -95px,50% 50%}}

/* En compact, mantener VIDA: una sola capa y bucles discretos para no cargar el campo. */
.card.flashera-card[data-flashera-effect="nebulosa-criolla"][data-flashera-mode="compact"]>.card-inner>.${FX_CLASS}::before,
.card.flashera-card[data-flashera-effect="solar-andino"][data-flashera-mode="compact"]>.card-inner>.${FX_CLASS}::before,
.card.flashera-card[data-flashera-effect="cometa-del-litoral"][data-flashera-mode="compact"]>.card-inner>.${FX_CLASS}::before,
.card.flashera-card[data-flashera-effect="mar-de-nacar"][data-flashera-mode="compact"]>.card-inner>.${FX_CLASS}::before,
.card.flashera-card[data-flashera-effect="relampago-del-plata"][data-flashera-mode="compact"]>.card-inner>.${FX_CLASS}::before,
.card.flashera-card[data-flashera-effect="vitral-celeste"][data-flashera-mode="compact"]>.card-inner>.${FX_CLASS}::before,
.card.flashera-card[data-flashera-effect="cromo-huracan"][data-flashera-mode="compact"]>.card-inner>.${FX_CLASS}::before,
.card.flashera-card[data-flashera-effect="polvo-de-estrellas"][data-flashera-mode="compact"]>.card-inner>.${FX_CLASS}::before,
.card.flashera-card[data-flashera-effect="tornado-prismatico"][data-flashera-mode="compact"]>.card-inner>.${FX_CLASS}::before,
.card.flashera-card[data-flashera-effect="llama-boreal"][data-flashera-mode="compact"]>.card-inner>.${FX_CLASS}::before{animation-play-state:running!important;animation-duration:15s!important;will-change:auto;filter:none;}
/* Compact establece animation:none; restauramos explícitamente el nombre sin afectar otros presets. */
.card.flashera-card[data-flashera-effect="nebulosa-criolla"][data-flashera-mode="compact"]>.card-inner>.${FX_CLASS}::before{animation-name:arg-fl-nebula!important;animation-iteration-count:infinite!important;animation-timing-function:ease-in-out!important;}
.card.flashera-card[data-flashera-effect="solar-andino"][data-flashera-mode="compact"]>.card-inner>.${FX_CLASS}::before{animation-name:arg-fl-solar-corona!important;animation-iteration-count:infinite!important;animation-timing-function:linear!important;}
.card.flashera-card[data-flashera-effect="cometa-del-litoral"][data-flashera-mode="compact"]>.card-inner>.${FX_CLASS}::before{animation-name:arg-fl-comet-trail!important;animation-iteration-count:infinite!important;animation-timing-function:ease-in-out!important;}
.card.flashera-card[data-flashera-effect="mar-de-nacar"][data-flashera-mode="compact"]>.card-inner>.${FX_CLASS}::before{animation-name:arg-fl-nacre-tide!important;animation-iteration-count:infinite!important;animation-timing-function:ease-in-out!important;}
.card.flashera-card[data-flashera-effect="relampago-del-plata"][data-flashera-mode="compact"]>.card-inner>.${FX_CLASS}::before{animation-name:arg-fl-rayo-flow!important;animation-iteration-count:infinite!important;animation-timing-function:ease-in-out!important;}
.card.flashera-card[data-flashera-effect="vitral-celeste"][data-flashera-mode="compact"]>.card-inner>.${FX_CLASS}::before{animation-name:arg-fl-vitral-light!important;animation-iteration-count:infinite!important;animation-timing-function:ease-in-out!important;}
.card.flashera-card[data-flashera-effect="cromo-huracan"][data-flashera-mode="compact"]>.card-inner>.${FX_CLASS}::before{animation-name:arg-fl-chrome-streak!important;animation-iteration-count:infinite!important;animation-timing-function:ease-in-out!important;}
.card.flashera-card[data-flashera-effect="polvo-de-estrellas"][data-flashera-mode="compact"]>.card-inner>.${FX_CLASS}::before{animation-name:arg-fl-stardust-fall!important;animation-iteration-count:infinite!important;animation-timing-function:linear!important;}
.card.flashera-card[data-flashera-effect="tornado-prismatico"][data-flashera-mode="compact"]>.card-inner>.${FX_CLASS}::before{animation-name:arg-fl-tornado-vortex!important;animation-iteration-count:infinite!important;animation-timing-function:linear!important;}
.card.flashera-card[data-flashera-effect="llama-boreal"][data-flashera-mode="compact"]>.card-inner>.${FX_CLASS}::before{animation-name:arg-fl-boreal-flame!important;animation-iteration-count:infinite!important;animation-timing-function:ease-in-out!important;}
/* Accesibilidad siempre por encima de la excepción compact: */
@media (prefers-reduced-motion:reduce){.card.flashera-card>.card-inner>.${FX_CLASS}::before,.card.flashera-card>.card-inner>.${FX_CLASS}::after{animation:none!important;}}


/* Stage42A HF3 · Continuous premium loops.
   Every non-angular animation has matching 0/100 properties and zero-velocity
   endpoints (ease-in-out). Full revolutions wrap at exactly 360°. No linear
   nonperiodic scan is permitted, so there are no teleporting highlights.
   Static Cristal Quebrado and the original Vitral geometry remain untouched. */
@keyframes arg-fl-aurora{0%,100%{transform:translate3d(-5%,1%,0) scale(1.05) rotate(-2deg);filter:blur(7px) hue-rotate(0deg)}25%{transform:translate3d(4%,-3%,0) scale(1.11) rotate(1deg);filter:blur(8px) hue-rotate(14deg)}50%{transform:translate3d(6%,-6%,0) scale(1.07) rotate(3deg);filter:blur(10px) hue-rotate(26deg)}75%{transform:translate3d(-2%,-2%,0) scale(1.09) rotate(0);filter:blur(8px) hue-rotate(12deg)}}
@keyframes arg-fl-metal{0%,100%{background-position:18% 50%;opacity:.55}33%{background-position:62% 50%;opacity:.9}66%{background-position:82% 50%;opacity:.68}}
@keyframes arg-fl-wisp{0%,100%{transform:translate3d(-3%,3%,0) scaleX(1.04);filter:blur(8px) hue-rotate(0deg)}30%{transform:translate3d(3%,-9%,0) scaleX(1.08);filter:blur(10px) hue-rotate(16deg)}65%{transform:translate3d(-1%,-4%,0) scaleX(.97);filter:blur(12px) hue-rotate(29deg)}}
@keyframes arg-fl-holo{0%,100%{background-position:0 0,0 0;opacity:.55}25%{background-position:28px -35px,-22px 25px;opacity:.82}50%{background-position:56px -70px,-44px 50px;opacity:.63}75%{background-position:28px -35px,-22px 25px;opacity:.86}}
@keyframes arg-fl-storm{0%,100%{opacity:.2;filter:brightness(1)}21%{opacity:.3;filter:brightness(1.1)}23%{opacity:.87;filter:brightness(1.6)}25%{opacity:.28;filter:brightness(1)}66%{opacity:.2}68%{opacity:.77}70%{opacity:.24}}
@keyframes arg-fl-storm2{0%,100%{opacity:.12}37%{opacity:.16}39%{opacity:.65}41%{opacity:.14}78%{opacity:.15}80%{opacity:.54}82%{opacity:.12}}
@keyframes arg-fl-nebula-dust{0%,100%{background-position:0 0,0 0,0 0,36% 50%;opacity:.48}50%{background-position:49px -67px,-75px 61px,61px -87px,72% 50%;opacity:.75}}
@keyframes arg-fl-comet-trail{0%,100%{background-position:0 0,24% 50%;opacity:.5}30%{background-position:74px -74px,68% 50%;opacity:.91}65%{background-position:148px -148px,82% 50%;opacity:.64}}
@keyframes arg-fl-comet-sparks{0%,100%{background-position:0 0;opacity:.33}50%{background-position:82px -82px;opacity:.8}}
@keyframes arg-fl-nacre-sheen{0%,100%{background-position:15% 50%;opacity:.51}50%{background-position:85% 50%;opacity:.91}}
@keyframes arg-fl-rayo-flow{0%,100%{background-position:35% 50%,65% 40%,0 0;opacity:.58}35%{background-position:84% 10%,25% 85%,0 0;opacity:.9}70%{background-position:20% 80%,74% 25%,0 0;opacity:.7}}
/* Vitral: same faceted art / first layer; only prevent second layer teleport. */
@keyframes arg-fl-vitral-rim{0%,100%{background-position:0 0,32% 50%;opacity:.58}50%{background-position:73px -73px,66% 50%;opacity:.85}}
@keyframes arg-fl-chrome-streak{0%,100%{background-position:14% 50%,0 0;opacity:.53}30%{background-position:64% 50%,0 0;opacity:.96}70%{background-position:85% 50%,0 0;opacity:.74}}
@keyframes arg-fl-boreal-embers{0%,100%{background-position:0 0,50% 50%;opacity:.48}50%{background-position:43px -80px,50% 50%;opacity:.86}}
@keyframes arg-fl-tornado-vortex{0%{transform:rotate(0deg) scale(1.1);filter:hue-rotate(0deg)}100%{transform:rotate(360deg) scale(1.1);filter:hue-rotate(360deg)}}
/* Slowly offset secondary motion phases, no hard cuts. */
.card.flashera-card[data-flashera-effect="aurora-austral"]>.card-inner>.${FX_CLASS}::before{animation:arg-fl-aurora 13s ease-in-out infinite;}
.card.flashera-card[data-flashera-effect="aurora-austral"]>.card-inner>.${FX_CLASS}::after{animation:arg-fl-drift 17s ease-in-out infinite;}
.card.flashera-card[data-flashera-effect="metal-liquido"]>.card-inner>.${FX_CLASS}::before{animation:arg-fl-metal 12s ease-in-out infinite;}
.card.flashera-card[data-flashera-effect="fuego-fatuo"]>.card-inner>.${FX_CLASS}::before{animation:arg-fl-wisp 12s ease-in-out infinite;}
.card.flashera-card[data-flashera-effect="holograma-pampeano"]>.card-inner>.${FX_CLASS}::before{animation:arg-fl-holo 14s ease-in-out infinite;}
.card.flashera-card[data-flashera-effect="tormenta-electrica"]>.card-inner>.${FX_CLASS}::before{animation:arg-fl-storm 11s linear infinite;}
.card.flashera-card[data-flashera-effect="tormenta-electrica"]>.card-inner>.${FX_CLASS}::after{animation:arg-fl-storm2 13s linear infinite;}
.card.flashera-card[data-flashera-effect="nebulosa-criolla"]>.card-inner>.${FX_CLASS}::after{animation:arg-fl-nebula-dust 16s ease-in-out infinite;}
.card.flashera-card[data-flashera-effect="cometa-del-litoral"]>.card-inner>.${FX_CLASS}::before{animation:arg-fl-comet-trail 13s ease-in-out infinite;}
.card.flashera-card[data-flashera-effect="cometa-del-litoral"]>.card-inner>.${FX_CLASS}::after{animation:arg-fl-comet-sparks 10s ease-in-out infinite;}
.card.flashera-card[data-flashera-effect="mar-de-nacar"]>.card-inner>.${FX_CLASS}::after{animation:arg-fl-nacre-sheen 12s ease-in-out infinite;}
.card.flashera-card[data-flashera-effect="relampago-del-plata"]>.card-inner>.${FX_CLASS}::before{animation:arg-fl-rayo-flow 11s ease-in-out infinite;}
.card.flashera-card[data-flashera-effect="vitral-celeste"]>.card-inner>.${FX_CLASS}::after{animation:arg-fl-vitral-rim 13s ease-in-out infinite;}
.card.flashera-card[data-flashera-effect="cromo-huracan"]>.card-inner>.${FX_CLASS}::before{animation:arg-fl-chrome-streak 11s ease-in-out infinite;}
.card.flashera-card[data-flashera-effect="llama-boreal"]>.card-inner>.${FX_CLASS}::after{animation:arg-fl-boreal-embers 14s ease-in-out infinite;}
/* Compact defaults to static for historical presets. HF3 restores the redesigned
   periodic motion for animated historical effects, at lower amplitude. */
.card.flashera-card[data-flashera-mode="compact"][data-flashera-effect="aurora-austral"]>.card-inner>.${FX_CLASS}::before{animation:arg-fl-aurora 18s ease-in-out infinite!important;}
.card.flashera-card[data-flashera-mode="compact"][data-flashera-effect="metal-liquido"]>.card-inner>.${FX_CLASS}::before{animation:arg-fl-metal 18s ease-in-out infinite!important;}
.card.flashera-card[data-flashera-mode="compact"][data-flashera-effect="fuego-fatuo"]>.card-inner>.${FX_CLASS}::before{animation:arg-fl-wisp 18s ease-in-out infinite!important;}
.card.flashera-card[data-flashera-mode="compact"][data-flashera-effect="holograma-pampeano"]>.card-inner>.${FX_CLASS}::before{animation:arg-fl-holo 18s ease-in-out infinite!important;}
.card.flashera-card[data-flashera-mode="compact"][data-flashera-effect="tormenta-electrica"]>.card-inner>.${FX_CLASS}::before{animation:arg-fl-storm 18s linear infinite!important;}
.card.flashera-card[data-flashera-mode="compact"][data-flashera-effect="cielo-estrellado"]>.card-inner>.${FX_CLASS}::before{animation:arg-fl-stars 19s linear infinite!important;}
.card.flashera-card[data-flashera-mode="compact"][data-flashera-effect="vidrio-tornasol"]>.card-inner>.${FX_CLASS}::before{animation:arg-fl-spin 21s linear infinite!important;}
.card.flashera-card[data-flashera-mode="compact"][data-flashera-effect="espejo-negro"]>.card-inner>.${FX_CLASS}::before{animation:arg-fl-spin 24s linear infinite reverse!important;}
.card.flashera-card[data-flashera-mode="compact"][data-flashera-effect="prisma-federal"]>.card-inner>.${FX_CLASS}::before{animation:arg-fl-prisma 18s ease-in-out infinite!important;}

@keyframes arg-fl-spin{to{transform:rotate(360deg) scale(1.02)}}
@keyframes arg-fl-drift{to{background-position:130% 70%}}
@keyframes arg-fl-spin{0%{transform:rotate(0deg) scale(1.02)}100%{transform:rotate(360deg) scale(1.02)}}
@keyframes arg-fl-drift{0%,100%{background-position:36% 44%}50%{background-position:66% 57%}}


@media (prefers-reduced-motion:reduce){
 .card.flashera-card>.card-inner>.${FX_CLASS}::before,.card.flashera-card>.card-inner>.${FX_CLASS}::after{animation:none!important;}
}
@media (prefers-reduced-motion:reduce){
 .card.flashera-card[data-flashera-mode="compact"][data-flashera-effect]>.card-inner>.${FX_CLASS}::before,
 .card.flashera-card[data-flashera-mode="compact"][data-flashera-effect]>.card-inner>.${FX_CLASS}::after{animation:none!important;transition:none!important;}
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
