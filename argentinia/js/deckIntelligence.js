// js/deckIntelligence.js
// ENTREGA 23.17.1 — Competitive Deck Intelligence Engine · Pool 880.
// Motor puro de construcción/evaluación. No toca DOM, Firebase ni estado global.

const COLORS = ['W','U','B','R','G'];
export const DECK_INTELLIGENCE_VERSION = '23.19.5-di2';
export const DEFAULT_CANDIDATE_COUNT = 64;
export const DEFAULT_GOLDFISH_ITERATIONS = 48;

// 23.19.5 DI2 — la calidad ya no es sólo "qué percentil elijo".
// Cada perfil define CUÁNTO del motor de construcción usa:
// - starter: jugable y coherente, pero deliberadamente básico/poco premium para dejar crecimiento;
// - good: casual funcional;
// - strong: Tano Medio, competente pero con tolerancia a pequeñas imperfecciones;
// - elite: Tano Difícil, usa todos los contratos de composición/coherencia y casi el mejor candidato.
// `competitive` queda como perfil completo para mazos automáticos del jugador.
export const DECK_QUALITY_PROFILES = Object.freeze({
  starter:     { label:'Inicial guiado', quantile:0.56, rarityBudget:{ mythic:1, rarePlusMythic:6 }, sophistication:'starter', requirementScale:0.70, rangeTolerance:2, deadSynergyMax:4, candidateCount:32, goldfishIterations:20, selectionWindow:4 },
  competitive: { label:'Competitivo', quantile:0.94, rarityBudget:null, sophistication:'elite', requirementScale:1.00, rangeTolerance:0, deadSynergyMax:1, candidateCount:80, goldfishIterations:48, selectionWindow:2 },
  good:        { label:'Bueno', quantile:0.55, rarityBudget:null, sophistication:'basic', requirementScale:0.68, rangeTolerance:3, deadSynergyMax:5, candidateCount:32, goldfishIterations:20, selectionWindow:4 },
  strong:      { label:'Muy bueno', quantile:0.80, rarityBudget:null, sophistication:'advanced', requirementScale:0.86, rangeTolerance:1, deadSynergyMax:3, candidateCount:56, goldfishIterations:32, selectionWindow:3 },
  elite:       { label:'Tremendo', quantile:0.995, rarityBudget:null, sophistication:'elite', requirementScale:1.00, rangeTolerance:0, deadSynergyMax:1, candidateCount:96, goldfishIterations:64, selectionWindow:1 }
});

const ARCHETYPES = Object.freeze({
  // creatureFloor conserva el guard RC2. creatureCeiling + interacción real +
  // instantSorceryFloor impiden el extremo opuesto (35 criaturas + 0 interacción real).
  aggro:      { label:'Aggro', lands:22, creatureFloor:20, creatureCeiling:31, maxVehicles:3, broadInteractionFloor:4, creatureInteractionFloor:2, instantSorceryFloor:2, nonCreatureFloor:4, themes:['aggro'], roleTargets:{ threat:20, broadInteraction:4 }, curve:{1:6,2:11,3:9,4:5,5:2,'6+':1} },
  tempo:      { label:'Tempo', lands:23, creatureFloor:14, creatureCeiling:23, maxVehicles:3, broadInteractionFloor:8, creatureInteractionFloor:3, instantSorceryFloor:8, nonCreatureFloor:10, themes:['aggro','spells'], roleTargets:{ threat:14, broadInteraction:8, selection:3 }, curve:{1:4,2:10,3:9,4:6,5:3,'6+':1} },
  midrange:   { label:'Midrange', lands:24, creatureFloor:18, creatureCeiling:28, maxVehicles:4, broadInteractionFloor:7, creatureInteractionFloor:4, instantSorceryFloor:4, nonCreatureFloor:6, themes:['midrange'], roleTargets:{ threat:18, broadInteraction:7, cardAdvantage:3 }, curve:{1:2,2:7,3:9,4:8,5:5,'6+':3} },
  control:    { label:'Control', lands:25, creatureFloor:6, creatureCeiling:14, maxVehicles:2, broadInteractionFloor:12, creatureInteractionFloor:6, instantSorceryFloor:12, nonCreatureFloor:18, themes:['control','spells'], roleTargets:{ broadInteraction:12, cardAdvantage:6, threat:7, sweeper:1 }, curve:{1:2,2:7,3:8,4:7,5:5,'6+':4} },
  tokens:     { label:'Fichas', lands:24, creatureFloor:14, creatureCeiling:26, maxVehicles:3, broadInteractionFloor:5, creatureInteractionFloor:3, instantSorceryFloor:2, nonCreatureFloor:6, primaryThemeFloor:10, themes:['tokens'], roleTargets:{ enabler:8, payoff:5, threat:13, broadInteraction:5 }, curve:{1:2,2:8,3:10,4:7,5:4,'6+':2} },
  counters:   { label:'Contadores', lands:24, creatureFloor:18, creatureCeiling:30, maxVehicles:3, broadInteractionFloor:5, creatureInteractionFloor:3, instantSorceryFloor:2, nonCreatureFloor:4, primaryThemeFloor:10, themes:['counters'], roleTargets:{ enabler:8, payoff:5, threat:16, broadInteraction:5 }, curve:{1:2,2:8,3:9,4:7,5:5,'6+':3} },
  sacrifice:  { label:'Sacrificio', lands:24, creatureFloor:18, creatureCeiling:30, maxVehicles:3, broadInteractionFloor:6, creatureInteractionFloor:3, instantSorceryFloor:2, nonCreatureFloor:4, primaryThemeFloor:11, themes:['sacrifice','graveyard'], roleTargets:{ enabler:7, payoff:6, threat:15, broadInteraction:6 }, curve:{1:3,2:9,3:9,4:7,5:4,'6+':2} },
  graveyard:  { label:'Cementerio', lands:24, creatureFloor:14, creatureCeiling:26, maxVehicles:3, broadInteractionFloor:5, creatureInteractionFloor:3, instantSorceryFloor:3, nonCreatureFloor:6, primaryThemeFloor:9, themes:['graveyard'], roleTargets:{ enabler:7, payoff:5, cardAdvantage:4, threat:13, broadInteraction:5 }, curve:{1:2,2:8,3:9,4:7,5:5,'6+':3} },
  exile:      { label:'Exilio / Impulse', lands:24, creatureFloor:10, creatureCeiling:24, maxVehicles:3, broadInteractionFloor:5, creatureInteractionFloor:2, instantSorceryFloor:4, nonCreatureFloor:8, primaryThemeFloor:8, themes:['exile'], roleTargets:{ enabler:6, payoff:5, cardAdvantage:5, threat:12, broadInteraction:5 }, curve:{1:2,2:8,3:9,4:7,5:5,'6+':3} },
  typal:      { label:'Typal', lands:23, creatureFloor:24, creatureCeiling:32, maxVehicles:2, broadInteractionFloor:4, creatureInteractionFloor:2, instantSorceryFloor:2, nonCreatureFloor:4, primaryThemeFloor:10, typalDensityFloor:0.68, tribalSupportFloor:3, themes:['typal'], roleTargets:{ lord:3, threat:20, broadInteraction:4, cardAdvantage:2 }, curve:{1:3,2:10,3:10,4:7,5:4,'6+':2} },
  artifacts:  { label:'Artefactos', lands:24, creatureFloor:12, creatureCeiling:24, maxVehicles:5, broadInteractionFloor:5, creatureInteractionFloor:2, instantSorceryFloor:2, nonCreatureFloor:8, primaryThemeFloor:11, themes:['artifacts'], roleTargets:{ enabler:7, payoff:5, threat:13, broadInteraction:5, cardAdvantage:3 }, curve:{1:3,2:8,3:9,4:7,5:5,'6+':3} },
  spells:     { label:'Spells', lands:23, creatureFloor:6, creatureCeiling:16, maxVehicles:1, broadInteractionFloor:8, creatureInteractionFloor:3, instantSorceryFloor:14, nonCreatureFloor:16, primaryThemeFloor:13, themes:['spells'], roleTargets:{ broadInteraction:8, cardAdvantage:5, threat:9, payoff:4 }, curve:{1:4,2:10,3:9,4:6,5:3,'6+':2} },
  suspend:    { label:'En espera / Tiempo', lands:24, creatureFloor:10, creatureCeiling:24, maxVehicles:3, broadInteractionFloor:5, creatureInteractionFloor:2, instantSorceryFloor:4, nonCreatureFloor:8, primaryThemeFloor:8, themes:['suspend','exile'], roleTargets:{ enabler:6, payoff:4, threat:12, broadInteraction:5, cardAdvantage:3 }, curve:{1:2,2:8,3:9,4:7,5:5,'6+':3} },
  transform:  { label:'Transform', lands:24, creatureFloor:18, creatureCeiling:30, maxVehicles:3, broadInteractionFloor:5, creatureInteractionFloor:2, instantSorceryFloor:2, nonCreatureFloor:4, primaryThemeFloor:9, themes:['transform'], roleTargets:{ enabler:5, payoff:4, threat:16, broadInteraction:5 }, curve:{1:2,2:8,3:9,4:8,5:5,'6+':3} },
  ramp:       { label:'Ramp', lands:25, creatureFloor:12, creatureCeiling:24, maxVehicles:3, broadInteractionFloor:5, creatureInteractionFloor:3, instantSorceryFloor:2, nonCreatureFloor:6, primaryThemeFloor:7, themes:['ramp'], roleTargets:{ ramp:7, threat:13, broadInteraction:5, finisher:5 }, curve:{1:1,2:6,3:8,4:7,5:6,'6+':8} }
});

