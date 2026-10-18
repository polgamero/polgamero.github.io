import { legacyEditorial, EDITORIAL_TOUR_STEPS, EDITORIAL_ZONES } from './editorialModel.js';
export const MENU_GUIDE_ID='guide-menu-v1';
const entries=[
  ['welcome',null,'Te damos la bienvenida a Argentinia. Este recorrido te muestra dónde jugar y cómo encontrar las funciones del juego. Podés salir cuando quieras y repetirlo desde Opciones.'],
  ['profile','#menu-public-profile','Acá aparece tu nombre de jugador. Abrí tu perfil para consultar tu identidad y tus estadísticas.'],
  ['wallet','.arg-menu-wallet','Puntos, Fichas y Esencia son los recursos del juego. Antes de comprar, mejorar o evolucionar una carta, cada pantalla te muestra su coste.'],
  ['support','#menu-moderation','Contactá a Soporte para pedir ayuda o informar un problema. Desde este lugar también podés consultar tus conversaciones.'],
  ['options','#menu-options','Ajustá el sonido, las animaciones y otras preferencias. También podés volver a ver este recorrido.'],
  ['play','#menu-play','Jugá una partida simple contra El Tano. Es un buen lugar para conocer tus cartas y practicar.'],
  ['tournament','#menu-tournament','Consultá el torneo, sus rondas y tus próximos enfrentamientos. La pantalla te explica los requisitos antes de comenzar.'],
  ['multiplayer','#menu-multiplayer','Entrá al lobby para encontrar jugadores, crear una partida o aceptar invitaciones. Se juega con tus mazos guardados.'],
  ['today','.arg-menu-today','Reunimos la recompensa diaria, el Santuario, tus logros y los eventos activos. Abrí esta sección para consultar lo que tenés disponible.','today'],
  ['news','#main-menu-news','Enterate de las novedades, anuncios y eventos que publica el juego.','news'],
  ['manual','#menu-how-to-play','Consultá el manual para conocer las reglas y las mecánicas de Argentinia. Podés volver cuando lo necesites.'],
  ['decks','#menu-mydecks','Creá y guardá mazos con tu colección. Revisá las cantidades y los requisitos antes de elegir uno para jugar.'],
  ['chest','#menu-chest','Tus sobres y otras recompensas disponibles se encuentran en Mi cofre. Entrá para ver qué podés abrir.'],
  ['workshop','#menu-workshop','En el taller podés consultar las máquinas de mejora, evolución y mezcla. Cada operación informa sus requisitos y coste antes de confirmarla.'],
  ['encyclopedia','#menu-encyclopedia','Explorá las cartas y sus reglas. Usá los filtros para encontrar cartas y conocer sus versiones.'],
  ['store','#menu-store','Consultá los productos disponibles y sus precios. Elegí una compra sólo después de revisar lo que incluye.','places'],
  ['market','#menu-trade-market','Publicá ofertas e intercambiá cartas con otros jugadores. Revisá los detalles y las reservas antes de confirmar.','places'],
  ['ranking','#menu-ranking','Consultá las posiciones del ranking global y compará tu progreso con otros jugadores.','places']
];
export const MENU_GUIDE_STEPS=Object.freeze(entries.map(([id,selector,body,reveal])=>Object.freeze({id,title:EDITORIAL_TOUR_STEPS[id],selector,body,reveal})));
export const TUTORIAL_ZONE_SCREENS=Object.freeze({sanctuary:'sanctuary-overlay',decks:'mydecks-overlay',chest:'chest-overlay',workshop:'workshop-overlay',encyclopedia:'encyclopedia-overlay',store:'store-overlay',market:'trade-market-overlay',tournament:'tournament-overlay',multiplayer:'multiplayer-overlay',achievements:'achievements-overlay'});
const zoneBodies={
  sanctuary:'Te damos la bienvenida al Santuario. Acá podés descubrir cartas especiales. Consultá los rituales y sus instrucciones; la pantalla te indica qué métodos tenés disponibles y qué necesitás para reclamar un descubrimiento.',
  decks:'En Mis mazos podés crear, editar y guardar tus propias combinaciones de cartas. Usá tu colección y revisá los requisitos del mazo antes de jugar.',
  chest:'En Mi cofre encontrás los sobres y recompensas que tenés disponibles. Elegí qué abrir y revisá las cartas que obtenés.',
  workshop:'Te damos la bienvenida a Mi taller. Elegí una máquina para consultar las mejoras, evoluciones o mezclas disponibles. Revisá siempre el coste y las copias que requiere la operación antes de confirmar.',
  encyclopedia:'La Enciclopedia te permite explorar cartas, consultar sus reglas y conocer sus versiones. Usá los filtros y abrí una carta para verla en detalle.',
  store:'En la Tienda podés consultar los productos disponibles. Cada compra informa su contenido y precio antes de confirmarla.',
  market:'El Mercado de pases reúne publicaciones e intercambios entre jugadores. Revisá las cartas, condiciones y recursos reservados antes de aceptar una oferta.',
  tournament:'Acá podés consultar el formato del torneo, sus rondas y tu progreso. Revisá los requisitos antes de comenzar y seguí las indicaciones del fixture.',
  multiplayer:'En Multijugador podés conversar en el lobby, invitar a otro jugador, crear una partida o unirte con un código. Elegí uno de tus mazos guardados cuando empiece la preparación.',
  achievements:'En Mis logros podés consultar tus objetivos y su progreso. Cuando un premio esté disponible, la pantalla te permite reclamarlo.'
};
export const zoneTutorialKey=zone=>`tutorial-zone-${zone}-v1`;
export function defaultZoneTutorial(zone){return {id:zoneTutorialKey(zone),title:`Te damos la bienvenida a ${EDITORIAL_ZONES[zone]||zone}`,paragraphs:[zoneBodies[zone]||'Consultá las opciones de esta pantalla para conocer sus funciones.'],contentKind:'tutorial',tutorialZone:zone,dismissible:true,presentation:legacyEditorial({title:EDITORIAL_ZONES[zone]||zone,paragraphs:[zoneBodies[zone]||'']})};}
export function defaultStepTutorial(stepId='welcome') {const step=MENU_GUIDE_STEPS.find(s=>s.id===stepId)||MENU_GUIDE_STEPS[0];return {title:step.title,paragraphs:[step.body],contentKind:'tutorial',tutorialZone:'main',tutorialStep:step.id,dismissible:true,presentation:legacyEditorial({title:step.title,paragraphs:[step.body]})};}
export function selectZoneTutorial(zone,announcements=[],now=new Date()){
  const ms=value=>value?.getTime?.()||value?.toMillis?.()||Date.parse(value)||0;
  return announcements.filter(a=>a.contentKind==='tutorial'&&a.tutorialZone===zone&&!a.finalizedAt&&(!ms(a.startAt)||ms(a.startAt)<=+now)&&(!ms(a.endAt)||ms(a.endAt)>+now)).sort((a,b)=>ms(b.updatedAt||b.createdAt)-ms(a.updatedAt||a.createdAt));
}
