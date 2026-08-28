#!/usr/bin/env node
import fs from 'node:fs';
import { auditActionReexecution } from '../js/actionReexecutor.js';
const file=process.argv[2];
if(!file){console.error('Uso: node tools/reexecute_telemetry_actions_23_18_1.mjs <log.json> [--strict] [--out result.json]');process.exit(2);}
const strict=process.argv.includes('--strict');
const outIdx=process.argv.indexOf('--out');
const out=outIdx>=0?process.argv[outIdx+1]:null;
const payload=JSON.parse(fs.readFileSync(file,'utf8'));
const result=auditActionReexecution(payload);
const summary={version:result.version,file,telemetryVersion:result.telemetryVersion,replayFormatVersion:result.replayFormatVersion,frames:result.frameCount,actions:result.actionJournalCount,divergences:result.divergences.length,finalHash:result.finalHash};
console.log(`ACTION_REEXECUTOR_23_18_1 ${Object.entries(summary).map(([k,v])=>`${k}=${v}`).join(' ')}`);
if(out) fs.writeFileSync(out,JSON.stringify({...summary,divergences:result.divergences,snapshot:result.snapshot},null,2));
if(strict && result.divergences.length) process.exit(1);
