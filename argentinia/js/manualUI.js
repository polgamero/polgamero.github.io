// js/manualUI.js — Manual del jugador (frontend-only)
// No Firebase, no economía, no gameplay mutations. Se monta sobre el menú principal y
// puede eliminarse sin tocar el estado de la partida.

const MANUAL_STYLE_ID = 'argentinia-game-manual-styles';
const MANUAL_OVERLAY_ID = 'argentinia-game-manual';

// Los PNG son el fallback estable. Para los bloques marcados preferAnimated:true,
// el loader prueba primero WebP animado y luego GIF con HEAD silencioso; si no existen,
// permanece en PNG. Así se pueden sumar demos animadas sin cambiar el HTML del manual.
const MANUAL_MEDIA = Object.freeze({
  manual1: { preferAnimated:false, alt:'Vista general de la mesa de juego de Argentinia' },
  manual2: { preferAnimated:true,  alt:'Ejemplo de lanzamiento de una carta y pago de maná' },
  manual3: { preferAnimated:true,  alt:'Secuencia de ataque, declaración de bloqueadores y daño de combate' },
  manual4: { preferAnimated:false, alt:'Anatomía de una carta y lectura de sus habilidades' },
  manual5: { preferAnimated:true,  alt:'Ejemplo de pila y prioridad entre dos acciones' },
  manual6: { preferAnimated:false, alt:'Fixture del modo Torneo de Argentinia' },
  manual7: { preferAnimated:false, alt:'Pantalla principal de la Tienda de Argentinia' },
  manual8: { preferAnimated:false, alt:'Publicación y oferta dentro del Mercado de Pases' },
  manual9: { preferAnimated:false, alt:'Pantalla de la racha de Recompensas diarias' },
  manual10:{ preferAnimated:false, alt:'Constructor de mazos y colección de Argentinia' }
});

