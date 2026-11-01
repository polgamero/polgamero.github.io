import {scoreBotCardKeepValue} from './botStrategy.js';
import {planeswalkerDeckValue3} from './planeswalkerStrategy3.js';

// Rank already legal/affordable proposals. Own hand is allowed; no opponent hand,
// library or future draw enters this function. Payment/targeting stay canonical.
export function chooseMainPhaseCard3({candidates,ownBoard,opponentBoard,ownLife,opponentLife,helpers,difficulty}){
  const limit=difficulty==='hard'?12:4;
  const threat=units=>units.reduce((sum,u)=>sum+Math.max(0,helpers.getPower(u))+Math.max(0,helpers.getToughness(u))*.5,0);
  const ownThreat=threat(ownBoard),opponentThreat=threat(opponentBoard),behind=opponentThreat>ownThreat;
  let best=null;
  for(const candidate of candidates.slice(0,limit)){
    const card=candidate.card,effect=card.effect||card.etbEffect||{},power=Number(card.power)||0,toughness=Number(card.toughness)||0;
    let score=scoreBotCardKeepValue(card,{landCount:candidate.landCount,manaNextTurn:candidate.manaNextTurn});
    if(String(card.type||'').includes('Planeswalker'))score+=planeswalkerDeckValue3(card).total;
    if(card.power!==undefined){score+=power*.8+toughness*.45+(ownBoard.length===0?5:0);if(behind)score+=toughness*.6;}
    if(['destroy_creature','exile_creature','bounce','fight','damage'].includes(effect.type))score+=behind?7:2;
    if(effect.type==='destroy_all_creatures')score+=Math.max(-12,Math.min(25,(opponentThreat-ownThreat)*1.2));
    if(effect.type==='damage'&&Number(effect.amount)>=opponentLife&&candidate.canHitOpponent===true)score+=100;
    if(effect.type==='draw'||effect.type==='search_library')score+=ownBoard.length?2:0;
    if(effect.type==='heal')score+=ownLife<=6?5:-2;
    if((card.keywords||[]).includes('haste'))score+=power*1.5;
    // Prefer development that produces useful material per mana, rather than
    // picking the first card in draw order at every subsequent priority window.
    score+=Math.min(3,score/Math.max(1,Number(candidate.manaValue)||1));
    if(!best||score>best.score)best={index:candidate.index,score};
  }
  return best?.index??-1;
}
