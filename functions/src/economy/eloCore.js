export const ELO_INITIAL_RATING = 1200;
export const ELO_PROVISIONAL_GAMES = 10;
export const ELO_K_PROVISIONAL = 40;
export const ELO_K_ESTABLISHED = 24;
export const ELO_MAX_RATED_PAIR_DAILY = 5;

const nonneg=v=>Math.max(0,Math.floor(Number(v)||0));
export function normalizeEloStats(raw={}){
  const rating=raw?.eloRating===undefined||raw?.eloRating===null?ELO_INITIAL_RATING:Math.max(1,nonneg(raw.eloRating));
  const games=nonneg(raw.eloGames);
  return {
    rating,
    peak:Math.max(rating,raw?.eloPeak===undefined||raw?.eloPeak===null?rating:nonneg(raw.eloPeak)),
    games,
    wins:nonneg(raw.eloWins),
    losses:nonneg(raw.eloLosses)
  };
}
export function eloExpectedScore(ratingA,ratingB){
  return 1/(1+Math.pow(10,(Number(ratingB)-Number(ratingA))/400));
}
export function eloK(games){return nonneg(games)<ELO_PROVISIONAL_GAMES?ELO_K_PROVISIONAL:ELO_K_ESTABLISHED;}
export function calculateEloChange(statsA,statsB,scoreA){
  const a=normalizeEloStats(statsA),b=normalizeEloStats(statsB),safeScore=scoreA>=1?1:0;
  const deltaA=Math.round(eloK(a.games)*(safeScore-eloExpectedScore(a.rating,b.rating)));
  const deltaB=Math.round(eloK(b.games)*((1-safeScore)-eloExpectedScore(b.rating,a.rating)));
  const nextA=Math.max(1,a.rating+deltaA),nextB=Math.max(1,b.rating+deltaB);
  return {
    a:{before:a.rating,after:nextA,delta:nextA-a.rating,k:eloK(a.games),gamesBefore:a.games},
    b:{before:b.rating,after:nextB,delta:nextB-b.rating,k:eloK(b.games),gamesBefore:b.games}
  };
}
