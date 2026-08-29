import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, ENGINE_PROTOCOL_VERSION, FIRESTORE_RULES_VERSION } from '../js/version.js';
import { CURRENT_POOL_MILESTONE, POOL_BASELINE } from '../js/poolContract.js';
import { isTransformingDoubleFacedCard, buildTransformFaceCard, transformFaceLayoutId } from '../js/transformEngine.js';
import { buildArtLayoutsDocument } from '../js/artLayout.js';
import { buildCardTextLayoutsDocument } from '../js/textLayout.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const json=p=>JSON.parse(read(p));
const dataFiles=['criaturas','instantaneos','conjuros','encantamientos','artefactos','tierras','planeswalkers'];
const cards=dataFiles.flatMap(k=>json(`assets/data/${k}.json`));
const tdfcs=cards.filter(isTransformingDoubleFacedCard);

assert.match(ENGINE_VERSION,/^(?:23\.16\.5\.2|23\.17(?:\.\d+)+|23\.18(?:\.\d+)*|23\.19(?:\.\d+)*)$/);
assert.ok(['mp-23.10.0','mp-23.19.0','mp-23.19.2'].includes(ENGINE_PROTOCOL_VERSION));
assert.equal(FIRESTORE_RULES_VERSION,'23.13.79');
assert.equal(CURRENT_POOL_MILESTONE,'pool_expansion_viii_880');
assert.equal(POOL_BASELINE.total,880);
assert.equal(cards.length,880);
assert.equal(tdfcs.length,16,'the 16 physical TDFCs must remain canonical');

const backFaces=tdfcs.map(card=>buildTransformFaceCard(card,'back'));
assert.equal(backFaces.length,16);
assert.ok(backFaces.every(card=>card?._dfcFace==='back' && card.image && card.name));
for(const physical of tdfcs){
  assert.equal(transformFaceLayoutId(physical),`${physical.id}::front`);
  const back=buildTransformFaceCard(physical,'back');
  assert.equal(transformFaceLayoutId(back),`${physical.id}::back`);
}
const normal=cards.find(c=>!isTransformingDoubleFacedCard(c));
assert.equal(transformFaceLayoutId(normal),normal.id,'normal cards must preserve historical layout key');

// Face-qualified IDs are valid persisted keys in both Admin layout documents.
const artDoc=buildArtLayoutsDocument({
  [`${tdfcs[0].id}::front`]:{scale:1.2,x:1,y:-2},
  [`${tdfcs[0].id}::back`]:{scale:1.1,x:-1,y:2}
});
assert.ok(artDoc.layouts[`${tdfcs[0].id}::front`]);
assert.ok(artDoc.layouts[`${tdfcs[0].id}::back`]);
const textDoc=buildCardTextLayoutsDocument({
  [`${tdfcs[0].id}::front`]:{fontScale:.9,lineHeightScale:1,flavorScale:1,flavorGapScale:1,boxHeight:43},
  [`${tdfcs[0].id}::back`]:{fontScale:1.1,lineHeightScale:1,flavorScale:.9,flavorGapScale:1,boxHeight:45}
});
assert.ok(textDoc.layouts[`${tdfcs[0].id}::front`]);
assert.ok(textDoc.layouts[`${tdfcs[0].id}::back`]);

const manifest=json('assets/images/cards/cards-image-manifest.json');
assert.equal(manifest.pool?.total ?? manifest.cardCount,880);
assert.equal(manifest.images?.referencedFaceCount,896);
assert.equal(manifest.images?.doubleFacedCardCount,16);
const backMissing=(manifest.missing||[]).filter(x=>x.face==='back');
assert.equal(backMissing.length,16,'all 16 back-face PNGs participate in missing-image audit in clean source');
const expectedBackImages=new Set(tdfcs.map(c=>c.dfc.backFace.image));
assert.deepEqual(new Set(backMissing.map(x=>x.image)),expectedBackImages);
assert.ok(backMissing.every(x=>x.id && x.name && x.category && x.face==='back'));

const ui=read('js/ui.js');
assert.ok(ui.includes("{ key: 'dfc-backs', label: gameText('encyclopedia.tab.dfcBacks') }"));
assert.ok(ui.includes("cardDb.allCards.filter(isTransformingDoubleFacedCard).map(card => buildTransformFaceCard(card, 'back'))"));
assert.ok(ui.includes('transformFaceLayoutId(card)'));
assert.ok(ui.includes('layoutId: artLayoutId'));
assert.ok(ui.includes('layoutId: textLayoutId'));
assert.ok(ui.includes("missingCards.filter(entry => entry?.face === 'back')"));
assert.ok(ui.includes('[CARAS_DFC_REVERSO_SIN_PNG]'));
assert.ok(ui.includes("gameText('admin.images.col.face')"));

const art=read('js/artLayout.js');
const text=read('js/textLayout.js');
assert.ok(art.includes("endsWith('::front')"));
assert.ok(text.includes("endsWith('::front')"));
assert.ok(art.includes('delete next[legacyId]'));
assert.ok(text.includes('delete next[legacyId]'));
const artEditor=read('js/artLayoutEditor.js');
const textEditor=read('js/textLayoutEditor.js');
assert.ok(artEditor.includes('layoutId = null') && artEditor.includes('saveArtLayout(layoutKey'));
assert.ok(textEditor.includes('layoutId = null') && textEditor.includes('saveCardTextLayout(layoutKey'));

const gameTexts=read('js/gameTexts.js');
assert.ok(gameTexts.includes("'encyclopedia.tab.dfcBacks'"));
assert.ok(gameTexts.includes("'admin.images.backsTitle'"));
assert.ok(gameTexts.includes("'admin.images.col.face'"));

console.log('PASS test_dfc_admin_assets_ux_23_16_5_2.mjs · 16 DFC backs · front/back layouts · Admin visual tab + face-aware audit · Pool 880');
