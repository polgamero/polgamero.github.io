// js/sagaEngine.js — Argentinia 23.16.1 · Sagas Engine
// Capa pura para identidad Saga, schema de capítulos, transiciones de Capítulo y condición
// de sacrificio final. No conoce state/DOM/Firestore/Stack: los callers aportan esa capa.

import { getCounterCount } from './counterEngine.js';

export const SAGA_ENGINE_VERSION = '23.16.1';

const ROMAN = Object.freeze(['','I','II','III','IV','V','VI','VII','VIII','IX','X']);

function cloneValue(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(cloneValue);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
}

function chapterNumbers(raw) {
  const source = raw?.number ?? raw?.chapter ?? raw?.chapters ?? raw?.lore ?? null;
  const values = Array.isArray(source) ? source : [source];
  return [...new Set(values.map(Number).filter(n => Number.isInteger(n) && n > 0))].sort((a,b)=>a-b);
}

function chapterEffects(raw) {
  if (Array.isArray(raw?.effects)) return raw.effects.filter(effect => effect && typeof effect === 'object');
  return raw?.effect && typeof raw.effect === 'object' ? [raw.effect] : [];
}

export function sagaChapterRoman(number) {
  const n = Math.max(0, Math.floor(Number(number) || 0));
  return ROMAN[n] || String(n);
}

export function isSagaCard(card) {
  if (!card || typeof card !== 'object') return false;
  const type = String(card.type || card.typeLine || '');
  return /(?:^|[—–-]|\s)Saga(?:\s|$)/i.test(type) || !!(card.saga && typeof card.saga === 'object');
}

export function normalizeSagaSpec(card) {
  if (!isSagaCard(card)) return Object.freeze({ valid:false, chapters:[], finalChapter:0, readAhead:false });
  const rawSpec = card?.saga && typeof card.saga === 'object' ? card.saga : {};
  const rawChapters = Array.isArray(rawSpec.chapters)
    ? rawSpec.chapters
    : (Array.isArray(card?.chapters) ? card.chapters : []);
  const chapters = [];
  rawChapters.forEach((raw, rawIndex) => {
    const numbers = chapterNumbers(raw);
    const effects = chapterEffects(raw);
    numbers.forEach(number => effects.forEach((effect, effectIndex) => {
      chapters.push(Object.freeze({
        number,
        roman:sagaChapterRoman(number),
        key:String(raw?.id || raw?.key || `chapter_${rawIndex+1}_${number}_${effectIndex+1}`),
        label:String(raw?.label || `Capítulo ${sagaChapterRoman(number)}`),
        text:typeof raw?.text === 'string' ? raw.text : '',
        effect:cloneValue(effect),
        requiresTarget:raw?.requiresTarget === true,
        target:cloneValue(raw?.target ?? null),
        rawIndex,
        effectIndex
      }));
    }));
  });
  chapters.sort((a,b)=>a.number-b.number || a.rawIndex-b.rawIndex || a.effectIndex-b.effectIndex);
  const explicitFinal = Math.max(0, Math.floor(Number(rawSpec.finalChapter || card?.finalChapter || 0)));
  const inferredFinal = chapters.reduce((max, chapter) => Math.max(max, chapter.number), 0);
  return Object.freeze({
    valid:chapters.length>0,
    chapters:Object.freeze(chapters),
    finalChapter:Math.max(explicitFinal, inferredFinal),
    readAhead:false,
    readAheadRequested:rawSpec.readAhead === true,
    schemaVersion:1
  });
}

export function getSagaFinalChapter(card) {
  return normalizeSagaSpec(card).finalChapter;
}

export function getSagaLoreCount(item) {
  return getCounterCount(item, 'lore');
}

// CR Saga: cuando uno o más Capítulo se agregan, dispara cada habilidad cuyo número de capítulo
// era mayor al contador anterior y es <= al contador nuevo. Si se salta de I a III, II y III
// disparan; remover Capítulo nunca "des-dispara" capítulos ya generados.
export function sagaChaptersCrossed(card, beforeLore, afterLore) {
  const before = Math.max(0, Math.floor(Number(beforeLore) || 0));
  const after = Math.max(0, Math.floor(Number(afterLore) || 0));
  if (after <= before) return [];
  return normalizeSagaSpec(card).chapters.filter(chapter => chapter.number > before && chapter.number <= after);
}

export function buildSagaChapterTriggerDescriptors(item, isLocal, beforeLore, afterLore, options = {}) {
  if (!item?.card || !isSagaCard(item.card)) return [];
  return sagaChaptersCrossed(item.card, beforeLore, afterLore).map(chapter => ({
    effect:cloneValue(chapter.effect),
    sourceCard:item.card,
    sourceItem:item,
    isLocal:isLocal !== false,
    triggerType:'saga_chapter',
    triggerLabel:chapter.label,
    sagaChapter:chapter.number,
    sagaChapterRoman:chapter.roman,
    sagaChapterSpecKey:chapter.key,
    sagaLoreBefore:Math.max(0, Number(beforeLore)||0),
    sagaLoreAfter:Math.max(0, Number(afterLore)||0),
    requiresTarget:chapter.requiresTarget,
    target:cloneValue(chapter.target),
    cause:options.cause || 'lore_counter_added'
  }));
}

export function sagaIsAtOrBeyondFinalChapter(item) {
  if (!item?.card || !isSagaCard(item.card)) return false;
  const finalChapter = getSagaFinalChapter(item.card);
  return finalChapter > 0 && getSagaLoreCount(item) >= finalChapter;
}

export function shouldSacrificeSaga(item, { hasPendingChapter=false } = {}) {
  return sagaIsAtOrBeyondFinalChapter(item) && !hasPendingChapter;
}

export function sagaUiState(itemOrCard) {
  const item = itemOrCard?.card ? itemOrCard : null;
  const card = item?.card || itemOrCard || {};
  const spec = normalizeSagaSpec(card);
  const lore = item ? getSagaLoreCount(item) : 0;
  const uniqueChapters=[];
  for(const chapter of spec.chapters){
    if(uniqueChapters.some(existing=>existing.number===chapter.number)) continue;
    uniqueChapters.push({
      number:chapter.number,
      roman:chapter.roman,
      label:chapter.label,
      text:chapter.text,
      completed:lore >= chapter.number,
      current:lore === chapter.number
    });
  }
  return {
    isSaga:isSagaCard(card),
    lore,
    finalChapter:spec.finalChapter,
    chapters:uniqueChapters
  };
}

export function sagaEngineSummary() {
  return Object.freeze({
    version:SAGA_ENGINE_VERSION,
    schemaVersion:1,
    automaticLore:['enter_with_first_lore','precombat_main_phase_lore'],
    chaptersUseStack:true,
    crossedChaptersTrigger:true,
    proliferateCompatible:true,
    addRemoveLoreCompatible:true,
    copyEngineCompatible:true,
    finalChapterSacrificeSba:true,
    readAhead:false,
    timeCounters:false
  });
}
