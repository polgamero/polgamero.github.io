// Public teaching scenario. No account inventory, hidden production cards or backend writes.
export const GUIDED_MATCH_VERSION = 'tano-learning-v1';
export const LESSON_CARDS = Object.freeze({land:'tier_005',pibe:'crea_010',artifact:'art_012',semigod:'pw_004',burn:'inst_023',bottom:'crea_098',botBlue:'tier_003',botRed:'tier_005',botCreature:'crea_099',botInstant:'inst_009',botSorcery:'conj_002'});
export const PLAYER_DECK = Object.freeze({tier_005:24,crea_010:4,crea_099:4,art_012:4,pw_004:4,inst_023:4,inst_053:4,inst_027:4,crea_098:4,art_061:4});
export const TANO_DECK = Object.freeze({tier_003:12,tier_005:12,crea_010:4,crea_099:4,inst_009:4,conj_002:4,inst_001:4,inst_053:4,inst_027:4,crea_098:4,art_061:4});
export const FIRST_HAND = Object.freeze(['tier_005','tier_005','tier_005','tier_005','tier_005','crea_010','art_012']);
export const REDRAW_HAND = Object.freeze(['tier_005','tier_005','crea_010','art_012','pw_004','inst_023','crea_098']);
export const TANO_HAND = Object.freeze(['tier_003','tier_005','tier_003','tier_005','inst_009','inst_001','crea_099']);
export function orderLibrary(library, drawIds) {
  const rest=[...library],top=[];
  for(const id of drawIds){const index=rest.findIndex(card=>card.id===id);if(index<0)throw Error(`GUIDED_CARD_UNAVAILABLE:${id}`);top.push(rest.splice(index,1)[0]);}
  return [...rest,...top.reverse()]; // The engine draws with pop(). No cards are created here.
}
export function buildLessonDecks(cards) {
  const byId=new Map(cards.filter(card=>card.enabled!==false).map(card=>[card.id,card]));
  const build=spec=>Object.entries(spec).flatMap(([id,count])=>{
    const card=byId.get(id);if(!card)throw Error(`GUIDED_CARD_UNAVAILABLE:${id}`);
    return Array.from({length:count},()=>structuredClone(card));
  });
  return {local:orderLibrary(build(PLAYER_DECK),[...FIRST_HAND,'tier_005','tier_005','tier_005','tier_005']),rival:orderLibrary(build(TANO_DECK),[...TANO_HAND,'conj_002','tier_003','tier_005','tier_003','tier_003','tier_005'])};
}
const pile=(side,zone)=>`[data-board-side="${side}"] [data-animation-zone="${zone}"]`;
const card=(zone,id)=>`#${zone} .card[data-card-id="${id}"]`;
const info=(id,title,body,selector,extra={})=>({id,title,body:body+(/^(rival|your)-(lands|combat|support|planeswalkers)$/.test(id)?' Las cartas transparentes son ejemplos de esta zona; desaparecen antes de comenzar a jugar.':''),selector,kind:'info',...extra});
const action=(id,title,body,goal,selector,extra={})=>({id,title,body,goal,selector,kind:'action',autoAdvance:selector==='#btn-end-turn',...extra});
export const BOARD_TOUR = Object.freeze([
  info('rival-library','El mazo de El Tano','Cada mazo empieza con 60 cartas. Algunas ya están en la mano: el contador muestra las que quedan en la biblioteca. Se pierde al intentar robar sin cartas, no simplemente al quedar en cero.',pile('rival','library')),
  info('rival-hand','La mano rival','Ves cuántas cartas tiene El Tano, pero no cuáles son. La información oculta también importa.','#rival-hand'),
  ...[['lands','Tierras','Producen maná al girarse. El maná sirve para pagar costes.'],['combat','Criaturas','Atacan y bloquean.'],['support','Soporte','Acá quedan artefactos y encantamientos.'],['planeswalkers','Semidioses','Tienen Creencia y habilidades propias.']].map(([zone,title,body])=>info(`rival-${zone}`,`${title} del rival`,body,`#rival-${zone}`)),
  info('rival-graveyard','Cementerio rival','Los hechizos usados y las cartas que mueren suelen ir acá. Es información pública.',pile('rival','graveyard')),
  info('rival-exile','Exilio rival','Es otra zona, distinta del cementerio. Sólo se puede recuperar o jugar una carta exiliada si una regla lo permite.',pile('rival','exile')),
  info('rival-badge','Vida de El Tano','Empieza con 20. Si llega a 0 o menos, pierde. Algunas cartas permiten apuntar al jugador usando este badge.','.rival-card'),
  info('smart','Atajos y Smart Pass','Los atajos sirven para administrar prioridad. Primero aprenderemos a pasar manualmente: durante esta práctica quedan bloqueados para no saltarnos una explicación.','#solo-priority-shortcuts'),
  info('log','La bitácora','Acá se registran jugadas, pagos y efectos. Es útil para entender qué acaba de pasar.','#game-log-box'),
  info('your-library','Tu mazo','Robás de acá. El orden de esta práctica está preparado; en una partida normal se baraja.',pile('local','library')),
  info('your-hand','Tu mano','Estas cartas sólo las ves vos. Una carta en la mano todavía no está en el campo.','#local-hand'),
  ...[['lands','Tus tierras','Podés jugar una por turno, en una fase principal tuya y con la pila vacía. Jugar una tierra no usa la pila.'],['combat','Tus criaturas','Las enderezadas pueden bloquear. Las giradas no.'],['support','Tu soporte','Los artefactos y encantamientos permanecen en el campo después de resolver.'],['planeswalkers','Tus semidioses','Sus habilidades pueden sumar o gastar Creencia. Normalmente activás una por semidiós y por turno, en tu fase principal y con la pila vacía.']].map(([zone,title,body])=>info(`your-${zone}`,title,body,`#local-${zone}`)),
  info('your-graveyard','Tu cementerio','Mulligan no significa descartar: la carta elegida fue al fondo del mazo. Más adelante veremos una criatura morir e ir al cementerio.',pile('local','graveyard')),
  info('your-exile','Tu exilio','Recordá que exilio y cementerio no son la misma zona.',pile('local','exile')),
  info('phases','El turno tiene fases','Enderezás, pasás por mantenimiento, robás, jugás tu primera principal, combatís, tenés otra principal y cerrás el turno. Las luces indican dónde estás.','#phase-indicator-container'),
  info('priority','Turno y prioridad','Aunque sea tu turno, El Tano puede recibir prioridad para responder. Pasar prioridad no siempre termina el turno: si ambos pasan con algo en la pila, resuelve sólo lo que está arriba.','#btn-end-turn'),
  info('exit','Volver al menú','En una partida normal salir puede contar como abandono. Esta práctica no da premios, no afecta estadísticas y podés salir con el botón del tutorial.','#btn-abandon-game'),
  info('your-badge','Tu vida y tu identidad','Tu badge muestra tu vida y tu jugador. En esta práctica los dos comienzan con 20.','.local-card')
]);
export const LESSON_STEPS = Object.freeze([
  action('mulligan','Probemos un mulligan','Esta mano tiene muchas tierras. Mulligan devuelve la mano al mazo, baraja y roba siete nuevas. Hacelo una sola vez; después devolverás una carta al fondo.','redrawn','#btn-do-mulligan'),
  action('keep','Quedate con esta mano','Ahora hay tierras, criatura, soporte y un semidiós. Tocá “Quedarme” para elegir la carta que irá al fondo.','bottom','#btn-keep-hand'),
  action('bottom','Una carta al fondo','Elegí Gato del Tejado Caliente y confirmá. Quedás con seis cartas. Esa carta no va al cementerio.','mulliganDone',card('mulligan-overlay','crea_098')),
  ...BOARD_TOUR,
  action('land1','Tu primera tierra','Tocá Cerro Siete Colores en tu mano. Podés jugar una tierra por turno.','land1',card('local-hand','tier_005')),
  action('pibe-cast','Lanzá al Pibe de la Cuadra','Tocá el Pibe. Cuando el juego pida el pago, girá la tierra resaltada para producir un maná rojo. Vos hacés cada clic.','pibeStack',card('local-hand','crea_010'),{cast:'crea_010'}),
  info('pibe-stack','Todavía es un hechizo','Pagar no lo pone directamente en el campo. El Pibe está en la pila y ambos jugadores pueden responder.','#stack-container'),
  action('pibe-resolve','Dale paso a la resolución','Pasá prioridad. Si El Tano también pasa, el Pibe resolverá y entrará al campo.','pibeField','#btn-end-turn'),
  info('pibe-details','Leamos una criatura','Nombre: Pibe de la Cuadra.\nCoste: un maná rojo.\nRareza: común.\nFuerza/resistencia: 2/1.\nApuro: puede atacar este mismo turno.\nMareo de invocación: sin Apuro, una criatura recién entrada no puede atacar ni pagar sus propios costes de girarse.\nBloqueo: puede bloquear aun con mareo, si está enderezado.\nOtras habilidades: el Pibe no tiene habilidades activadas.',card('local-combat','crea_010'),{preview:'crea_010'}),
  action('to-attack','Lleguemos a combate','Tocá avanzar una vez. Llegaremos directamente a declarar atacantes.','attackWindow','#btn-end-turn'),
  action('choose-attacker','Elegí quién ataca','Tocá el Pibe para marcarlo como atacante. Apuro permite hacerlo aunque acaba de entrar.','attacker',card('local-combat','crea_010')),
  action('attack-confirm','Confirmá el ataque','Confirmá el ataque una vez. La práctica avanza hasta el daño; El Tano no tiene bloqueadores.','firstDamage','#btn-end-turn'),
  info('damage','Dos puntos de daño','El Pibe hizo 2 de daño: El Tano queda en 18. El Pibe se giró para atacar y no podrá bloquear mientras siga girado. Su daño no baja su propia resistencia.','.rival-card'),
  action('tano-instant','Ahora juega El Tano','Tocá pasar una vez para ver la jugada de El Tano: bajará una tierra azul y lanzará Beso en la Mejilla.','botInstantStack','#btn-end-turn'),
  info('instant','Un instantáneo en la pila','Beso en la Mejilla cuesta un azul y roba una carta. Un instantáneo puede jugarse en una ventana legal con prioridad, incluso durante el turno del rival.','#stack-container'),
  action('turn2','Resolvé y volvé a tu turno','Tocá pasar una vez: se resolverá el instantáneo y llegará tu turno, con tus permanentes enderezados y una carta nueva.','localTurn2','#btn-end-turn'),
  action('land2','Tu segunda tierra','Bajá otra tierra roja. Jugarla no gasta el maná de la primera.','land2',card('local-hand','tier_005')),
  action('artifact-cast','Un artefacto de soporte','Lanzá Billetera Vieja y pagá sus dos manás girando tus tierras.','artifactStack',card('local-hand','art_012'),{cast:'art_012'}),
  action('artifact-resolve','Dejá resolver el artefacto','Tocá pasar una vez para que Billetera Vieja resuelva y entre en soporte.','artifactField','#btn-end-turn'),
  info('artifact','El soporte también produce maná','Billetera Vieja puede girarse para agregar un maná incoloro. No es una tierra y no consume tu jugada de tierra del turno. La usaremos para pagar parte del coste genérico del semidiós.',card('local-support','art_012')),
  action('to-block','Esta vez reservá al Pibe','Tocá avanzar una vez: reservamos al Pibe para defender. El Tano bajará otra tierra y una criatura con Apuro.','blockWindow','#btn-end-turn'),
  info('block-explain','El Tano ataca','Foguista de Taller es 2/2 y tiene Apuro. Elegí tu criatura y después la criatura atacante para asignar el bloqueo. Un bloqueador no se gira por bloquear.','#rival-combat'),
  action('block','Asigná el bloqueo','Tocá al Pibe y después al Foguista atacante.','blockAssigned',card('local-combat','crea_010'),{block:true}),
  action('block-damage','Confirmá y resolvé el daño','Confirmá el bloqueo una vez. Avanzamos al daño: cada criatura hace su fuerza de daño a la otra.','creaturesDied','#btn-end-turn'),
  info('graveyard','Ambas criaturas murieron','El Pibe recibió 2 de daño teniendo resistencia 1; el Foguista recibió 2 teniendo resistencia 2. Ambas fueron al cementerio. El daño de ese ataque no llegó a tu vida.',pile('local','graveyard')),
  action('turn3','Un turno nuevo','Tocá avanzar una vez para llegar a tu siguiente principal, con las tierras y la Billetera enderezadas.','localTurn3','#btn-end-turn'),
  action('land3','Tu tercera tierra','Bajá una tierra roja más. Con tres tierras y la Billetera podés producir cuatro manás.','land3',card('local-hand','tier_005')),
  action('semigod-cast','Lanzá un semidiós','El Piromaníaco Callejero cuesta dos genéricos y dos rojos. Tocá la carta y pagá usando tus tres tierras y la Billetera. El incoloro sirve para el coste genérico, no para un símbolo rojo.','semigodStack',card('local-hand','pw_004'),{cast:'pw_004'}),
  action('semigod-resolve','Dejá entrar al semidiós','Tocá pasar una vez para que el semidiós resuelva y entre en su zona.','semigodField','#btn-end-turn'),
  info('semigod','Creencia y habilidades','El número del semidiós es Creencia, no fuerza/resistencia. Una habilidad +1 suma uno como coste; una negativa lo gasta. Se activa normalmente una sola habilidad por turno y pasa por la pila.',card('local-planeswalkers','pw_004'),{preview:'pw_004'}),
  action('loyalty','Probá la primera habilidad','Tocá al semidiós y elegí +1: Chispa. La habilidad hace un daño a El Tano.','loyaltyStack',card('local-planeswalkers','pw_004'),{loyalty:true}),
  action('loyalty-resolve','Resolvé la habilidad','Pasá prioridad para resolver Chispa. La Creencia ya se pagó al activarla.','loyaltyResolved','#btn-end-turn'),
  action('turn4','Preparémonos para responder','Tocá avanzar una vez para llegar a tu próximo turno. El Tano conserva maná para una respuesta.','localTurn4','#btn-end-turn'),
  action('land4','Una tierra más','Bajá otra tierra. Ahora vamos a lanzar un instantáneo y ver una respuesta encima.','land4',card('local-hand','tier_005')),
  action('burn','Apuntá al jugador','Lanzá Chispazo, elegí el badge de El Tano como objetivo y pagá un rojo. Esta vez el objetivo es el jugador, no el semidiós ni una criatura.','burnStack',card('local-hand','inst_023'),{cast:'inst_023',playerTarget:true}),
  action('response','El Tano puede responder','Pasá prioridad. El Tano pagará dos manás azules y lanzará Corta la Bocha apuntando a tu Chispazo: habrá dos hechizos en la pila.','depth2','#btn-end-turn'),
  info('depth2','La pila: último en entrar, primero en salir','Abajo está tu Chispazo, que intenta hacer daño a El Tano. Arriba está Corta la Bocha, cuyo objetivo es ese hechizo. Primero resolverá el contrahechizo; mientras ambos están en la pila todavía hay oportunidad de responder.','#stack-container'),
  action('resolve-top','Resolvé el contrahechizo','Pasá prioridad. Corta la Bocha contrarrestará Chispazo: ambos irán al cementerio y El Tano seguirá en 17 vidas. Chispazo no resolverá ni hará daño.','burnCountered','#btn-end-turn'),
  info('countered','Tu Chispazo quedó sin efecto','Corta la Bocha resolvió primero y retiró Chispazo de la pila. Contrarrestar no es prevenir daño: el hechizo directamente no resuelve. Si el hechizo de abajo siguiera en la pila, habría otra ventana de prioridad antes de resolverlo. Ahora la pila está vacía.','#stack-container'),
  action('sorcery','Una última diferencia','Tocá avanzar una vez para ver la siguiente jugada de El Tano: La Picadita, un conjuro para robar dos cartas.','sorceryStack','#btn-end-turn'),
  info('sorcery-info','Conjuro o instantáneo','Un conjuro normalmente se lanza en una fase principal propia, con prioridad y la pila vacía. El instantáneo es más flexible. Ambos usan la pila. Artefactos, criaturas, encantamientos y semidioses normalmente comparten el timing de conjuro.','#stack-container'),
  action('sorcery-resolve','La última resolución','Pasá prioridad para que El Tano robe dos cartas.','sorceryResolved','#btn-end-turn'),
  info('finish','Ya jugaste una partida guiada','Aprendiste mulligan, zonas, tierras, pago de maná, prioridad, pila, combate, bloqueo, cementerio, soporte y semidioses. Se pierde al llegar a 0 vidas o al intentar robar sin cartas; existen otras condiciones especiales. La práctica termina acá sin declarar un ganador ni dar premios. Podés repetirla desde el manual o jugar una Partida Simple con tu mazo.','.rival-card',{finish:true})
]);

