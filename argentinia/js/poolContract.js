// js/poolContract.js
// 23.15.5.5 — POOL EXPANSION I: 643 -> 673.
// Materializa en cartas reales Control + Event + Cost + Replacement/Prevention sin abrir
// motores nuevos. Los milestones anteriores se preservan como historia auditable.
const makeMilestone = (version, total, categories) => Object.freeze({
  version,
  total,
  categories: Object.freeze(categories)
});

export const POOL_MILESTONES = Object.freeze({
  rebalance_511: makeMilestone('23.13.32', 511, {
    tierras: 55,
    artefactos: 44,
    criaturas: 210,
    instantaneos: 85,
    conjuros: 61,
    encantamientos: 50,
    planeswalkers: 6
  }),
  archetypes_553: makeMilestone('23.13.33', 553, {
    tierras: 55,
    artefactos: 53,
    criaturas: 227,
    instantaneos: 93,
    conjuros: 64,
    encantamientos: 55,
    planeswalkers: 6
  }),
  mechanics_583: makeMilestone('23.13.34', 583, {
    tierras: 55,
    artefactos: 54,
    criaturas: 243,
    instantaneos: 102,
    conjuros: 67,
    encantamientos: 56,
    planeswalkers: 6
  }),
  structural_601: makeMilestone('23.13.35', 601, {
    tierras: 56,
    artefactos: 54,
    criaturas: 252,
    instantaneos: 105,
    conjuros: 70,
    encantamientos: 56,
    planeswalkers: 8
  }),
  land_expansion_643: makeMilestone('23.14.8', 643, {
    tierras: 64,
    artefactos: 60,
    criaturas: 262,
    instantaneos: 110,
    conjuros: 76,
    encantamientos: 63,
    planeswalkers: 8
  }),
  pool_expansion_i_673: makeMilestone('23.15.5.5', 673, {
    tierras: 64,
    artefactos: 63,
    criaturas: 275,
    instantaneos: 115,
    conjuros: 80,
    encantamientos: 68,
    planeswalkers: 8
  })
});

export const CURRENT_POOL_MILESTONE = 'pool_expansion_i_673';
export const POOL_BASELINE = POOL_MILESTONES[CURRENT_POOL_MILESTONE];
