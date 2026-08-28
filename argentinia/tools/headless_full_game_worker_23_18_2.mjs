#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installHeadlessDom } from './headless_dom_stub_23_18_1.mjs';
installHeadlessDom();

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const args=Object.fromEntries(process.argv.slice(2).reduce((acc,v,i,a)=>{ if(v.startsWith('--')) acc.push([v.slice(2), a[i+1] && !a[i+1].startsWith('--') ? a[i+1] : true]); return acc; },[]));
const seed=String(args.seed || 'headless-1');
const difficulty=String(args.difficulty || 'medium');
const maxSteps=Math.max(1, Number(args.maxSteps)||5000);
const maxTurns=Math.max(1, Number(args.maxTurns)||80);
const profile=String(args.profile || 'coverage-v2');
const deckFixturePath=args.deckFixture ? path.resolve(String(args.deckFixture)) : null;
const identity=String(args.identity || 'RG').toUpperCase().split('').filter(c=>'WUBRG'.includes(c)).slice(0,2);
if(identity.length!==2) throw new Error('HEADLESS_IDENTITY_REQUIRES_TWO_COLORS');

const dataFiles=['criaturas.json','instantaneos.json','conjuros.json','encantamientos.json','artefactos.json','tierras.json','planeswalkers.json'];
const pool=Object.fromEntries(dataFiles.map(name=>[name,JSON.parse(fs.readFileSync(path.join(root,'assets/data',name),'utf8'))]));

const [{state,playCard,tapLocalLand,cancelPayment,checkGameOver,canPlayCard,canManaSourcePayPendingCost},bot,combat,turn,stack,telemetry,rng,lab,keywords,replay] = await Promise.all([
  import('../js/main.js'), import('../js/bot.js'), import('../js/combatRules.js'), import('../js/turnManager.js'),
  import('../js/stackManager.js'), import('../js/telemetry.js'), import('../js/gameRng.js'), import('../js/headlessGameLab.js'),
  import('../js/keywords.js'), import('../js/replayKernel.js')
]);

function zeroPool(){ return {W:0,U:0,B:0,R:0,G:0,C:0}; }
function resetGameplayState(){
  // Cada worker importa un módulo fresco. Sólo normalizamos el dominio de una partida.
  Object.assign(state,{
    turnCount:1,isPlayerTurn:true,activePlayer:'local',priorityPlayer:'local',consecutivePasses:0,phase:'main1',gameOver:false,
    botDifficulty:difficulty,currentMatch:null,abandonedBy:null,abandonProcessedLocally:false,
    localHP:20,localPoison:0,localDeck:[],localHand:[],localLands:[],localCombat:[],localGraveyard:[],localExile:[],localPlaneswalkers:[],localSupport:[],localLandPlayedThisTurn:false,localManaPool:zeroPool(),
    rivalHP:20,rivalPoison:0,rivalDeck:[],rivalHand:[],rivalLands:[],rivalCombat:[],rivalGraveyard:[],rivalExile:[],rivalPlaneswalkers:[],rivalSupport:[],rivalLandPlayedThisTurn:false,rivalManaPool:zeroPool(),
    localAttackersDeclaredThisTurn:0,rivalAttackersDeclaredThisTurn:0,localBlockersDeclaredThisCombat:false,rivalBlockersDeclaredThisCombat:false,
    activeEffects:[],scheduledReturns:[],combatDamagePrevented:false,triggerStackSerial:0,sbaKernelRunning:false,sbaHeldTriggerBatches:[],
    pendingLegendChoice:null,pendingTriggerOrderChoice:null,pendingCastTransaction:null,pendingSuspendTransaction:null,pendingAlternativeCostChoice:null,pendingPrivateZoneChoice:null,
    pendingLandSearchChoice:null,pendingLibraryChoice:null,pendingSpellIndex:null,pendingCost:null,pendingAbilitySource:null,pendingActivatedAbilityChoice:null,pendingCrew:null,
    pendingWardChoice:null,pendingCounterUnlessPay:null,pendingFightChoice:null,pendingXChoice:null,pendingModeChoice:null,pendingLoyaltyTargetChoice:null,pendingMultiTargetChoice:null,
    pendingScrySurveilChoice:null,pendingProliferateChoice:null,pendingHandFilterChoice:null,pendingDiscardChoice:null,pendingSacrificeEffectChoice:null,pendingGraveyardChoice:null,
    pendingResolvedEffectTargetChoice:null,pendingCompositeCostPayment:false,pendingEscapeExileChoice:null,pendingKickerChoice:null,pendingRampChoice:null,
    resolvingCardFilterEffects:0,resolvingDiscardEffects:0,resolvingSacrificeEffects:0,resolvingGraveyardChoices:0,resolvingResolvedEffectTargetChoices:0,
    isDiscarding:false,damageModalOpen:false,awaitingRivalDecision:false,respondingToDecision:false
  });
  stack.replaceSpellStackFromSync([]);
}

