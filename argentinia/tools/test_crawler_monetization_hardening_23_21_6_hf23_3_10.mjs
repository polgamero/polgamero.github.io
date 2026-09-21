import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=path.resolve(__dirname,'..');
const repo=path.resolve(app,'..');
const domain='https://magiayleyenda.com.ar/';
const publisher='6181395403710642';
const adsLine=`google.com, pub-${publisher}, DIRECT, f08c47fec0942fa0`;

const index=fs.readFileSync(path.join(app,'index.html'),'utf8');
assert.match(index,/<html lang="es">/);
assert.match(index,new RegExp(`<link rel="canonical" href="${domain.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}">`));
assert.match(index,/<meta name="description" content="[^"]{80,}">/);
assert.match(index,new RegExp(`<meta name="google-adsense-account" content="ca-pub-${publisher}">`));
assert.match(index,/<meta name="robots" content="index,follow/);
assert.match(index,/"@type": "VideoGame"/);
assert.match(index,/más de 900 cartas originales/i);
assert.match(index,/Juego de cartas coleccionables argentino/i);
assert.match(index,/<noscript>[\s\S]*Argentinia — juego de cartas coleccionables argentino[\s\S]*<\/noscript>/i);

assert.equal(fs.readFileSync(path.join(repo,'ads.txt'),'utf8').trim(),adsLine);
assert.equal(fs.readFileSync(path.join(repo,'CNAME'),'utf8').trim(),'magiayleyenda.com.ar');
const robots=fs.readFileSync(path.join(repo,'robots.txt'),'utf8');
for (const agent of ['Googlebot','Mediapartners-Google','Google-Display-Ads-Bot']) {
  assert.match(robots,new RegExp(`User-agent: ${agent}\\s+Allow: /`));
}
assert.doesNotMatch(robots,/Disallow:\s*\//);
assert.match(robots,/Sitemap: https:\/\/magiayleyenda\.com\.ar\/sitemap\.xml/);
const sitemap=fs.readFileSync(path.join(repo,'sitemap.xml'),'utf8');
assert.match(sitemap,/<loc>https:\/\/magiayleyenda\.com\.ar\/<\/loc>/);
assert.doesNotMatch(sitemap,/\/argentinia\//);

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'argentinia-adsense-'));
const dest=path.join(temp,'site');
const build=spawnSync(process.execPath,[path.join(__dirname,'build_pages_root_23_21_6_hf23_3_9.mjs'),'--source',app,'--dest',dest,'--repo-root',repo],{encoding:'utf8'});
assert.equal(build.status,0,build.stderr||build.stdout);
for (const file of ['index.html','ads.txt','robots.txt','sitemap.xml','CNAME','.nojekyll']) {
  assert.ok(fs.existsSync(path.join(dest,file)),`public root missing ${file}`);
}
assert.equal(fs.readFileSync(path.join(dest,'ads.txt'),'utf8').trim(),adsLine);
const builtIndex=fs.readFileSync(path.join(dest,'index.html'),'utf8');
assert.match(builtIndex,new RegExp(`ca-pub-${publisher}`));
assert.match(builtIndex,/https:\/\/magiayleyenda\.com\.ar\//);
const legacy=fs.readFileSync(path.join(dest,'argentinia','index.html'),'utf8');
assert.match(legacy,/noindex/);
assert.match(legacy,/url=\//);
fs.rmSync(temp,{recursive:true,force:true});
console.log('PASS test_crawler_monetization_hardening_23_21_6_hf23_3_10.mjs · ads.txt + AdSense meta + crawler allow + canonical + sitemap + semantic boot + public-root artifact');
