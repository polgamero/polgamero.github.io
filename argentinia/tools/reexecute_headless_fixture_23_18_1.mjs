#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const execFileAsync=promisify(execFile);
const fixture=process.argv[2];
if(!fixture){console.error('Uso: node tools/reexecute_headless_fixture_23_18_1.mjs fixture.json');process.exit(2);}
const expected=JSON.parse(fs.readFileSync(fixture,'utf8'));
const here=path.dirname(fileURLToPath(import.meta.url));
const worker=path.join(here,'headless_full_game_worker_23_18_1.mjs');
const {stdout}=await execFileAsync(process.execPath,[worker,'--seed',String(expected.seed),'--difficulty',String(expected.difficulty||'medium'),'--identity',String(expected.identity||'RG'),'--maxTurns',String(Math.max(80,expected.turns+10)),'--maxSteps',String(Math.max(6000,(expected.actionCount||0)+1000))],{maxBuffer:8*1024*1024,timeout:30000});
const actual=JSON.parse(stdout);
const fields=['status','winner','turns','actionCount','finalHash','traceHash'];
const mismatches=fields.filter(k=>actual[k]!==expected[k]).map(k=>({field:k,expected:expected[k],actual:actual[k]}));
console.log(`HEADLESS_FIXTURE_REEXEC_23_18_1 ${mismatches.length?'FAIL':'OK'} seed=${expected.seed} mismatches=${mismatches.length} finalHash=${actual.finalHash} traceHash=${actual.traceHash}`);
if(mismatches.length){console.error(JSON.stringify(mismatches,null,2));process.exit(1);}
