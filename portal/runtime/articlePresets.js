// Public starter text is independent of backend deployment. Existing server
// starters and, later, the owner's saved revisions always retain priority.
export function mergeArticlePresets(remote, prepared) {
  if(!Array.isArray(remote)||!Array.isArray(prepared))throw Error('INVALID_ARTICLE_PRESETS');
  const rows=new Map(),slugs=new Map();
  for(const article of [...remote,...prepared]){
    if(!article||typeof article.id!=='string'||typeof article.slug!=='string')throw Error('INVALID_ARTICLE_PRESETS');
    const previous=rows.get(article.id);
    if(previous){if(previous.slug!==article.slug)throw Error('ARTICLE_PRESET_ID_CONFLICT');continue;}
    if(slugs.has(article.slug))throw Error('ARTICLE_PRESET_SLUG_CONFLICT');
    rows.set(article.id,article);slugs.set(article.slug,article.id);
  }
  return [...rows.values()];
}
