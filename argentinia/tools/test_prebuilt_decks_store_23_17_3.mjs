import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PREBUILT_DECKS_VERSION, normalizePrebuiltDeckCatalog, validatePrebuiltDeckCatalog,
  summarizePrebuiltDeck, getPrebuiltPurchaseIds
} from '../js/prebuiltDecks.js';
import {
  PREBUILT_DECK_POINTS, PREBUILT_DECK_FICHAS, MAX_SAVED_DECKS,
  getDefaultGameConfig, applyGameConfig
} from '../js/store.js';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { CURRENT_POOL_MILESTONE, POOL_BASELINE } from '../js/poolContract.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));

assert.equal(ENGINE_VERSION, '23.19.4.15');
assert.equal(PREBUILT_DECKS_VERSION,'23.17.3');
assert.equal(ENGINE_PROTOCOL_VERSION,'mp-23.19.2');
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.equal(CURRENT_POOL_MILESTONE,'pool_expansion_viii_880');
assert.equal(POOL_BASELINE.total,880);

const dataFiles=['criaturas','instantaneos','conjuros','encantamientos','artefactos','tierras','planeswalkers'];
const cards=dataFiles.flatMap(name=>json(`assets/data/${name}.json`));
assert.equal(cards.length,880,'Pool físico debe seguir en 880');
const rawCatalog=json('assets/data/prebuilt-decks.json');
const normalized=normalizePrebuiltDeckCatalog(rawCatalog);
assert.equal(normalized.ok,true,normalized.errors.join(','));
assert.equal(normalized.catalog.products.length,10,'debe haber diez mazos oficiales, uno por par bicolor');
const validation=validatePrebuiltDeckCatalog(rawCatalog,cards);
assert.equal(validation.ok,true,validation.errors.join('\n'));

const expectedPairs=new Set(['WU','UB','BR','RG','GW','WB','UR','BG','RW','GU']);
const seenPairs=new Set();
const images=new Set();
for(const product of normalized.catalog.products){
  assert.equal(product.cardIds.length,60,`${product.id}: 60 cartas exactas`);
  assert.equal(product.colors.length,2,`${product.id}: bicolor`);
  seenPairs.add(product.colors.join(''));
  assert.match(product.image,/^mazo_[a-z0-9_]+\.png$/);
  assert.equal(images.has(product.image),false,`PNG repetido ${product.image}`); images.add(product.image);
  const summary=summarizePrebuiltDeck(product,cards);
  assert.equal(summary.total,60);
  assert.ok(summary.lands>=20 && summary.lands<=27,`${product.id}: base de maná razonable`);
  assert.equal(summary.lands+summary.creatures+summary.instants+summary.sorceries+summary.enchantments+summary.artifacts+summary.planeswalkers >= 60,true);
  assert.ok((summary.rarity.Mythic||0)<=2,`${product.id}: presupuesto Mythic`);
  assert.ok((summary.rarity.Mythic||0)+(summary.rarity.Rare||0)<=8,`${product.id}: presupuesto Rare+Mythic`);
}
assert.deepEqual(seenPairs,expectedPairs,'deben cubrirse exactamente los 10 pares de colores');
assert.equal(images.size,10);
assert.ok(normalized.catalog.products.some(p=>p.name==='Fogón de Sacrificio'));
assert.ok(normalized.catalog.products.some(p=>p.name==='Archivo Celeste'));
assert.ok(normalized.catalog.products.some(p=>p.name==='Popular al Ataque'));

const defaults=getDefaultGameConfig();
assert.equal(defaults.prebuiltDeckPoints,1500);
assert.equal(defaults.prebuiltDeckFichas,3);
assert.equal(defaults.maxSavedDecks,12);
assert.equal(PREBUILT_DECK_POINTS,1500);
assert.equal(PREBUILT_DECK_FICHAS,3);
assert.equal(MAX_SAVED_DECKS,12);
applyGameConfig({prebuiltDeckPoints:1777,prebuiltDeckFichas:4,maxSavedDecks:14});
assert.equal(PREBUILT_DECK_POINTS,1777);
assert.equal(PREBUILT_DECK_FICHAS,4);
assert.equal(MAX_SAVED_DECKS,14);

assert.deepEqual(getPrebuiltPurchaseIds({prebuiltDeckPurchases:{wu:{productId:'wu'},br:{productId:'br'}}}).sort(),['br','wu']);
assert.deepEqual(getPrebuiltPurchaseIds({prebuiltDeckPurchases:['wu','wu','br']}).sort(),['br','wu']);

const fb=read('js/firebaseClientImpl.js');
assert.ok(fb.includes('export async function purchasePrebuiltDeck'));
assert.ok(fb.includes("doc(db,'gameConfig','settings')"),'precio/cupo deben releerse dentro de la transacción');
assert.ok(fb.includes('prebuiltDeckPurchases:receipts'),'receipt persistente evita recompra tras borrar el deck');
assert.ok(fb.includes('collection,') && fb.includes('decks:[...decks,newDeck]'),'compra debe acreditar cartas y crear deck');
assert.ok(fb.includes('points:points-pointsCost') && fb.includes('fichas:fichas-fichasCost'),'compra debe cobrar ambas monedas');
assert.ok(fb.includes("source:'prebuilt_deck_purchase'"),'compra debe registrar economía');
const facade=read('js/firebaseClient.js');
assert.ok(facade.includes("purchasePrebuiltDeck = asyncProxy('purchasePrebuiltDeck')"));

const ui=read('js/ui.js');
assert.ok(ui.includes("gameTextHtml('store.prebuilt.showcaseTitle')"));
assert.ok(ui.includes('renderPrebuiltDecksView'));
assert.ok(ui.includes('openPrebuiltDeckModal'));
assert.ok(ui.includes("purchasePrebuiltDeck(state.currentUser.uid,product.id,name)"));
assert.ok(ui.includes('maxlength="30"'));
assert.ok(ui.includes("id: 'prebuiltDeckPoints'"));
assert.ok(ui.includes("id: 'prebuiltDeckFichas'"));
assert.ok(ui.includes("id: 'maxSavedDecks'"));
assert.ok(ui.includes("./assets/images/ui/${escapeHtml(product.image)}"),'cada producto usa su PNG de assets/images/ui');
assert.ok(ui.includes('const MAX_DECKS = MAX_SAVED_DECKS'),'Mis Mazos debe usar el límite configurable');

const store=read('js/store.js');
assert.ok(store.includes('export let PREBUILT_DECK_POINTS = 1500'));
assert.ok(store.includes('export let PREBUILT_DECK_FICHAS = 3'));
assert.ok(store.includes('export let MAX_SAVED_DECKS = 12'));
const texts=read('js/gameTexts.js');
for(const key of ['store.prebuilt.showcaseTitle','prebuilt.title','prebuilt.view','prebuilt.buy','prebuilt.confirm','prebuilt.success']) {
  assert.ok(texts.includes(`'${key}'`),`falta Game Text ${key}`);
}
const workflow=read('../.github/workflows/pages.yml');
assert.ok(workflow.includes('regression_legacy_23_17_3_1.zip'));
assert.ok(workflow.includes('ci_regression_manifest_23_17_3_1.txt'));
assert.ok(workflow.includes('test_prebuilt_decks_store_23_17_3.mjs'));

console.log('PASS test_prebuilt_decks_store_23_17_3.mjs · Pool 880 · 10 official bicolor products · 60 cards fixed · 1500+3 · 12 deck slots · persistent purchase receipts · collection+Mis Mazos atomic flow');