export const ARCHETYPE_IDS = Object.freeze(Object.keys(ARCHETYPES));

function norm(value='') {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
function typeText(card) { return norm(card?.type); }
function isLand(card) { return typeText(card).includes('tierra'); }
function isCreature(card) { return typeText(card).includes('criatura'); }
function isArtifact(card) { return typeText(card).includes('artefacto'); }
function isEnchantment(card) { return typeText(card).includes('encantamiento'); }
function isVehicle(card) { return isArtifact(card) && typeText(card).includes('vehiculo'); }
function isPlaneswalker(card) { return typeText(card).includes('planeswalker'); }
function isInstant(card) { return typeText(card).includes('instantaneo'); }
function isSorcery(card) { return typeText(card).includes('conjuro'); }
function isPermanent(card) { return isCreature(card) || isArtifact(card) || typeText(card).includes('encantamiento') || isLand(card) || typeText(card).includes('planeswalker'); }
function cmc(card) { const n=Number(card?.cmc); return Number.isFinite(n)&&n>=0?n:0; }
function identityMatches(card, identity) {
  const cols = Array.isArray(card?.colors) ? card.colors : [];
  return cols.length === 0 || cols.every(c => identity.includes(c));
}
function rarityRank(card) {
  return ({common:0,uncommon:1,rare:2,mythic:3}[norm(card?.rarity)] ?? 0);
}
function manaDemand(cost='') {
  const out={W:0,U:0,B:0,R:0,G:0};
  for (const m of String(cost||'').matchAll(/\{([WUBRG])\}/g)) out[m[1]]++;
  return out;
}
function sourceColors(card) {
  const out=new Set();
  const p=String(card?.produces||'').toUpperCase(); if (COLORS.includes(p)) out.add(p);
  for (const c of (Array.isArray(card?.producesOptions)?card.producesOptions:[])) if (COLORS.includes(String(c).toUpperCase())) out.add(String(c).toUpperCase());
  const text=String(card?.text||'');
  if (/cualquier color/i.test(text)) COLORS.forEach(c=>out.add(c));
  for (const m of text.matchAll(/Agreg(?:a|á)[^\.\n]{0,80}\{([WUBRG])\}/gi)) out.add(m[1].toUpperCase());
  return [...out];
}
function walkStructured(value, visit) {
  if (!value) return;
  if (Array.isArray(value)) { value.forEach(v=>walkStructured(v,visit)); return; }
  if (typeof value !== 'object') return;
  visit(value);
  Object.values(value).forEach(v=>walkStructured(v,visit));
}
function effectTypes(card) {
  const set=new Set();
  const roots=['effect','etbEffect','activatedAbility','activatedAbilities','triggers','attackTrigger','diesTrigger','landEtbTrigger','combatDamageTrigger','spellCastTrigger','upkeepTrigger','blockTrigger','anyCreatureDiesTrigger','creatureEtbTrigger','opponentDeathTrigger','staticEffect','replacementEffect','saga','dfc'];
  roots.forEach(k=>walkStructured(card?.[k], obj=>{ if (typeof obj.type==='string') set.add(norm(obj.type)); }));
  return set;
}
function structuredHas(card, predicate) {
  let found=false;
  walkStructured(card, obj=>{ if (!found && predicate(obj)) found=true; });
  return found;
}
function cardSubtypeTokens(card) {
  const raw=String(card?.type||'');
  const parts=raw.split(/[—-]/);
  if (parts.length<2) return [];
  return parts.slice(1).join(' ').trim().split(/\s+/).filter(Boolean).map(norm);
}

function walkStructuredContext(value, visit, parents=[]) {
  if (!value) return;
  if (Array.isArray(value)) { value.forEach(v=>walkStructuredContext(v,visit,parents)); return; }
  if (typeof value !== 'object') return;
  visit(value, parents);
  const next=[...parents,value];
  Object.values(value).forEach(v=>walkStructuredContext(v,visit,next));
}
function literalSubtypeRefs(card) {
  const refs=new Set();
  let flexible=false;
  walkStructured(card,obj=>{
    for (const key of ['subtype','targetSubtype']) {
      const value=obj?.[key];
      if (typeof value!=='string') continue;
      if (value.includes('$chosen')) flexible=true;
      else if (value.trim()) refs.add(norm(value));
    }
    const many=obj?.targetSubtypes;
    if (Array.isArray(many)) many.forEach(value=>{
      if (typeof value!=='string') return;
      if (value.includes('$chosen')) flexible=true; else if (value.trim()) refs.add(norm(value));
    });
  });
  if (structuredHas(card,obj=>norm(obj?.type)==='choose_creature_type')) flexible=true;
  const own=cardSubtypeTokens(card);
  const text=norm(card?.text);
  // Muchas cartas typal históricas sólo tienen texto humano, no staticEffect estructurado.
  // Si el texto habla de "otros/otras <subtipo>" o "tus <subtipo>", ligamos el payoff
  // al subtipo REAL de la propia carta en vez de marcar un typal genérico.
  for (const token of own) {
    if (token.length<3) continue;
    const pluralA=`${token}s`, pluralB=token.endsWith('n')?`${token}es`:pluralA;
    if ([token,pluralA,pluralB].some(v=>text.includes(`otros ${v}`)||text.includes(`otras ${v}`)||text.includes(`tus ${v}`)||text.includes(`los ${v}`)||text.includes(`las ${v}`))) refs.add(token);
  }
  return {refs:[...refs], flexible};
}
function effectContexts(card, wantedType) {
  const out=[];
  walkStructuredContext(card,(obj,parents)=>{
    if (norm(obj?.type)===wantedType) out.push({obj,parents});
  });
  return out;
}
function damageTargetSemantics(card) {
  let creature=false, player=false;
  const cardText=norm(card?.text);
  const textCreatureTarget=/criatura objetivo|permanente objetivo|jugador o criatura|cualquier objetivo|any target|al objetivo/.test(cardText);
  const textPlayer=/jugador rival|jugador objetivo|tu oponente|al rival|a tu oponente/.test(cardText);
  for (const {obj,parents} of effectContexts(card,'damage')) {
    // No inspeccionar el objeto raíz completo: puede mencionar "un permanente del oponente"
    // como condición del trigger aunque el daño vaya exclusivamente a la cara.
    const localParents=parents.filter(p=>p!==card);
    const targetValues=[];
    for (const source of [...localParents.slice(-3),obj]) {
      if (!source || typeof source!=='object') continue;
      for (const key of ['target','targetKind','targetType']) if (typeof source[key]==='string') targetValues.push(norm(source[key]));
    }
    const structuredPlayer=targetValues.some(v=>/opponent_player|player_opponent|target_player|jugador/.test(v));
    const structuredCreature=targetValues.some(v=>/^(creature|permanent|criatura|permanente)$/.test(v)||/creature|permanent|criatura|permanente/.test(v)&&!/noncreature/.test(v));
    const requiresTarget=!!card?.requiresTarget || localParents.some(p=>p?.requiresTarget===true);
    if (structuredCreature || textCreatureTarget || (requiresTarget && !structuredPlayer && !textPlayer)) creature=true;
    if (structuredPlayer || textPlayer || /cualquier objetivo|jugador o criatura|any target/.test(cardText)) player=true;
  }
  return {creature,player};
}
function inferInteractionSemantics(card,effects) {
  const roles=new Set();
  const broadCreature=['destroy_creature','exile_creature','fight','bounce','gain_control','gain_control_until_eot','cant_attack_next_turn','prevent_attack'];
  const narrow=['destroy_artifact','destroy_enchantment','destroy_land','destroy_nonbasic_land','exile_graveyard'];
  if (broadCreature.some(t=>effects.has(t))) {
    roles.add('interaction'); roles.add('broadInteraction'); roles.add('creatureInteraction'); roles.add('removal');
  }
  if (narrow.some(t=>effects.has(t))) { roles.add('interaction'); roles.add('narrowInteraction'); }
  if ([...effects].some(t=>t.startsWith('counter'))) {
    roles.add('interaction'); roles.add('broadInteraction'); roles.add('disruption'); roles.add('counterspell');
  }
  if (effects.has('discard') || effects.has('private_zone_move') && /descart/.test(norm(card?.text))) {
    roles.add('interaction'); roles.add('broadInteraction'); roles.add('disruption');
  }
  if (effects.has('destroy_all_creatures')) {
    roles.add('interaction'); roles.add('broadInteraction'); roles.add('creatureInteraction'); roles.add('removal'); roles.add('sweeper');
  }
  if (effects.has('destroy_all_lands')) {
    roles.add('interaction'); roles.add('narrowInteraction'); roles.add('sweeper');
  }
  const dmg=damageTargetSemantics(card);
  if (dmg.creature) {
    roles.add('interaction'); roles.add('broadInteraction'); roles.add('creatureInteraction'); roles.add('removal');
  }
  if (dmg.player || (effects.has('damage') && !dmg.creature)) roles.add('reach');
  if (effects.has('drain') || effects.has('poison')) roles.add('reach');
  return roles;
}

export function inferCardDeckProfile(card) {
  const effects=effectTypes(card);
  const text=norm(card?.text);
  const keywords=new Set((card?.keywords||[]).map(norm));
  const themes=new Set();
  const roles=new Set();
  const mv=cmc(card);
  const creature=isCreature(card);
  const artifact=isArtifact(card);
  const instant=isInstant(card);
  const sorcery=isSorcery(card);
  const permanent=isPermanent(card);
  const vehicle=isVehicle(card);
  const planeswalker=isPlaneswalker(card);

  // `threat` debe significar una pieza que realmente pueda cerrar la partida. Antes, TODO
  // permanente (incluidos artefactos/encantamientos utilitarios) contaba como threat. Eso
  // permitía cumplir roleTargets sin cuerpos. Criaturas, Vehículos y Planeswalkers sí cuentan;
  // el piso de criaturas real se valida aparte para que un Vehículo nunca sustituya su tripulación.
  if (creature || vehicle || planeswalker) roles.add('threat');
  if (vehicle) roles.add('vehicle');
  if (creature && mv<=3) themes.add('aggro');
  if (creature && mv>=5) roles.add('finisher');
  if (keywords.has('haste') || keywords.has('menace') || keywords.has('firststrike') || keywords.has('doublestrike')) themes.add('aggro');
  if (effects.has('pump') || effects.has('grant_keyword_temp')) themes.add('aggro');

  // DI2 — interacción semántica por OBJETIVO. Un ping al jugador ya no cuenta como removal.
  // Esto corrige el caso real donde Tasador/Sereno/Séptimo Hijo hacían que un mazo con
  // 0 removal pareciera tener 6 piezas de interacción.
  const interactionRoles=inferInteractionSemantics(card,effects);
  interactionRoles.forEach(r=>roles.add(r));
  if (roles.has('interaction')) themes.add('control');
  if (roles.has('counterspell')) themes.add('spells');
  if (effects.has('fog') || effects.has('prevent_damage') || /indestruct|proteccion|hexproof|ward/.test(text)) roles.add('protection');

  if (effects.has('draw') || effects.has('draw_and_lose_life') || effects.has('rummage')) roles.add('cardAdvantage');
  if (effects.has('scry') || effects.has('surveil') || effects.has('look_at_top')) roles.add('selection');
  if (effects.has('search_library')) { roles.add('cardAdvantage'); roles.add('tutor'); }
  if (effects.has('ramp') || effects.has('search_land')) { roles.add('ramp'); themes.add('ramp'); }

  if (effects.has('create_tokens') || /crea (?:una|un|dos|tres|\d+)/.test(text)) { themes.add('tokens'); roles.add('enabler'); }
  if (card?.diesTrigger || card?.anyCreatureDiesTrigger || effects.has('sacrifice') || /sacrific/.test(text)) { themes.add('sacrifice'); roles.add(card?.diesTrigger || /siempre que .*muera|cuando .*muera/.test(text) ? 'payoff':'enabler'); }
  if (effects.has('reanimate') || effects.has('return_from_graveyard') || effects.has('return_lands_from_graveyard') || card?.escape || card?.flashback || /cementerio/.test(text)) { themes.add('graveyard'); roles.add(effects.has('reanimate')||effects.has('return_from_graveyard')?'payoff':'enabler'); }
  if (effects.has('add_counter') || effects.has('proliferate') || effects.has('remove_counter') || /contador/.test(text)) { themes.add('counters'); roles.add(effects.has('add_counter')||effects.has('proliferate')?'enabler':'payoff'); }
  if (effects.has('exile_top_with_permission') || /desde el exilio|del exilio|exilia .*biblioteca/.test(text)) { themes.add('exile'); roles.add(effects.has('exile_top_with_permission')?'enabler':'payoff'); }
  if (card?.suspend || effects.has('add_time_counter_suspended') || effects.has('remove_time_counter_suspended') || /suspend/.test(text)) { themes.add('suspend'); roles.add(card?.suspend?'enabler':'payoff'); }
  if (card?.dfc || effects.has('transform') || /transform/.test(text)) { themes.add('transform'); roles.add(card?.dfc?'enabler':'payoff'); }
  if (artifact || /artefact/.test(text) || structuredHas(card,o=>['artifact','artefacto'].includes(norm(o?.subtype)))) { themes.add('artifacts'); if (artifact) roles.add('enabler'); }
  if (instant || sorcery || card?.spellCastTrigger) themes.add('spells');
  if (card?.spellCastTrigger) roles.add('payoff');
  const tribal=literalSubtypeRefs(card);
  const staticIsLord=card?.staticEffect && ['team_buff','team_keyword'].includes(norm(card.staticEffect.type));
  const textLord=/otros |otras |tus /.test(text) && /obtienen|tienen|cuestan/.test(text) && tribal.refs.length>0;
  if (staticIsLord && (tribal.refs.length || tribal.flexible) || textLord) { themes.add('typal'); roles.add('lord'); roles.add('payoff'); }
  if (tribal.refs.length || tribal.flexible || structuredHas(card,o=>o?.sharedCreatureTypeWithSource || o?.type==='choose_creature_type') || /tipo de criatura/.test(text)) {
    themes.add('typal'); roles.add(/elige|elegi/.test(text)||tribal.flexible?'enabler':'payoff');
  }
  if (card?.creatureEtbTrigger && (card.creatureEtbTrigger.subtype || card.creatureEtbTrigger.targetSubtype)) { themes.add('typal'); roles.add('payoff'); }

  if (roles.has('interaction') && roles.has('cardAdvantage')) themes.add('control');
  if (creature && mv>=3 && mv<=5) themes.add('midrange');
  if (!themes.size) themes.add(creature && mv<=3 ? 'aggro' : 'midrange');

  // Poder base deliberadamente heurístico: no reemplaza playtesting, sólo evita elegir
  // cartas claramente peores cuando hay otra pieza equivalente para el mismo rol.
  let power=50;
  power += Math.min(12, roles.size*2.3);
  power += roles.has('interaction')?5:0;
  power += roles.has('cardAdvantage')?5:0;
  power += roles.has('sweeper')?5:0;
  power += roles.has('lord')?4:0;
  power += roles.has('ramp')?3:0;
  power += rarityRank(card)*1.1; // señal chica, nunca razón principal.
  if (creature) {
    const stats=(Number(card?.power)||0)+(Number(card?.toughness)||0);
    power += Math.max(-5, Math.min(7, stats - Math.max(1,mv)*1.7));
  }
  if (mv>=7 && !roles.has('finisher') && !roles.has('sweeper')) power-=6;
  if (mv===0 && !isLand(card) && !roles.has('interaction')) power-=2;

  return {
    id:card?.id,
    mv,
    isCreature:creature,
    isLand:isLand(card),
    isPermanent:permanent,
    isVehicle:vehicle,
    isArtifact:artifact,
    isEnchantment:isEnchantment(card),
    isInstant:instant,
    isSorcery:sorcery,
    isPlaneswalker:planeswalker,
    themes:[...themes],
    roles:[...roles],
    subtypeTokens:cardSubtypeTokens(card),
    tribalRefs:tribal.refs,
    flexibleTribe:tribal.flexible,
    effectCount:effects.size,
    power:Math.max(1,Math.min(100,power))
  };
}

export function buildDeckMetaCatalog(cards=[]) {
  const map=new Map();
  cards.forEach(card=>map.set(card.id,inferCardDeckProfile(card)));
  return map;
}

function archetypeSupport(eligibleProfiles, id) {
  const arch=ARCHETYPES[id];
  let matching=0, payoff=0, enabler=0, power=0;
  let focusSubtype=null;
  if (id==='typal') focusSubtype=chooseTypalFocus(eligibleProfiles)?.subtype||null;
  for (const {profile} of eligibleProfiles) {
    let hit=arch.themes.some(t=>profile.themes.includes(t));
    if (id==='typal') {
      hit=!!focusSubtype && (
        profile.isCreature&&profile.subtypeTokens.includes(focusSubtype) ||
        profile.flexibleTribe || (profile.tribalRefs||[]).includes(focusSubtype)
      );
    }
    if (!hit) continue;
    matching++;
    power+=profile.power;
    if (profile.roles.includes('payoff')) payoff++;
    if (profile.roles.includes('enabler')) enabler++;
  }
  const density=eligibleProfiles.length?matching/eligibleProfiles.length:0;
  let score=matching*1.8 + density*45 + (matching?power/matching:0)*0.08;
  if (['tokens','counters','sacrifice','graveyard','exile','typal','artifacts','suspend','transform'].includes(id)) {
    score += Math.min(enabler,payoff)*2.5;
    if (matching<8) score-=25;
  }
  if (id==='typal') {
    const focus=chooseTypalFocus(eligibleProfiles);
    if (!focus) score-=80;
    else score += focus.support*5 + focus.lords*8 + Math.min(20,focus.creatures)*0.8;
  }
  if (id==='control') score += eligibleProfiles.filter(x=>x.profile.roles.includes('broadInteraction')).length*0.75;
  if (id==='aggro') score += eligibleProfiles.filter(x=>x.profile.isCreature&&x.profile.mv<=3).length*0.25;
  if (id==='ramp' && matching<6) score-=25;
  return {id,label:arch.label,score,matching,enabler,payoff,focusSubtype};
}
export function rankViableArchetypes(cards, identity) {
  const meta=buildDeckMetaCatalog(cards);
  const eligible=cards.filter(c=>!isLand(c)&&identityMatches(c,identity)).map(card=>({card,profile:meta.get(card.id)}));
  return ARCHETYPE_IDS.map(id=>{
    const row=archetypeSupport(eligible,id);
    // Artefactos incoloros son jugables en cualquier identidad; eso no debe hacer que
    // todos los colores parezcan automáticamente un deck de Artefactos. Tempo también
    // combina dos familias muy amplias, así que reducimos sólo su señal de VIABILIDAD.
    if (id === 'artifacts') row.score *= 0.68;
    if (id === 'tempo') row.score *= 0.58;
    return row;
  }).sort((a,b)=>b.score-a.score);
}

function weightedPick(scored, rng) {
  if (!scored.length) return null;
  const max=Math.max(...scored.map(x=>x.score));
  const weights=scored.map(x=>Math.max(0.01, Math.exp((x.score-max)/11)));
  let roll=rng()*weights.reduce((a,b)=>a+b,0);
  for (let i=0;i<scored.length;i++) { roll-=weights[i]; if (roll<=0) return scored[i]; }
  return scored[scored.length-1];
}

function chooseArchetype(cards, identity, rng, quality='competitive') {
  const ranked=rankViableArchetypes(cards,identity).map(x=>({...x}));
  const qp=DECK_QUALITY_PROFILES[quality]||DECK_QUALITY_PROFILES.competitive;
  if (quality==='starter') {
    // Onboarding: no regalar un deck malo, pero sí favorecer planes legibles y con espacio
    // para upgrades. Los arquetipos más técnicos siguen disponibles si el pool/color lo exige.
    const complexity={aggro:0,midrange:0,tokens:1,counters:1,typal:1,artifacts:2,ramp:2,sacrifice:3,graveyard:4,tempo:4,exile:4,transform:5,spells:5,suspend:6,control:6};
    ranked.forEach(x=>x.score-=Number(complexity[x.id]||0)*8);
    ranked.sort((a,b)=>b.score-a.score);
  }
  let rankedPool=ranked;
  if (quality==='starter') {
    const preferred=new Set(['aggro','midrange','tokens','counters','typal','artifacts','ramp']);
    const globalTop=Math.max(1,ranked[0]?.score||1);
    const simple=ranked.filter(x=>preferred.has(x.id) && x.score>=Math.max(18,globalTop*0.30));
    if (simple.length) rankedPool=simple;
  }
  const topScore=Math.max(1,rankedPool[0]?.score||1);
  const maxPool=qp.sophistication==='elite'?4:qp.sophistication==='advanced'?6:7;
  const viabilityRatio=qp.sophistication==='elite'?0.60:qp.sophistication==='advanced'?0.48:0.40;
  const viable=rankedPool.filter((x,i)=>i<maxPool && x.score>=Math.max(16,topScore*viabilityRatio));
  const base=(viable.length?viable:rankedPool.slice(0,Math.min(3,rankedPool.length)));
  const candidates=base.map((x,i)=>{
    const ratio=Math.max(0,x.score/topScore);
    let score;
    if (qp.sophistication==='elite') score=62-i*8+ratio*22;
    else if (qp.sophistication==='advanced') score=46-i*5+ratio*14;
    else score=38-i*3+ratio*10;
    return {...x,score};
  });
  return weightedPick(candidates,rng)?.id || 'midrange';
}
function curveBucket(mv) { return mv>=6?'6+':String(Math.floor(mv)); }
function roleCounts(profiles) {
  const counts={};
  profiles.forEach(p=>p.roles.forEach(r=>counts[r]=(counts[r]||0)+1));
  return counts;
}
function curveCounts(profiles) {
  const out={'0':0,'1':0,'2':0,'3':0,'4':0,'5':0,'6+':0};
  profiles.forEach(p=>out[curveBucket(p.mv)]++);
  return out;
}
function chooseTypalFocus(eligibleProfiles) {
  const rows=new Map();
  const rowFor=t=>{ if (!rows.has(t)) rows.set(t,{subtype:t,creatures:0,support:0,lords:0}); return rows.get(t); };
  for (const {profile} of eligibleProfiles) {
    if (profile.isCreature) profile.subtypeTokens.forEach(t=>rowFor(t).creatures++);
    for (const t of profile.tribalRefs||[]) {
      const row=rowFor(t); row.support++; if (profile.roles.includes('lord')) row.lords++;
    }
  }
  const viable=[...rows.values()].filter(r=>r.creatures>=4 && (r.support>=1 || r.lords>=1));
  viable.forEach(r=>r.score=r.creatures*1.25+r.support*7+r.lords*9);
  viable.sort((a,b)=>b.score-a.score || b.creatures-a.creatures || a.subtype.localeCompare(b.subtype));
  return viable[0]||null;
}
function buildArchetypeContext(cards, identity, archetypeId, meta) {
  const eligible=cards.filter(c=>!isLand(c)&&identityMatches(c,identity)).map(card=>({card,profile:meta.get(card.id)}));
  const typalFocus=archetypeId==='typal'?chooseTypalFocus(eligible):null;
  return {eligible,focusSubtype:typalFocus?.subtype||null,typalFocus};
}
function availableCopies(eligible, predicate, spellCount) {
  const unique=eligible.reduce((n,x)=>n+(predicate(x.profile,x.card)?1:0),0);
  return Math.min(spellCount,unique*4);
}
function buildCompositionRequirements(arch, quality, spellCount, context) {
  const qp=DECK_QUALITY_PROFILES[quality]||DECK_QUALITY_PROFILES.competitive;
  const tol=Math.max(0,Number(qp.rangeTolerance)||0);
  const scale=Math.max(0.5,Math.min(1,Number(qp.requirementScale)||1));
  const cap=(target,pred)=>Math.min(spellCount,Math.ceil(Math.max(0,target||0)*scale),availableCopies(context.eligible,pred,spellCount));
  const creatureMin=Math.min(spellCount,Math.max(0,Number(arch.creatureFloor)||0));
  const creatureMax=Math.min(spellCount,Math.max(creatureMin,(Number(arch.creatureCeiling)||spellCount)+tol));
  const req={
    creatureMin,
    creatureMax,
    maxVehicles:Math.max(0,Number(arch.maxVehicles)||0),
    broadInteraction:cap(arch.broadInteractionFloor,p=>p.roles.includes('broadInteraction')),
    creatureInteraction:cap(arch.creatureInteractionFloor,p=>p.roles.includes('creatureInteraction')),
    instantSorcery:cap(arch.instantSorceryFloor,p=>p.isInstant||p.isSorcery),
    nonCreature:cap(arch.nonCreatureFloor,p=>!p.isCreature),
    primaryTheme:cap(arch.primaryThemeFloor,p=>arch.themes.some(t=>p.themes.includes(t))),
    typalDensity:Math.max(0,Math.min(1,(Number(arch.typalDensityFloor)||0)*(quality==='elite'||quality==='competitive'?1:quality==='strong'?0.92:0.78))),
    tribalSupport:cap(arch.tribalSupportFloor,p=>context.focusSubtype && (p.flexibleTribe||(p.tribalRefs||[]).includes(context.focusSubtype))),
    deadSynergyMax:Number(qp.deadSynergyMax)??4
  };
  return req;
}
function compositionStats(profiles, arch, context) {
  const roles=roleCounts(profiles);
  const creatures=profiles.filter(p=>p.isCreature).length;
  const vehicles=profiles.filter(p=>p.isVehicle).length;
  const nonCreature=profiles.length-creatures;
  const instantSorcery=profiles.filter(p=>p.isInstant||p.isSorcery).length;
  const artifacts=profiles.filter(p=>p.isArtifact).length;
  const enchantments=profiles.filter(p=>p.isEnchantment).length;
  const planeswalkers=profiles.filter(p=>p.isPlaneswalker).length;
  const subtypeCounts={};
  profiles.filter(p=>p.isCreature).forEach(p=>p.subtypeTokens.forEach(t=>subtypeCounts[t]=(subtypeCounts[t]||0)+1));
  const focus=context?.focusSubtype||null;
  const focusCreatures=focus?(subtypeCounts[focus]||0):0;
  const typalDensity=focus&&creatures?focusCreatures/creatures:0;
  const tribalSupport=focus?profiles.filter(p=>p.flexibleTribe||(p.tribalRefs||[]).includes(focus)).length:0;
  const themeHits=profiles.filter(p=>arch.themes.some(t=>p.themes.includes(t))).length;
  let deadSynergy=0;
  for (const p of profiles) {
    const refs=p.tribalRefs||[];
    if (refs.length && !refs.some(t=>(subtypeCounts[t]||0)>=4)) deadSynergy++;
    if (p.roles.includes('payoff') && p.themes.includes('spells') && instantSorcery<6) deadSynergy++;
    if (p.roles.includes('payoff') && p.themes.includes('artifacts') && artifacts<6) deadSynergy++;
  }
  return {
    creatures,vehicles,nonCreature,instantSorcery,artifacts,enchantments,planeswalkers,
    broadInteraction:roles.broadInteraction||0,
    creatureInteraction:roles.creatureInteraction||0,
    interaction:roles.interaction||0,
    narrowInteraction:roles.narrowInteraction||0,
    reach:roles.reach||0,
    themeHits,focusSubtype:focus,focusCreatures,typalDensity,tribalSupport,deadSynergy,subtypeCounts
  };
}
function compositionDeficits(stats, req, archetypeId) {
  const out=[];
  const need=(key,actual,target)=>{ if (target>actual) out.push({key,actual,target,missing:target-actual}); };
  need('creatures',stats.creatures,req.creatureMin);
  if (stats.creatures>req.creatureMax) out.push({key:'creatureCeiling',actual:stats.creatures,target:req.creatureMax,missing:stats.creatures-req.creatureMax});
  if (stats.vehicles>req.maxVehicles) out.push({key:'vehicles',actual:stats.vehicles,target:req.maxVehicles,missing:stats.vehicles-req.maxVehicles});
  need('broadInteraction',stats.broadInteraction,req.broadInteraction);
  need('creatureInteraction',stats.creatureInteraction,req.creatureInteraction);
  need('instantSorcery',stats.instantSorcery,req.instantSorcery);
  need('nonCreature',stats.nonCreature,req.nonCreature);
  need('primaryTheme',stats.themeHits,req.primaryTheme);
  if (archetypeId==='typal' && req.typalDensity>0) {
    if (!stats.focusSubtype) out.push({key:'typalFocus',actual:0,target:1,missing:1});
    else if (stats.typalDensity+1e-9<req.typalDensity) out.push({key:'typalDensity',actual:stats.typalDensity,target:req.typalDensity,missing:req.typalDensity-stats.typalDensity});
    need('tribalSupport',stats.tribalSupport,req.tribalSupport);
  }
  if (stats.deadSynergy>req.deadSynergyMax) out.push({key:'deadSynergy',actual:stats.deadSynergy,target:req.deadSynergyMax,missing:stats.deadSynergy-req.deadSynergyMax});
  return out;
}
function synergyScore(profile, arch, context=null) {
  let s=0;
  for (const t of arch.themes) if (profile.themes.includes(t)) s+=9;
  if (arch.themes.includes('midrange') && profile.themes.includes('midrange')) s+=4;
  if (arch.themes.includes('control') && profile.roles.includes('interaction')) s+=5;
  if (arch.themes.includes('aggro') && profile.isCreature && profile.mv<=3) s+=5;
  if (arch.themes.includes('typal') && context?.focusSubtype) {
    const focus=context.focusSubtype;
    if (profile.isCreature && profile.subtypeTokens.includes(focus)) s+=13;
    if (profile.flexibleTribe) s+=9;
    if ((profile.tribalRefs||[]).includes(focus)) s+=14;
    if ((profile.tribalRefs||[]).length && !(profile.tribalRefs||[]).includes(focus)) s-=18;
    if (profile.isCreature && !profile.subtypeTokens.includes(focus) && !profile.roles.includes('broadInteraction')) s-=6;
  }
  return s;
}
function cardCandidateScore(profile, arch, context, copies, card, quality, archContext=null, req=null) {
  const roles=context.roles, curve=context.curve, bucket=curveBucket(profile.mv);
  let score=profile.power*0.48 + synergyScore(profile,arch,archContext);
  const desiredCurve=arch.curve[bucket]||0;
  score += Math.max(-5,(desiredCurve-(curve[bucket]||0))*1.6);
  for (const [role,target] of Object.entries(arch.roleTargets||{})) if (profile.roles.includes(role)) score += Math.max(-2,(target-(roles[role]||0))*0.9);
  const stats=context.composition;
  if (req && stats) {
    if (profile.isCreature && stats.creatures<req.creatureMin) score+=11+(req.creatureMin-stats.creatures)*0.65;
    if (profile.roles.includes('broadInteraction') && stats.broadInteraction<req.broadInteraction) score+=15+(req.broadInteraction-stats.broadInteraction)*1.4;
    if (profile.roles.includes('creatureInteraction') && stats.creatureInteraction<req.creatureInteraction) score+=13+(req.creatureInteraction-stats.creatureInteraction)*1.5;
    if ((profile.isInstant||profile.isSorcery) && stats.instantSorcery<req.instantSorcery) score+=10+(req.instantSorcery-stats.instantSorcery)*0.9;
    if (!profile.isCreature && stats.nonCreature<req.nonCreature) score+=8+(req.nonCreature-stats.nonCreature)*0.7;
    if (arch.themes.some(t=>profile.themes.includes(t)) && stats.themeHits<req.primaryTheme) score+=8;
    if (profile.roles.includes('narrowInteraction') && !profile.roles.includes('broadInteraction') && stats.broadInteraction<req.broadInteraction) score-=5;
  }
  if (copies===1) score+=2.5; // consistencia: la segunda copia de una pieza buena es valiosa.
  if (copies===2) score+=1.2;
  if (copies>=3) score-=3.5;
  // Starter: el primer mazo tiene un plan real, pero deja espacio visible para mejorar la
  // colección: menos premium y selección deliberadamente no-élite.
  if (quality === 'starter') {
    const rr = rarityRank(card);
    if (rr === 2) score -= 12;
    if (rr >= 3) score -= 22;
    if ((profile.effectCount||0)>=5) score-=2; // curva de aprendizaje un poco más amable.
  }
  return score;
}

function compositionPenalty(deficits) {
  const weights={
    creatures:130, creatureCeiling:120, vehicles:150,
    broadInteraction:155, creatureInteraction:145,
    instantSorcery:105, nonCreature:90, primaryTheme:72,
    typalFocus:220, typalDensity:180, tribalSupport:130, deadSynergy:55
  };
  return deficits.reduce((sum,d)=>sum+(weights[d.key]||80)*Math.max(0.25,Number(d.missing)||1),0);
}
function profileMatchesDeficit(profile, deficitKey, arch, context) {
  const focus=context?.focusSubtype;
  if (deficitKey==='creatures') return profile.isCreature;
  if (deficitKey==='creatureCeiling' || deficitKey==='nonCreature') return !profile.isCreature;
  if (deficitKey==='vehicles') return !profile.isVehicle;
  if (deficitKey==='broadInteraction') return profile.roles.includes('broadInteraction');
  if (deficitKey==='creatureInteraction') return profile.roles.includes('creatureInteraction');
  if (deficitKey==='instantSorcery') return profile.isInstant||profile.isSorcery;
  if (deficitKey==='primaryTheme') return arch.themes.some(t=>profile.themes.includes(t));
  if (deficitKey==='typalFocus' || deficitKey==='typalDensity') return !!focus && profile.isCreature && profile.subtypeTokens.includes(focus);
  if (deficitKey==='tribalSupport') return !!focus && (profile.flexibleTribe||(profile.tribalRefs||[]).includes(focus));
  if (deficitKey==='deadSynergy') return !(profile.tribalRefs||[]).length || !!focus && (profile.tribalRefs||[]).includes(focus);
  return true;
}
function repairSpellCandidate(chosen, meta, arch, archetypeId, quality, archContext, req) {
  let cards=[...chosen];
  const eligible=archContext.eligible;
  for (let pass=0;pass<28;pass++) {
    const profiles=cards.map(c=>meta.get(c.id));
    const stats=compositionStats(profiles,arch,archContext);
    const deficits=compositionDeficits(stats,req,archetypeId);
    if (!deficits.length) break;
    deficits.sort((a,b)=>compositionPenalty([b])-compositionPenalty([a]));
    const target=deficits[0];
    const counts=new Map(); cards.forEach(c=>counts.set(c.id,(counts.get(c.id)||0)+1));
    const candidatePool=eligible
      .filter(({card,profile})=>(counts.get(card.id)||0)<4 && profileMatchesDeficit(profile,target.key,arch,archContext))
      .map(({card,profile})=>({card,profile,base:profile.power*0.25+synergyScore(profile,arch,archContext)}))
      .sort((a,b)=>b.base-a.base)
      .slice(0,72);
    if (!candidatePool.length) break;
    const before=compositionPenalty(deficits);
    let best=null;
    for (const cand of candidatePool) {
      for (let i=0;i<cards.length;i++) {
        const old=cards[i];
        if (old.id===cand.card.id) continue;
        const simulated=profiles.slice(); simulated[i]=cand.profile;
        const simStats=compositionStats(simulated,arch,archContext);
        const simDef=compositionDeficits(simStats,req,archetypeId);
        const after=compositionPenalty(simDef);
        const oldProfile=profiles[i];
        const qualityDelta=(cand.profile.power-oldProfile.power)*0.18 + (synergyScore(cand.profile,arch,archContext)-synergyScore(oldProfile,arch,archContext))*0.35;
        const improvement=(before-after)+qualityDelta;
        if (!best || improvement>best.improvement) best={i,card:cand.card,improvement,after};
      }
    }
    if (!best || best.improvement<=0.01) break;
    cards[best.i]={...best.card};
  }
  return cards;
}

function buildSpellCandidate(cards, identity, archetypeId, spellCount, meta, rng, quality, archContext) {
  const arch=ARCHETYPES[archetypeId]||ARCHETYPES.midrange;
  const eligible=archContext?.eligible?.map(x=>x.card) || cards.filter(c=>!isLand(c)&&identityMatches(c,identity));
  const contextInfo=archContext || buildArchetypeContext(cards,identity,archetypeId,meta);
  const req=buildCompositionRequirements(arch,quality,spellCount,contextInfo);
  const chosen=[], profiles=[], copies=new Map();
  while (chosen.length<spellCount) {
    const scored=[];
    const comp=compositionStats(profiles,arch,contextInfo);
    const remaining=spellCount-chosen.length;
    const context={roles:roleCounts(profiles),curve:curveCounts(profiles),composition:comp};
    const forceCreature=Math.max(0,req.creatureMin-comp.creatures)>=remaining;
    const forceNonCreature=Math.max(0,req.nonCreature-comp.nonCreature)>=remaining;
    const forceBroad=Math.max(0,req.broadInteraction-comp.broadInteraction)>=remaining;
    const forceCreatureInteraction=Math.max(0,req.creatureInteraction-comp.creatureInteraction)>=remaining;
    const forceInstantSorcery=Math.max(0,req.instantSorcery-comp.instantSorcery)>=remaining;
    for (const card of eligible) {
      const count=copies.get(card.id)||0;
      if (count>=4) continue;
      const profile=meta.get(card.id);
      if (forceCreature && !profile.isCreature) continue;
      if (forceNonCreature && profile.isCreature) continue;
      if (forceBroad && !profile.roles.includes('broadInteraction')) continue;
      if (forceCreatureInteraction && !profile.roles.includes('creatureInteraction')) continue;
      if (forceInstantSorcery && !(profile.isInstant||profile.isSorcery)) continue;
      if (profile.isVehicle && comp.vehicles>=req.maxVehicles) continue;
      if (profile.isCreature && comp.creatures>=req.creatureMax && comp.creatures>=req.creatureMin) continue;
      let score=cardCandidateScore(profile,arch,context,count,card,quality,contextInfo,req);
      // Cerca del final, reservar slots para los contratos que todavía faltan.
      const urgency=Math.max(0,req.broadInteraction-comp.broadInteraction)+Math.max(0,req.creatureInteraction-comp.creatureInteraction)+Math.max(0,req.instantSorcery-comp.instantSorcery)+Math.max(0,req.nonCreature-comp.nonCreature);
      if (remaining<=urgency+4) {
        if (profile.roles.includes('broadInteraction')) score+=8;
        if (profile.roles.includes('creatureInteraction')) score+=7;
        if (profile.isInstant||profile.isSorcery) score+=5;
        if (!profile.isCreature) score+=4;
      }
      if (profile.isVehicle) score += comp.creatures >= Math.max(4, comp.vehicles*2+2) ? 2 : -14;
      scored.push({card,profile,score});
    }
    if (!scored.length) break;
    scored.sort((a,b)=>b.score-a.score);
    const shortlist=scored.slice(0,Math.min(quality==='elite'||quality==='competitive'?20:28,scored.length));
    const pick=weightedPick(shortlist,rng) || shortlist[0];
    chosen.push({...pick.card}); profiles.push(pick.profile);
    copies.set(pick.card.id,(copies.get(pick.card.id)||0)+1);
  }
  if (chosen.length!==spellCount) return chosen;
  return repairSpellCandidate(chosen,meta,arch,archetypeId,quality,contextInfo,req);
}
function colorPips(cards) {
  const out={W:0,U:0,B:0,R:0,G:0};
  cards.forEach(card=>{const d=manaDemand(card.manaCost);COLORS.forEach(c=>out[c]+=d[c]);});
  return out;
}
function pickBasic(basics,color,rng) {
  const pool=basics.filter(c=>String(c.produces||'').toUpperCase()===color);
  return pool.length ? {...pool[Math.floor(rng()*pool.length)]} : null;
}
function buildLandCandidate(cards, identity, spells, landCount, rng) {
  const lands=cards.filter(isLand);
  const basics=lands.filter(c=>norm(c.type).includes('basica') && identity.includes(String(c.produces||'').toUpperCase()));
  const nonbasics=lands.filter(c=>{
    if (norm(c.type).includes('basica')) return false;
    const cols=sourceColors(c);
    return cols.length>0 && cols.every(col=>identity.includes(col));
  });
  const pips=colorPips(spells);
  const desiredSources={};
  const totalPips=identity.reduce((s,c)=>s+pips[c],0)||identity.length;
  identity.forEach(c=>desiredSources[c]=(pips[c]||1)/totalPips);

  const duals=nonbasics.filter(c=>sourceColors(c).length>=2);
  const monoUtility=nonbasics.filter(c=>sourceColors(c).length===1);
  const picks=[], copies=new Map();
  const dualBudget=identity.length===2 ? Math.min(8,Math.max(4,Math.round(landCount*0.28))) : 0;
  for (let i=0;i<dualBudget && duals.length;i++) {
    const eligible=duals.filter(c=>(copies.get(c.id)||0)<2);
    if (!eligible.length) break;
    const c=eligible[Math.floor(rng()*eligible.length)]; picks.push({...c}); copies.set(c.id,(copies.get(c.id)||0)+1);
  }
  const utilityBudget=Math.min(identity.length===1?3:2, Math.max(0,landCount-picks.length-identity.length*6));
  for (let i=0;i<utilityBudget && monoUtility.length;i++) {
    const eligible=monoUtility.filter(c=>(copies.get(c.id)||0)<2);
    if (!eligible.length) break;
    const c=eligible[Math.floor(rng()*eligible.length)]; picks.push({...c}); copies.set(c.id,(copies.get(c.id)||0)+1);
  }
  while (picks.length<landCount) {
    let chosenColor=identity[0];
    if (identity.length===2) {
      const current={}; identity.forEach(c=>current[c]=picks.filter(l=>sourceColors(l).includes(c)).length);
      const deficits=identity.map(c=>({c,def:(desiredSources[c]*landCount)-(current[c]||0)})).sort((a,b)=>b.def-a.def);
      chosenColor=deficits[0].c;
    }
    const basic=pickBasic(basics,chosenColor,rng) || (basics.length?{...basics[Math.floor(rng()*basics.length)]}:null);
    if (!basic) break;
    picks.push(basic);
  }
  return picks;
}

function summarizeDeck(deck, meta) {
  const spells=deck.filter(c=>!isLand(c));
  const lands=deck.filter(isLand);
  const profiles=spells.map(c=>meta.get(c.id));
  const pips=colorPips(spells);
  const sources={W:0,U:0,B:0,R:0,G:0};
  lands.forEach(l=>sourceColors(l).forEach(c=>sources[c]++));
  const curve=curveCounts(profiles), roles=roleCounts(profiles);
  const themes={}; profiles.forEach(p=>p.themes.forEach(t=>themes[t]=(themes[t]||0)+1));
  const rarity={Common:0,Uncommon:0,Rare:0,Mythic:0};
  deck.forEach(c=>{ const key=String(c.rarity||''); if (key in rarity) rarity[key]++; });
  const avgMV=profiles.length?profiles.reduce((s,p)=>s+p.mv,0)/profiles.length:0;
  const creatures=profiles.filter(p=>p.isCreature).length;
  const vehicles=profiles.filter(p=>p.isVehicle).length;
  const instants=profiles.filter(p=>p.isInstant).length;
  const sorceries=profiles.filter(p=>p.isSorcery).length;
  const enchantments=profiles.filter(p=>p.isEnchantment).length;
  const artifacts=profiles.filter(p=>p.isArtifact).length;
  const planeswalkers=profiles.filter(p=>p.isPlaneswalker).length;
  return {spells:spells.length,lands:lands.length,creatures,vehicles,instants,sorceries,enchantments,artifacts,planeswalkers,profiles,pips,sources,curve,roles,themes,rarity,avgMV};
}

function openingGoldfish(deck, identity, iterations, rng) {
  let healthy=0, early=0, colorReady=0, land3=0, manaStall=0;
  const runs=Math.max(1,iterations|0);
  for (let n=0;n<runs;n++) {
    const pool=deck.slice();
    for (let i=0;i<Math.min(11,pool.length);i++) { const j=i+Math.floor(rng()*(pool.length-i)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
    const hand=pool.slice(0,7), draws=pool.slice(7,11);
    const lands=hand.filter(isLand), spells=hand.filter(c=>!isLand(c));
    if (lands.length>=2&&lands.length<=4) healthy++;
    if (spells.some(c=>cmc(c)<=2)) early++;
    const handSources=new Set(lands.flatMap(sourceColors));
    if (identity.every(c=>handSources.has(c)) || identity.length===1&&handSources.has(identity[0])) colorReady++;
    const first10=[...hand,...draws.slice(0,3)];
    const landCount10=first10.filter(isLand).length;
    if (landCount10>=3) land3++; else manaStall++;
  }
  const pct=x=>100*x/runs;
  return {iterations:runs,healthyPct:pct(healthy),earlyPct:pct(early),colorReadyPct:pct(colorReady),thirdLandPct:pct(land3),manaStallPct:pct(manaStall)};
}

function rarityPenalty(summary,budget) {
  if (!budget) return 0;
  const mythic=summary.rarity.Mythic||0;
  const rarePlus=mythic+(summary.rarity.Rare||0);
  return Math.max(0,mythic-budget.mythic)*80 + Math.max(0,rarePlus-budget.rarePlusMythic)*28;
}

function evaluateCandidate(deck, identity, archetypeId, meta, quality, goldfishIterations, rng, archContext) {
  const arch=ARCHETYPES[archetypeId]||ARCHETYPES.midrange;
  const qp=DECK_QUALITY_PROFILES[quality]||DECK_QUALITY_PROFILES.competitive;
  const s=summarizeDeck(deck,meta);
  const req=buildCompositionRequirements(arch,quality,s.spells,archContext);
  const composition=compositionStats(s.profiles,arch,archContext);
  const deficits=compositionDeficits(composition,req,archetypeId);
  const coreKeys=new Set(['creatures','creatureCeiling','vehicles','broadInteraction','creatureInteraction','instantSorcery','nonCreature']);
  const advancedKeys=new Set(['primaryTheme','typalFocus','typalDensity','tribalSupport']);
  const hardDeficits=deficits.filter(d=>coreKeys.has(d.key) || (qp.sophistication==='advanced'&&advancedKeys.has(d.key)) || qp.sophistication==='elite');
  const rarityBudget=qp.rarityBudget;
  const starterRarityInvalid=!!rarityBudget && ((s.rarity.Mythic||0)>rarityBudget.mythic || (s.rarity.Mythic||0)+(s.rarity.Rare||0)>rarityBudget.rarePlusMythic);
  if (hardDeficits.length || starterRarityInvalid) {
    const penalty=compositionPenalty(hardDeficits)+(starterRarityInvalid?1200:0);
    return {
      score:-100000-penalty,
      structuralOk:false,
      summary:{...s,profiles:undefined},
      composition,
      requirements:req,
      deficits,
      goldfish:{iterations:0,healthyPct:0,earlyPct:0,colorReadyPct:0,thirdLandPct:0,manaStallPct:100}
    };
  }
  let score=50;
  // Curva: premiar cercanía a la plantilla en lugar de una curva universal.
  let curveError=0; Object.entries(arch.curve).forEach(([b,target])=>curveError+=Math.abs((s.curve[b]||0)-target));
  score += Math.max(-20,22-curveError*1.15);
  // Roles funcionales. `broadInteraction` es el piso real; reach/narrow no lo falsifican.
  let roleScore=0; Object.entries(arch.roleTargets||{}).forEach(([r,target])=>{const actual=s.roles[r]||0;roleScore+=Math.min(actual,target)*1.25-Math.max(0,target-actual)*1.1;});
  score += roleScore;
  const themeHits=composition.themeHits;
  score += Math.min(28,themeHits*1.2);
  if (['tokens','counters','sacrifice','graveyard','exile','typal','artifacts','suspend','transform'].some(t=>arch.themes.includes(t))) {
    score += Math.min(s.roles.enabler||0,s.roles.payoff||0)*2.15;
    if ((s.roles.payoff||0)>0 && (s.roles.enabler||0)===0) score-=18;
  }
  // Calidad de construcción humana: ni todos cuerpos ni todos trucos salvo que el arquetipo lo pida.
  const creatureMid=(req.creatureMin+req.creatureMax)/2;
  score -= Math.abs(composition.creatures-creatureMid)*(qp.sophistication==='elite'?0.95:0.55);
  score += Math.min(12,composition.broadInteraction*0.9);
  score += Math.min(8,composition.creatureInteraction*0.7);
  score -= composition.narrowInteraction>Math.max(3,composition.broadInteraction)?5:0;
  const deadWeight=qp.sophistication==='elite'?6:qp.sophistication==='advanced'?3.5:1.5;
  score -= composition.deadSynergy*deadWeight;
  if (archetypeId==='typal' && composition.focusSubtype) {
    score += composition.typalDensity*18 + Math.min(10,composition.tribalSupport*1.3);
  }
  // Base de maná basada en demanda real de pips.
  for (const c of identity) {
    const demand=s.pips[c]||0, sources=s.sources[c]||0;
    const target=Math.max(8,Math.min(16,Math.round(7+demand*0.42)));
    score += Math.max(-16,8-Math.abs(sources-target)*1.8);
    if (demand>0&&sources<6) score-=18;
  }
  const gold=openingGoldfish(deck,identity,goldfishIterations,rng);
  score += (gold.healthyPct-55)*0.32 + (gold.earlyPct-60)*0.18 + (gold.thirdLandPct-70)*0.22 + (gold.colorReadyPct-(identity.length===1?70:48))*0.15;
  score -= rarityPenalty(s,qp.rarityBudget);
  // Cartas individualmente sólidas, pero en starter pesa menos para conservar upgrade headroom.
  const powerWeight=quality==='starter'?0.10:quality==='good'?0.14:0.18;
  score += s.profiles.reduce((sum,p)=>sum+p.power,0)/Math.max(1,s.profiles.length)*powerWeight;
  score -= compositionPenalty(deficits)*0.015; // defectos blandos siguen importando en Starter/Good/Strong.
  return {score,structuralOk:true,summary:{...s,profiles:undefined},composition,requirements:req,deficits,goldfish:gold};
}
function pickByQuantile(sorted, quality, rng) {
  const profile=DECK_QUALITY_PROFILES[quality]||DECK_QUALITY_PROFILES.competitive;
  const q=profile.quantile;
  const target=Math.max(0,Math.min(sorted.length-1,Math.round((sorted.length-1)*q)));
  // La dificultad también controla cuánto azar queda alrededor del percentil elegido.
  // Starter/Good varían más; Elite elige dentro del top mínimo para explotar todo el builder.
  const window=Math.max(0,Number(profile.selectionWindow)||0);
  const lo=Math.max(0,target-window), hi=Math.min(sorted.length-1,target+window);
  return sorted[lo+Math.floor(rng()*(hi-lo+1))];
}

export function buildCompetitiveDeck(cards, identity, options={}) {
  const rng=options.rng||Math.random;
  const quality=DECK_QUALITY_PROFILES[options.quality]?options.quality:'competitive';
  const qualityProfile=DECK_QUALITY_PROFILES[quality];
  const candidateCount=Math.max(12,Number(options.candidateCount)||qualityProfile.candidateCount||DEFAULT_CANDIDATE_COUNT);
  const goldfishIterations=Math.max(12,Number(options.goldfishIterations)||qualityProfile.goldfishIterations||DEFAULT_GOLDFISH_ITERATIONS);
  const cleanIdentity=[...new Set((identity||[]).filter(c=>COLORS.includes(c)))];
  if (!cleanIdentity.length || cleanIdentity.length>2) throw new Error('Deck Intelligence requiere una identidad de 1 o 2 colores.');
  const meta=buildDeckMetaCatalog(cards);
  const archetypeId=options.archetypeId&&ARCHETYPES[options.archetypeId]?options.archetypeId:chooseArchetype(cards,cleanIdentity,rng,quality);
  const arch=ARCHETYPES[archetypeId];
  const archContext=buildArchetypeContext(cards,cleanIdentity,archetypeId,meta);
  const candidates=[];
  for (let i=0;i<candidateCount;i++) {
    // Jitter de +/-1 tierra en algunas candidatas; la evaluación decide si realmente mejora.
    const jitter=(i%5===0?(rng()<0.5?-1:1):0);
    const landCount=Math.max(21,Math.min(26,arch.lands+jitter));
    const spellCount=60-landCount;
    const spells=buildSpellCandidate(cards,cleanIdentity,archetypeId,spellCount,meta,rng,quality,archContext);
    const lands=buildLandCandidate(cards,cleanIdentity,spells,landCount,rng);
    const deck=[...lands,...spells];
    if (deck.length!==60) continue;
    const evaluation=evaluateCandidate(deck,cleanIdentity,archetypeId,meta,quality,goldfishIterations,rng,archContext);
    if (!evaluation.structuralOk) continue;
    candidates.push({deck,evaluation,index:i});
  }
  if (!candidates.length) throw new Error(`No se pudo construir un mazo ${cleanIdentity.join('/')} de 60 cartas.`);
  candidates.sort((a,b)=>a.evaluation.score-b.evaluation.score);
  const selected=pickByQuantile(candidates,quality,rng);
  return {
    deck:selected.deck,
    report:{
      engineVersion:DECK_INTELLIGENCE_VERSION,
      identity:cleanIdentity,
      archetypeId,
      archetypeLabel:arch.label,
      quality,
      qualityLabel:qualityProfile.label,
      sophistication:qualityProfile.sophistication,
      candidateCount:candidates.length,
      selectedRank:candidates.indexOf(selected)+1,
      selectedScore:Math.round(selected.evaluation.score*10)/10,
      bestScore:Math.round(candidates[candidates.length-1].evaluation.score*10)/10,
      worstScore:Math.round(candidates[0].evaluation.score*10)/10,
      landCount:selected.evaluation.summary.lands,
      creatureCount:selected.evaluation.summary.creatures,
      vehicleCount:selected.evaluation.summary.vehicles,
      creatureFloor:selected.evaluation.requirements.creatureMin,
      creatureCeiling:selected.evaluation.requirements.creatureMax,
      maxVehicles:selected.evaluation.requirements.maxVehicles,
      broadInteractionFloor:selected.evaluation.requirements.broadInteraction,
      creatureInteractionFloor:selected.evaluation.requirements.creatureInteraction,
      instantSorceryFloor:selected.evaluation.requirements.instantSorcery,
      nonCreatureFloor:selected.evaluation.requirements.nonCreature,
      focusSubtype:selected.evaluation.composition.focusSubtype,
      composition:selected.evaluation.composition,
      constructionDeficits:selected.evaluation.deficits,
      averageManaValue:Math.round(selected.evaluation.summary.avgMV*100)/100,
      curve:selected.evaluation.summary.curve,
      roles:selected.evaluation.summary.roles,
      themes:selected.evaluation.summary.themes,
      rarity:selected.evaluation.summary.rarity,
      sources:selected.evaluation.summary.sources,
      pips:selected.evaluation.summary.pips,
      goldfish:selected.evaluation.goldfish
    }
  };
}

export function validateCompetitiveDeck(deck, identity) {
  const errors=[];
  if (!Array.isArray(deck)||deck.length!==60) errors.push(`size:${Array.isArray(deck)?deck.length:'invalid'}`);
  const copies=new Map();
  for (const card of deck||[]) {
    if (!identityMatches(card,identity)) errors.push(`off-color:${card?.id}`);
    if (!isLand(card) || !norm(card.type).includes('basica')) {
      copies.set(card.id,(copies.get(card.id)||0)+1);
      const limit=isLand(card)?2:4;
      if (copies.get(card.id)>limit) errors.push(`copies:${card.id}:${copies.get(card.id)}`);
    }
  }
  const lands=(deck||[]).filter(isLand).length;
  if (lands<21||lands>26) errors.push(`lands:${lands}`);
  return {ok:errors.length===0,errors,lands};
}

export function getArchetypeDefinition(id) {
  const a=ARCHETYPES[id]; return a?JSON.parse(JSON.stringify({id,...a})):null;
}
