import { maximumBipartiteAssignment } from './flexibleMatching.js';
// js/manaPool.js — Argentinia 23.14.1 · Mana Pool Foundation
// Modelo puro de reserva de maná. No conoce DOM ni `state`: se comparte entre humano,
// Tano, UI y sync sin introducir otro motor paralelo de pagos.

export const MANA_TYPES = Object.freeze(['W', 'U', 'B', 'R', 'G', 'C']);

export function emptyManaPool() {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}

export function normalizeManaPool(pool) {
  const out = emptyManaPool();
  for (const type of MANA_TYPES) out[type] = Math.max(0, Math.floor(Number(pool?.[type]) || 0));
  return out;
}

export function cloneManaPool(pool) {
  return normalizeManaPool(pool);
}

export function manaPoolTotal(pool) {
  const p = normalizeManaPool(pool);
  return MANA_TYPES.reduce((sum, type) => sum + p[type], 0);
}

export function addMana(pool, type, amount = 1) {
  if (!MANA_TYPES.includes(type)) return false;
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  if (n <= 0) return false;
  pool[type] = Math.max(0, Math.floor(Number(pool[type]) || 0)) + n;
  return true;
}

export function clearManaPool(pool) {
  for (const type of MANA_TYPES) pool[type] = 0;
  return pool;
}

export function manaCostTotal(cost) {
  if (!cost) return 0;
  const fixed = ['W', 'U', 'B', 'R', 'G', 'C', 'generic']
    .reduce((sum, key) => sum + Math.max(0, Math.floor(Number(cost[key]) || 0)), 0);
  return fixed + (Array.isArray(cost.hybrid) ? cost.hybrid.length : 0) + (Array.isArray(cost.phyrexian) ? cost.phyrexian.length : 0);
}

// Un click de un símbolo del pool paga primero su requisito específico y, si ya no hace
// falta ese símbolo, puede pagar genérico. {C} sólo puede pagarse con maná incoloro.
export function spendOneMana(pool, cost, type) {
  if (!pool || !cost || !MANA_TYPES.includes(type) || (pool[type] || 0) <= 0) return null;
  if ((cost[type] || 0) > 0) {
    pool[type] -= 1; cost[type] -= 1; return { type, paid: type };
  }
  if (Array.isArray(cost.hybrid)) {
    const idx=cost.hybrid.findIndex(options=>Array.isArray(options)&&options.includes(type));
    if(idx>=0){ const symbol=cost.hybrid.splice(idx,1)[0]; pool[type]-=1; return {type,paid:`hybrid:${symbol.join('/')}`}; }
  }
  if (Array.isArray(cost.phyrexian)) {
    const idx=cost.phyrexian.findIndex(color=>color===type);
    if(idx>=0){ const color=cost.phyrexian.splice(idx,1)[0]; pool[type]-=1; return {type,paid:`phyrexian:${color}`}; }
  }
  if ((cost.generic || 0) > 0) {
    pool[type] -= 1; cost.generic -= 1; return { type, paid: 'generic' };
  }
  return null;
}

function planManaPayment(pool, cost) {
  const remainingPool=normalizeManaPool(pool);
  const normalizedCost={
    W:Math.max(0,Math.floor(Number(cost?.W)||0)), U:Math.max(0,Math.floor(Number(cost?.U)||0)),
    B:Math.max(0,Math.floor(Number(cost?.B)||0)), R:Math.max(0,Math.floor(Number(cost?.R)||0)),
    G:Math.max(0,Math.floor(Number(cost?.G)||0)), C:Math.max(0,Math.floor(Number(cost?.C)||0)),
    generic:Math.max(0,Math.floor(Number(cost?.generic)||0)),
    hybrid:(cost?.hybrid||[]).map(options=>[...options]), phyrexian:[...(cost?.phyrexian||[])]
  };
  const payments=[];

  // Requisitos rígidos primero ({C} incluido).
  for(const type of MANA_TYPES) {
    const need=normalizedCost[type];
    if(remainingPool[type] < need) return null;
    remainingPool[type]-=need;
    for(let i=0;i<need;i++) payments.push({type,paid:type});
  }

  // Híbridos y Phyrexian restantes compiten por el mismo maná de colores: se resuelven
  // juntos mediante matching, no en dos greedy passes que puedan bloquearse entre sí.
  const resources=[];
  for(const type of MANA_TYPES) for(let i=0;i<remainingPool[type];i++) resources.push({type,ordinal:i});
  const demands=[
    ...normalizedCost.hybrid.map((options,index)=>({kind:'hybrid',index,options})),
    ...normalizedCost.phyrexian.map((color,index)=>({kind:'phyrexian',index,color,options:[color]}))
  ];
  const matching=maximumBipartiteAssignment(resources,demands,(resource,demand)=>demand.options.includes(resource.type));
  if(matching.size !== demands.length) return null;
  for(const {demandIndex,resourceIndex} of matching.assignments) {
    const demand=demands[demandIndex]; const resource=resources[resourceIndex];
    remainingPool[resource.type]-=1;
    payments.push({type:resource.type,paid:demand.kind==='hybrid'?`hybrid:${demand.options.join('/')}`:`phyrexian:${demand.color}`});
  }

  if(manaPoolTotal(remainingPool) < normalizedCost.generic) return null;
  let generic=normalizedCost.generic;
  for(const type of MANA_TYPES) {
    if(generic<=0) break;
    const use=Math.min(remainingPool[type],generic);
    remainingPool[type]-=use; generic-=use;
    for(let i=0;i<use;i++) payments.push({type,paid:'generic'});
  }
  return {remainingPool,payments};
}

