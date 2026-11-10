import {canonicalJSON, fromLegacy, normalizeArticle} from './articleModel.js';

export function revisedEdition(presets) {
  const articles = presets
    .filter(article => article.preparedOn === '2026-11-10' && !article.tags.includes('sitio:portada'))
    .map(fromLegacy);
  if (articles.length !== 19 || new Set(articles.map(article => article.id)).size !== 19 ||
      new Set(articles.map(article => article.slug)).size !== 19) {
    throw new Error('La revisión editorial del 10 de noviembre debe contener 19 entradas distintas.');
  }
  return articles;
}

export function planArticleRevision(revision, saved) {
  if (!saved) return {article: revision, head: null, changed: true};
  const current = normalizeArticle(saved.article);
  if (current.id !== revision.id || current.slug !== revision.slug) {
    throw new Error(`La URL de «${revision.title}» difiere de la entrada guardada.`);
  }
  const sections = structuredClone(revision.sections);
  const images = current.sections.flatMap(section => section.blocks.filter(block => block.type === 'image'));
  if (images.length) sections.push({id:'imagenes-de-la-entrada', title:'Imágenes de la entrada', blocks:images});
  const article = normalizeArticle({...revision, sections, cover:current.cover, tags:current.tags});
  return {article, head:saved.head, changed:canonicalJSON(article) !== canonicalJSON(current)};
}
