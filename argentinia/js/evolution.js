// HF23.3.14.1 — Cápsula de Evolución · content/balance contract.
// Una evolución pertenece a UNA copia física de una carta base. La colección conserva
// cardIds canónicos; los mazos marcan esa copia con ::evo1 / ::evo2.
//
// CONTRATO DE DISEÑO:
// - catálogo inicial cerrado: 20 bases / 20 EVO1 / 20 EVO2;
// - EVO1/EVO2 son cartas jugables completas: pueden sobrescribir coste, CMC, rareza,
//   P/T, keywords, texto y triggers/habilidades estructurados;
// - cada stage tiene arte propio determinístico en assets/images/evolutions/;
// - una carta con defender/Muralla SIEMPRE tiene poder 0;
// - nuevas líneas evolutivas requieren diseño explícito; no se generan automáticamente.

export const EVOLUTION_STAGE1_SUFFIX = '::evo1';
export const EVOLUTION_STAGE2_SUFFIX = '::evo2';
export const EVOLUTION_SUFFIXES = Object.freeze([EVOLUTION_STAGE1_SUFFIX, EVOLUTION_STAGE2_SUFFIX]);
export const EVOLUTION_ART_DIRECTORY = 'assets/images/evolutions';

const cloneValue = value => {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,cloneValue(v)]));
  return value;
};

const stage = spec => Object.freeze({ ...spec });
const path = (baseId, stage1, stage2) => Object.freeze({
  baseId,
  stages: Object.freeze({ 1: stage(stage1), 2: stage(stage2) })
});

// Campos de carta que una evolución puede redefinir. Mantener esta allowlist explícita:
// una EVO no puede cambiar el id físico ni introducir propiedades arbitrarias de autoridad.
export const EVOLUTION_CARD_OVERRIDE_FIELDS = Object.freeze([
  'name','type','manaCost','cmc','rarity','colors','power','toughness','keywords','text','flavorText',
  'etbEffect','diesTrigger','attackTrigger','combatDamageTrigger','blockTrigger','upkeepTrigger',
  'spellCastTrigger','creatureEtbTrigger','anyCreatureDiesTrigger','opponentDeathTrigger','landEtbTrigger',
  'activatedAbility','activatedAbilities','staticEffect','staticEffects','replacementEffect','requiresTarget'
]);

