#!/usr/bin/env node
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import {execFile} from 'node:child_process'; import {promisify} from 'node:util'; import {fileURLToPath} from 'node:url';
const execFileAsync=promisify(execFile); const here=path.dirname(fileURLToPath(import.meta.url));
const worker=path.join(here,'headless_full_game_worker_23_18_2.mjs');
const input=process.argv[2]; if(!input){console.error('Uso: node tools/minimize_headless_failure_23_18_2.mjs fixture.json --out minimized.json');process.exit(2);}
const val=(flag,def)=>{const i=process.argv.indexOf(flag);return i>=0?process.argv[i+1]:def;};
const source=JSON.parse(fs.readFileSync(path.resolve(input),'utf8'));
if(!source.status||source.status==='completed') throw new Error('MINIMIZER_REQUIRES_FAILURE_FIXTURE');
if(!source.initialDecks?.localDeck||!source.initialDecks?.rivalDeck) throw new Error('MINIMIZER_REQUIRES_DEBUG_INITIAL_DECKS');
const target={status:source.status,reason:source.reason}; const maxAttempts=Math.max(10,Number(val('--maxAttempts','80'))||80);
const outPath=path.resolve(val('--out',path.join(process.cwd(),`minimized_${path.basename(input)}`)));
let attempts=0;
const tmpDir=fs.mkdtempSync(path.join(os.tmpdir(),'arg-min-23-18-2-'));
let decks={localDeck:structuredClone(source.initialDecks.localDeck),rivalDeck:structuredClone(source.initialDecks.rivalDeck)};
let bestSteps=Math.max(1,Number(source.actionCount||source.steps||6000)); let bestTurns=Math.max(1,Number(source.turns||80));
function sameFailure(r){return r?.status===target.status&&r?.reason===target.reason;}
async function run({steps=bestSteps,turns=bestTurns,candidateDecks=decks,debug=false}={}){
  if(++attempts>maxAttempts) return null;
  const deckPath=path.join(tmpDir,`deck_${attempts}.json`); fs.writeFileSync(deckPath,JSON.stringify(candidateDecks));
  const args=[worker,'--seed',String(source.seed),'--difficulty',String(source.difficulty||'medium'),'--identity',String(source.identity||'RG'),'--profile',String(source.profile||'coverage-v2'),'--deckFixture',deckPath,'--maxTurns',String(turns),'--maxSteps',String(steps)];
  if(debug) args.push('--debug');
  try { const {stdout}=await execFileAsync(process.execPath,args,{maxBuffer:32*1024*1024,timeout:30000}); return JSON.parse(stdout); }
  catch(err){ if(err.stdout){try{return JSON.parse(err.stdout);}catch{}} throw err; }
}
async function bisectNumber(low,high,key){
  let best=high;
  while(low<=high&&attempts<maxAttempts){const mid=Math.floor((low+high)/2); const r=await run(key==='steps'?{steps:mid}:{turns:mid}); if(r&&sameFailure(r)){best=mid;high=mid-1;}else low=mid+1;}
  return best;
}
// Primero minimiza la ventana temporal: el prefijo causal mínimo que todavía reproduce.
bestTurns=await bisectNumber(1,bestTurns,'turns');
bestSteps=await bisectNumber(1,bestSteps,'steps');

async function minimizeDeckSide(side){
  let deck=decks[side]; let granularity=2;
  while(deck.length>7 && attempts<maxAttempts){
    const removable=deck.length-7; const chunk=Math.max(1,Math.ceil(removable/granularity)); let reduced=false;
    for(let start=0;start<removable&&attempts<maxAttempts;start+=chunk){
      const end=Math.min(removable,start+chunk); const candidate=deck.slice(0,start).concat(deck.slice(end));
      if(candidate.length<7) continue;
      const candidateDecks={...decks,[side]:candidate}; const r=await run({candidateDecks});
      if(r&&sameFailure(r)){deck=candidate;decks=candidateDecks;reduced=true;granularity=Math.max(2,granularity-1);break;}
    }
    if(!reduced){ if(granularity>=removable) break; granularity=Math.min(removable,granularity*2); }
  }
}
await minimizeDeckSide('localDeck'); await minimizeDeckSide('rivalDeck');
const final=await run({debug:true});
if(!final||!sameFailure(final)) throw new Error('MINIMIZER_LOST_FAILURE');
const context=(final.debugActions||[]).slice(-Math.min(40,(final.debugActions||[]).length));
const minimized={
  minimizerVersion:'23.18.2-prefix-ddmin-v1',target,seed:source.seed,difficulty:source.difficulty,identity:source.identity,profile:source.profile||'coverage-v2',
  attempts,original:{steps:source.actionCount||source.steps,turns:source.turns,localDeck:source.initialDecks.localDeck.length,rivalDeck:source.initialDecks.rivalDeck.length},
  minimized:{steps:bestSteps,turns:bestTurns,localDeck:decks.localDeck.length,rivalDeck:decks.rivalDeck.length},
  initialDecks:decks,reproduction:{status:final.status,reason:final.reason,finalHash:final.finalHash,traceHash:final.traceHash,actionCount:final.actionCount},
  actionContext:context,logs:final.logs||[],failureContext:final.failureContext||null
};
fs.writeFileSync(outPath,JSON.stringify(minimized,null,2));
console.log(`HEADLESS_FAILURE_MINIMIZER_23_18_2_OK status=${target.status} reason=${target.reason} attempts=${attempts} steps=${source.actionCount||source.steps}->${bestSteps} turns=${source.turns}->${bestTurns} localDeck=${source.initialDecks.localDeck.length}->${decks.localDeck.length} rivalDeck=${source.initialDecks.rivalDeck.length}->${decks.rivalDeck.length} out=${outPath}`);