export function canPoolPayCost(pool, cost) {
  return !!planManaPayment(pool,cost);
}

// Pago automático ATÓMICO: primero construye un plan completo sobre clones. Sólo si existe
// una asignación válida se mutan pool/cost; en caso de fallo ambos objetos quedan intactos.
export function spendCostAutomatically(pool, cost) {
  const plan=planManaPayment(pool,cost);
  if(!plan) return false;
  for(const type of MANA_TYPES) pool[type]=plan.remainingPool[type];
  for(const type of MANA_TYPES) cost[type]=0;
  cost.generic=0;
  if(Object.prototype.hasOwnProperty.call(cost,'hybrid')) delete cost.hybrid;
  if(Object.prototype.hasOwnProperty.call(cost,'phyrexian')) delete cost.phyrexian;
  return true;
}

// Consume todo el maná YA flotante que pueda contribuir a un coste, aunque no alcance para
// pagarlo entero. Es útil para IA, Ward/impuestos y otros pagos automáticos; nunca inventa
// maná ni consume un color que no pueda satisfacer un pip específico o genérico.
function bestHybridPaymentAssignment(pool, symbols) {
  const list=(symbols||[]).map((options,index)=>({options:[...options],index}));
  let best=[];
  const counts=normalizeManaPool(pool);
  const walk=(i,chosen)=>{
    if(i>=list.length){ if(chosen.length>best.length) best=[...chosen]; return; }
    // Skip is legal for partial spending; this lets us maximize number paid when pool is short.
    walk(i+1,chosen);
    for(const type of list[i].options){
      if((counts[type]||0)<=0) continue;
      counts[type]-=1; chosen.push({index:list[i].index,type});
      walk(i+1,chosen);
      chosen.pop(); counts[type]+=1;
    }
  };
  walk(0,[]);
  return best;
}

export function spendAvailableTowardCost(pool, cost) {
  if (!pool || !cost) return cost;
  for (const type of MANA_TYPES) {
    const need = Math.max(0, Math.floor(Number(cost[type]) || 0));
    if (!need) continue;
    const use = Math.min(Math.max(0, Number(pool[type]) || 0), need);
    pool[type] -= use; cost[type] -= use;
  }
  if(Array.isArray(cost.hybrid)&&cost.hybrid.length){
    const assignment=bestHybridPaymentAssignment(pool,cost.hybrid);
    const paidIndexes=new Set();
    for(const {index,type} of assignment){ pool[type]-=1; paidIndexes.add(index); }
    cost.hybrid=cost.hybrid.filter((_symbol,index)=>!paidIndexes.has(index));
    if(!cost.hybrid.length) delete cost.hybrid;
  }
  if(Array.isArray(cost.phyrexian)){
    for(let i=cost.phyrexian.length-1;i>=0;i--){
      const type=cost.phyrexian[i];
      if((pool[type]||0)>0){ pool[type]-=1; cost.phyrexian.splice(i,1); }
    }
  }
  let generic = Math.max(0, Math.floor(Number(cost.generic) || 0));
  for (const type of MANA_TYPES) {
    if (generic <= 0) break;
    const use = Math.min(Math.max(0, Number(pool[type]) || 0), generic);
    pool[type] -= use; generic -= use;
  }
  cost.generic = generic;
  return cost;
}
