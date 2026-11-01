// Semidios/Planeswalker strategy. No global state, DOM, RNG or hidden enemy zones.
const number=value=>Math.max(0,Number(value)||0);
export function entryLoyaltyAbilities(card){
  const loyalty=number(card?.loyalty);
  return (card?.loyaltyAbilities||[]).filter(a=>Number.isFinite(Number(a.cost))&&Number(a.cost)>=-loyalty&&a.effect);
}
function baseEffectValue(effect={}){
  const amount=number(effect.amount)||1;
  switch(effect.type){
    case 'draw':return Math.min(12,amount*4);
    case 'scry':case 'loot':return Math.min(4,amount*1.3);
    case 'create_tokens':return Math.min(14,amount*(number(effect.tokenStats?.power)*.9+number(effect.tokenStats?.toughness)*.7+1));
    case 'destroy_creature':case 'exile_creature':return 7;
    case 'bounce':return 4;
    case 'damage':return Math.min(12,amount*1.6);
    case 'drain':return Math.min(10,amount*2);
    case 'heal':return Math.min(3,amount*.55);
    case 'ramp':case 'search_land':return 4;
    case 'return_from_graveyard':return 4;
    case 'reanimate':return 8;
    case 'poison':return amount*2;
    case 'proliferate':return 3;
    case 'cant_attack_next_turn':return 3;
    case 'destroy_all_creatures':return 9;
    default:return 1;
  }
}
export function planeswalkerDeckValue3(card){
  const usable=entryLoyaltyAbilities(card),abilities=card?.loyaltyAbilities||[];
  if(!usable.length)return {immediate:0,repeatable:0,future:0,total:0};
  const immediate=Math.max(...usable.map(a=>baseEffectValue(a.effect)));
  const repeatable=Math.max(0,...usable.filter(a=>Number(a.cost)>=0).map(a=>baseEffectValue(a.effect)));
  const gain=Math.max(0,...abilities.map(a=>Number(a.cost)||0));
  const future=Math.max(0,...abilities.filter(a=>Number(a.cost)<-number(card.loyalty)).map(a=>{
    if(!gain)return 0;
    const turns=Math.ceil((-Number(a.cost)-number(card.loyalty))/gain);
    return baseEffectValue(a.effect)/(turns+3);
  }));
  return {immediate,repeatable,future,total:Math.min(18,immediate*.8+repeatable*.9+future*.5)};
}

export function chooseLoyaltyAbility3(walker,legalAbilities,context){
  const abilities=legalAbilities.slice(0,context.difficulty==='hard'?legalAbilities.length:2);
  const behind=context.opponentBoardValue>context.ownBoardValue;
  let best=null;
  for(const entry of abilities){
    const a=entry.a,e=a.effect||{},amount=number(e.amount)||1,cost=Number(a.cost)||0;
    let score=baseEffectValue(e);
    if(e.type==='damage'&&(!a.requiresTarget||entry.lethalPlayerTarget)&&amount>=context.opponentLife)score+=100000;
    if(e.type==='drain'&&amount>=context.opponentLife)score+=100000;
    if(e.type==='poison'&&amount+context.opponentPoison>=10)score+=100000;
    if(e.type==='heal')score=context.ownLife<=6?amount*2:context.ownLife<14?amount:.2;
    if(e.type==='create_tokens')score+=(behind||!context.ownCreatureCount)?5:1;
    if(e.type==='draw')score-=Math.max(0,context.ownHandSize+amount-7)*5;
    if(['destroy_creature','exile_creature','bounce','cant_attack_next_turn'].includes(e.type))score+=Math.min(10,number(entry.targetValue)*.3)+(behind?3:0);
    if(e.type==='destroy_all_creatures'){
      const gain=context.opponentBoardValue-context.ownBoardValue;if(gain<=0)continue;score+=Math.min(20,gain*.7);
    }
    if(['return_from_graveyard','reanimate'].includes(e.type)){
      const count=e.filter==='creature'||e.type==='reanimate'?context.graveyardCreatureCount:context.graveyardCount;if(!count)continue;
    }
    if(['ramp','search_land'].includes(e.type)&&!context.hasRampTarget)continue;
    if(e.type==='proliferate'&&!context.hasProliferateTargets)continue;
    score+=cost>=0?Math.min(4,cost*1.4):-Math.abs(cost)*.65;
    if(context.difficulty==='hard'&&!behind&&context.ownLife>8){
      const futureLethal=(walker.card?.loyaltyAbilities||[]).filter(ability=>Number(ability.cost)<-number(walker.loyalty)&&!ability.requiresTarget
        &&(['damage','drain'].includes(ability.effect?.type)&&number(ability.effect.amount)>=context.opponentLife
          ||ability.effect?.type==='poison'&&number(ability.effect.amount)+context.opponentPoison>=10));
      for(const ultimate of futureLethal){
        const gap=-Number(ultimate.cost)-(number(walker.loyalty)+cost);
        if(cost>0&&gap<=2)score+=gap<=0?12:5;
        else if(cost<0&&-Number(ultimate.cost)-number(walker.loyalty)<=2)score-=5;
      }
    }
    if(number(walker.loyalty)+cost<=0)score-=10;
    if(!best||score>best.score)best={...entry,score};
  }
  return best;
}
