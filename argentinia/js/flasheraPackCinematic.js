// Stage33 — Solo presentación; nunca determina/acredita Flasheras.
// La acreditación proviene del receipt autoritativo Stage32.
export function buildFlasheraCeremonyPlan(sequence) {
  if (!Array.isArray(sequence)) throw new TypeError('PACK_SEQUENCE_INVALID');
  const premium = sequence.filter(entry => entry?.card?.flashera === true);
  if (premium.length > 1) throw new Error('FLASHERA_PACK_MULTIPLE_FINISHES');
  if (!premium.length) return null;
  const entry = premium[0];
  if (!Number.isInteger(entry.revealIndex) || entry.revealIndex < 0 ||
      sequence[entry.revealIndex] !== entry) throw new Error('FLASHERA_SEQUENCE_INDEX_INVALID');
  return Object.freeze({ index:entry.revealIndex, sourceIndex:entry.sourceIndex,
    isMythic:entry.tier === 'mythic', label:entry.tier === 'mythic' ? 'MÍTICA FLASHERA' : 'FLASHERA' });
}

export function planFlasheraSkip({flasheraPlan, acknowledged=false, currentIndex=-1, revealed=false} = {}) {
  if (!flasheraPlan || acknowledged) return {type:'summary'};
  if (currentIndex !== flasheraPlan.index) return {type:'focus', index:flasheraPlan.index};
  // Incluso con doble click o con una animación cargando, hay que esperar la ceremonia.
  return {type:'hold', index:flasheraPlan.index, revealed:revealed === true};
}
