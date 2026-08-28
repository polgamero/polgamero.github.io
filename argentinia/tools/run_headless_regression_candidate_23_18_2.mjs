#!/usr/bin/env node
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import {execFile} from 'node:child_process'; import {promisify} from 'node:util'; import {fileURLToPath} from 'node:url';
const execFileAsync=promisify(execFile); const input=process.argv[2]; if(!input){console.error('Uso: node tools/run_headless_regression_candidate_23_18_2.mjs candidate.json');process.exit(2);}
const c=JSON.parse(fs.readFileSync(path.resolve(input),'utf8')); const here=path.dirname(fileURLToPath(import.meta.url)); const worker=path.join(here,'headless_full_game_worker_23_18_2.mjs');
const tmp=path.join(os.tmpdir(),`arg_candidate_${process.pid}.json`); fs.writeFileSync(tmp,JSON.stringify(c.initialDecks));
const args=[worker,'--seed',String(c.seed),'--difficulty',String(c.difficulty),'--identity',String(c.identity),'--profile',String(c.profile||'coverage-v2'),'--deckFixture',tmp,'--maxSteps',String(c.bounds?.maxSteps||6000),'--maxTurns',String(c.bounds?.maxTurns||80)];
const {stdout}=await execFileAsync(process.execPath,args,{maxBuffer:16*1024*1024,timeout:30000}); const r=JSON.parse(stdout); try{fs.unlinkSync(tmp);}catch{}
const persists=r.status===c.failureSignature?.status&&r.reason===c.failureSignature?.reason;
console.log(`HEADLESS_REGRESSION_CANDIDATE_23_18_2 ${persists?'STILL_FAILING':'FIXED'} fingerprint=${c.fingerprint} status=${r.status} reason=${r.reason}`);
if(persists) process.exit(1);
