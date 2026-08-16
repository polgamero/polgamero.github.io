// js/poolContract.js
// Baseline runtime autoritativa del pool. Cualquier cambio de cardinalidad debe ser
// deliberado y acompañar una nueva entrega/contrato; nunca se infiere desde snapshots viejos.
export const POOL_BASELINE = Object.freeze({
  version: '23.8.3',
  total: 501,
  categories: Object.freeze({
    tierras: 55,
    artefactos: 43,
    criaturas: 209,
    instantaneos: 80,
    conjuros: 58,
    encantamientos: 50,
    planeswalkers: 6
  })
});
