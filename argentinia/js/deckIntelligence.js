// js/deckIntelligence.js
// ENTREGA 23.17.1 — Competitive Deck Intelligence Engine · Pool 880.
// Motor puro de construcción/evaluación. No toca DOM, Firebase ni estado global.

const COLORS = ['W','U','B','R','G'];
export const DECK_INTELLIGENCE_VERSION = '23.17.1';
export const DEFAULT_CANDIDATE_COUNT = 64;
export const DEFAULT_GOLDFISH_ITERATIONS = 48;

export const DECK_QUALITY_PROFILES = Object.freeze({
  starter:     { label:'Starter competitivo', quantile:0.82, rarityBudget:{ mythic:2, rarePlusMythic:8 } },
  competitive: { label:'Competitivo', quantile:0.92, rarityBudget:null },
  good:        { label:'Bueno', quantile:0.60, rarityBudget:null },
  strong:      { label:'Muy bueno', quantile:0.86, rarityBudget:null },
  elite:       { label:'Tremendo', quantile:0.985, rarityBudget:null }
});

const ARCHETYPES = Object.freeze({
  aggro:      { label:'Aggro', lands:22, themes:['aggro'], roleTargets:{ threat:18, interaction:5 }, curve:{1:6,2:11,3:9,4:5,5:2,'6+':1} },
  tempo:      { label:'Tempo', lands:23, themes:['aggro','spells'], roleTargets:{ threat:14, interaction:8, selection:3 }, curve:{1:4,2:10,3:9,4:6,5:3,'6+':1} },
  midrange:   { label:'Midrange', lands:24, themes:['midrange'], roleTargets:{ threat:16, interaction:7, cardAdvantage:3 }, curve:{1:2,2:7,3:9,4:8,5:5,'6+':3} },
  control:    { label:'Control', lands:25, themes:['control','spells'], roleTargets:{ interaction:12, cardAdvantage:6, threat:7, sweeper:1 }, curve:{1:2,2:7,3:8,4:7,5:5,'6+':4} },
  tokens:     { label:'Fichas', lands:24, themes:['tokens'], roleTargets:{ enabler:8, payoff:5, threat:13, interaction:5 }, curve:{1:2,2:8,3:10,4:7,5:4,'6+':2} },
  counters:   { label:'Contadores', lands:24, themes:['counters'], roleTargets:{ enabler:8, payoff:5, threat:14, interaction:5 }, curve:{1:2,2:8,3:9,4:7,5:5,'6+':3} },
  sacrifice:  { label:'Sacrificio', lands:24, themes:['sacrifice','graveyard'], roleTargets:{ enabler:7, payoff:6, threat:13, interaction:6 }, curve:{1:3,2:9,3:9,4:7,5:4,'6+':2} },
  graveyard:  { label:'Cementerio', lands:24, themes:['graveyard'], roleTargets:{ enabler:7, payoff:5, cardAdvantage:4, threat:13, interaction:5 }, curve:{1:2,2:8,3:9,4:7,5:5,'6+':3} },
  exile:      { label:'Exilio / Impulse', lands:24, themes:['exile'], roleTargets:{ enabler:6, payoff:5, cardAdvantage:5, threat:12, interaction:5 }, curve:{1:2,2:8,3:9,4:7,5:5,'6+':3} },
  typal:      { label:'Typal', lands:24, themes:['typal'], roleTargets:{ lord:4, threat:17, interaction:5, cardAdvantage:3 }, curve:{1:3,2:9,3:10,4:7,5:4,'6+':2} },
  artifacts:  { label:'Artefactos', lands:24, themes:['artifacts'], roleTargets:{ enabler:6, payoff:5, threat:13, interaction:5, cardAdvantage:3 }, curve:{1:3,2:8,3:9,4:7,5:5,'6+':3} },
  spells:     { label:'Spells', lands:23, themes:['spells'], roleTargets:{ interaction:8, cardAdvantage:5, threat:10, payoff:4 }, curve:{1:4,2:10,3:9,4:6,5:3,'6+':2} },
  suspend:    { label:'Suspend / Tiempo', lands:24, themes:['suspend','exile'], roleTargets:{ enabler:6, payoff:4, threat:12, interaction:5, cardAdvantage:3 }, curve:{1:2,2:8,3:9,4:7,5:5,'6+':3} },
  transform:  { label:'Transform', lands:24, themes:['transform'], roleTargets:{ enabler:5, payoff:4, threat:15, interaction:5 }, curve:{1:2,2:8,3:9,4:8,5:5,'6+':3} },
  ramp:       { label:'Ramp', lands:25, themes:['ramp'], roleTargets:{ ramp:7, threat:13, interaction:5, finisher:5 }, curve:{1:1,2:6,3:8,4:7,5:6,'6+':8} }
});

