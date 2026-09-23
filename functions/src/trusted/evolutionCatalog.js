// HF23.3.14 — trusted server catalog for Cápsula de Evolución.
// Gameplay presentation overrides live in the frontend catalog. Server authority only
// needs the closed set of base IDs and stage count; clients cannot invent eligible cards.
export const TRUSTED_EVOLUTION_BASE_IDS = Object.freeze([
  'crea_001','crea_002','crea_003','crea_004','crea_005','crea_006','crea_007','crea_008','crea_009','crea_010',
  'crea_011','crea_012','crea_024','crea_025','crea_034','crea_036','crea_039','crea_041','crea_046','crea_050'
]);
export const TRUSTED_EVOLUTION_BASE_ID_SET = new Set(TRUSTED_EVOLUTION_BASE_IDS);
export const EVOLUTION_MAX_STAGE = 2;
