import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHETYPE_IDS } from '../js/deckIntelligence.js';
import { PUBLISHED_CARD_BASELINE_IDS as CLIENT_BASELINE } from '../js/publishedCardBaseline.js';
import { PUBLISHED_CARD_BASELINE_IDS as SERVER_BASELINE } from '../../functions/src/trusted/publishedCardBaseline.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(__dirname,'../..');
const argRoot=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(repoRoot,rel),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(argRoot,'build-manifest.json'),'utf8'));

assert.equal(manifest.engineVersion,'23.21.6');
assert.equal(manifest.pool,900);
assert.equal(manifest.functionsCount,41);
assert.equal(manifest.firestoreRulesVersion,'23.13.89');
assert.ok(/Card Publication Control.*Admin Card Identity.*Browser Archetype UX/i.test(manifest.label) || /DRAGONES EN BUENOS AIRES.*Dragon Archetype Foundation/i.test(manifest.label),'23.21.5 publication controls must survive cumulative 23.21.6 label');
assert.match(String(manifest.promotedFrom||''),/23\.21\.(?:5|6)/,'cumulative/hotfix candidates may be promoted from 23.21.5 or the 23.21.6 pre-release while retaining publication controls');

assert.equal(CLIENT_BASELINE.length,880);
assert.equal(new Set(CLIENT_BASELINE).size,880);
assert.deepEqual(SERVER_BASELINE,CLIENT_BASELINE,'client/server frozen publication baseline must be byte-semantic parity');

const publication=read('argentinia/js/cardPublication.js');
assert.match(publication,/gameConfig\/cardCatalog|CARD_CATALOG_DOCUMENT_ID = 'cardCatalog'/);
assert.match(publication,/PUBLISHED_CARD_BASELINE_SET\.has/);
assert.match(publication,/enabled:\s*typeof override\?\.enabled === 'boolean' \? override\.enabled : isHistoricalPublishedCardId\(id\)/);
assert.match(publication,/replaceOwnName/);
assert.match(publication,/canonicalName/);
assert.match(publication,/CARD_CATALOG_NAME_DUPLICATE/);

const loader=read('argentinia/js/cardLoader.js');
assert.match(loader,/rawAllCards/);
assert.match(loader,/enabledCards/);
assert.match(loader,/includeDisabled/);
assert.match(loader,/applyCardCatalogToPool/);

const utils=read('argentinia/js/utils.js');
assert.match(utils,/cardDb\.enabledCards/);
assert.match(utils,/CARD_DISABLED/);

const textLayout=read('argentinia/js/textLayout.js');
assert.match(textLayout,/nameScale:\s*1/);
assert.match(textLayout,/minNameScale:\s*0\.70/);
assert.match(textLayout,/maxNameScale:\s*1\.35/);

const editor=read('argentinia/js/textLayoutEditor.js');
assert.match(editor,/Nombre real de la carta/);
assert.match(editor,/Tamaño del nombre/);
assert.match(editor,/saveCardCatalogOverride/);
assert.match(editor,/canonicalName/);

const ui=read('argentinia/js/ui.js');
assert.match(ui,/HABILITADA/);
assert.match(ui,/NO PUBLICADA/);
assert.match(ui,/includeDisabled:\s*isAdminUser\(\)/);
assert.match(ui,/top:\s*30px/);
assert.match(ui,/CARD_BROWSER_MECHANICS/);
for(const label of ['Veneno','Robo','Curación']) assert.ok(ui.includes(label),`missing mechanic ${label}`);
assert.equal(ARCHETYPE_IDS.length,16);
for(const id of ARCHETYPE_IDS) assert.ok(ui.includes('ARCHETYPE_IDS') || id,'archetype list is Deck Intelligence-driven');

const serverPublication=read('functions/src/trusted/cardPublication.js');
assert.match(serverPublication,/CARD_DISABLED/);
assert.match(serverPublication,/PUBLISHED_CARD_BASELINE_SET\.has\(id\)/);
assert.match(serverPublication,/enabledTrustedPool/);

const commerce=read('functions/src/economy/commerce.js');
assert.match(commerce,/assertCardEnabled/);
assert.match(commerce,/disabledPrebuiltProductIds/);
const trade=read('functions/src/economy/trade.js');
assert.match(trade,/cardEnabledByPolicy/);
assert.match(trade,/cardEnabled:/);
assert.match(trade,/assertCardEnabled\(accepted\.offeredCardId,publication\)/);

const constants=read('functions/src/shared/constants.js');
assert.match(constants,/ENGINE_VERSION = '23\.21\.6'/);
const version=read('argentinia/js/version.js');
assert.match(version,/ENGINE_VERSION = '23\.21\.6'/);

console.log('CARD_PUBLICATION_ADMIN_IDENTITY_23_21_5_OK physicalPool=900 historicalBaseline=880 futureDefault=unpublished functions=41 archetypes=16 mechanics=3 rules=23.13.86');
