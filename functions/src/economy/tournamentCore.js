import { seededRng } from '../shared/canonical.js';
import { TOURNAMENT_NPC_ROSTER, TOURNAMENT_NPC_BY_ID } from '../trusted/tournamentRoster.js';

export const TOURNAMENT_SCHEMA_VERSION = 1;
export const TOURNAMENT_ROUNDS = Object.freeze([
  Object.freeze({ key:'round16', label:'Octavos', matchCount:8 }),
  Object.freeze({ key:'quarter', label:'Cuartos', matchCount:4 }),
  Object.freeze({ key:'semi', label:'Semifinal', matchCount:2 }),
  Object.freeze({ key:'final', label:'Final', matchCount:1 })
]);
export const TOURNAMENT_DEFAULT_POLICY = Object.freeze({
  rewardedStartsPerDay:1, npcRandomnessPercent:18,
  round16:Object.freeze({ points:100,packs:0,difficulty:'medium',deckQuality:'good' }),
  quarter:Object.freeze({ points:150,packs:0,difficulty:'medium',deckQuality:'strong' }),
  semi:Object.freeze({ points:250,packs:1,difficulty:'hard',deckQuality:'strong' }),
  final:Object.freeze({ points:500,packs:2,difficulty:'hard',deckQuality:'elite' })
});
const DIFFICULTIES=new Set(['easy','medium','hard']);
const QUALITIES=new Set(['good','strong','elite']);
function int(v,f,min=0,max=1000000){const n=Math.floor(Number(v));return Number.isFinite(n)?Math.max(min,Math.min(max,n)):f;}
function enumv(v,set,f){const s=String(v||'').toLowerCase();return set.has(s)?s:f;}
export function normalizeTournamentPolicy(raw={}){
  const out={rewardedStartsPerDay:int(raw.tournamentRewardedStartsPerDay,1,0,1000),npcRandomnessPercent:int(raw.tournamentNpcRandomnessPercent,18,0,100)};
  const map=[['round16','Round16'],['quarter','Quarter'],['semi','Semi'],['final','Final']];
  for(const [key,suffix] of map){const d=TOURNAMENT_DEFAULT_POLICY[key];out[key]={points:int(raw[`tournament${suffix}Points`],d.points),packs:int(raw[`tournament${suffix}Packs`],d.packs,0,100),difficulty:enumv(raw[`tournament${suffix}Difficulty`],DIFFICULTIES,d.difficulty),deckQuality:enumv(raw[`tournament${suffix}DeckQuality`],QUALITIES,d.deckQuality)};}
  return out;
}
function shuffle(list,rng){const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function matchId(roundKey,index){return `${roundKey}_${index+1}`;}
export function createTournamentBracket({uid,username,tournamentId,seed,policy,rewardEligible,dayKey}){
  const rng=seededRng(`tournament|${seed}|${uid}`), npcs=shuffle(TOURNAMENT_NPC_ROSTER,rng).slice(0,15).map(n=>n.id);
  const entrants=shuffle([{id:'player',kind:'player',uid,name:String(username||'Jugador'),rating:1450},...npcs.map(id=>({id,kind:'npc',...TOURNAMENT_NPC_BY_ID[id]}))],rng);
  const matches={};
  for(let i=0;i<8;i++) matches[matchId('round16',i)]={id:matchId('round16',i),roundKey:'round16',index:i,aEntrantId:entrants[i*2].id,bEntrantId:entrants[i*2+1].id,winnerEntrantId:null,status:'pending'};
  for(let i=0;i<4;i++) matches[matchId('quarter',i)]={id:matchId('quarter',i),roundKey:'quarter',index:i,aFrom:matchId('round16',i*2),bFrom:matchId('round16',i*2+1),winnerEntrantId:null,status:'pending'};
  for(let i=0;i<2;i++) matches[matchId('semi',i)]={id:matchId('semi',i),roundKey:'semi',index:i,aFrom:matchId('quarter',i*2),bFrom:matchId('quarter',i*2+1),winnerEntrantId:null,status:'pending'};
  matches.final_1={id:'final_1',roundKey:'final',index:0,aFrom:'semi_1',bFrom:'semi_2',winnerEntrantId:null,status:'pending'};
  const run={schemaVersion:TOURNAMENT_SCHEMA_VERSION,tournamentId,uid,status:'active',currentRoundIndex:0,rewardEligible:!!rewardEligible,rewardDayKey:dayKey,policy,entrants:Object.fromEntries(entrants.map(e=>[e.id,e])),matches,activeMatch:null,rewardsEarned:{points:0,packs:0},championEntrantId:null};
  simulateNpcMatchesForRound(run,0,seed); return run;
}
export function resolveMatchParticipants(run,match){const winner=id=>run.matches[id]?.winnerEntrantId||null;return {a:match.aEntrantId||winner(match.aFrom),b:match.bEntrantId||winner(match.bFrom)};}
export function playerMatchForRound(run,roundIndex=run.currentRoundIndex){const key=TOURNAMENT_ROUNDS[roundIndex]?.key;if(!key)return null;return Object.values(run.matches).find(m=>m.roundKey===key&&Object.values(resolveMatchParticipants(run,m)).includes('player'))||null;}
export function simulateNpcMatchesForRound(run,roundIndex,seed=''){const key=TOURNAMENT_ROUNDS[roundIndex]?.key;if(!key)return run;const rng=seededRng(`sim|${seed}|${run.tournamentId}|${key}`), randomness=(Number(run.policy?.npcRandomnessPercent)||18)*8;
  for(const m of Object.values(run.matches).filter(x=>x.roundKey===key)){if(m.winnerEntrantId)continue;const {a,b}=resolveMatchParticipants(run,m);if(!a||!b||a==='player'||b==='player')continue;const ea=run.entrants[a],eb=run.entrants[b];const scoreA=(ea?.rating||1300)+(rng()-.5)*randomness,scoreB=(eb?.rating||1300)+(rng()-.5)*randomness;m.winnerEntrantId=scoreA>=scoreB?a:b;m.status='completed';}
  return run;}
export function sanitizedTournament(run){if(!run)return null;const rounds=TOURNAMENT_ROUNDS.map((r,ri)=>({key:r.key,label:r.label,matches:Object.values(run.matches).filter(m=>m.roundKey===r.key).sort((a,b)=>a.index-b.index).map(m=>{const p=resolveMatchParticipants(run,m);return {...m,aEntrantId:p.a,bEntrantId:p.b};})}));return {schemaVersion:run.schemaVersion,tournamentId:run.tournamentId,status:run.status,currentRoundIndex:run.currentRoundIndex,rewardEligible:!!run.rewardEligible,rewardDayKey:run.rewardDayKey,policy:run.policy,entrants:run.entrants,rounds,activeMatch:run.activeMatch||null,rewardsEarned:run.rewardsEarned||{points:0,packs:0},championEntrantId:run.championEntrantId||null};}