// Pool inicial owner-approved como BASE del sistema: 20 líneas. El balance usa progresión
// Common→Uncommon→Rare y Uncommon→Rare→Mythic, aumentando también el coste de maná para
// que el poder adicional exista DENTRO de la partida y no sólo como coste de adquisición.
export const EVOLUTION_PATHS = Object.freeze([
  path('crea_001',
    { name:'El Firulais · Guardián', manaCost:'{2}', cmc:2, rarity:'Uncommon', power:2, toughness:3, keywords:['vigilance'], text:'Alerta. Siempre que El Firulais · Guardián bloquee, ganás 1 Punto de Vida.', blockTrigger:{type:'heal',amount:1} },
    { name:'El Firulais · Leyenda del Barrio', manaCost:'{4}', cmc:4, rarity:'Rare', power:3, toughness:5, keywords:['vigilance','lifelink'], text:'Alerta, Absorción. Siempre que El Firulais · Leyenda del Barrio bloquee, ganás 1 Punto de Vida.', blockTrigger:{type:'heal',amount:1} }
  ),
  path('crea_002',
    { name:'El Canillita · Mensajero', manaCost:'{2}{U}', cmc:3, rarity:'Uncommon', power:2, toughness:2, keywords:['flying'], text:'Vuela. Cuando El Canillita · Mensajero entre al campo de batalla, robá una carta.', etbEffect:{type:'draw',amount:1} },
    { name:'El Canillita · Voz de la Ciudad', manaCost:'{3}{U}', cmc:4, rarity:'Rare', power:3, toughness:3, keywords:['flying','ward_1'], text:'Vuela. Impuesto {1}. Cuando El Canillita · Voz de la Ciudad entre al campo de batalla, robá una carta. Siempre que ataque, anticipá 1.', etbEffect:{type:'draw',amount:1}, attackTrigger:{type:'scry',amount:1} }
  ),
  path('crea_003',
    { name:'El Gaucho · Baqueano', manaCost:'{2}{G}', cmc:3, rarity:'Uncommon', power:3, toughness:3, keywords:['firststrike'], text:'Iniciativa. Siempre que El Gaucho · Baqueano ataque, ganás 1 Punto de Vida.', attackTrigger:{type:'heal',amount:1} },
    { name:'El Gaucho · Custodio del Horizonte', manaCost:'{4}{G}', cmc:5, rarity:'Rare', power:4, toughness:5, keywords:['firststrike','trample'], text:'Iniciativa, Arrolla. Siempre que El Gaucho · Custodio del Horizonte le haga daño de combate al jugador, ganás 2 Puntos de Vida.', combatDamageTrigger:{type:'heal',amount:2} }
  ),
  path('crea_004',
    { name:'Mozo de Bodegón · Encargado', manaCost:'{3}', cmc:3, rarity:'Uncommon', power:2, toughness:4, keywords:['vigilance'], text:'Alerta. Siempre que Mozo de Bodegón · Encargado bloquee, ganás 1 Punto de Vida.', blockTrigger:{type:'heal',amount:1} },
    { name:'Mozo de Bodegón · Dueño de la Noche', manaCost:'{5}', cmc:5, rarity:'Rare', power:3, toughness:5, keywords:['vigilance','lifelink'], text:'Alerta, Absorción. Siempre que Mozo de Bodegón · Dueño de la Noche bloquee, ganás 1 Punto de Vida.', blockTrigger:{type:'heal',amount:1} }
  ),
  path('crea_005',
    { name:'Loro Hablador · Chusma', manaCost:'{2}{G}', cmc:3, rarity:'Uncommon', power:2, toughness:2, keywords:['flying'], text:'Vuela. Cuando Loro Hablador · Chusma entre al campo de batalla, anticipá 1.', etbEffect:{type:'scry',amount:1} },
    { name:'Loro Hablador · Oráculo de Plaza', manaCost:'{3}{G}', cmc:4, rarity:'Rare', power:3, toughness:3, keywords:['flying','ward_1'], text:'Vuela. Impuesto {1}. Siempre que Loro Hablador · Oráculo de Plaza ataque, anticipá 1.', attackTrigger:{type:'scry',amount:1} }
  ),
  path('crea_006',
    { name:'El Trapito · Dueño de la Cuadra', manaCost:'{2}{R}', cmc:3, rarity:'Uncommon', power:3, toughness:2, keywords:['menace'], text:'Intimidante. Cuando El Trapito · Dueño de la Cuadra entre al campo de batalla, hace 1 de daño al jugador rival.', etbEffect:{type:'damage',amount:1} },
    { name:'El Trapito · Señor de la Esquina', manaCost:'{4}{R}', cmc:5, rarity:'Rare', power:4, toughness:4, keywords:['menace','haste'], text:'Intimidante, Apuro. Siempre que El Trapito · Señor de la Esquina ataque, hace 1 de daño al jugador rival.', attackTrigger:{type:'damage',amount:1} }
  ),
  path('crea_007',
    { name:'Vecina Chismosa · Informante', manaCost:'{2}{W}', cmc:3, rarity:'Uncommon', power:0, toughness:6, keywords:['defender'], text:'Muralla. Siempre que Vecina Chismosa · Informante bloquee, ganás 1 Punto de Vida.', blockTrigger:{type:'heal',amount:1} },
    { name:'Vecina Chismosa · Red del Barrio', manaCost:'{3}{W}', cmc:4, rarity:'Rare', power:0, toughness:7, keywords:['defender','ward_1'], text:'Muralla. Impuesto {1}. Siempre que Vecina Chismosa · Red del Barrio bloquee, ganás 2 Puntos de Vida.', blockTrigger:{type:'heal',amount:2} }
  ),
  path('crea_008',
    { name:'Paloma de Plaza · Bandada', manaCost:'{1}{W}', cmc:2, rarity:'Uncommon', power:2, toughness:1, keywords:['flying','vigilance'], text:'Vuela, Alerta.' },
    { name:'Paloma de Plaza · Reina de las Cúpulas', manaCost:'{2}{W}', cmc:3, rarity:'Rare', power:2, toughness:3, keywords:['flying','vigilance'], text:'Vuela, Alerta. Siempre que Paloma de Plaza · Reina de las Cúpulas le haga daño de combate al jugador, ganás 1 Punto de Vida.', combatDamageTrigger:{type:'heal',amount:1} }
  ),
  path('crea_009',
    { name:'Vendedora de Chipá · Repartidora', manaCost:'{3}', cmc:3, rarity:'Uncommon', power:2, toughness:3, keywords:['lifelink'], text:'Absorción. Cuando Vendedora de Chipá · Repartidora entre al campo de batalla, ganás 2 Puntos de Vida.', etbEffect:{type:'heal',amount:2} },
    { name:'Vendedora de Chipá · Alma de la Terminal', manaCost:'{5}', cmc:5, rarity:'Rare', power:3, toughness:4, keywords:['lifelink'], text:'Absorción. Cuando Vendedora de Chipá · Alma de la Terminal entre al campo de batalla, ganás 3 Puntos de Vida.', etbEffect:{type:'heal',amount:3} }
  ),
  path('crea_010',
    { name:'Pibe de la Cuadra · Corredor', manaCost:'{2}{R}', cmc:3, rarity:'Uncommon', power:3, toughness:2, keywords:['haste'], text:'Apuro. Siempre que Pibe de la Cuadra · Corredor ataque, hace 1 de daño al jugador rival.', attackTrigger:{type:'damage',amount:1} },
    { name:'Pibe de la Cuadra · Ídolo del Asfalto', manaCost:'{3}{R}', cmc:4, rarity:'Rare', power:3, toughness:3, keywords:['haste','firststrike'], text:'Apuro, Iniciativa. Siempre que Pibe de la Cuadra · Ídolo del Asfalto ataque, hace 1 de daño al jugador rival.', attackTrigger:{type:'damage',amount:1} }
  ),
  path('crea_011',
    { name:'Perro de la Plaza · Protector', manaCost:'{3}{G}', cmc:4, rarity:'Rare', power:4, toughness:4, keywords:['lifelink'], text:'Absorción. Siempre que Perro de la Plaza · Protector bloquee, ganás 1 Punto de Vida.', blockTrigger:{type:'heal',amount:1} },
    { name:'Perro de la Plaza · Guardián del Parque', manaCost:'{5}{G}', cmc:6, rarity:'Mythic', power:5, toughness:5, keywords:['lifelink','vigilance'], text:'Absorción, Alerta. Siempre que Perro de la Plaza · Guardián del Parque bloquee, ganás 2 Puntos de Vida.', blockTrigger:{type:'heal',amount:2} }
  ),
  path('crea_012',
    { name:'Colectivero Apurado · Línea Directa', manaCost:'{3}{R}', cmc:4, rarity:'Rare', power:4, toughness:3, keywords:['haste'], text:'Apuro. Siempre que Colectivero Apurado · Línea Directa ataque, hace 1 de daño al jugador rival.', attackTrigger:{type:'damage',amount:1} },
    { name:'Colectivero Apurado · Último Servicio', manaCost:'{4}{R}', cmc:5, rarity:'Mythic', power:5, toughness:4, keywords:['haste','firststrike'], text:'Apuro, Iniciativa. Siempre que Colectivero Apurado · Último Servicio ataque, hace 1 de daño al jugador rival.', attackTrigger:{type:'damage',amount:1} }
  ),
  path('crea_024',
    { name:'Petardo Ambulante · Mecha Corta', manaCost:'{2}{R}', cmc:3, rarity:'Rare', power:2, toughness:1, keywords:['haste'], text:'Apuro. Cuando esta criatura muera, hace 2 de daño al jugador rival.', diesTrigger:{type:'damage',amount:2} },
    { name:'Petardo Ambulante · Estallido Viviente', manaCost:'{3}{R}', cmc:4, rarity:'Mythic', power:3, toughness:2, keywords:['haste','menace'], text:'Apuro, Intimidante. Cuando esta criatura muera, hace 3 de daño al jugador rival.', diesTrigger:{type:'damage',amount:3} }
  ),
  path('crea_025',
    { name:'Alma en Pena · Aparición', manaCost:'{2}{B}', cmc:3, rarity:'Rare', power:2, toughness:3, keywords:['menace'], text:'Intimidante. Cuando esta criatura muera, robás una carta.', diesTrigger:{type:'draw',amount:1} },
    { name:'Alma en Pena · Espectro Persistente', manaCost:'{3}{B}', cmc:4, rarity:'Mythic', power:3, toughness:4, keywords:['menace','deathtouch'], text:'Intimidante, Letal. Cuando esta criatura muera, robás una carta.', diesTrigger:{type:'draw',amount:1} }
  ),
  path('crea_034',
    { name:'El Recaudador Implacable · Cobrador', manaCost:'{3}{B}', cmc:4, rarity:'Rare', power:3, toughness:4, keywords:['deathtouch'], text:'Letal. Cuando esta criatura muera, el jugador rival pierde 2 Puntos de Vida y vos ganás 2.', diesTrigger:{type:'drain',amount:2} },
    { name:'El Recaudador Implacable · Verdugo Fiscal', manaCost:'{4}{B}', cmc:5, rarity:'Mythic', power:4, toughness:5, keywords:['deathtouch'], text:'Letal. Cuando esta criatura muera, el jugador rival pierde 3 Puntos de Vida y vos ganás 3.', diesTrigger:{type:'drain',amount:3} }
  ),
  path('crea_036',
    { name:'Buzo de la Costanera · Explorador', manaCost:'{4}{U}', cmc:5, rarity:'Rare', power:3, toughness:4, keywords:['flying','ward_1'], text:'Vuela. Impuesto {1}. Siempre que Buzo de la Costanera · Explorador ataque, robás una carta.', attackTrigger:{type:'draw',amount:1} },
    { name:'Buzo de la Costanera · Fantasma del Río', manaCost:'{5}{U}', cmc:6, rarity:'Mythic', power:4, toughness:5, keywords:['flying','ward_2'], text:'Vuela. Impuesto {2}. Siempre que Buzo de la Costanera · Fantasma del Río ataque, robás una carta. Siempre que le haga daño de combate al jugador, anticipá 1.', attackTrigger:{type:'draw',amount:1}, combatDamageTrigger:{type:'scry',amount:1} }
  ),
  path('crea_039',
    { name:'Capitana del Aguante · Jefa de Guardia', manaCost:'{3}{W}', cmc:4, rarity:'Rare', power:4, toughness:4, keywords:['vigilance'], text:'Alerta. Siempre que Capitana del Aguante · Jefa de Guardia ataque, ganás 2 Puntos de Vida.', attackTrigger:{type:'heal',amount:2} },
    { name:'Capitana del Aguante · Comandante del Barrio', manaCost:'{4}{W}', cmc:5, rarity:'Mythic', power:5, toughness:5, keywords:['vigilance','lifelink'], text:'Alerta, Absorción. Siempre que Capitana del Aguante · Comandante del Barrio ataque, ganás 2 Puntos de Vida.', attackTrigger:{type:'heal',amount:2} }
  ),
  path('crea_041',
    { name:'Jabalí del Descampado · Embestida', manaCost:'{4}{G}', cmc:5, rarity:'Rare', power:5, toughness:4, keywords:['trample','reach'], text:'Arrolla, Alcance. Siempre que Jabalí del Descampado · Embestida le haga daño de combate al jugador, ganás 2 Puntos de Vida.', combatDamageTrigger:{type:'heal',amount:2} },
    { name:'Jabalí del Descampado · Bestia del Terraplén', manaCost:'{5}{G}', cmc:6, rarity:'Mythic', power:6, toughness:5, keywords:['trample','reach','ward_1'], text:'Arrolla, Alcance. Impuesto {1}. Siempre que Jabalí del Descampado · Bestia del Terraplén le haga daño de combate al jugador, ganás 3 Puntos de Vida.', combatDamageTrigger:{type:'heal',amount:3} }
  ),
  path('crea_046',
    { name:'Contrabandista de Sombras · Correo Negro', manaCost:'{3}{U}', cmc:4, rarity:'Rare', power:2, toughness:3, keywords:['flying','ward_1'], text:'Vuela. Impuesto {1}. Siempre que Contrabandista de Sombras · Correo Negro le haga daño de combate al jugador, robás una carta.', combatDamageTrigger:{type:'draw',amount:1} },
    { name:'Contrabandista de Sombras · Amo del Pasaje', manaCost:'{4}{U}', cmc:5, rarity:'Mythic', power:3, toughness:4, keywords:['flying','ward_2'], text:'Vuela. Impuesto {2}. Siempre que Contrabandista de Sombras · Amo del Pasaje ataque, anticipá 1. Siempre que le haga daño de combate al jugador, robás una carta.', attackTrigger:{type:'scry',amount:1}, combatDamageTrigger:{type:'draw',amount:1} }
  ),
  path('crea_050',
    { name:'Ángel del Descampado · Vigía', manaCost:'{5}{W}', cmc:6, rarity:'Rare', power:5, toughness:6, keywords:['flying','vigilance'], text:'Vuela, Alerta.' },
    { name:'Ángel del Descampado · Custodio del Cielo', manaCost:'{5}{W}{W}', cmc:7, rarity:'Mythic', power:6, toughness:7, keywords:['flying','vigilance','lifelink'], text:'Vuela, Alerta, Absorción.' }
  )
]);

