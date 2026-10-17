// Display-only self references. Never change IDs, targets or gameplay rules data.
// Protect complete occurrences of the new name before replacing its shorter old prefix.
export function replaceCardSelfName(text, original, current) {
  if (typeof text !== 'string' || !original || !current || original === current) return text;
  return text.split(current).map(part => part.split(original).join(current)).join(current);
}

export function cardWithCurrentSelfReferences(card) {
  if (!card || typeof card !== 'object') return card;
  const original=String(card.canonicalName||card.name||''), current=String(card.name||'');
  if (!original || !current) return card;
  const next={...card};
  for (const key of ['text','rulesText','oracleText','reminderText']) {
    const text=key==='text'&&typeof card.canonicalText==='string'?card.canonicalText:card[key];
    if (typeof text==='string') next[key]=replaceCardSelfName(text,original,current);
  }
  return next;
}
