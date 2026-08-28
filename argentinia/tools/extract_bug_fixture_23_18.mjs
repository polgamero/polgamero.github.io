#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { auditTelemetryReplay, findReplayBugMarkers, replayHash } from '../js/replayKernel.js';

const argv=process.argv.slice(2);
const file=argv.find(a=>!a.startsWith('--'));
const markerPos=argv.indexOf('--marker');
const outPos=argv.indexOf('--out');
const beforePos=argv.indexOf('--before');
const afterPos=argv.indexOf('--after');
if(!file){
  console.log('Uso: node tools/extract_bug_fixture_23_18.mjs <telemetry.json> --marker N [--out fixture.json] [--before 120] [--after 40]');
  process.exit(2);
}
const payload=JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));
const markers=findReplayBugMarkers(payload);
const markerNumber=Math.max(1,Number(markerPos>=0?argv[markerPos+1]:1)||1);
const marker=markers[markerNumber-1];
if(!marker) throw new Error(`No existe marker ${markerNumber}. Disponibles: ${markers.length}`);
const audit=auditTelemetryReplay(payload,{marker:markerNumber});
const before=Math.max(0,Number(beforePos>=0?argv[beforePos+1]:120)||120);
const after=Math.max(0,Number(afterPos>=0?argv[afterPos+1]:40)||40);
const events=Array.isArray(payload.events)?payload.events:[];
const markerIndex=events.findIndex(ev=>Number(ev?.seq||0)===marker.seq);
const context=markerIndex>=0?events.slice(Math.max(0,markerIndex-before),markerIndex+after+1):[];
const initialDecks=events.find(ev=>ev?.type==='initial_decks')||null;
const startingPlayer=events.find(ev=>ev?.type==='starting_player_selected')||null;
const fixture={
  fixtureSchemaVersion:1,
  createdBy:'Argentinia 23.18 extract_bug_fixture',
  source:{file:path.basename(file),sessionId:payload.sessionId||null,telemetryVersion:payload.telemetryVersion||null,schemaVersion:payload.schemaVersion||null},
  marker,
  replay:{
    formatVersion:payload.replay?.formatVersion||0,
    rng:payload.meta?.replayRng||payload.replay?.rngAtSessionStart||marker.replay?.rng||null,
    stateHash:audit.reconstructedHash,
    hashAlgorithm:payload.replay?.hashAlgorithm||'fnv1a32-stable-json-v1',
    targetSeq:audit.targetSeq,
    invariantFindings:audit.invariantFindings,
    hashMismatches:audit.hashMismatches
  },
  startingPlayer,
  initialDecks,
  snapshotAtMarker:audit.snapshot,
  actionJournal:audit.actionJournal,
  eventContext:{before,after,events:context}
};
fixture.fixtureHash=replayHash(fixture);
const output=path.resolve(outPos>=0?argv[outPos+1]:`Argentinia_BugFixture_${payload.sessionId||'session'}_marker${markerNumber}.json`);
fs.writeFileSync(output,JSON.stringify(fixture,null,2));
console.log(`BUG_FIXTURE_23_18_OK marker=${markerNumber} seq=${marker.seq} context=${context.length} actions=${audit.actionJournal.length} hash=${fixture.fixtureHash}`);
console.log(output);
