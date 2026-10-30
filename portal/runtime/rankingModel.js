// Same semantics as rankingUI.js: default ELO desc, uniqueCards desc tie-break,
// stable original document order for complete ties; no additional invented tie.
export const count=v=>Math.max(0,Math.floor(Number(v)||0));
export function rating(v){const n=Math.floor(Number(v));return Number.isFinite(n)&&n>0?n:1200;}
export function publicRanking(records){return (Array.isArray(records)?records:[]).filter(r=>r?.excludeFromGlobalRanking!==true).map(r=>({username:String(r.username||'Jugador'),eloRating:rating(r.eloRating),eloGames:count(r.eloGames),uniqueCards:count(r.uniqueCards),gamesPlayed:count(r.gamesPlayed),wins:count(r.wins),tournamentChampionships:count(r.tournamentChampionships)})).sort((a,b)=>-(a.eloRating-b.eloRating||a.uniqueCards-b.uniqueCards));}
