#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const execFileAsync=promisify(execFile);
const here=path.dirname(fileURLToPath(import.meta.url));
const worker=path.join(here,'headless_full_game_worker_23_18_2.mjs');
const val=(flag,def)=>{const i=process.argv.indexOf(flag);return i>=0?process.argv[i+1]:def;};
const games=Math.max(1,Number(val('--games','12'))||12);
const maxTurns=Math.max(10,Number(val('--maxTurns','80'))||80);
const maxSteps=Math.max(500,Number(val('--maxSteps','6000'))||6000);
const determinismRuns=Math.max(1,Number(val('--determinismRuns','2'))||2);
const concurrency=Math.max(1,Math.min(12,Number(val('--concurrency','6'))||6));
const fixtureDir=path.resolve(val('--fixtures',path.join(os.tmpdir(),'argentinia-headless-fixtures-23.18.2')));
const difficultyArg=String(val('--difficulty','all'));
const profile=String(val('--profile','coverage-v2'));
const identityArg=String(val('--identity','all')).toUpperCase();
const difficulties=difficultyArg==='all'?['easy','medium','hard']:[difficultyArg];
const identities=identityArg==='ALL'?['WU','UB','BR','RG','GW','WB','UR','BG','RW','GU']:[identityArg];
fs.mkdirSync(fixtureDir,{recursive:true});

async function runOne(seed,difficulty,identity){
  const args=[worker,'--seed',seed,'--difficulty',difficulty,'--identity',identity,'--profile',profile,'--maxTurns',String(maxTurns),'--maxSteps',String(maxSteps)];
  const {stdout}=await execFileAsync(process.execPath,args,{maxBuffer:8*1024*1024,timeout:30000});
  return JSON.parse(stdout);
}

const results=[]; const determinismFailures=[]; const fixtures=[];
const cases=Array.from({length:games},(_,i)=>({
  i,
  difficulty:difficulties[i%difficulties.length],
  identity:identities[i%identities.length]
})).map(c=>({...c,seed:`headless-${c.difficulty}-${c.identity}-${c.i}`}));

async function runCase(c){
  const runs=await Promise.all(Array.from({length:determinismRuns},()=>runOne(c.seed,c.difficulty,c.identity)));
  const baseline=runs[0];
  for(let r=1;r<runs.length;r++){
    const result=runs[r];
    if(result.finalHash!==baseline.finalHash || result.traceHash!==baseline.traceHash || result.actionCount!==baseline.actionCount || result.status!==baseline.status){
      determinismFailures.push({seed:c.seed,difficulty:c.difficulty,identity:c.identity,run:r+1,expected:{finalHash:baseline.finalHash,traceHash:baseline.traceHash,actionCount:baseline.actionCount,status:baseline.status},actual:{finalHash:result.finalHash,traceHash:result.traceHash,actionCount:result.actionCount,status:result.status}});
    }
  }
  if(!['completed'].includes(baseline.status)){
    // 23.18.2: un failure fixture tiene que ser minimizable. Re-ejecutamos una vez con
    // --debug para conservar decks iniciales exactos + action trace causal.
    const debugArgs=[worker,'--seed',c.seed,'--difficulty',c.difficulty,'--identity',c.identity,'--profile',profile,'--maxTurns',String(maxTurns),'--maxSteps',String(maxSteps),'--debug'];
    const {stdout:debugStdout}=await execFileAsync(process.execPath,debugArgs,{maxBuffer:32*1024*1024,timeout:30000});
    const debugResult=JSON.parse(debugStdout);
    const fp=path.join(fixtureDir,`${c.seed}_${baseline.status}.json`);
    fs.writeFileSync(fp,JSON.stringify(debugResult,null,2)); fixtures.push(fp);
  }
  return {index:c.i,result:baseline};
}

let cursor=0;
async function lane(){
  const out=[];
  while(true){
    const idx=cursor++;
    if(idx>=cases.length) break;
    out.push(await runCase(cases[idx]));
  }
  return out;
}
const laneResults=(await Promise.all(Array.from({length:Math.min(concurrency,cases.length)},()=>lane()))).flat().sort((a,b)=>a.index-b.index);
results.push(...laneResults.map(x=>x.result));
const counts=results.reduce((m,r)=>(m[r.status]=(m[r.status]||0)+1,m),{});
const totalActions=results.reduce((s,r)=>s+(r.actionCount||0),0);
const totalTurns=results.reduce((s,r)=>s+(r.turns||0),0);
const summary={version:'23.18.2',profile,games,determinismRuns,concurrency,difficulties,identities,counts,totalActions,totalTurns,avgActions:Number((totalActions/games).toFixed(2)),avgTurns:Number((totalTurns/games).toFixed(2)),determinismFailures:determinismFailures.length,fixtures:fixtures.length,fixtureDir};
console.log(`HEADLESS_FULL_GAME_LAB_23_18_2_OK games=${games} deterministicRuns=${determinismRuns} completed=${counts.completed||0} coverageStops=${counts.coverage_stop||0} stalls=${counts.stall||0} invariants=${counts.invariant_failure||0} turnLimits=${counts.turn_limit||0} stepLimits=${counts.step_limit||0} determinismFailures=${determinismFailures.length} totalActions=${totalActions} totalTurns=${totalTurns}`);
if(process.argv.includes('--json')) console.log(JSON.stringify({summary,results,determinismFailures,fixtures},null,2));
if(determinismFailures.length || (counts.stall||0) || (counts.invariant_failure||0)) process.exit(1);
