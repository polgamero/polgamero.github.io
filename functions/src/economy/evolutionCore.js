// HF23.3.14 — pure evolution/deck helpers.
export const EVOLUTION_STAGE1_SUFFIX = '::evo1';
export const EVOLUTION_STAGE2_SUFFIX = '::evo2';

const nonneg = v => Math.max(0, Math.floor(Number(v) || 0));
const positive = (v, fallback) => Math.max(1, nonneg(v ?? fallback));

export function normalizeEvolutionSettings(raw = {}) {
  return Object.freeze({
    enabled: typeof raw.evolutionEnabled === 'boolean' ? raw.evolutionEnabled : true,
    maxPerDeck: Math.min(20, Math.max(0, nonneg(raw.maxEvolvedCardsPerDeck ?? 1))),
    stage1: Object.freeze({
      points: nonneg(raw.evolutionStage1Points ?? 250),
      fichas: nonneg(raw.evolutionStage1Fichas ?? 2),
      essence: nonneg(raw.evolutionStage1Essence ?? 10),
      copiesRequired: positive(raw.evolutionStage1CopiesRequired, 1)
    }),
    stage2: Object.freeze({
      points: nonneg(raw.evolutionStage2Points ?? 500),
      fichas: nonneg(raw.evolutionStage2Fichas ?? 5),
      essence: nonneg(raw.evolutionStage2Essence ?? 25),
      copiesRequired: positive(raw.evolutionStage2CopiesRequired, 2)
    })
  });
}

export function normalizeEvolutionProfile(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const [baseId,row] of Object.entries(source)) {
    const stage=Math.max(0,Math.min(2,Math.floor(Number(typeof row==='object'&&row?row.stage:row)||0)));
    if(stage<1) continue;
    out[baseId]=typeof row==='object'&&row?{...row,stage}:{stage};
  }
  return out;
}

export function evolutionVariantId(baseId, stage) {
  const s=Math.max(0,Math.min(2,Math.floor(Number(stage)||0)));
  return s===2?`${baseId}${EVOLUTION_STAGE2_SUFFIX}`:s===1?`${baseId}${EVOLUTION_STAGE1_SUFFIX}`:String(baseId||'');
}

export function parseEvolutionVariantId(rawId) {
  const id=String(rawId||'');
  if(id.endsWith(EVOLUTION_STAGE2_SUFFIX)) return {baseId:id.slice(0,-EVOLUTION_STAGE2_SUFFIX.length),stage:2};
  if(id.endsWith(EVOLUTION_STAGE1_SUFFIX)) return {baseId:id.slice(0,-EVOLUTION_STAGE1_SUFFIX.length),stage:1};
  return {baseId:id,stage:0};
}

export function migrateDecksForEvolution({ decks = [], baseId, fromStage = 0, toStage, ownedCopies = 1, enhanced = false, maxEvolvedCardsPerDeck = 1 }) {
  const nextVariant=evolutionVariantId(baseId,toStage);
  const previousVariant=fromStage>0?evolutionVariantId(baseId,fromStage):null;
  const max=Math.max(0,Math.floor(Number(maxEvolvedCardsPerDeck)||0));
  const updatedDeckIds=[], conflictDeckIds=[], nextDecks=[];
  const reservedSpecialCopies=1+(enhanced?1:0);
  const normalOwned=Math.max(0,Math.floor(Number(ownedCopies)||0)-reservedSpecialCopies);
  for(const deck of Array.isArray(decks)?decks:[]){
    const ids=Array.isArray(deck?.cardIds)?[...deck.cardIds]:[];
    const evolvedCount=ids.filter(id=>String(id).endsWith(EVOLUTION_STAGE1_SUFFIX)||String(id).endsWith(EVOLUTION_STAGE2_SUFFIX)).length;
    let changed=false;
    if(previousVariant&&ids.includes(previousVariant)){
      const idx=ids.indexOf(previousVariant); ids[idx]=nextVariant; changed=true;
    } else if(fromStage===0){
      const baseIndexes=ids.map((id,i)=>id===baseId?i:-1).filter(i=>i>=0);
      if(baseIndexes.length>normalOwned){
        if(max<1||evolvedCount>=max){ conflictDeckIds.push(String(deck?.id||'')); nextDecks.push(deck); continue; }
        ids[baseIndexes[0]]=nextVariant; changed=true;
      }
    }
    if(changed) updatedDeckIds.push(String(deck?.id||''));
    nextDecks.push(changed?{...deck,cardIds:ids}:deck);
  }
  return {decks:nextDecks,updatedDeckIds,conflictDeckIds};
}
