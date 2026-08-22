// js/poolContract.js
// 23.13.35 — cierre de expansión estructural: 583 -> 601.
// POOL_BASELINE queda fail-closed en el baseline final de 601 cartas.
// Los milestones 511/553/583 se preservan como historia auditable, pero el runtime actual exige 601.
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
  })
});

export const CURRENT_POOL_MILESTONE = 'structural_601';
export const POOL_BASELINE = POOL_MILESTONES[CURRENT_POOL_MILESTONE];
