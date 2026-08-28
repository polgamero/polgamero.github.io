#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path'; import {fileURLToPath} from 'node:url';
import {replayHash} from '../js/replayKernel.js';
const input=process.argv[2]; if(!input){console.error('Uso: node tools/register_headless_regression_candidate_23_18_2.mjs minimized.json [--dir tools/regressions/candidates]');process.exit(2);}
const val=(flag,def)=>{const i=process.argv.indexOf(flag);return i>=0?process.argv[i+1]:def;};
const here=path.dirname(fileURLToPath(import.meta.url)); const root=path.resolve(here,'..');
const src=JSON.parse(fs.readFileSync(path.resolve(input),'utf8')); if(!src.target?.status) throw new Error('INVALID_MINIMIZED_FIXTURE');
const slug=s=>String(s||'bug').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,64);
const fingerprint=replayHash({target:src.target,identity:src.identity,difficulty:src.difficulty,profile:src.profile,decks:src.initialDecks}).replace(':','_');
const dir=path.resolve(root,val('--dir','tools/regressions/candidates')); fs.mkdirSync(dir,{recursive:true});
const out=path.join(dir,`${slug(src.target.reason)}_${fingerprint}.json`);
const candidate={
  schemaVersion:1,kind:'headless_regression_candidate',createdBy:'23.18.2',fingerprint,
  failureSignature:src.target,seed:src.seed,difficulty:src.difficulty,identity:src.identity,profile:src.profile,
  bounds:{maxSteps:src.minimized?.steps||src.reproduction?.actionCount||6000,maxTurns:src.minimized?.turns||80},
  initialDecks:src.initialDecks,reproduction:src.reproduction,sourceMinimizer:src.minimizerVersion||null,
  expectedAfterFix:'failure_signature_absent'
};
fs.writeFileSync(out,JSON.stringify(candidate,null,2));
console.log(`HEADLESS_REGRESSION_CANDIDATE_23_18_2_OK fingerprint=${fingerprint} out=${out}`);