const has=(zone,id)=>(zone||[]).some(item=>(item.card||item).id===id);
export function lessonGoal(goal,s,stack,progress) {
  const top=id=>stack.some(item=>item.card?.id===id);
  const localMain=turn=>s.turnCount>=turn&&s.activePlayer==='local'&&s.phase==='main1'&&s.priorityPlayer==='local'&&!stack.length;
  return ({redrawn:()=>progress.mulligan==='redrawn',bottom:()=>progress.mulligan==='bottom',mulliganDone:()=>progress.mulligan==='done',
    land1:()=>s.localLands.length>=1,pibeStack:()=>top('crea_010'),pibeField:()=>has(s.localCombat,'crea_010')&&!stack.length,
    attackWindow:()=>s.activePlayer==='local'&&s.phase==='combat_attackers'&&s.priorityPlayer==='local',attacker:()=>s.localCombat.some(unit=>unit.card.id==='crea_010'&&unit.isAttacking),firstDamage:()=>s.rivalHP===18,
    botInstantStack:()=>top('inst_009'),localTurn2:()=>localMain(3),land2:()=>s.localLands.length>=2,artifactStack:()=>top('art_012'),artifactField:()=>has(s.localSupport,'art_012')&&!stack.length,
    blockWindow:()=>s.activePlayer==='rival'&&s.phase==='combat_blockers'&&s.priorityPlayer==='local'&&s.rivalCombat.some(unit=>unit.isAttacking),blockAssigned:()=>s.localCombat.some(unit=>unit.card.id==='crea_010'&&Number.isInteger(unit.blockingIndex)),creaturesDied:()=>has(s.localGraveyard,'crea_010')&&has(s.rivalGraveyard,'crea_099'),
    localTurn3:()=>localMain(5),land3:()=>s.localLands.length>=3,semigodStack:()=>top('pw_004'),semigodField:()=>has(s.localPlaneswalkers,'pw_004')&&!stack.length,
    loyaltyStack:()=>stack.some(item=>item.type==='ability'&&item.abilityKind==='loyalty'&&item.card?.id==='pw_004'),loyaltyResolved:()=>s.rivalHP===17&&!stack.length,
    localTurn4:()=>localMain(7),land4:()=>s.localLands.length>=4,burnStack:()=>top('inst_023'),depth2:()=>stack.length===2&&stack[0].card?.id==='inst_023'&&stack[1].card?.id==='inst_001'&&stack[1].targetObj?.type==='stack'&&stack[1].targetObj.stackId===stack[0].id,
    burnCountered:()=>!stack.length&&s.rivalHP===17&&has(s.localGraveyard,'inst_023')&&has(s.rivalGraveyard,'inst_001'),
    sorceryStack:()=>top('conj_002'),sorceryResolved:()=>!stack.length&&has(s.rivalGraveyard,'conj_002')&&s.rivalHand.length===progress.sorceryHandBefore+2
  }[goal]||(()=>false))();
}
