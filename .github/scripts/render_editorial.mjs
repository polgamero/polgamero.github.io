// Build-time adapter for the same renderer used by the browser editor.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {normalizeArticle,fromLegacy,canonicalJSON,articleMedia} from '../../portal/runtime/articleModel.js';
import {renderArticle,articleJSONLD} from '../../portal/runtime/articleRenderer.js';
import {SHARED_ASSETS} from '../../argentinia/js/sharedAssets.js';
const input=JSON.parse(fs.readFileSync(0,'utf8'));
if(!Array.isArray(input.articles)||input.articles.length>300)throw Error('INVALID_EDITORIAL_SNAPSHOT');
const ids=new Set(),slugs=new Set();
const output=input.articles.map(entry=>{
  const article=entry.article.version===2?normalizeArticle(entry.article,{publish:!!entry.publication}):fromLegacy(entry.article);
  if(ids.has(article.id)||slugs.has(article.slug))throw Error('DUPLICATE_EDITORIAL_ROUTE');ids.add(article.id);slugs.add(article.slug);
  const contentHash=crypto.createHash('sha256').update(canonicalJSON(article)).digest('hex');
  if(entry.contentHash&&entry.contentHash!==contentHash)throw Error('EDITORIAL_CONTENT_HASH_MISMATCH');
  return {article,contentHash,media:articleMedia(article),revision:entry.revision??null,html:renderArticle(article,{mediaUrl:id=>'../../media/'+id+'.webp',publication:entry.publication}),jsonld:articleJSONLD(article,entry.publication)};
});
process.stdout.write(JSON.stringify({articles:output,sharedAssets:SHARED_ASSETS}));
