// Build-time adapter for the same renderer used by the browser editor.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {normalizeArticle,fromLegacy,canonicalJSON,articleMedia} from '../../portal/runtime/articleModel.js';
import {renderArticle,articleJSONLD,articleGameCard,imageHTML} from '../../portal/runtime/articleRenderer.js';
import {publicGameManualHTML} from '../../argentinia/js/manualUI.js';
import {SHARED_ASSETS,sharedAssetURL} from '../../argentinia/js/sharedAssets.js';
const dataDirectory=new URL('../../argentinia/assets/data/',import.meta.url);
const gameCards=[];
for(const file of ['tierras.json','criaturas.json','instantaneos.json','conjuros.json','artefactos.json','encantamientos.json','planeswalkers.json']){
  const rows=JSON.parse(fs.readFileSync(new URL(file,dataDirectory),'utf8'));if(!Array.isArray(rows))continue;
  for(const c of rows){if(!c||!/^[a-z]+_\d+$/.test(c.id||'')||typeof c.image!=='string'||/[\\/]/.test(c.image)||c.image.includes('..')||!c.image.endsWith('.png'))continue;
    gameCards.push({id:c.id,name:c.name,type:c.type,rarity:c.rarity,text:c.text||'',flavorText:c.flavorText||'',imageURL:'/assets/images/cards/'+encodeURIComponent(c.image)});
  }
}
const revision=process.env.GITHUB_SHA||SHARED_ASSETS.fallbackRevision;
const gameMedia={matitoBase:'/assets/images/cards/matito.png',matitoEvo1:sharedAssetURL('/assets/images/evolutions/crea_368_evo1.png',{hostname:'magiayleyenda.com.ar',revision}),matitoEvo2:sharedAssetURL('/assets/images/evolutions/crea_368_evo2.png',{hostname:'magiayleyenda.com.ar',revision})};
const input=JSON.parse(fs.readFileSync(0,'utf8'));
if(!Array.isArray(input.articles)||input.articles.length>300)throw Error('INVALID_EDITORIAL_SNAPSHOT');
const ids=new Set(),slugs=new Set();
const output=input.articles.map(entry=>{
  const article=entry.article.version===2?normalizeArticle(entry.article,{publish:!!entry.publication}):fromLegacy(entry.article);
  if(ids.has(article.id)||slugs.has(article.slug))throw Error('DUPLICATE_EDITORIAL_ROUTE');ids.add(article.id);slugs.add(article.slug);
  const contentHash=crypto.createHash('sha256').update(canonicalJSON(article)).digest('hex');
  if(entry.contentHash&&entry.contentHash!==contentHash)throw Error('EDITORIAL_CONTENT_HASH_MISMATCH');
  const bodySections=article.tags.includes('sitio:portada')?article.sections.filter(s=>!['modo-solo','modo-torneo','modo-mazos','flasheras','invitacion'].includes(s.id)):article.sections;
  const bodyHTML=bodySections.length?renderArticle({...article,sections:bodySections},{gameCards,mediaUrl:id=>'/media/'+id+'.webp',bodyOnly:true}):article.cover?imageHTML(article.cover,id=>'/media/'+id+'.webp'):'';
  return {article,contentHash,media:articleMedia(article),revision:entry.revision??null,gameCard:articleGameCard(article,gameCards),bodyHTML,html:renderArticle(article,{gameCards,mediaUrl:id=>'/media/'+id+'.webp',publication:entry.publication}),jsonld:articleJSONLD(article,entry.publication)};
});
process.stdout.write(JSON.stringify({articles:output,sharedAssets:SHARED_ASSETS,manualHTML:publicGameManualHTML(),gameCards,gameMedia}));