function ensureManualStyles() {
  if (typeof document === 'undefined' || document.getElementById(MANUAL_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = MANUAL_STYLE_ID;
  style.textContent = `
    .main-menu-help-link{
      flex:0 0 auto; min-height:var(--main-menu-button-height); align-self:stretch;
      display:inline-flex; align-items:center; justify-content:center;
      padding:0 10px; border:0; background:transparent; color:#f0e0b0;
      font:800 12px/1.05 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      text-decoration:underline; text-underline-offset:3px; cursor:pointer; white-space:nowrap;
      opacity:.92; text-shadow:0 1px 3px rgba(0,0,0,.8);
      transition:color .15s ease,opacity .15s ease,transform .15s ease;
    }
    .main-menu-help-link:hover{color:#f4d969;opacity:1;transform:translateY(-1px)}
    /* Manual Preview v2 — el acceso debe quedar realmente visible a la derecha de Mercado
       también en viewports mobile estrechos. No se redimensionan Opciones ni los 3 iconos
       existentes: sólo el texto nuevo puede encogerse/envolver. */
    html.argentinia-mobile .main-menu-bottom-row{
      max-width:calc(100dvw - max(3dvw,var(--arg-safe-left,0px)) - max(8px,var(--arg-safe-right,0px)))!important;
      overflow:visible!important;
    }
    html.argentinia-mobile .main-menu-help-link{
      flex:0 1 var(--arg-manual-help-max-width,96px);
      width:min(96px,var(--arg-manual-help-max-width,96px));
      max-width:var(--arg-manual-help-max-width,96px);
      min-width:0; min-height:var(--main-menu-button-height);
      padding:0 4px; box-sizing:border-box;
      font-size:clamp(8px,2.35dvw,10px); line-height:1.04;
      white-space:normal; overflow-wrap:normal; word-break:normal; text-align:center;
      position:relative; z-index:4;
      color:#f2df9c; opacity:1;
    }

    #${MANUAL_OVERLAY_ID}{
      position:fixed; inset:0; z-index:12000; display:flex; align-items:center; justify-content:center;
      padding:22px; color:#f5f0df; font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      background:
        radial-gradient(circle at 50% 16%,rgba(116,172,223,.16),transparent 34%),
        linear-gradient(180deg,rgba(2,7,4,.80),rgba(2,7,4,.95));
      backdrop-filter:blur(9px);
    }
    #${MANUAL_OVERLAY_ID}[hidden]{display:none!important}
    .arg-manual-shell{
      width:min(1220px,96vw); height:min(900px,94dvh); overflow:hidden;
      display:grid; grid-template-rows:auto 1fr;
      border:1px solid rgba(212,175,55,.48); border-radius:20px;
      background:
        radial-gradient(circle at 80% 0%,rgba(212,175,55,.08),transparent 31%),
        linear-gradient(145deg,rgba(15,25,18,.98),rgba(5,10,7,.985));
      box-shadow:0 34px 100px rgba(0,0,0,.68),0 0 44px rgba(212,175,55,.09);
    }
    .arg-manual-header{
      min-height:78px; display:flex; align-items:center; gap:16px; padding:12px 18px;
      border-bottom:1px solid rgba(212,175,55,.25); background:rgba(4,9,6,.68);
    }
    .arg-manual-logo{width:56px;height:56px;object-fit:contain;filter:drop-shadow(0 6px 15px rgba(0,0,0,.45))}
    .arg-manual-heading{min-width:0;flex:1}
    .arg-manual-kicker{margin:0 0 3px;color:#d4af37;font-size:10px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}
    .arg-manual-title{margin:0;color:#f7efda;font-family:Georgia,"Times New Roman",serif;font-size:clamp(22px,2.6vw,34px);line-height:1}
    .arg-manual-subtitle{margin:5px 0 0;color:#aeb4aa;font-size:12px}
    .arg-manual-close{
      width:42px;height:42px;flex:0 0 42px;border:1px solid rgba(212,175,55,.45);border-radius:11px;
      background:rgba(11,19,14,.78);color:#f0e0b0;font-size:25px;line-height:1;cursor:pointer;
    }
    .arg-manual-close:hover{background:rgba(212,175,55,.14);border-color:#f0d56c}
    .arg-manual-layout{min-height:0;display:grid;grid-template-columns:238px minmax(0,1fr)}
    .arg-manual-toc{
      min-height:0;overflow:auto;padding:16px 12px 22px;border-right:1px solid rgba(212,175,55,.18);
      background:rgba(4,9,6,.58); scrollbar-width:thin; scrollbar-color:#806517 transparent;
    }
    .arg-manual-toc-title{margin:2px 9px 10px;color:#8f968d;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
    .arg-manual-toc button{
      width:100%;display:flex;align-items:center;gap:8px;text-align:left;margin:2px 0;padding:9px 10px;
      border:1px solid transparent;border-radius:9px;background:transparent;color:#c8c6ba;font-size:12px;font-weight:700;cursor:pointer;
    }
    .arg-manual-toc button:hover{color:#fff;background:rgba(255,255,255,.04)}
    .arg-manual-toc button.is-active{color:#f2d875;border-color:rgba(212,175,55,.28);background:rgba(212,175,55,.09)}
    .arg-manual-toc-num{width:22px;color:#806f35;font:800 10px/1 Georgia,serif;text-align:center}
    .arg-manual-content{
      min-height:0;overflow:auto;scroll-behavior:smooth;padding:34px clamp(24px,4vw,58px) 70px;
      scrollbar-width:thin;scrollbar-color:#806517 transparent;scroll-padding-top:22px;
    }
    .arg-manual-hero{padding:8px 0 26px;border-bottom:1px solid rgba(212,175,55,.18);margin-bottom:8px}
    .arg-manual-hero h2{margin:0 0 12px;color:#fff4dc;font:800 clamp(31px,4.4vw,54px)/.98 Georgia,"Times New Roman",serif;letter-spacing:-.025em}
    .arg-manual-hero h2 span{color:#f0d56c}
    .arg-manual-hero p{max-width:780px;margin:0;color:#b8b8ae;font-size:15px;line-height:1.65}
    .arg-manual-quick{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
    .arg-manual-quick span{padding:6px 9px;border:1px solid rgba(255,255,255,.09);border-radius:999px;background:rgba(3,8,5,.45);color:#c9c5b8;font-size:11px}
    .arg-manual-section{padding:34px 0 12px;border-bottom:1px solid rgba(212,175,55,.14)}
    .arg-manual-section:last-child{border-bottom:0}
    .arg-manual-section-kicker{margin:0 0 7px;color:#d4af37;font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
    .arg-manual-section h3{margin:0 0 13px;color:#f8f0dc;font:800 clamp(24px,3vw,34px)/1.1 Georgia,"Times New Roman",serif}
    .arg-manual-section h4{margin:24px 0 8px;color:#f0d56c;font-size:15px}
    .arg-manual-section p{margin:0 0 12px;color:#bbbcb3;font-size:14px;line-height:1.65}
    .arg-manual-section strong{color:#eee5cc}
    .arg-manual-note{margin:15px 0;padding:13px 15px;border-left:3px solid #74acdf;border-radius:8px;background:rgba(116,172,223,.075);color:#c7d9e9;font-size:13px;line-height:1.55}
    .arg-manual-warning{border-left-color:#d4af37;background:rgba(212,175,55,.07);color:#e3d5ae}
    .arg-manual-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}
    .arg-manual-card{padding:14px 15px;border:1px solid rgba(212,175,55,.18);border-radius:12px;background:rgba(7,13,9,.60)}
    .arg-manual-card h4{margin:0 0 5px;color:#ede3ca;font-size:13px}
    .arg-manual-card p{margin:0;color:#9fa49c;font-size:12px;line-height:1.48}
    .arg-manual-steps{counter-reset:manualstep;margin:15px 0;display:grid;gap:8px}
    .arg-manual-step{counter-increment:manualstep;display:grid;grid-template-columns:34px 1fr;gap:10px;align-items:start;padding:10px 12px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:rgba(0,0,0,.14)}
    .arg-manual-step::before{content:counter(manualstep);width:28px;height:28px;display:grid;place-items:center;border:1px solid rgba(212,175,55,.45);border-radius:50%;color:#f0d56c;font:800 12px/1 Georgia,serif}
    .arg-manual-step b{display:block;color:#eee5cc;font-size:13px;margin-bottom:2px}.arg-manual-step span{color:#a8aca4;font-size:12px;line-height:1.45}
    .arg-manual-list{margin:10px 0 14px;padding:0;list-style:none;display:grid;gap:6px}
    .arg-manual-list li{position:relative;padding-left:18px;color:#b4b6ad;font-size:13px;line-height:1.5}
    .arg-manual-list li::before{content:"◆";position:absolute;left:0;top:.16em;color:#8a7329;font-size:8px}
    .arg-manual-figure{margin:20px 0 10px;border:1px solid rgba(212,175,55,.28);border-radius:15px;overflow:hidden;background:#071009;box-shadow:0 18px 45px rgba(0,0,0,.25)}
    .arg-manual-media{position:relative;aspect-ratio:16/9;display:grid;place-items:center;overflow:hidden;background:linear-gradient(135deg,rgba(116,172,223,.07),rgba(212,175,55,.08)),#08110b}
    .arg-manual-media img{width:100%;height:100%;display:block;object-fit:contain;background:#050907}
    .arg-manual-placeholder{position:absolute;inset:0;display:none;place-items:center;text-align:center;padding:22px;color:#867c58;background:radial-gradient(circle at 50% 45%,rgba(212,175,55,.06),transparent 36%)}
    .arg-manual-placeholder strong{display:block;color:#c4a94a;font:800 16px/1.2 Georgia,serif;margin-bottom:5px}.arg-manual-placeholder small{color:#7f857c;font-size:11px}
    .arg-manual-figure.is-missing .arg-manual-media img{display:none}.arg-manual-figure.is-missing .arg-manual-placeholder{display:grid}
    .arg-manual-figure figcaption{display:flex;justify-content:space-between;gap:16px;padding:10px 13px;background:rgba(9,16,11,.94);color:#949a91;font-size:11px;line-height:1.4}
    .arg-manual-figure figcaption b{color:#ddd2b7;font-weight:800}
    .arg-manual-media-badge{position:absolute;right:9px;top:9px;padding:5px 7px;border:1px solid rgba(116,172,223,.32);border-radius:999px;background:rgba(3,8,5,.77);color:#b8d7ee;font-size:9px;font-weight:800;letter-spacing:.04em;display:none}
    .arg-manual-figure.is-animated .arg-manual-media-badge{display:block}
    .arg-manual-keywords{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:14px 0}
    .arg-manual-keyword{padding:11px 12px;border:1px solid rgba(255,255,255,.075);border-radius:10px;background:rgba(255,255,255,.025)}
    .arg-manual-keyword b{display:block;color:#f0d56c;font-size:12px;margin-bottom:3px}.arg-manual-keyword span{display:block;color:#9fa49d;font-size:11px;line-height:1.4}
    .arg-manual-daily{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin:14px 0}
    .arg-manual-day{padding:10px 7px;text-align:center;border:1px solid rgba(212,175,55,.18);border-radius:10px;background:rgba(7,13,9,.58)}
    .arg-manual-day b{display:block;color:#f0d56c;font-size:11px;margin-bottom:4px}.arg-manual-day span{display:block;color:#aeb1a9;font-size:10px;line-height:1.3}
    .arg-manual-route{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:14px 0}
    .arg-manual-route div{position:relative;padding:14px 12px 12px;border:1px solid rgba(116,172,223,.17);border-radius:11px;background:rgba(116,172,223,.04);color:#adb8bd;font-size:12px;line-height:1.4}
    .arg-manual-route b{display:block;color:#d8e8f2;margin-bottom:4px;font-size:12px}
    .arg-manual-footer-note{margin-top:32px;padding:18px;text-align:center;border:1px solid rgba(212,175,55,.18);border-radius:13px;background:rgba(3,8,5,.35);color:#8f958d;font-size:11px;line-height:1.55}
    @media(max-width:900px){
      #${MANUAL_OVERLAY_ID}{padding:8px}.arg-manual-shell{width:100%;height:calc(100dvh - 16px);border-radius:14px}
      .arg-manual-layout{grid-template-columns:1fr;grid-template-rows:auto 1fr}
      .arg-manual-toc{display:flex;gap:4px;overflow-x:auto;overflow-y:hidden;padding:8px;border-right:0;border-bottom:1px solid rgba(212,175,55,.18)}
      .arg-manual-toc-title{display:none}.arg-manual-toc button{width:auto;min-width:max-content;margin:0;padding:7px 9px;font-size:10px}.arg-manual-toc-num{display:none}
      .arg-manual-content{padding:23px 18px 55px;scroll-padding-top:18px}
      .arg-manual-header{min-height:64px;padding:8px 11px}.arg-manual-logo{width:44px;height:44px}.arg-manual-subtitle{display:none}.arg-manual-close{width:38px;height:38px;flex-basis:38px}
      .arg-manual-keywords{grid-template-columns:repeat(2,minmax(0,1fr))}.arg-manual-daily{grid-template-columns:repeat(4,minmax(0,1fr))}.arg-manual-route{grid-template-columns:1fr 1fr}
    }
    @media(max-width:560px){
      .arg-manual-grid,.arg-manual-keywords,.arg-manual-route{grid-template-columns:1fr}.arg-manual-daily{grid-template-columns:repeat(2,minmax(0,1fr))}
      .arg-manual-figure figcaption{display:block}.arg-manual-figure figcaption span{display:block;margin-top:3px}
    }
    @media(prefers-reduced-motion:reduce){.arg-manual-content{scroll-behavior:auto}.main-menu-help-link{transition:none}}
  `;
  document.head.appendChild(style);
}

let manualMenuFitListenersInstalled = false;
let manualMenuFitRaf = 0;

function fitMainMenuHelpLink() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const link = document.getElementById('menu-how-to-play');
  const market = document.getElementById('menu-trade-market');
  if (!link || !market) return;

  const isMobile = document.documentElement.classList.contains('argentinia-mobile');
  if (!isMobile) {
    link.style.removeProperty('--arg-manual-help-max-width');
    return;
  }

  const vv = window.visualViewport;
  const viewportRight = (vv ? vv.offsetLeft + vv.width : window.innerWidth) - 8;
  const marketRect = market.getBoundingClientRect();
  // Gap mobile canónico = 4 px. El ancho disponible sólo modifica este enlace nuevo;
  // nunca toca Opciones, Tienda, Ranking ni Mercado de Pases.
  const available = Math.max(40, Math.floor(viewportRight - marketRect.right - 4));
  link.style.setProperty('--arg-manual-help-max-width', `${Math.min(96, available)}px`);
}

function scheduleMainMenuHelpLinkFit() {
  if (typeof window === 'undefined') return;
  if (manualMenuFitRaf) window.cancelAnimationFrame?.(manualMenuFitRaf);
  const run = () => { manualMenuFitRaf = 0; fitMainMenuHelpLink(); };
  if (window.requestAnimationFrame) manualMenuFitRaf = window.requestAnimationFrame(run);
  else setTimeout(run, 0);
}

function installManualMenuFitListeners() {
  if (manualMenuFitListenersInstalled || typeof window === 'undefined') return;
  manualMenuFitListenersInstalled = true;
  window.addEventListener('resize', scheduleMainMenuHelpLinkFit, { passive:true });
  window.visualViewport?.addEventListener('resize', scheduleMainMenuHelpLinkFit, { passive:true });
  window.visualViewport?.addEventListener('scroll', scheduleMainMenuHelpLinkFit, { passive:true });
}

export function prepareGameManualUI() {
  ensureManualStyles();
  installManualMenuFitListeners();
  // showMainMenu crea y agrega el overlay sincrónicamente después de esta llamada.
  // El microtask corre cuando #menu-how-to-play ya existe en el DOM.
  if (typeof queueMicrotask === 'function') queueMicrotask(scheduleMainMenuHelpLinkFit);
  else Promise.resolve().then(scheduleMainMenuHelpLinkFit);
}

function figure(key, title, caption, animatedCandidate = false) {
  const config = MANUAL_MEDIA[key] || {};
  const base = `./assets/images/manual/${key}`;
  return `
    <figure class="arg-manual-figure" data-manual-figure="${key}">
      <div class="arg-manual-media">
        <img src="${base}.png" data-manual-base="${base}" data-prefer-animated="${animatedCandidate && config.preferAnimated ? 'true' : 'false'}" alt="${config.alt || title}" loading="lazy" decoding="async">
        <div class="arg-manual-placeholder"><div><strong>${key}.png</strong><small>Placeholder del manual · subilo a assets/images/manual/</small></div></div>
        <span class="arg-manual-media-badge">DEMO ANIMADA</span>
      </div>
      <figcaption><b>${title}</b><span>${caption}</span></figcaption>
    </figure>`;
}

function keyword(name, text) {
  return `<div class="arg-manual-keyword"><b>${name}</b><span>${text}</span></div>`;
}

function manualHTML() {
  const toc = [
    ['inicio','Empezar'],['objetivo','Objetivo y mesa'],['simple','Partida simple'],['turno','Turno y maná'],
    ['combate','Combate'],['pila','Pila y prioridad'],['habilidades','Habilidades'],['torneo','Torneo'],
    ['multi','Multijugador'],['tienda','Tienda'],['mercado','Mercado de Pases'],['daily','Daily Rewards'],
    ['mazos','Mazos y colección'],['completo','Juego completo']
  ];
  return `
    <div class="arg-manual-shell" role="document">
      <header class="arg-manual-header">
        <img class="arg-manual-logo" src="./assets/images/ui/logo.png" alt="" onerror="this.style.display='none'">
        <div class="arg-manual-heading">
          <p class="arg-manual-kicker">MANUAL DEL JUGADOR</p>
          <h1 class="arg-manual-title" id="arg-manual-title">¿Cómo se juega?</h1>
          <p class="arg-manual-subtitle">Reglas, modos, mecánicas y sistemas de Argentinia.</p>
        </div>
        <button class="arg-manual-close" type="button" data-manual-close aria-label="Cerrar manual">×</button>
      </header>
      <div class="arg-manual-layout">
        <nav class="arg-manual-toc" aria-label="Contenido del manual">
          <div class="arg-manual-toc-title">Contenido</div>
          ${toc.map(([id,label],i)=>`<button type="button" data-manual-target="${id}" class="${i===0?'is-active':''}"><span class="arg-manual-toc-num">${String(i+1).padStart(2,'0')}</span>${label}</button>`).join('')}
        </nav>
        <main class="arg-manual-content" data-manual-scroll tabindex="0">
          <section class="arg-manual-hero" id="manual-inicio" data-manual-section="inicio">
            <p class="arg-manual-section-kicker">BIENVENIDO A LA MESA</p>
            <h2>Aprendé lo básico.<br><span>Después rompé las reglas con las cartas.</span></h2>
            <p>Argentinia es un juego de cartas estratégico por turnos. Construís un mazo, generás maná con Tierras, desplegás permanentes y lanzás hechizos para superar al rival. Las cartas pueden cambiar casi cualquier regla general: cuando una carta contradice una regla básica, seguí el texto de la carta y las opciones que habilita la interfaz.</p>
            <div class="arg-manual-quick"><span>20 HP iniciales</span><span>Mano inicial de 7</span><span>Mazos construidos</span><span>IA y PvP</span><span>Torneos</span><span>Economía de colección</span></div>
          </section>

          <section class="arg-manual-section" id="manual-objetivo" data-manual-section="objetivo">
            <p class="arg-manual-section-kicker">REGLAS CENTRALES</p><h3>Objetivo, zonas y condiciones de victoria</h3>
            <p>Cada jugador comienza normalmente con <strong>20 HP</strong>. Ganás cuando llevás los HP del rival a 0 o menos, cuando el rival llega a <strong>10 contadores de Veneno</strong>, o cuando intenta robar una carta de un mazo vacío. También podés ganar si el rival abandona.</p>
            <div class="arg-manual-grid">
              <div class="arg-manual-card"><h4>Mano</h4><p>Cartas privadas que podés jugar cuando su tipo, costo y timing lo permiten.</p></div>
              <div class="arg-manual-card"><h4>Campo de batalla</h4><p>Tierras, criaturas, apoyos y Semidioses permanecen acá hasta que un efecto los mueva.</p></div>
              <div class="arg-manual-card"><h4>Mazo</h4><p>Tu biblioteca. Robás desde arriba; algunas cartas buscan, miran o reordenan cartas.</p></div>
              <div class="arg-manual-card"><h4>Cementerio y Exilio</h4><p>El Cementerio recibe cartas usadas o destruidas. Exilio es una zona separada y más difícil de recuperar.</p></div>
            </div>
            ${figure('manual1','La mesa completa','Ideal: una captura limpia donde se vean mano, Tierras, criaturas, apoyos, mazo, cementerio, exilio, HP y panel de fases.')}
          </section>

          <section class="arg-manual-section" id="manual-simple" data-manual-section="simple">
            <p class="arg-manual-section-kicker">MODO DE ENTRADA</p><h3>Partida simple contra la IA</h3>
            <p><strong>PARTIDA SIMPLE</strong> es la forma más directa de practicar. Te enfrenta a la IA y usa la dificultad elegida en Opciones. Hay distintos niveles de dificultad para que puedas aprender el flujo, probar un mazo nuevo o buscar un desafío mayor.</p>
            <div class="arg-manual-steps">
              <div class="arg-manual-step"><div><b>Elegí la dificultad</b><span>Desde Opciones podés cambiar entre los niveles disponibles de IA.</span></div></div>
              <div class="arg-manual-step"><div><b>Elegí o prepará tu mazo</b><span>Con una cuenta iniciada podés jugar con tus mazos guardados y progresar con tu colección.</span></div></div>
              <div class="arg-manual-step"><div><b>Confirmá tu mano inicial</b><span>Robás 7. Podés hacer mulligan: volvés a barajar y robás 7; al quedarte, ponés al fondo tantas cartas como mulligans hayas hecho.</span></div></div>
              <div class="arg-manual-step"><div><b>Jugá hasta una condición final</b><span>La interfaz guía fases, prioridad, pagos, objetivos y combate.</span></div></div>
            </div>
            <div class="arg-manual-note">La recompensa de una partida y los valores económicos pueden cambiar por configuración del juego. El resultado y la liquidación se muestran al terminar.</div>
          </section>

          <section class="arg-manual-section" id="manual-turno" data-manual-section="turno">
            <p class="arg-manual-section-kicker">FLUJO DE PARTIDA</p><h3>Turno, Tierras, maná y tipos de carta</h3>
            <p>El turno recorre <strong>Enderezar → Mantenimiento → Robo → Main 1 → Combate → Main 2 → Paso final → Limpieza</strong>. En tus fases principales podés bajar una Tierra por turno, salvo que un efecto te permita jugar más.</p>
            <p>Las Tierras producen maná. Cuando un costo requiere maná, la interfaz te deja elegir las fuentes válidas. Girar una Tierra indica que ya fue utilizada para ese recurso hasta que vuelva a enderezarse.</p>
            <div class="arg-manual-grid">
              <div class="arg-manual-card"><h4>Tierras</h4><p>Generan maná y habilitan tu curva de juego. No se lanzan como hechizos.</p></div>
              <div class="arg-manual-card"><h4>Criaturas</h4><p>Atacan, bloquean y pueden tener habilidades disparadas, estáticas o activadas.</p></div>
              <div class="arg-manual-card"><h4>Instantáneos</h4><p>Pueden jugarse cuando tenés prioridad, incluso para responder a otras acciones.</p></div>
              <div class="arg-manual-card"><h4>Conjuros</h4><p>Normalmente se juegan en tu fase principal, con la Pila vacía.</p></div>
              <div class="arg-manual-card"><h4>Artefactos y Encantamientos</h4><p>Permanentes de apoyo; algunos se anexan, otros modifican reglas o generan valor continuo.</p></div>
              <div class="arg-manual-card"><h4>Semidioses, Crónicas y Transportes</h4><p>Usan reglas propias de Creencia, Capítulos y Tripular explicadas más abajo.</p></div>
            </div>
            ${figure('manual2','Pagar y lanzar una carta','Recomendado ANIMADO: mostrar una carta desde la mano, selección de Tierras/maná, confirmación y entrada a la Pila.',true)}
          </section>

          <section class="arg-manual-section" id="manual-combate" data-manual-section="combate">
            <p class="arg-manual-section-kicker">ATACAR Y DEFENDER</p><h3>Combate paso a paso</h3>
            <div class="arg-manual-steps">
              <div class="arg-manual-step"><div><b>Declarás atacantes</b><span>Elegís cuáles de tus criaturas disponibles atacan. Atacar normalmente las gira, salvo Alerta.</span></div></div>
              <div class="arg-manual-step"><div><b>El defensor declara bloqueadores</b><span>Cada bloqueo debe ser legal según habilidades como Vuela, Alcance o Protección.</span></div></div>
              <div class="arg-manual-step"><div><b>Se resuelve el daño</b><span>Atacante y bloqueador intercambian daño; Iniciativa y Dos golpes pueden crear subpasos de daño distintos.</span></div></div>
              <div class="arg-manual-step"><div><b>Sobrevive o va al Cementerio</b><span>El motor revisa daño letal, Letal, Irrompible, contadores y demás efectos antes de continuar.</span></div></div>
            </div>
            <div class="arg-manual-note arg-manual-warning">Una criatura recién entrada suele tener mareo de invocación: no puede atacar ni pagar costos de girarse hasta que corresponda, salvo que tenga <strong>Apuro</strong>.</div>
            ${figure('manual3','Ataque, bloqueo y daño','Recomendado ANIMADO: un ataque con 2–3 criaturas, asignación de bloqueadores y resolución de daño/flechas.',true)}
          </section>

          <section class="arg-manual-section" id="manual-pila" data-manual-section="pila">
            <p class="arg-manual-section-kicker">RESPUESTAS</p><h3>Pila, prioridad y objetivos</h3>
            <p>Los hechizos y muchas habilidades no resuelven instantáneamente: primero entran en la <strong>Pila</strong>. Cada jugador recibe <strong>prioridad</strong> para responder. Cuando ambos pasan sin agregar nada, resuelve el elemento superior. Por eso, en general, <strong>lo último que entró es lo primero que resuelve</strong>.</p>
            <ul class="arg-manual-list"><li>Los Instantáneos y habilidades con timing adecuado pueden responder a otra acción.</li><li>Los Conjuros, Equipar y habilidades de Creencia suelen exigir timing de conjuro: tu fase principal y Pila vacía.</li><li>Si una carta pide un objetivo, la interfaz resalta únicamente opciones legales.</li><li>Si un objetivo deja de ser legal antes de resolver, el efecto puede no poder aplicarse a ese objetivo.</li></ul>
            ${figure('manual5','Responder usando la Pila','Recomendado ANIMADO: hechizo A → respuesta B → ambos pasan prioridad → B resuelve antes que A.',true)}
          </section>

          <section class="arg-manual-section" id="manual-habilidades" data-manual-section="habilidades">
            <p class="arg-manual-section-kicker">DICCIONARIO DE JUEGO</p><h3>Habilidades y mecánicas principales</h3>
            <p>Las cartas usan terminología propia de Argentinia. Este resumen cubre las palabras que más vas a encontrar; el texto específico de cada carta termina de definir qué hace.</p>
            ${figure('manual4','Cómo leer una carta','Ideal: una carta ampliada con costo, tipo, texto, habilidades, fuerza/resistencia y rareza claramente visibles.')}
            <h4>Habilidades de criatura</h4>
            <div class="arg-manual-keywords">
              ${keyword('Vuela','Sólo puede ser bloqueada por criaturas con Vuela o Alcance.')}
              ${keyword('Alcance','Puede bloquear criaturas con Vuela.')}
              ${keyword('Arrolla','El daño de combate excedente puede continuar hacia el jugador o destino atacado.')}
              ${keyword('Alerta','Atacar no hace que la criatura se gire.')}
              ${keyword('Apuro','Puede atacar y usar habilidades con costo de girar sin esperar un turno completo bajo tu control.')}
              ${keyword('Intimidante','Necesita al menos dos bloqueadores para ser bloqueada.')}
              ${keyword('Absorción','El controlador gana tanta vida como daño haga la fuente.')}
              ${keyword('Letal','Una cantidad positiva de daño de esa fuente alcanza para considerar letal a una criatura.')}
              ${keyword('Iniciativa','Hace daño en el subpaso de daño de iniciativa.')}
              ${keyword('Dos golpes','Hace daño en iniciativa y nuevamente en el paso de daño normal si sigue presente.')}
              ${keyword('Irrompible','No muere por destrucción ni por daño letal; exiliarla o reducir su resistencia de otras formas puede seguir funcionando.')}
              ${keyword('Muralla','No puede atacar salvo que un efecto permita lo contrario.')}
              ${keyword('Intocable','No puede ser objetivo de hechizos o habilidades controlados por el rival.')}
              ${keyword('Impuesto {N}','Si el rival la hace objetivo, debe pagar el Impuesto o su hechizo/habilidad es contrarrestado.')}
              ${keyword('Protección de un color','Impide interacciones relevantes provenientes de ese color, incluyendo bloqueo, objetivos, daño y anexos incompatibles.')}
              ${keyword('Contagio','A criaturas les deja contadores -1/-1; a jugadores les coloca Veneno. Diez de Veneno hacen perder la partida.')}
              ${keyword('Al toque','Permite lanzar esa carta con timing de Instantáneo.')}
            </div>
            <h4>Mecánicas avanzadas</h4>
            <div class="arg-manual-grid">
              <div class="arg-manual-card"><h4>Anticipá</h4><p>Mirá cartas superiores y elegí cuáles mandar al fondo; las demás permanecen arriba.</p></div>
              <div class="arg-manual-card"><h4>Chusmeá</h4><p>Mirá cartas superiores y elegí cuáles mandar al Cementerio; las demás quedan arriba.</p></div>
              <div class="arg-manual-card"><h4>Amplificá</h4><p>Elegí permanentes o jugadores que ya tengan contadores; cada elegido recibe uno más de cada tipo que ya tenga.</p></div>
              <div class="arg-manual-card"><h4>Yapa</h4><p>Al lanzar la carta podés pagar un costo adicional para obtener el beneficio extra indicado.</p></div>
              <div class="arg-manual-card"><h4>Otra vuelta</h4><p>Permite volver a lanzar una carta desde el Cementerio pagando el costo indicado.</p></div>
              <div class="arg-manual-card"><h4>Zafar</h4><p>Permite jugar desde el Cementerio pagando su costo y exiliando las cartas requeridas.</p></div>
              <div class="arg-manual-card"><h4>En espera</h4><p>Exiliás la carta con contadores de Tiempo; en tus mantenimientos pierde Tiempo y, al quitar el último, puede jugarse sin pagar su costo de maná.</p></div>
              <div class="arg-manual-card"><h4>Vaquita</h4><p>Podés girar criaturas válidas para ayudar a pagar parte del costo de maná.</p></div>
              <div class="arg-manual-card"><h4>Rebuscar</h4><p>Podés exiliar cartas del Cementerio para reducir la parte genérica de un costo.</p></div>
              <div class="arg-manual-card"><h4>Pelea</h4><p>Dos criaturas se hacen daño entre sí igual a su fuerza; no es un ataque y no gira por sí sola a las criaturas.</p></div>
              <div class="arg-manual-card"><h4>Tripular</h4><p>Girás criaturas con suficiente fuerza total para convertir un Transporte en criatura según su habilidad.</p></div>
              <div class="arg-manual-card"><h4>Equipar</h4><p>Anexa un Equipamiento a una criatura propia usando timing de conjuro, salvo reglas específicas de la carta.</p></div>
              <div class="arg-manual-card"><h4>Crónicas</h4><p>Entran con Capítulo, avanzan por capítulos y disparan cada habilidad cruzada. Después del capítulo final se sacrifican cuando ya no quedan capítulos pendientes.</p></div>
              <div class="arg-manual-card"><h4>Semidioses</h4><p>Usan Creencia. Sus habilidades de +/− Creencia se activan con timing de conjuro y, normalmente, una vez por turno.</p></div>
              <div class="arg-manual-card"><h4>Transformar</h4><p>Algunas cartas de dos caras cambian su cara efectiva en el campo de batalla y conservan su estado físico.</p></div>
              <div class="arg-manual-card"><h4>Arraigo</h4><p>Habilidades que reaccionan a la entrada de Tierras o al evento indicado por la propia carta.</p></div>
            </div>
          </section>

          <section class="arg-manual-section" id="manual-torneo" data-manual-section="torneo">
            <p class="arg-manual-section-kicker">CUATRO PARTIDOS</p><h3>Torneo</h3>
            <p>El Torneo arma un fixture de <strong>16 participantes</strong> y eliminación directa: <strong>Octavos → Cuartos → Semifinal → Final</strong>. Cuatro victorias te separan del campeonato.</p>
            <ul class="arg-manual-list"><li>Perder un partido te elimina del Torneo.</li><li>Entre partidos podés volver al menú, cerrar el juego y continuar más tarde.</li><li>Una partida de Torneo ya iniciada no se pausa: abandonar, cerrar o recargar durante esa partida cuenta como derrota.</li><li>Cada ronda ganada entrega el premio configurado para esa etapa.</li><li>Si superaste el límite diario de Torneos premiados, podés seguir jugando en modo práctica.</li></ul>
            ${figure('manual6','Fixture del Torneo','Captura recomendada: cuadro de 16 participantes con la ronda actual, tu recorrido y premios visibles.')}
          </section>

          <section class="arg-manual-section" id="manual-multi" data-manual-section="multi">
            <p class="arg-manual-section-kicker">JUGAR CON OTRA PERSONA</p><h3>Multijugador, ELO, chat y emotes</h3>
            <p>Desde <strong>Multijugador</strong> podés crear una sala y compartir un código de 6 caracteres, o unirte a la sala de otra persona usando su código. Una vez emparejados, cada jugador elige su mazo y confirma su preparación antes de empezar.</p>
            <ul class="arg-manual-list"><li>Las acciones se sincronizan con el servidor; si la conexión se corta, el juego puede pausar acciones mientras reconecta.</li><li>El resultado puede modificar tu ELO y aparece resumido al final de la partida.</li><li>La Bitácora puede mostrar mensajes de jugadores y del sistema. Podés silenciar la comunicación del rival durante esa partida.</li><li>Los emotes gratuitos o adquiridos en Tienda pueden usarse durante partidas multijugador.</li></ul>
            <div class="arg-manual-note">El Ranking Global permite comparar rendimiento público entre jugadores. Las reglas anti-farming pueden limitar qué partidas otorgan recompensas económicas aunque el resultado deportivo se registre.</div>
          </section>

          <section class="arg-manual-section" id="manual-tienda" data-manual-section="tienda">
            <p class="arg-manual-section-kicker">PROGRESIÓN Y COLECCIÓN</p><h3>Tienda y sus secciones</h3>
            <p>La Tienda usa los saldos del juego y muestra siempre los costos vigentes. Las compras que afectan colección o economía se confirman con el servidor.</p>
            <div class="arg-manual-grid">
              <div class="arg-manual-card"><h4>Sobres</h4><p>Comprás el sobre y queda guardado en <strong>Mi Cofre</strong>. Al abrir un sobre estándar recibís 15 cartas y 1 Ficha.</p></div>
              <div class="arg-manual-card"><h4>Avisos Clasificados</h4><p>Siete cartas rotan cada lunes: 4 Comunes, 2 Poco Comunes y 1 Rara o Mítica. Cada aviso puede comprarse una vez por semana.</p></div>
              <div class="arg-manual-card"><h4>Mazos Prearmados</h4><p>Mazos competitivos de 60 cartas organizados por color y arquetipo. Al comprarlos, sus cartas pasan también a tu colección.</p></div>
              <div class="arg-manual-card"><h4>Fichas / Mejoras</h4><p>Permiten aplicar mejoras permanentes a criaturas elegibles de tu colección, respetando los límites del constructor de mazos.</p></div>
              <div class="arg-manual-card"><h4>Emojis</h4><p>Hay una base gratuita y emotes premium desbloqueables con Puntos para usar en partidas multiplayer.</p></div>
              <div class="arg-manual-card"><h4>Mi Cofre</h4><p>Guarda sobres y recompensas especiales para que las abras cuando quieras desde el menú principal.</p></div>
            </div>
            ${figure('manual7','La Tienda','Captura recomendada: vista principal con Sobres, Clasificados, Mazos Prearmados, Fichas/Mejoras y Emojis.')}
          </section>

          <section class="arg-manual-section" id="manual-mercado" data-manual-section="mercado">
            <p class="arg-manual-section-kicker">INTERCAMBIO ENTRE JUGADORES</p><h3>Mercado de Pases</h3>
            <p>El Mercado de Pases permite intercambiar <strong>1 carta ↔ 1 carta</strong> entre jugadores. No intervienen Puntos, Fichas ni sobres.</p>
            <div class="arg-manual-steps">
              <div class="arg-manual-step"><div><b>Publicá una carta</b><span>Elegís una copia disponible de tu colección y definís qué buscás a cambio.</span></div></div>
              <div class="arg-manual-step"><div><b>Explorá publicaciones</b><span>Filtrá el mercado y encontrá publicaciones compatibles con cartas que realmente podés ofrecer.</span></div></div>
              <div class="arg-manual-step"><div><b>Hacé una oferta</b><span>Ofrecés una de tus cartas elegibles por la carta publicada.</span></div></div>
              <div class="arg-manual-step"><div><b>El dueño acepta o rechaza</b><span>Al aceptar, el servidor vuelve a validar ambas colecciones y completa el intercambio de forma atómica.</span></div></div>
            </div>
            <p>También podés revisar tus publicaciones, ofertas salientes y el historial de intercambios completados. Los límites activos se muestran o aplican desde la configuración vigente del juego.</p>
            ${figure('manual8','Publicación y oferta','Captura recomendada: una publicación mostrando la carta ofrecida, BUSCO, una oferta compatible y los botones de aceptar/rechazar.')}
          </section>

          <section class="arg-manual-section" id="manual-daily" data-manual-section="daily">
            <p class="arg-manual-section-kicker">VOLVÉ CADA DÍA</p><h3>Daily Rewards y Mi Cofre</h3>
            <p>Las Recompensas diarias usan una <strong>racha de 7 accesos consecutivos</strong>. Tu primer acceso válido es Día 1; cada fecha consecutiva avanza un escalón. Si faltás un día, el próximo acceso vuelve a Día 1. Después de completar Día 7, el acceso consecutivo siguiente inicia un nuevo ciclo.</p>
            <div class="arg-manual-daily">
              <div class="arg-manual-day"><b>Día 1</b><span>30 Puntos</span></div><div class="arg-manual-day"><b>Día 2</b><span>30 Puntos</span></div><div class="arg-manual-day"><b>Día 3</b><span>30 Puntos</span></div><div class="arg-manual-day"><b>Día 4</b><span>1 Ficha</span></div><div class="arg-manual-day"><b>Día 5</b><span>60 Puntos</span></div><div class="arg-manual-day"><b>Día 6</b><span>1 Sobre + 100 Puntos</span></div><div class="arg-manual-day"><b>Día 7</b><span>Mítica asegurada</span></div>
            </div>
            <p>El Día 6 guarda el sobre en Mi Cofre. El Día 7 guarda una recompensa mítica asegurada para abrir desde allí. La racha usa la fecha oficial del servidor en Argentina (UTC−3), no el reloj de tu dispositivo.</p>
            ${figure('manual9','Racha de 7 días','Captura recomendada: pantalla de Recompensas diarias con la racha actual, días reclamados y próximo premio.')}
          </section>

          <section class="arg-manual-section" id="manual-mazos" data-manual-section="mazos">
            <p class="arg-manual-section-kicker">CONSTRUCCIÓN</p><h3>Mazos, colección y Enciclopedia</h3>
            <p><strong>Mis Mazos</strong> te deja crear, editar y guardar mazos. El formato actual trabaja con mazos de 60 cartas y un máximo general de 4 copias de una misma carta, salvo Tierras básicas. El constructor valida automáticamente tamaño, propiedad de cartas y límites vigentes antes de guardar.</p>
            <p>La <strong>Enciclopedia</strong> sirve para explorar el pool y tu progreso de colección. Las cartas recién obtenidas pueden destacarse en el constructor para ayudarte a encontrarlas.</p>
            ${figure('manual10','Constructor de mazos','Captura recomendada: colección a un lado, mazo armado al otro, filtros visibles y contador 60/60.')}
          </section>

          <section class="arg-manual-section" id="manual-completo" data-manual-section="completo">
            <p class="arg-manual-section-kicker">RUTA SUGERIDA</p><h3>El juego completo, en qué orden conviene descubrirlo</h3>
            <p>No necesitás aprender todo antes de jugar. Una buena progresión es ir incorporando sistemas a medida que entendés la mesa.</p>
            <div class="arg-manual-route">
              <div><b>1 · Partida Simple</b>Aprendé turnos, maná, combate y timing contra la IA.</div>
              <div><b>2 · Enciclopedia</b>Conocé cartas y detectá colores/arquetipos que te interesen.</div>
              <div><b>3 · Mis Mazos</b>Construí un mazo propio y probalo varias veces.</div>
              <div><b>4 · Daily + Cofre</b>Reclamá la racha y abrí las recompensas que vayas acumulando.</div>
              <div><b>5 · Tienda</b>Usá Puntos y Fichas para expandir o especializar tu colección.</div>
              <div><b>6 · Mercado</b>Intercambiá copias disponibles por cartas que necesitás.</div>
              <div><b>7 · Multijugador</b>Probá tu mazo contra otra persona y empezá a mover tu ELO.</div>
              <div><b>8 · Torneo</b>Enfrentá un recorrido de cuatro partidos y buscá el campeonato.</div>
              <div><b>9 · Ranking</b>Seguí tu progreso competitivo a largo plazo.</div>
            </div>
            <div class="arg-manual-footer-note">Manual frontend de referencia. Los costos, premios, límites y balance pueden actualizarse desde la configuración del juego; ante una diferencia, la interfaz y el texto actual de cada carta tienen prioridad.</div>
          </section>
        </main>
      </div>
    </div>`;
}

async function assetExists(url) {
  try {
    const response = await fetch(url, { method:'HEAD', cache:'force-cache', credentials:'same-origin' });
    return response.ok;
  } catch (_) {
    return false;
  }
}

function bindManualMedia(root) {
  root.querySelectorAll('img[data-manual-base]').forEach(img => {
    const figureEl = img.closest('.arg-manual-figure');
    const markMissing = () => figureEl?.classList.add('is-missing');
    const markReady = () => figureEl?.classList.remove('is-missing');
    img.addEventListener('error', markMissing);
    img.addEventListener('load', markReady);
    if (img.complete) {
      if (img.naturalWidth > 0) markReady(); else markMissing();
    }
    if (img.dataset.preferAnimated !== 'true') return;
    const base = img.dataset.manualBase;
    void (async () => {
      for (const ext of ['webp','gif']) {
        const candidate = `${base}.${ext}`;
        if (!await assetExists(candidate)) continue;
        const preload = new Image();
        preload.onload = () => {
          img.src = candidate;
          figureEl?.classList.add('is-animated');
        };
        preload.onerror = () => {};
        preload.src = candidate;
        break;
      }
    })();
  });
}

export function showGameManual({ returnFocusTo = null } = {}) {
  if (typeof document === 'undefined') return null;
  ensureManualStyles();
  document.getElementById(MANUAL_OVERLAY_ID)?.remove();

  const overlay = document.createElement('div');
  overlay.id = MANUAL_OVERLAY_ID;
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-labelledby','arg-manual-title');
  overlay.innerHTML = manualHTML();
  document.body.appendChild(overlay);

  const scroll = overlay.querySelector('[data-manual-scroll]');
  const closeBtn = overlay.querySelector('[data-manual-close]');
  const tocButtons = [...overlay.querySelectorAll('[data-manual-target]')];
  const sections = [...overlay.querySelectorAll('[data-manual-section]')];
  const previousOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.documentElement.style.overflow = previousOverflow;
    window.removeEventListener('keydown', onKeyDown, true);
    overlay.remove();
    if (returnFocusTo?.isConnected) returnFocusTo.focus({ preventScroll:true });
  };
  const onKeyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  };
  closeBtn?.addEventListener('click', close);
  window.addEventListener('keydown', onKeyDown, true);

  tocButtons.forEach(btn => btn.addEventListener('click', () => {
    const section = overlay.querySelector(`[data-manual-section="${btn.dataset.manualTarget}"]`);
    if (!section || !scroll) return;
    scroll.scrollTo({ top: Math.max(0, section.offsetTop - 14), behavior:'smooth' });
  }));

  let ticking = false;
  const syncActiveToc = () => {
    ticking = false;
    if (!scroll) return;
    const y = scroll.scrollTop + 90;
    let active = sections[0]?.dataset.manualSection;
    for (const section of sections) {
      if (section.offsetTop <= y) active = section.dataset.manualSection;
      else break;
    }
    tocButtons.forEach(btn => btn.classList.toggle('is-active', btn.dataset.manualTarget === active));
  };
  scroll?.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(syncActiveToc);
  }, { passive:true });

  bindManualMedia(overlay);
  syncActiveToc();
  setTimeout(() => closeBtn?.focus({ preventScroll:true }), 0);
  return overlay;
}
