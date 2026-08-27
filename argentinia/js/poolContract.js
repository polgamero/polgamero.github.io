// js/poolContract.js
// 23.16.5.1 — POOL EXPANSION VIII — Typal. Pool canónico 850 → 880.
// Estrena 30 cartas de contenido Typal sobre el motor Typal 23.16.5.
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
  }),
  pool_expansion_ii_700: makeMilestone('23.15.7.2', 700, {
    tierras: 64,
    artefactos: 67,
    criaturas: 285,
    instantaneos: 120,
    conjuros: 85,
    encantamientos: 71,
    planeswalkers: 8
  }),
  pool_expansion_iii_730: makeMilestone('23.15.8.1', 730, {
    tierras: 65,
    artefactos: 71,
    criaturas: 297,
    instantaneos: 126,
    conjuros: 89,
    encantamientos: 74,
    planeswalkers: 8
  }),
  pool_expansion_iv_760: makeMilestone('23.16.1.1', 760, {
    tierras: 65,
    artefactos: 73,
    criaturas: 302,
    instantaneos: 128,
    conjuros: 91,
    encantamientos: 93,
    planeswalkers: 8
  }),
  pool_expansion_v_790: makeMilestone('23.16.2.1', 790, {
    tierras: 66,
    artefactos: 77,
    criaturas: 311,
    instantaneos: 134,
    conjuros: 97,
    encantamientos: 97,
    planeswalkers: 8
  }),
  pool_expansion_vi_820: makeMilestone('23.16.3.1', 820, {
    tierras: 67,
    artefactos: 81,
    criaturas: 321,
    instantaneos: 140,
    conjuros: 102,
    encantamientos: 101,
    planeswalkers: 8
  }),
  pool_expansion_vii_850: makeMilestone('23.16.4.1', 850, {
    tierras: 68,
    artefactos: 85,
    criaturas: 335,
    instantaneos: 144,
    conjuros: 105,
    encantamientos: 105,
    planeswalkers: 8
  }),
  pool_expansion_viii_880: makeMilestone('23.16.5.1', 880, {
    tierras: 68,
    artefactos: 87,
    criaturas: 355,
    instantaneos: 147,
    conjuros: 107,
    encantamientos: 108,
    planeswalkers: 8
  }),
});

export const CURRENT_POOL_MILESTONE = 'pool_expansion_viii_880';
export const POOL_BASELINE = POOL_MILESTONES[CURRENT_POOL_MILESTONE];
