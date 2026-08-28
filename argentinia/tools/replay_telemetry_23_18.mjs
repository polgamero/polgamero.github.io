#!/usr/bin/env node
// Argentinia 23.18 — Replay CLI
import fs from 'node:fs';
import path from 'node:path';
import { auditTelemetryReplay, findReplayBugMarkers } from '../js/replayKernel.js';

function parseArgs(argv) {
  const out = { file: null, marker: null, seq: null, out: null, list: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--') && !out.file) out.file = arg;
    else if (arg === '--marker') out.marker = Number(argv[++i]);
    else if (arg === '--seq') out.seq = Number(argv[++i]);
    else if (arg === '--out') out.out = argv[++i];
    else if (arg === '--list') out.list = true;
    else if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
  }
  return out;
}

function usage() {
  console.log(`Argentinia 23.18 Replay CLI\n\n` +
    `Uso:\n  node tools/replay_telemetry_23_18.mjs <telemetry.json> [--marker N | --seq N] [--out state.json] [--json]\n` +
    `  node tools/replay_telemetry_23_18.mjs <telemetry.json> --list\n\n` +
    `Compatible con logs legacy 23.17.x (reconstrucción por state_change) y 23.18+ (hash validation + RNG metadata).`);
}

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.file) {
  usage();
  process.exit(args.file ? 0 : 2);
}

const filePath = path.resolve(args.file);
const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const markers = findReplayBugMarkers(payload);
if (args.list) {
  if (!markers.length) console.log('Sin marcadores manuales.');
  else markers.forEach(m => console.log(`#${m.marker} seq=${m.seq} ${m.at || ''} — ${m.note}`));
  process.exit(0);
}

const audit = auditTelemetryReplay(payload, { marker: args.marker, seq: args.seq });
const report = {
  file: path.basename(filePath),
  telemetryVersion: audit.telemetryVersion,
  replayFormatVersion: audit.formatVersion,
  targetSeq: audit.targetSeq,
  marker: audit.marker,
  reconstructedHash: audit.reconstructedHash,
  hashMismatchCount: audit.hashMismatches.length,
  invariantFindingCount: audit.invariantFindings.length,
  hashMismatches: audit.hashMismatches,
  invariantFindings: audit.invariantFindings,
  actionCount: audit.actionJournal.length,
  snapshot: audit.snapshot
};

if (args.out) fs.writeFileSync(path.resolve(args.out), JSON.stringify(report, null, 2));
if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`ARGENTINIA_REPLAY_23_18_OK file=${path.basename(filePath)} targetSeq=${audit.targetSeq} marker=${audit.marker?.marker || 0}`);
  console.log(`telemetry=${audit.telemetryVersion || '?'} replayFormat=${audit.formatVersion} hash=${audit.reconstructedHash || 'n/a'} hashMismatches=${audit.hashMismatches.length} invariants=${audit.invariantFindings.length} actions=${audit.actionJournal.length}`);
  if (audit.marker) console.log(`bug: ${audit.marker.note}`);
  if (args.out) console.log(`out: ${path.resolve(args.out)}`);
}
if (audit.hashMismatches.length || audit.invariantFindings.length) process.exitCode = 1;
