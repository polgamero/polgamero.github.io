import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=path.resolve(__dirname,'..');
const repo=path.resolve(app,'..');
const manual=fs.readFileSync(path.join(app,'js','manualUI.js'),'utf8');
const ui=fs.readFileSync(path.join(app,'js','ui.js'),'utf8');
const gameTexts=fs.readFileSync(path.join(app,'js','gameTexts.js'),'utf8');
const workflow=fs.readFileSync(path.join(repo,'.github','workflows','pages.yml'),'utf8');

// No new main-menu surface: the only human navigation hook is contextual inside ¿Cómo se juega?.
assert.match(manual,/class="arg-manual-public-cards-link" href="\/cartas\/"/);
assert.match(gameTexts,/manual\.publicCards\.link/);
assert.doesNotMatch(ui,/href=["']\/cartas\//);
assert.doesNotMatch(ui,/menu-public-cards/);
assert.match(workflow,/Verify public card gallery artifact/);
assert.match(workflow,/publicCount!==180/);

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'arg-public-cards-'));
const dest=path.join(temp,'site');
const build=spawnSync(process.execPath,[path.join(__dirname,'build_pages_root_23_21_6_hf23_3_9.mjs'),'--source',app,'--dest',dest,'--repo-root',repo],{encoding:'utf8'});
assert.equal(build.status,0,build.stderr||build.stdout);
assert.match(build.stdout,/PUBLIC_CARD_GALLERY_OK pool=900 eligible=880 public=180 common=90 uncommon=60 rare=24 mythic=6/);

const galleryDir=path.join(dest,'cartas');
assert.ok(fs.existsSync(path.join(galleryDir,'index.html')),'/cartas/ must exist in built Pages artifact');
assert.ok(fs.existsSync(path.join(galleryDir,'public-cards.css')));
assert.ok(fs.existsSync(path.join(galleryDir,'public-cards.js')));
const summary=JSON.parse(fs.readFileSync(path.join(galleryDir,'public-selection.json'),'utf8'));
assert.equal(summary.totalPool,900);
assert.equal(summary.publishedEligible,880);
assert.equal(summary.publicCount,180);
assert.deepEqual(summary.rarityCounts,{Common:90,Uncommon:60,Rare:24,Mythic:6});
assert.equal(new Set(summary.ids).size,180,'public selection IDs must be unique');

const disabledIds=[];
for(const category of ['tierras','artefactos','criaturas','instantaneos','conjuros','encantamientos','planeswalkers']){
  const rows=JSON.parse(fs.readFileSync(path.join(app,'assets','data',`${category}.json`),'utf8'));
  for(const card of rows) if(card?.enabled===false) disabledIds.push(card.id);
}
assert.equal(disabledIds.length,20,'current source has the 20 unpublished Dragon Foundation cards');
for(const id of disabledIds) assert.ok(!summary.ids.includes(id),`disabled card leaked into public gallery: ${id}`);

const gallery=fs.readFileSync(path.join(galleryDir,'index.html'),'utf8');
assert.match(gallery,/<h1>Cartas de Argentinia<\/h1>/);
assert.match(gallery,/selección oficial de cartas del juego/i);
assert.match(gallery,/no reemplaza la Enciclopedia interna/i);
assert.match(gallery,/colección, cantidades, mejoras y propiedad de cartas siguen siendo privados/i);
assert.match(gallery,/ca-pub-6181395403710642/);
assert.match(gallery,/rel="canonical" href="https:\/\/magiayleyenda\.com\.ar\/cartas\/"/);
assert.doesNotMatch(gallery,/Firebase|signIn|currentUser|ownership|playerProfile/i,'public gallery must not depend on private/auth runtime');

const detailDirs=fs.readdirSync(galleryDir,{withFileTypes:true}).filter(e=>e.isDirectory());
assert.equal(detailDirs.length,180,'one static detail page per public card');
for(const entry of detailDirs.slice(0,20)){
  const html=fs.readFileSync(path.join(galleryDir,entry.name,'index.html'),'utf8');
  assert.match(html,/Cartas de Argentinia/);
  assert.match(html,/rel="canonical" href="https:\/\/magiayleyenda\.com\.ar\/cartas\//);
  assert.doesNotMatch(html,/\bPlaneswalker\b/,'public terminology must use Semidiós');
  assert.doesNotMatch(html,/Firebase|signIn|currentUser/i);
}

const sitemap=fs.readFileSync(path.join(dest,'sitemap.xml'),'utf8');
const locs=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
assert.equal(locs.length,182,'sitemap = root + gallery + 180 detail pages');
assert.equal(locs[0],'https://magiayleyenda.com.ar/');
assert.equal(locs[1],'https://magiayleyenda.com.ar/cartas/');
assert.equal(new Set(locs).size,182);
assert.ok(locs.every(x=>!x.includes('/argentinia/')));

// Explicitly avoid duplicate public Manual/How-to routes: existing in-game manual remains canonical UI.
assert.ok(!fs.existsSync(path.join(dest,'manual')));
assert.ok(!fs.existsSync(path.join(dest,'como-jugar')));

fs.rmSync(temp,{recursive:true,force:true});
console.log('PASS test_public_card_gallery_23_21_6_hf23_3_11.mjs · 180 spoiler-safe static cards + 20 disabled excluded + contextual manual link + no menu noise + sitemap 182 URLs');
