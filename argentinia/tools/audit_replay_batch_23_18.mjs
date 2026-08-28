#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { auditTelemetryReplay, findReplayBugMarkers } from '../js/replayKernel.js';

const inputs = process.argv.slice(2).filter(a => !a.startsWith('--'));
const strict = process.argv.includes('--strict');
if (!inputs.length) {
  console.log('Uso: node tools/audit_replay_batch_23_18.mjs <archivo-o-carpeta> [...] [--strict]');
  process.exit(2);
}
function collect(input, out=[]) {
  const p=path.resolve(input); if(!fs.existsSync(p)) return out;
  const st=fs.statSync(p);
  if(st.isDirectory()) for(const name of fs.readdirSync(p)) collect(path.join(p,name),out);
  else if(/\.json$/i.test(p) && /Argentinia_(?:Log|Diagnostico)/i.test(path.basename(p))) out.push(p);
  return out;
}
const files=[...new Set(inputs.flatMap(i=>collect(i)))];
let markers=0, invariantFindings=0, hashMismatches=0, unreadable=0;
for(const file of files){
  try{
    const payload=JSON.parse(fs.readFileSync(file,'utf8'));
    const bugs=findReplayBugMarkers(payload);
    const targets=bugs.length?bugs:[null];
    for(let i=0;i<targets.length;i++){
      const a=auditTelemetryReplay(payload, bugs.length?{marker:i+1}:{});
      markers += bugs.length?1:0;
      invariantFindings += a.invariantFindings.length;
      hashMismatches += a.hashMismatches.length;
      console.log(`${path.basename(file)} marker=${bugs.length?i+1:0} seq=${a.targetSeq} hash=${a.reconstructedHash||'n/a'} invariants=${a.invariantFindings.length} hashMismatch=${a.hashMismatches.length}${bugs[i]?` note=${bugs[i].note}`:''}`);
    }
  }catch(err){ unreadable++; console.error(`UNREADABLE ${file}: ${err.message}`); }
}
console.log(`REPLAY_BATCH_23_18_DONE files=${files.length} markers=${markers} invariants=${invariantFindings} hashMismatches=${hashMismatches} unreadable=${unreadable}`);
if(strict && (invariantFindings||hashMismatches||unreadable)) process.exitCode=1;
