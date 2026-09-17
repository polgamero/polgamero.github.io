import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const main=read('js/main.js');
const ui=read('js/ui.js');
const bot=read('js/bot.js');
const animations=read('js/animationDirector.js');
const admission=read('../functions/src/economy/admission.js');
const ambient=read('../functions/src/community/bots.js');
const creatures=JSON.parse(read('assets/data/criaturas.json'));
const enchantments=JSON.parse(read('assets/data/encantamientos.json'));
const lands=JSON.parse(read('assets/data/tierras.json'));

const byName=(arr,name)=>arr.find(card=>card?.name===name);
const viuda=byName(creatures,'Viuda del Kilómetro 9');
const espuelas=byName(enchantments,'Espuelas de Chispa');
const rey=byName(creatures,'Rey del Frigorífico');
const parque=byName(lands,'Parque Pereyra Iraola');
assert.equal(viuda?.id,'crea_144');
assert.deepEqual(espuelas?.auraEffect?.keywords,['haste'],'reported Aura must mechanically grant haste');
assert.match(rey?.type||'',/Legendaria/i,'reported legend must be mechanically legendary');
assert.equal(parque?.activatedAbility?.effect?.type,'animate_land');
assert.equal(parque?.activatedAbility?.cost,'{3}{G}');

// Real tournament regression: summoning-sickness is only a restriction while effective haste is absent.
assert.match(main,/if \(item\.summoningSickness && !hasKeyword\(item, 'haste'\)\)/,
  'attacker legality must honor dynamically granted haste');
assert.match(main,/requiresTap && combatZone\.includes\(tapTarget\) && tapTarget\.summoningSickness && !hasKeyword\(tapTarget, 'haste'\)/,
  'creature {T} abilities must honor dynamically granted haste');
assert.match(ui,/summoningSickness && !getEffectiveKeywords\(itemObj\)\.some\([\s\S]*?=== 'haste'\) \? 'sick' : ''/,
  'battlefield sick styling must match effective haste legality');
assert.match(bot,/unit\.summoningSickness&&!hasKeyword\(unit,'haste'\)/,
  'bot attacker eligibility must honor effective haste');
assert.match(bot,/creatureItem\.summoningSickness && !hasKeyword\(creatureItem,'haste'\)/,
  'bot {T} abilities must honor effective haste');

// Legend-rule strategy: engine still resolves SBA, but Tano must not knowingly waste a cast.
assert.match(bot,/import \{ isLegendaryPermanentCard \} from '\.\/rulesKernel\.js';/);
assert.match(bot,/function botControlsLegendaryNamed\(card\)/);
assert.match(bot,/if \(botControlsLegendaryNamed\(card\)\) return false;/,
  'main-phase proposal preflight must reject redundant legendary permanent');
assert.match(bot,/bot_legend_duplicate_deferred[\s\S]*?castFrom:'exile'/,
  'cast-from-exile path must avoid redundant legend');
assert.match(bot,/bot_legend_duplicate_deferred[\s\S]*?castFrom:'suspend'/,
  'Suspend optional cast path must avoid redundant legend');
assert.match(bot,/if \(!meta \|\| botControlsLegendaryNamed\(c\) \|\| !canBotPayCastRoute/,
  'graveyard recast path must avoid redundant legend');

// Hard-bot manland regression: never pay an offensive animation by tapping the very land
// that is supposed to attack, and preserve a playable hand spell on expensive activations.
assert.match(bot,/canPayWithoutTappingAnimatedLand[\s\S]*?excludeItems:\[\.\.\.new Set\(\[\.\.\.reservedManaSources,supportItem\]\)\]/,
  'offensive manland affordability must exclude the animation source');
assert.match(bot,/if \(offensiveWindow \|\| defensiveWindow\) \{[\s\S]*?reservedManaSources=\[\.\.\.new Set\(\[\.\.\.reservedManaSources,supportItem\]\)\]/,
  'actual manland payment must preserve the source untapped');
assert.match(bot,/preservePlayableSpell[\s\S]*?botHasPlayableMainPhaseSpellNow\(\)[\s\S]*?>= \.60/,
  'strategic bot must not spend most mana on manland before a playable hand spell');
assert.match(bot,/would_tap_animation_source/);
assert.match(bot,/preserve_main_phase_spell/);

// Ambient system accounts never consume human admission slots and listings look like real BUSCO posts.
assert.match(admission,/where\('isSystemBot','==',true\)\.count\(\)/);
assert.match(admission,/ADMISSION_COUNTER_SCOPE\s*=\s*'human_only_v2'/);
assert.match(ambient,/buildAmbientWantedCriteria/);
assert.match(ambient,/acceptAnyCard:false/);

// Duplicate-card cinematics must bind to physical identity and fail closed on ambiguous card IDs.
assert.match(animations,/item\?\._syncObjectId \|\| item\?\._effectObjectId \|\| item\?\.card\?\.instanceId \|\| item\?\.instanceId/);
assert.match(animations,/if \(visualId\) \{[\s\S]*?return byVisual \|\| null;/);
assert.match(animations,/matches\.length===1 \? matches\[0\] : null/);

console.log('HF23_3_5_INTEGRITY_AI_HOTFIX_OK admission=HUMAN_ONLY ambientMarket=COHERENT_BUSCO haste=DYNAMIC legendBot=GUARDED manland=SOURCE_RESERVED+SPELL_PRESERVED animationOrigin=PHYSICAL_INSTANCE');