function drawOpening(side){
  const deck=side==='local'?state.localDeck:state.rivalDeck;
  const hand=side==='local'?state.localHand:state.rivalHand;
  for(let i=0;i<7;i++) hand.push(deck.pop());
}
function simpleMulligan(side){
  const deck=side==='local'?state.localDeck:state.rivalDeck;
  const hand=side==='local'?state.localHand:state.rivalHand;
  const lands=hand.filter(c=>String(c?.type||'').includes('Tierra')).length;
  if(lands>=2 && lands<=5) return false;
  deck.push(...hand.splice(0));
  rng.shuffleInPlace?.(deck); // compat futura; hoy hacemos shuffle manual debajo si no existe.
  for(let i=deck.length-1;i>0;i--){const j=Math.floor(rng.gameRandom(`headless_mulligan_${side}`)*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
  for(let i=0;i<7;i++) hand.push(deck.pop());
  return true;
}

function legalAttackers(){ return state.localCombat.filter(u=>!u.tapped && !u.summoningSickness && !keywords.hasKeyword(u,'defender')); }
function assignLocalBlocks(){
  state.localCombat.forEach(u=>{u.blockingIndex=null;});
  const available=state.localCombat.map((u,index)=>({u,index})).filter(({u})=>!u.tapped);
  state.rivalCombat.forEach((att,aIdx)=>{
    if(!att.isAttacking || !available.length) return;
    if(keywords.hasKeyword(att,'menace')){
      const choices=[];
      for(let i=0;i<available.length && choices.length<2;i++) if(keywords.canBlock(att,available[i].u)) choices.push(i);
      if(choices.length===2){ choices.reverse().forEach(i=>{const [b]=available.splice(i,1);b.u.blockingIndex=aIdx;}); }
      return;
    }
    const idx=available.findIndex(({u})=>keywords.canBlock(att,u));
    if(idx>=0){const [b]=available.splice(idx,1);b.u.blockingIndex=aIdx;}
  });
}

function untappedLocalLands(){ return state.localLands.filter(l=>!l.tapped); }
function findLocalLandIndex(){ return state.localHand.findIndex(c=>String(c?.type||'').includes('Tierra')); }
function isExecutableLocalCard(card){
  if(profile==='core-combat-v1') return lab.isHeadlessSafeCreature(card,identity);
  if(profile==='pool-probe-v2') return lab.isHeadlessProbeCard(card,identity);
  return lab.isHeadlessCoverageFullCard(card,identity);
}
function affordableExecutableCardIndex(){
  const mana=untappedLocalLands().length;
  let best=-1,bestCmc=-1;
  state.localHand.forEach((c,i)=>{
    if(!isExecutableLocalCard(c) || state.activePlayer!=='local' || !canPlayCard(c)) return;
    const cmc=Number(c.cmc||0);
    if(cmc<=mana && cmc>bestCmc){best=i;bestCmc=cmc;}
  });
  return best;
}

async function flushMicrotasks(){ for(let i=0;i<4;i++) await Promise.resolve(); }
async function tryLocalCast(){
  const idx=affordableExecutableCardIndex();
  if(idx<0) return false;
  const card=state.localHand[idx];
  if(!card || state.priorityPlayer!=='local') return false;
  playCard(idx);
  await flushMicrotasks();
  let taps=0;
  while(state.pendingCastTransaction && state.pendingCost && taps<state.localLands.length+2){
    const land=untappedLocalLands().find(l=>canManaSourcePayPendingCost(l)) || untappedLocalLands()[0];
    if(!land) break;
    tapLocalLand(land); taps++; await flushMicrotasks();
  }
  if(state.pendingCastTransaction){ cancelPayment(); return false; }
  return true;
}

const actions=[];
function snapshot(){ return telemetry.buildReplaySnapshot(state,stack.spellStack); }
function pushAction(type,details={}){ const snap=snapshot(); actions.push({n:actions.length+1,type,details,hash:replay.replayHash(snap),turn:snap.turn}); }

async function localStep(){
  if(state.isDiscarding){
    const idx=Math.max(0,state.localHand.length-1);
    const name=state.localHand[idx]?.name||null;
    await turn.handleDiscardClick(idx);
    pushAction('LOCAL_CLEANUP_DISCARD',{card:name,remaining:state.cardsToDiscard||0});
    return;
  }
  if(stack.spellStack.length>0){ await turn.passPriority('local'); pushAction('LOCAL_PASS_STACK'); return; }
  if(state.activePlayer==='local' && (state.phase==='main1'||state.phase==='main2')){
    const li=findLocalLandIndex();
    if(li>=0 && !state.localLandPlayedThisTurn){ const name=state.localHand[li].name; playCard(li); await flushMicrotasks(); pushAction('LOCAL_PLAY_LAND',{card:name}); return; }
    if(await tryLocalCast()){ pushAction('LOCAL_CAST_HEADLESS_CARD',{profile}); return; }
  }
  if(state.activePlayer==='local' && state.phase==='combat_attackers' && (state.localAttackersDeclaredThisTurn||0)===0){
    for(const u of legalAttackers()) u.isAttacking=true;
    await combat.executeLocalAttack(); pushAction('LOCAL_DECLARE_ATTACKERS',{count:state.localAttackersDeclaredThisTurn}); return;
  }
  if(state.activePlayer==='rival' && state.phase==='combat_blockers' && !state.localBlockersDeclaredThisCombat){
    assignLocalBlocks(); combat.executeRivalAttack(); pushAction('LOCAL_DECLARE_BLOCKERS',{count:state.localCombat.filter(u=>u.blockingIndex!=null).length}); return;
  }
  await turn.passPriority('local'); pushAction('LOCAL_PASS');
}

resetGameplayState();
rng.beginGameRngSession({seed,label:'headless-full-engine'});
const allNonlands=[...pool['criaturas.json'],...pool['instantaneos.json'],...pool['conjuros.json'],...pool['encantamientos.json'],...pool['artefactos.json'],...pool['planeswalkers.json']];
let localBuild,rivalBuild;
if(deckFixturePath){
  const fixture=JSON.parse(fs.readFileSync(deckFixturePath,'utf8'));
  localBuild={deck:structuredClone(fixture.localDeck||[]),coverageCandidateCount:null,safeCreatureCount:null};
  rivalBuild={deck:structuredClone(fixture.rivalDeck||[]),coverageCandidateCount:null,safeCreatureCount:null};
}else if(profile==='core-combat-v1'){
  localBuild=lab.buildHeadlessSafeDeck({creatures:pool['criaturas.json'],lands:pool['tierras.json'],identity,seed,side:'local'});
  rivalBuild=lab.buildHeadlessSafeDeck({creatures:pool['criaturas.json'],lands:pool['tierras.json'],identity,seed,side:'rival'});
}else if(profile==='pool-probe-v2'){
  localBuild=lab.buildHeadlessProbeDeck({cards:allNonlands,lands:pool['tierras.json'],identity,seed,side:'local'});
  rivalBuild=lab.buildHeadlessProbeDeck({cards:allNonlands,lands:pool['tierras.json'],identity,seed,side:'rival'});
}else{
  localBuild=lab.buildHeadlessCoverageDeck({cards:allNonlands,lands:pool['tierras.json'],identity,seed,side:'local'});
  rivalBuild=lab.buildHeadlessCoverageDeck({cards:allNonlands,lands:pool['tierras.json'],identity,seed,side:'rival'});
}
const initialDecks={localDeck:structuredClone(localBuild.deck),rivalDeck:structuredClone(rivalBuild.deck)};
state.localDeck=localBuild.deck; state.rivalDeck=rivalBuild.deck;
drawOpening('local');drawOpening('rival');simpleMulligan('local');simpleMulligan('rival');
pushAction('GAME_INITIALIZED',{identity,profile,localPool:localBuild.safeCreatureCount??localBuild.coverageCandidateCount,rivalPool:rivalBuild.safeCreatureCount??rivalBuild.coverageCandidateCount});

let sameProgress=0,lastProgress=null,status='running',reason=null,invariantFindings=[],runtimeWarnings=[];
for(let step=0;step<maxSteps && !state.gameOver;step++){
  await flushMicrotasks();
  const pending=lab.pendingChoiceKeys(state).filter(k=>k!=='pendingCastTransaction' && k!=='pendingCompositeCostPayment');
  if(pending.length){ status='coverage_stop';reason=`UNSUPPORTED_PENDING:${pending.join(',')}`;break; }
  const snap=snapshot();
  const runtimeFindings=telemetry.evaluateRuntimeInvariants(state,stack.spellStack);
  invariantFindings=runtimeFindings.filter(f=>f?.severity==='error');
  runtimeWarnings=runtimeFindings.filter(f=>f?.severity!=='error');
  if(invariantFindings.length){status='invariant_failure';reason=invariantFindings[0].code;break;}
  const progress=lab.headlessProgressKey(snap);
  if(progress===lastProgress) sameProgress++; else sameProgress=0;
  lastProgress=progress;
  if(sameProgress>40){status='stall';reason='NO_STATE_PROGRESS_40_STEPS';break;}
  if(state.turnCount>maxTurns){status='turn_limit';reason='MAX_TURNS';break;}

  if(state.priorityPlayer==='rival') { await bot.takeBotPriorityAction(); pushAction('RIVAL_BOT_ACTION'); }
  else await localStep();
  checkGameOver();
}
await flushMicrotasks();
const finalSnapshot=snapshot();
if(state.gameOver){status='completed';reason='GAME_OVER';}
if(status==='running'){status='step_limit';reason='MAX_STEPS';}
const traceHash=replay.replayHash(actions.map(a=>({type:a.type,hash:a.hash,turn:a.turn,details:a.details})));
const result=lab.summarizeHeadlessRun({seed,difficulty,profile,steps:actions.length,snapshot:finalSnapshot,actions,unsupported:reason?.startsWith('UNSUPPORTED_PENDING:')?[reason.split(':')[1]]:[],invariantFindings,status,reason,traceHash});
result.identity=identity.join('');
result.profile=profile;
result.runtimeWarnings=runtimeWarnings.slice(0,20);
result.rng=rng.getGameRngSnapshot();
result.sampleActions=actions.slice(-12);
if(args.debug) { result.debugSnapshot=finalSnapshot; result.debugActions=actions; result.initialDecks=initialDecks; }
result.logs=(globalThis.__ARGENTINIA_HEADLESS_LOG__||[]).slice(-20);
if(status!=='completed') result.failureContext={snapshot:finalSnapshot,actions:actions.slice(-120),logs:result.logs,runtimeWarnings};
process.stdout.write(JSON.stringify(result),()=>process.exit(0));
