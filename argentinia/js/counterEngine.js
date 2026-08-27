// js/counterEngine.js — Argentinia 23.15.8 · Counters Semantics + UI 2.0
// Fuente única de verdad para contadores de permanentes. Mantiene compatibilidad con las
// claves históricas plusOne/minusOne y permite counters nuevos/custom sin hardcodear el storage.

const DEFINITIONS = Object.freeze({
  plusOne: Object.freeze({ key:'plusOne', label:'+1/+1', short:'+1', icon:'⬆️', order:10, polarity:'positive', statPower:1, statToughness:1, reminder:'Da +1/+1 por cada contador.' }),
  minusOne: Object.freeze({ key:'minusOne', label:'-1/-1', short:'-1', icon:'⬇️', order:20, polarity:'negative', statPower:-1, statToughness:-1, reminder:'Da -1/-1 por cada contador.' }),
  shield: Object.freeze({ key:'shield', label:'Escudo', short:'Esc', icon:'🛡️', order:30, polarity:'positive', semantic:'shield', reminder:'Si este permanente fuera a recibir daño o ser destruido, remové un contador de Escudo de él en vez de eso.' }),
  stun: Object.freeze({ key:'stun', label:'Aturdimiento', short:'Atur', icon:'⏸️', order:40, polarity:'negative', semantic:'stun', reminder:'Si este permanente fuera a enderezarse, remové un contador de Aturdimiento de él en vez de eso.' }),
  charge: Object.freeze({ key:'charge', label:'Carga', short:'Carga', icon:'⚡', order:50, polarity:'neutral' }),
  time: Object.freeze({ key:'time', label:'Tiempo', short:'Tiempo', icon:'⏳', order:60, polarity:'neutral' }),
  lore: Object.freeze({ key:'lore', label:'Sabiduría', short:'Lore', icon:'📖', order:70, polarity:'positive' }),
  loyalty: Object.freeze({ key:'loyalty', label:'Lealtad', short:'Lealtad', icon:'🔮', order:80, polarity:'positive' }),
});

const ALIASES = Object.freeze({
  '+1/+1':'plusOne', plusone:'plusOne', plus_one:'plusOne', plus1:'plusOne',
  '-1/-1':'minusOne', minusone:'minusOne', minus_one:'minusOne', minus1:'minusOne',
  shield_counter:'shield', escudo:'shield',
  stun_counter:'stun', aturdimiento:'stun',
  charge_counter:'charge', carga:'charge',
  time_counter:'time', tiempo:'time',
  lore_counter:'lore', sabiduria:'lore',
  loyalty_counter:'loyalty', lealtad:'loyalty',
});

function ascii(value='') {
  return String(value).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

export function normalizeCounterType(rawType) {
  const raw=String(rawType ?? '').trim();
  if (!raw) return 'plusOne';
  if (DEFINITIONS[raw]) return raw;
  const compact=ascii(raw).replace(/[\s-]+/g,'_');
  return ALIASES[raw] || ALIASES[ascii(raw)] || ALIASES[compact] || raw;
}

export function getCounterDefinition(rawType) {
  const key=normalizeCounterType(rawType);
  if (DEFINITIONS[key]) return DEFINITIONS[key];
  const label=String(rawType || key).replace(/_/g,' ').trim() || 'Contador';
  return { key, label, short:label, icon:'●', order:1000, polarity:'neutral' };
}

export function ensureCounters(item) {
  if (!item || typeof item !== 'object') return {};
  if (!item.counters || typeof item.counters !== 'object' || Array.isArray(item.counters)) item.counters={};
  return item.counters;
}

export function getCounterCount(item, rawType) {
  const key=normalizeCounterType(rawType);
  return Math.max(0, Number(item?.counters?.[key] || 0));
}

export function setCounterCount(item, rawType, rawAmount) {
  const counters=ensureCounters(item);
  const key=normalizeCounterType(rawType);
  const amount=Math.max(0, Math.floor(Number(rawAmount)||0));
  counters[key]=amount;
  return amount;
}

// Mutación de storage solamente. La capa main.js envuelve esta función para publicar
// Replacement/Event Engine. Es útil en reglas de reemplazo (Shield/Stun), que ya están
// dentro de un evento en proceso y no deben iniciar otro counter_add recursivo.
export function changeCounterCount(item, rawType, rawDelta) {
  const key=normalizeCounterType(rawType);
  const before=getCounterCount(item,key);
  const after=Math.max(0, before + Math.trunc(Number(rawDelta)||0));
  setCounterCount(item,key,after);
  return { key, before, after, changed:after-before, removed:Math.max(0,before-after), added:Math.max(0,after-before) };
}

export function consumeCounter(item, rawType, amount=1) {
  const count=Math.max(0,Math.floor(Number(amount)||0));
  if (!count) return { key:normalizeCounterType(rawType), before:getCounterCount(item,rawType), after:getCounterCount(item,rawType), changed:0, removed:0, added:0 };
  return changeCounterCount(item,rawType,-count);
}

export function listCounters(item, { positiveOnly=true } = {}) {
  const counters=item?.counters && typeof item.counters==='object' ? item.counters : {};
  return Object.keys(counters)
    .map(rawKey => {
      const key=normalizeCounterType(rawKey);
      const amount=Math.max(0,Number(counters[rawKey]||0));
      return { ...getCounterDefinition(key), key, amount };
    })
    .filter(entry => !positiveOnly || entry.amount>0)
    .sort((a,b)=>(a.order-b.order) || a.label.localeCompare(b.label,'es'));
}

export function hasAnyCounters(item) { return listCounters(item).length>0; }

export function counterStatDelta(item) {
  return listCounters(item).reduce((acc,entry)=>{
    acc.power += Number(entry.statPower||0)*entry.amount;
    acc.toughness += Number(entry.statToughness||0)*entry.amount;
    return acc;
  },{power:0,toughness:0});
}

export function compactCounterText(item) {
  return listCounters(item).map(entry => `${entry.icon}${entry.amount}`).join(' ');
}

export function counterTooltipLines(item) {
  return listCounters(item).map(entry => `${entry.icon} ${entry.label}: ${entry.amount}${entry.reminder ? ` — ${entry.reminder}` : ''}`);
}

// CR Stun: sólo se llama ante un intento REAL de enderezar. Rollbacks internos de pago,
// Crew cancelado, etc. deben restaurar tapped directamente y NO pasar por esta función.
export function resolveUntapAttempt(item) {
  if (!item?.tapped) return { attempted:false, untapped:false, stunConsumed:false };
  if (getCounterCount(item,'stun')>0) {
    const change=consumeCounter(item,'stun',1);
    return { attempted:true, untapped:false, stunConsumed:true, counterChange:change };
  }
  item.tapped=false;
  return { attempted:true, untapped:true, stunConsumed:false };
}

export function counterEngineSummary() {
  return {
    version:'23.15.8',
    builtins:Object.keys(DEFINITIONS),
    genericCustom:true,
    semantics:['plusOne','minusOne','shield','stun'],
    tracked:['charge','time','lore'],
  };
}