export const EVOLUTION_PATH_BY_BASE_ID = new Map(EVOLUTION_PATHS.map(entry => [entry.baseId, entry]));

const clampStage = value => Math.max(0, Math.min(2, Math.floor(Number(value) || 0)));

export function evolutionArtFilename(baseId, stageValue) {
  const s = clampStage(stageValue);
  if (s < 1) return '';
  return `${String(baseId || '')}_evo${s}.png`;
}

export function evolutionArtRelativePath(baseId, stageValue) {
  const filename = evolutionArtFilename(baseId, stageValue);
  return filename ? `${EVOLUTION_ART_DIRECTORY}/${filename}` : '';
}

export function expectedEvolutionArtEntries() {
  return EVOLUTION_PATHS.flatMap(entry => [1,2].map(stageNumber => ({
    baseId: entry.baseId,
    stage: stageNumber,
    name: entry.stages[stageNumber].name,
    image: evolutionArtFilename(entry.baseId, stageNumber),
    path: evolutionArtRelativePath(entry.baseId, stageNumber)
  })));
}

export function normalizeEvolutionProfile(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const [baseId, row] of Object.entries(source)) {
    if (!EVOLUTION_PATH_BY_BASE_ID.has(baseId)) continue;
    const currentStage = clampStage(typeof row === 'object' && row ? row.stage : row);
    if (currentStage < 1) continue;
    out[baseId] = typeof row === 'object' && row ? { ...row, stage:currentStage } : { stage:currentStage };
  }
  return out;
}