export const ARCHETYPE_IDS = Object.freeze(Object.keys(ARCHETYPES));

function norm(value='') {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
function typeText(card) { return norm(card?.type); }
function isLand(card) { return typeText(card).includes('tierra'); }
function isCreature(card) { return typeText(card).includes('criatura'); }
function isArtifact(card) { return typeText(card).includes('artefacto'); }
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

  if (creature || permanent) roles.add('threat');
  if (creature && mv<=3) themes.add('aggro');
  if (creature && mv>=5) roles.add('finisher');
  if (keywords.has('haste') || keywords.has('menace') || keywords.has('firststrike') || keywords.has('doublestrike')) themes.add('aggro');
  if (effects.has('pump') || effects.has('grant_keyword_temp')) themes.add('aggro');

  const removalTypes=['destroy_creature','exile_creature','damage','fight','bounce','destroy_artifact','destroy_enchantment','destroy_land','destroy_nonbasic_land','gain_control','cant_attack_next_turn'];
  if (removalTypes.some(t=>effects.has(t))) { roles.add('interaction'); roles.add('removal'); themes.add('control'); }
  if ([...effects].some(t=>t.startsWith('counter'))) { roles.add('interaction'); roles.add('counterspell'); themes.add('control'); themes.add('spells'); }
  if (effects.has('destroy_all_creatures') || effects.has('destroy_all_lands')) { roles.add('sweeper'); roles.add('interaction'); themes.add('control'); }
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
  if (card?.staticEffect && ['team_buff','team_keyword'].includes(norm(card.staticEffect.type))) { themes.add('typal'); roles.add('lord'); roles.add('payoff'); }
  if (structuredHas(card,o=>o?.subtype || o?.targetSubtype || o?.targetSubtypes || o?.sharedCreatureTypeWithSource || o?.type==='choose_creature_type') || /tipo de criatura/.test(text)) { themes.add('typal'); roles.add(/elige|elegi/.test(text)?'enabler':'payoff'); }
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
    themes:[...themes],
    roles:[...roles],
    subtypeTokens:cardSubtypeTokens(card),
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
  for (const {profile} of eligibleProfiles) {
    const hit=arch.themes.some(t=>profile.themes.includes(t));
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
  if (id==='control') score += eligibleProfiles.filter(x=>x.profile.roles.includes('interaction')).length*0.6;
  if (id==='aggro') score += eligibleProfiles.filter(x=>x.profile.isCreature&&x.profile.mv<=3).length*0.25;
  if (id==='ramp' && matching<6) score-=25;
  return {id,label:arch.label,score,matching,enabler,payoff};
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
    if (id === 'tempo') row.score *= 0.76;
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

function chooseArchetype(cards, identity, rng) {
  const ranked=rankViableArchetypes(cards,identity);
  const viable=ranked.filter((x,i)=>i<6 && x.score>=Math.max(18,ranked[0].score*0.48));
  const base=(viable.length?viable:ranked.slice(0,3));
  const top=Math.max(1,base[0]?.score||1);
  // Elegir entre arquetipos REALMENTE viables, con preferencia moderada por los más
  // profundos. No usar el score bruto: sus escalas dependen de cuántas cartas tenga el pool.
  const candidates=base.map((x,i)=>({...x,score:42-i*5+(x.score/top)*12}));
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
function synergyScore(profile, arch) {
  let s=0;
  for (const t of arch.themes) if (profile.themes.includes(t)) s+=9;
  if (arch.themes.includes('midrange') && profile.themes.includes('midrange')) s+=4;
  if (arch.themes.includes('control') && profile.roles.includes('interaction')) s+=5;
  if (arch.themes.includes('aggro') && profile.isCreature && profile.mv<=3) s+=5;
  return s;
}
function cardCandidateScore(profile, arch, context, copies, card, quality) {
  const roles=context.roles, curve=context.curve, bucket=curveBucket(profile.mv);
  let score=profile.power*0.48 + synergyScore(profile,arch);
  const desiredCurve=arch.curve[bucket]||0;
  score += Math.max(-5,(desiredCurve-(curve[bucket]||0))*1.6);
  for (const [role,target] of Object.entries(arch.roleTargets||{})) if (profile.roles.includes(role)) score += Math.max(-2,(target-(roles[role]||0))*0.9);
  if (copies===1) score+=2.5; // consistencia: la segunda copia de una pieza buena es valiosa.
  if (copies===2) score+=1.2;
  if (copies>=3) score-=3.5;
  // Starter: conservar potencia/sinergia, pero no convertir la primera colección en una
  // montaña de Rares/Mythics. El presupuesto final además se valida a nivel de mazo.
  if (quality === 'starter') {
    const rr = rarityRank(card);
    if (rr === 2) score -= 11;
    if (rr >= 3) score -= 18;
  }
  return score;
}

function buildSpellCandidate(cards, identity, archetypeId, spellCount, meta, rng, quality) {
  const arch=ARCHETYPES[archetypeId]||ARCHETYPES.midrange;
  const eligible=cards.filter(c=>!isLand(c)&&identityMatches(c,identity));
  const chosen=[], profiles=[], copies=new Map();
  while (chosen.length<spellCount) {
    const scored=[];
    const context={roles:roleCounts(profiles),curve:curveCounts(profiles)};
    for (const card of eligible) {
      const count=copies.get(card.id)||0;
      if (count>=4) continue;
      const profile=meta.get(card.id);
      scored.push({card,profile,score:cardCandidateScore(profile,arch,context,count,card,quality)});
    }
    if (!scored.length) break;
    scored.sort((a,b)=>b.score-a.score);
    // Sólo hacemos RNG dentro del segmento razonable; evita que una tirada azarosa elija basura.
    const shortlist=scored.slice(0,Math.min(28,scored.length));
    const pick=weightedPick(shortlist,rng) || shortlist[0];
    chosen.push({...pick.card}); profiles.push(pick.profile);
    copies.set(pick.card.id,(copies.get(pick.card.id)||0)+1);
  }
  return chosen;
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
  return {spells:spells.length,lands:lands.length,profiles,pips,sources,curve,roles,themes,rarity,avgMV};
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

function evaluateCandidate(deck, identity, archetypeId, meta, quality, goldfishIterations, rng) {
  const arch=ARCHETYPES[archetypeId]||ARCHETYPES.midrange;
  const s=summarizeDeck(deck,meta);
  let score=50;
  // Curva: premiar cercanía a la plantilla en lugar de una curva universal.
  let curveError=0; Object.entries(arch.curve).forEach(([b,target])=>curveError+=Math.abs((s.curve[b]||0)-target));
  score += Math.max(-20,22-curveError*1.15);
  // Roles.
  let roleScore=0; Object.entries(arch.roleTargets||{}).forEach(([r,target])=>{const actual=s.roles[r]||0;roleScore+=Math.min(actual,target)*1.25-Math.max(0,target-actual)*1.1;});
  score += roleScore;
  // Densidad de la sinergia principal y equilibrio enabler/payoff.
  const themeHits=arch.themes.reduce((sum,t)=>sum+(s.themes[t]||0),0);
  score += Math.min(26,themeHits*1.25);
  if (['tokens','counters','sacrifice','graveyard','exile','typal','artifacts','suspend','transform'].some(t=>arch.themes.includes(t))) {
    score += Math.min(s.roles.enabler||0,s.roles.payoff||0)*2.2;
    if ((s.roles.payoff||0)>0 && (s.roles.enabler||0)===0) score-=18;
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
  score -= rarityPenalty(s,DECK_QUALITY_PROFILES[quality]?.rarityBudget);
  // Cartas individualmente sólidas, peso moderado para que sinergia/consistencia manden.
  score += s.profiles.reduce((sum,p)=>sum+p.power,0)/Math.max(1,s.profiles.length)*0.18;
  return {score,summary:{...s,profiles:undefined},goldfish:gold};
}

function pickByQuantile(sorted, quality, rng) {
  const q=DECK_QUALITY_PROFILES[quality]?.quantile ?? DECK_QUALITY_PROFILES.competitive.quantile;
  const target=Math.max(0,Math.min(sorted.length-1,Math.round((sorted.length-1)*q)));
  // Ventana chica para que dos builds del mismo color/arquetipo no sean clones.
  const lo=Math.max(0,target-2), hi=Math.min(sorted.length-1,target+2);
  return sorted[lo+Math.floor(rng()*(hi-lo+1))];
}

export function buildCompetitiveDeck(cards, identity, options={}) {
  const rng=options.rng||Math.random;
  const quality=DECK_QUALITY_PROFILES[options.quality]?options.quality:'competitive';
  const candidateCount=Math.max(12,Number(options.candidateCount)||DEFAULT_CANDIDATE_COUNT);
  const goldfishIterations=Math.max(12,Number(options.goldfishIterations)||DEFAULT_GOLDFISH_ITERATIONS);
  const cleanIdentity=[...new Set((identity||[]).filter(c=>COLORS.includes(c)))];
  if (!cleanIdentity.length || cleanIdentity.length>2) throw new Error('Deck Intelligence requiere una identidad de 1 o 2 colores.');
  const meta=buildDeckMetaCatalog(cards);
  const archetypeId=options.archetypeId&&ARCHETYPES[options.archetypeId]?options.archetypeId:chooseArchetype(cards,cleanIdentity,rng);
  const arch=ARCHETYPES[archetypeId];
  const candidates=[];
  for (let i=0;i<candidateCount;i++) {
    // Jitter de +/-1 tierra en algunas candidatas; la evaluación decide si realmente mejora.
    const jitter=(i%5===0?(rng()<0.5?-1:1):0);
    const landCount=Math.max(21,Math.min(26,arch.lands+jitter));
    const spellCount=60-landCount;
    const spells=buildSpellCandidate(cards,cleanIdentity,archetypeId,spellCount,meta,rng,quality);
    const lands=buildLandCandidate(cards,cleanIdentity,spells,landCount,rng);
    const deck=[...lands,...spells];
    if (deck.length!==60) continue;
    const evaluation=evaluateCandidate(deck,cleanIdentity,archetypeId,meta,quality,goldfishIterations,rng);
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
      qualityLabel:DECK_QUALITY_PROFILES[quality].label,
      candidateCount:candidates.length,
      selectedRank:candidates.indexOf(selected)+1,
      selectedScore:Math.round(selected.evaluation.score*10)/10,
      bestScore:Math.round(candidates[candidates.length-1].evaluation.score*10)/10,
      worstScore:Math.round(candidates[0].evaluation.score*10)/10,
      landCount:selected.evaluation.summary.lands,
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
