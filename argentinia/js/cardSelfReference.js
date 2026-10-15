// Only display text changes. IDs, targeting, rules data, catalog and private storage stay intact.
// Canonical names/text arrive with the already-authorized definition; no secret name map.
export function cardWithCurrentSelfReferences(card){
  if(!card||typeof card!=='object')return card;
  const original=String(card.canonicalName||card.name||''),current=String(card.name||'');
  if(!original||!current||original===current)return card;
  const next={...card};
  for(const key of ['text','rulesText','oracleText','reminderText']){
    const text=key==='text'&&typeof card.canonicalText==='string'?card.canonicalText:card[key];
    if(typeof text==='string')next[key]=text.split(original).join(current);
  }
  return next;
}