export function parseEvolutionVariantId(rawId) {
  const id = String(rawId || '');
  if (id.endsWith(EVOLUTION_STAGE2_SUFFIX)) return { baseId:id.slice(0,-EVOLUTION_STAGE2_SUFFIX.length), stage:2 };
  if (id.endsWith(EVOLUTION_STAGE1_SUFFIX)) return { baseId:id.slice(0,-EVOLUTION_STAGE1_SUFFIX.length), stage:1 };
  return { baseId:id, stage:0 };
}

export function evolutionVariantId(baseId, stageValue) {
  const s = clampStage(stageValue);
  return s === 2 ? `${baseId}${EVOLUTION_STAGE2_SUFFIX}` : s === 1 ? `${baseId}${EVOLUTION_STAGE1_SUFFIX}` : String(baseId || '');
}

export function evolutionStageForProfile(evolutions, baseId) {
  return clampStage(normalizeEvolutionProfile(evolutions)?.[String(baseId || '')]?.stage);
}

export function isEvolutionEligibleCard(cardOrId) {
  const id = typeof cardOrId === 'string' ? cardOrId : cardOrId?.id;
  return EVOLUTION_PATH_BY_BASE_ID.has(String(id || ''));
}

export function isEvolutionStageDiscovered(evolutions, baseId, stageValue) {
  const requested = clampStage(stageValue);
  return requested > 0 && evolutionStageForProfile(evolutions, baseId) >= requested;
}

export function applyEvolutionStage(card, stageValue) {
  if (!card) return card;
  const baseId = String(card.evolutionBaseId || card.id || '');
  const pathEntry = EVOLUTION_PATH_BY_BASE_ID.get(baseId);
  const s = clampStage(stageValue);
  const spec = pathEntry?.stages?.[s];
  if (!spec) return { ...card };

  const out = { ...card };
  for (const field of EVOLUTION_CARD_OVERRIDE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(spec, field)) continue;
    const value = spec[field];
    if (value === null) delete out[field];
    else out[field] = cloneValue(value);
  }

  // Defensa/Muralla es una regla de identidad de Argentinia, no una sugerencia de balance.
  if (Array.isArray(out.keywords) && out.keywords.includes('defender')) out.power = 0;

  out.image = evolutionArtFilename(baseId, s);
  out.imageRoot = 'evolutions';
  out.evolutionBaseId = baseId;
  out.evolutionStage = s;
  out.evolutionPathId = baseId;
  return out;
}
