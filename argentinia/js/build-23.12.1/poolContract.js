// js/poolContract.js
// Baseline runtime autoritativa del pool. Cualquier cambio de cardinalidad debe ser
// deliberado y acompañar una nueva entrega/contrato; nunca se infiere desde snapshots viejos.
export const POOL_BASELINE = Object.freeze({
  version: '23.10.1',
  total: 511,
  categories: Object.freeze({
    tierras: 55,
    artefactos: 44,
    criaturas: 210,
    instantaneos: 85,
    conjuros: 61,
    encantamientos: 50,
    planeswalkers: 6
  })
});
