import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const audio = read('../js/audioManager.js');
const animation = read('../js/animationDirector.js');
const ui = read('../js/ui.js');
const telemetry = read('../js/telemetry.js');
const permanentTypes = read('../js/permanentTypes.js');
const artifacts = JSON.parse(read('../assets/data/artefactos.json'));
const artifactCards = Array.isArray(artifacts) ? artifacts : (artifacts.cards || artifacts.artefactos || []);

function functionSlice(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = endMarker ? src.indexOf(endMarker, start + startMarker.length) : src.length;
  assert.ok(end > start, `missing end marker ${endMarker}`);
  return src.slice(start, end);
}

// HF7 conservó el master mute como compatibilidad interna. HF16 reemplaza su acceso rápido
// por un mixer Música/Efectos independiente junto a REC; las primitivas master siguen disponibles
// para migración/backward compatibility y el hard silence de WebKit continúa vigente.
assert.match(audio, /masterMuted: false/);
assert.match(audio, /masterMuted: raw\?\.masterMuted === true/);
assert.match(audio, /function managedMusicElements\(\)/);
assert.match(audio, /function managedSfxElements\(\)/);
const hardMusic = functionSlice(audio, 'function hardSilenceManagedMusic()', 'function hardSilenceManagedSfx');
assert.match(hardMusic, /fadeSerial \+= 1/);
assert.match(hardMusic, /audio\.muted = true/);
assert.match(hardMusic, /audio\.pause\(\)/);
const hardSfx = functionSlice(audio, 'function hardSilenceManagedSfx', 'function armManagedMusicForPlayback');
assert.match(hardSfx, /audio\.muted = true/);
assert.match(hardSfx, /audio\.pause\(\)/);
assert.match(hardSfx, /audio\.remove\(\)/);
assert.match(audio, /export function setMasterMuted\(muted\)/);
assert.match(audio, /export function toggleMasterMute\(\)/);
assert.match(audio, /if \(settings\.masterMuted \|\| !settings\.sfxEnabled/);
assert.match(audio, /audio\.dataset\.argentiniaAudioRole = 'sfx'/);
assert.match(audio, /audio\.muted = !!settings\.masterMuted \|\| !settings\.musicEnabled/);
assert.doesNotMatch(ui, /id=\"menu-music-toggle\"/);
assert.match(telemetry, /setQuickMusicLevel/);
assert.match(telemetry, /setQuickSfxLevel/);
assert.match(telemetry, /arg-quick-music-volume/);
assert.match(telemetry, /arg-quick-sfx-volume/);

// WebKit animation completion is not trusted as the only cleanup path. Every Web Animation gets
// a deadline, and player-damage pills have their own TTL + aria-hidden transient marker.
const webAnimation = functionSlice(animation, 'function runWebAnimation(el, keyframes, options)', 'function center(rect)');
assert.match(webAnimation, /Promise\.race\(\[finished, sleepMs\(duration \+ 350\)\]\)/);
assert.match(animation, /function armTransientRemoval\(node, ttlMs = 1200\)/);
assert.match(animation, /damage\.setAttribute\('aria-hidden','true'\)/);
assert.match(animation, /damage\.dataset\.argTransient='damage'/);
assert.ok((animation.match(/armTransientRemoval\(damage,damageDuration\+500\)/g) || []).length >= 2,
  'both combat-to-player animation paths need backup removal');
assert.match(animation, /\.arg-anim-damage-number\{[^}]*white-space:nowrap;[^}]*contain:content;/);

// Transporte/Vehículo P/T is a renderer concern, not a rules identity change. createCardElement is
// the shared card renderer used by encyclopedia, decks, previews, packs, battlefield, etc.
assert.match(ui, /const isVehicleCard = \/\(\?:Vehículo\|Transporte\)\/i\.test/);
assert.match(ui, /const vehiclePrintedPower = Number\(card\?\.baseStats\?\.power\)/);
assert.match(ui, /const vehiclePrintedToughness = Number\(card\?\.baseStats\?\.toughness\)/);
assert.match(ui, /const hasDisplayCombatStats = hasCreatureStats \|\| hasVehiclePrintedStats/);
assert.match(ui, /let ptText = hasDisplayCombatStats \? `\$\{effPower\}\/\$\{effToughness\}` : ''/);
assert.match(ui, /\$\{hasDisplayCombatStats \? `<div class="card-pt/);
assert.match(ui, /Poder\/Resistencia al tripular este Transporte/);

// Do not accidentally make an uncrewed artifact a creature just because it owns printed baseStats.
assert.doesNotMatch(permanentTypes, /baseStats[\s\S]{0,120}(?:creature|Criatura)/i);

const vehicles = artifactCards.filter(card => /(?:Vehículo|Transporte)/i.test(String(card?.type || '')));
assert.equal(vehicles.length, 10, 'canonical physical pool currently contains 10 Transportes/Vehículos');
for (const card of vehicles) {
  assert.ok(Number.isFinite(Number(card?.baseStats?.power)), `${card.id} missing printed power`);
  assert.ok(Number.isFinite(Number(card?.baseStats?.toughness)), `${card.id} missing printed toughness`);
}

console.log(`MASTER_AUDIO_DAMAGE_TRANSPORTE_STATS_23_21_6_HF7_OK vehicles=${vehicles.length} masterMute=music+sfx WebKitCleanup=deadline renderer=global`);
