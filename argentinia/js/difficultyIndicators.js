export const DIFFICULTY_INDICATORS_SCHEMA = 1;
const DAY = 86400000;
const LEVELS = ['easy','medium','hard'];
const ROUNDS = ['round16','quarter','semi','final'];
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const id = value => String(value || '').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,240);
const enumValue = (value, allowed) => allowed.includes(value) ? value : null;
const token = value => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(value) ? value : null;
export function difficultyTime(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === 'object') return Number(value.seconds ?? value._seconds ?? 0) * 1000;
  const ms = typeof value === 'string' ? Date.parse(value) : Number(value);
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}
export function normalizeDifficultyObservation(value, { previousGames = null, difficulty = null, deckQuality = null, nowMs = Date.now() } = {}) {
  const raw = record(value);
  if (!Object.keys(raw).length && !difficulty && !deckQuality) return null;
  const start = enumValue(difficulty, LEVELS) || enumValue(raw.difficultyStart, LEVELS);
  const end = enumValue(raw.difficultyEnd, LEVELS) || start;
  const startedAtMs = difficultyTime(raw.startedAtMs);
  const buildId=typeof raw.buildId==='string' && /^[a-f0-9]{20,64}$/.test(raw.buildId)?raw.buildId:null;
  const buildIdEnd=typeof raw.buildIdEnd==='string' && /^[a-f0-9]{20,64}$/.test(raw.buildIdEnd)?raw.buildIdEnd:buildId;
  const botVersion=token(raw.botVersion),botVersionEnd=token(raw.botVersionEnd)||botVersion;
  return {
    schemaVersion:1, source:'client_observation', difficultyStart:start, difficultyEnd:end,
    difficultyChanged:raw.difficultyChanged === true || !!(start && end && start !== end),
    deckQuality:enumValue(deckQuality, ['good','strong','elite']) || enumValue(raw.deckQuality, ['good','strong','elite']),
    botVersion,botVersionEnd,botVersionChanged:raw.botVersionChanged===true || !!(botVersion && botVersionEnd && botVersion!==botVersionEnd),
    buildId,buildIdEnd,buildChanged:raw.buildChanged===true || !!(buildId && buildIdEnd && buildId!==buildIdEnd),
    startedAtMs:startedAtMs && startedAtMs <= nowMs + 300000 ? startedAtMs : null,
    deckSource:enumValue(raw.deckSource, ['saved','automatic','guided']),
    previousGames:Number.isFinite(previousGames) && previousGames >= 0 ? Math.floor(previousGames) : null
  };
}
export function difficultyRate(wins, total, playerRows = []) {
  if (!Number.isFinite(total) || !Number.isFinite(wins) || total<=0 || wins<0 || wins>total) return { wins, total, percent:null, low:null, high:null, playerMean:null, players:0 };
  const p = wins / total, z = 1.959963984540054, z2 = z*z, denominator = 1 + z2/total;
  const center = (p + z2/(2*total))/denominator;
  const margin = z*Math.sqrt(p*(1-p)/total + z2/(4*total*total))/denominator;
  const players = new Map();
  for (const row of playerRows) {
    const stats = players.get(row.uid) || { wins:0,total:0 };
    stats.total++; stats.wins += row.won ? 1 : 0; players.set(row.uid,stats);
  }
  return { wins,total,percent:p*100,low:Math.max(0,center-margin)*100,high:Math.min(1,center+margin)*100,
    playerMean:players.size ? [...players.values()].reduce((sum,x)=>sum+x.wins/x.total,0)/players.size*100 : null,players:players.size };
}
function parse(value) { try { return typeof value === 'string' ? JSON.parse(value) : record(value); } catch { return {}; } }
function storedObservation(value) {
  const raw = record(value);
  return normalizeDifficultyObservation(raw, { previousGames:typeof raw.previousGames === 'number' ? raw.previousGames : null });
}
function experience(observation) {
  return observation?.previousGames == null ? 'unknown' : observation.previousGames < 10 ? 'new' : 'experienced';
}
function rowsSummary(rows) {
  const natural = rows.filter(x=>x.kind === 'natural' && ['win','loss'].includes(x.outcome));
  const wins = natural.filter(x=>x.outcome === 'win').length, losses = natural.length-wins;
  const abandoned = rows.filter(x=>x.kind === 'abandon').length;
  const interrupted = rows.filter(x=>x.kind === 'interrupted').length;
  const durations = rows.map(x=>x.durationMs).filter(x=>Number.isFinite(x) && x > 0).sort((a,b)=>a-b);
  return {
    games:rows.length,wins,losses,abandoned,interrupted,unknown:rows.length-natural.length-abandoned-interrupted,
    players:new Set(rows.map(x=>x.uid)).size,
    naturalRate:difficultyRate(wins,natural.length,natural.map(x=>({uid:x.uid,won:x.outcome==='win'}))),
    inclusiveRate:difficultyRate(wins,natural.length+abandoned+interrupted),
    abandonRate:difficultyRate(abandoned+interrupted,natural.length+abandoned+interrupted),
    averageDurationMs:durations.length ? durations.reduce((sum,x)=>sum+x,0)/durations.length : null,
    durationSamples:durations.length
  };
}
function policyKey(policy) { return ROUNDS.map(key=>`${policy?.[key]?.difficulty || '?'}/${policy?.[key]?.deckQuality || '?'}`).join('|'); }
function contextKey(observation, key) {
  if(key==='buildId' && observation?.buildChanged || key==='botVersion' && observation?.botVersionChanged)return 'mixed';
  return observation?.[key] || 'unknown';
}
function contextFilter(row, filters) {
  return (!filters.botVersion || row.botVersion === filters.botVersion)
    && (!filters.buildId || row.buildId === filters.buildId)
    && (!filters.experience || row.experience === filters.experience);
}
function retrySummary(losses, attempts, nowMs) {
  const byUser = new Map();
  for (const attempt of attempts) {
    if (!attempt.startedAtMs) continue;
    const list = byUser.get(attempt.uid) || []; list.push(attempt); byUser.set(attempt.uid,list);
  }
  for (const list of byUser.values()) list.sort((a,b)=>a.startedAtMs-b.startedAtMs);
  let eligible = 0, retried = 0, pending = 0, nextKnown = 0, nextWins = 0;
  for (const loss of losses) {
    if (!loss.atMs) continue;
    if (nowMs-loss.atMs < 7*DAY) { pending++; continue; }
    eligible++;
    const list=byUser.get(loss.uid) || [];
    let low=0,high=list.length;
    while(low<high){const middle=(low+high)>>>1;if(list[middle].startedAtMs<=loss.atMs)low=middle+1;else high=middle;}
    let next=list[low];if(next?.key===loss.key)next=list[low+1];
    if(next?.startedAtMs>loss.atMs+7*DAY)next=null;
    if (!next) continue;
    retried++;
    if (next.kind === 'natural' && ['win','loss'].includes(next.outcome)) { nextKnown++; nextWins += next.outcome === 'win' ? 1 : 0; }
  }
  return { eligible,retried,pending,rate:difficultyRate(retried,eligible),nextResultRate:difficultyRate(nextWins,nextKnown) };
}
export function buildDifficultyIndicators(input = {}, options = {}) {
  const nowMs = Number(options.nowMs) || Date.now();
  const filters = { fromMs:0,toMs:nowMs,botVersion:'',buildId:'',experience:'',rewardMode:'',policy:'',includeTests:false,...options };
  const inRange = ms => ms > 0 && ms >= filters.fromMs && ms < filters.toMs;
  const accounts = new Map((input.accounts || []).map(x=>[String(x.uid || x.id),x]));
  const excluded = new Set(input.excludedUids || []);
  const isEligible = uid => {
    if (!uid || excluded.has(uid)) return false;
    const account = accounts.get(uid);
    if (account?.isSystemBot || account?.systemRole === 'ambient_player') return false;
    return filters.includeTests || !!account && !(account.isAdmin || account.isTestAccount || account.isTest);
  };
  const sessions = new Map();
  for (const source of input.sessions || []) {
    const meta = parse(source.metaJson || source.meta), uid = String(source.ownerUid || source.uid || '');
    const mode = String(source.mode || meta.mode || '');
    if (!['solo','solo_reconnect'].includes(mode) || !isEligible(uid) || meta.guided === true || meta.difficultyObservation?.deckSource === 'guided') continue;
    const sourceId = id(source.soloGameId || meta.soloGameId || source.sessionId || source.id);
    if (!sourceId) continue;
    const key = `${uid}|${sourceId}`, entry = sessions.get(key) || { key,uid,levels:new Set(),versions:new Set(),builds:new Set(),startedAtMs:0,observation:null };
    const observation = storedObservation(meta.difficultyObservation);
    const level = enumValue(source.difficulty || meta.difficulty,LEVELS);
    if (level) entry.levels.add(level);
    if (observation?.botVersion) entry.versions.add(observation.botVersion);
    if (observation?.buildId) entry.builds.add(observation.buildId);
    const start = difficultyTime(source.startedAtClient || meta.startedAt || source.startedAt);
    if (start) entry.startedAtMs = entry.startedAtMs ? Math.min(start,entry.startedAtMs) : start;
    entry.observation ||= observation; sessions.set(key,entry);
  }
  const gameMap = new Map();
  // Result and economic receipts describe the same logical game; never add them.
  for (const [kind, sources] of [['result',input.soloResults || []],['reward',input.soloRewards || []]]) for (const source of sources) {
    const uid = String(source.uid || '');
    if (source.mode !== 'solo' || !isEligible(uid)) continue;
    const receipt = id(source.receiptId || String(source.id || '').replace(`${uid}_`,''));
    if (!receipt) continue;
    const key = `${uid}|${receipt}`, row = gameMap.get(key) || {key,uid};
    row[kind] = source; gameMap.set(key,row);
  }
  const games = [];
  let excludedGuided = 0, missingDates = 0;
  for (const entry of gameMap.values()) {
    const { result = {},reward = {} } = entry, session = sessions.get(entry.key);
    const observation = storedObservation(result.difficultyObservation || reward.difficultyObservation) || session?.observation;
    if (observation?.deckSource === 'guided') { excludedGuided++; continue; }
    const atMs = difficultyTime(result.createdAt || reward.createdAt || result.updatedAt);
    if (!atMs) missingDates++;
    const abandoned = result.abandoned === true || reward.abandoned === true || result.terminalKind === 'abandon' || reward.terminalKind === 'abandon';
    const interrupted = result.terminalKind === 'interrupted' || reward.terminalKind === 'interrupted';
    const sessionMixed = session?.levels.size > 1;
    const difficulty = observation?.difficultyChanged || sessionMixed ? 'mixed' : observation?.difficultyEnd || enumValue(reward.difficulty,LEVELS)
      || (session?.levels.size === 1 ? [...session.levels][0] : 'unknown');
    const row = { key:entry.key,uid:entry.uid,atMs,difficulty,
      outcome:abandoned || interrupted ? 'loss' : enumValue(result.result || reward.outcome,['win','loss']) || 'unknown',
      kind:interrupted ? 'interrupted' : abandoned ? 'abandon' : 'natural',
      startedAtMs:observation?.startedAtMs || session?.startedAtMs || 0,
      botVersion:session?.versions.size > 1 ? 'mixed' : contextKey(observation,'botVersion'),
      buildId:session?.builds.size > 1 ? 'mixed' : contextKey(observation,'buildId'),
      experience:experience(observation),deckQuality:observation?.deckQuality || 'unknown',
      durationMs:Number(result.durationMs ?? reward.durationMs) || null };
    games.push(row);
  }
  const selectedGames = games.filter(x=>inRange(x.atMs) && contextFilter(x,filters));
  const attempts = new Map(games.map(x=>[x.key,x]));
  for (const session of sessions.values()) {
    if (attempts.has(session.key)) continue;
    const row = {...session,botVersion:contextKey(session.observation,'botVersion'),buildId:contextKey(session.observation,'buildId'),experience:experience(session.observation)};
    attempts.set(row.key,row);
  }
  const soloRows = [...LEVELS,'mixed','unknown'].map(key=>{
    const selected = selectedGames.filter(x=>x.difficulty === key);
    return { key,...rowsSummary(selected),retries:retrySummary(selected.filter(x=>x.kind==='natural' && x.outcome==='loss'),[...attempts.values()],nowMs) };
  });
  const receiptMap = new Map();
  for (const receipt of input.roundReceipts || []) {
    if (!receipt.tournamentId || !receipt.matchId) continue;
    receiptMap.set(`${receipt.tournamentId}|${receipt.matchId}`,receipt);
  }
  const runs = [];
  const roundRows = [];
  for (const source of input.runs || []) {
    const uid = String(source.uid || ''); if (!isEligible(uid)) continue;
    const key = String(source.tournamentId || source.id || ''); if (!key) continue;
    const matches = Array.isArray(source.rounds) ? Object.fromEntries(source.rounds.flatMap(r=>(r.matches || []).map(m=>[m.id,m]))) : record(source.matches);
    const observations = [storedObservation(source.difficultyObservation)];
    for (const match of Object.values(matches)) observations.push(storedObservation(receiptMap.get(`${key}|${match.id}`)?.difficultyObservation));
    const versions = [...new Set(observations.map(x=>x?.botVersion).filter(Boolean))];
    const builds = [...new Set(observations.map(x=>x?.buildId).filter(Boolean))];
    const observation = observations[0];
    const run = { key,uid,atMs:difficultyTime(source.endedAt),startedAtMs:difficultyTime(source.createdAt),
      status:source.status || 'unknown',reason:source.eliminationReason || null,policy:record(source.policy),policyKey:policyKey(source.policy),
      botVersion:observations.some(x=>x?.botVersionChanged) || versions.length>1 ? 'mixed' : contextKey(observation,'botVersion'),
      buildId:observations.some(x=>x?.buildChanged) || builds.length>1 ? 'mixed' : contextKey(observation,'buildId'),
      experience:experience(observation),rewardMode:source.rewardEligible===true?'rewarded':source.rewardEligible===false?'practice':'unknown',reached:[true,false,false,false],
      kind:source.status === 'champion' || source.eliminationReason === 'match_loss' ? 'natural' : source.eliminationReason === 'interrupted_match' ? 'interrupted' : ['forfeit','tournament_abandon'].includes(source.eliminationReason) ? 'abandon' : 'unknown',
      outcome:source.status === 'champion' ? 'win' : source.status === 'eliminated' ? 'loss' : 'unknown' };
    const participant = match => [match.aEntrantId || matches[match.aFrom]?.winnerEntrantId,match.bEntrantId || matches[match.bFrom]?.winnerEntrantId].includes('player');
    for (const match of Object.values(matches).filter(participant)) {
      const round = match.roundKey, receipt = receiptMap.get(`${key}|${match.id}`);
      const roundIndex = ROUNDS.indexOf(round); if (roundIndex < 0) continue;
      run.reached[roundIndex] = true;
      const isInterrupted = source.eliminationReason === 'interrupted_match' && Number(source.currentRoundIndex) === roundIndex;
      if (match.status !== 'completed' && typeof receipt?.won !== 'boolean' && !isInterrupted) continue;
      const won = typeof receipt?.won === 'boolean' ? receipt.won : match.winnerEntrantId === 'player';
      const obs = storedObservation(receipt?.difficultyObservation || source.activeMatch?.difficultyObservation);
      roundRows.push({ key:`${key}|${match.id}`,runKey:key,uid,round,outcome:won ? 'win' : 'loss',
        kind:isInterrupted ? 'interrupted' : receipt?.forfeit || source.eliminationReason==='forfeit' && Number(source.currentRoundIndex)===roundIndex ? 'abandon' : 'natural',
        durationMs:Number(receipt?.durationMs) || null,difficulty:obs?.difficultyChanged ? 'mixed' : obs?.difficultyEnd || source.policy?.[round]?.difficulty || 'unknown',
        deckQuality:source.policy?.[round]?.deckQuality || 'unknown' });
      if (won && roundIndex < 3) run.reached[roundIndex+1] = true;
    }
    for (let i=1;i<4;i++) if (Number(source.currentRoundIndex)>=i) run.reached[i]=true;
    runs.push(run);
  }
  const selectRun = run => inRange(run.startedAtMs) && contextFilter(run,filters)
    && (!filters.policy || run.policyKey === filters.policy)
    && (!filters.rewardMode || filters.rewardMode === run.rewardMode);
  const selectedRuns = runs.filter(selectRun), selectedKeys = new Set(selectedRuns.map(x=>x.key));
  const closed = selectedRuns.filter(x=>['champion','eliminated'].includes(x.status));
  const naturalRuns = closed.filter(x=>x.kind==='natural');
  const champions = selectedRuns.filter(x=>x.status==='champion').length;
  const tournament = {
    started:selectedRuns.length,open:selectedRuns.filter(x=>x.status==='active').length,closed:closed.length,champions,
    defeated:closed.filter(x=>x.reason==='match_loss').length,abandoned:closed.filter(x=>x.kind==='abandon').length,
    interrupted:closed.filter(x=>x.kind==='interrupted').length,unknown:selectedRuns.filter(x=>!['active','champion','eliminated'].includes(x.status) || ['champion','eliminated'].includes(x.status) && x.kind==='unknown').length,
    players:new Set(selectedRuns.map(x=>x.uid)).size,
    perStartRate:difficultyRate(champions,selectedRuns.length),closedRate:difficultyRate(champions,closed.length),
    playedRate:difficultyRate(champions,naturalRuns.length,naturalRuns.map(x=>({uid:x.uid,won:x.status==='champion'}))),
    funnel:ROUNDS.map((key,i)=>({key,reached:selectedRuns.filter(x=>x.reached[i]).length})),
    rounds:ROUNDS.map(key=>({key,...rowsSummary(roundRows.filter(x=>x.round===key && selectedKeys.has(x.runKey))),
      combinations:[...new Set(roundRows.filter(x=>x.round===key && selectedKeys.has(x.runKey)).map(x=>`${x.difficulty}/${x.deckQuality}`))]})),
    rewards:['rewarded','practice','unknown'].map(key=>{const subset=selectedRuns.filter(x=>key===x.rewardMode);return {key,started:subset.length,champions:subset.filter(x=>x.status==='champion').length};}),
    retries:retrySummary(closed.filter(x=>x.reason==='match_loss'),runs,nowMs)
  };
  const contexts = [...games,...runs];
  const comparison=(solo,tours)=>({solo:rowsSummary(solo),tournaments:tours.length,
    championshipRate:difficultyRate(tours.filter(x=>x.status==='champion').length,tours.filter(x=>['champion','eliminated'].includes(x.status)).length)});
  const versions=[...new Set([...selectedGames,...selectedRuns].map(x=>x.botVersion))].sort().map(key=>({key,...comparison(selectedGames.filter(x=>x.botVersion===key),selectedRuns.filter(x=>x.botVersion===key))}));
  const week=ms=>{const date=new Date(ms-3*3600000);date.setUTCHours(0,0,0,0);date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);return date.getTime()+3*3600000;};
  const timeSeries=[...new Set([...selectedGames.map(x=>week(x.atMs)),...selectedRuns.map(x=>week(x.startedAtMs))])].sort((a,b)=>a-b).map(atMs=>({atMs,...comparison(selectedGames.filter(x=>week(x.atMs)===atMs),selectedRuns.filter(x=>week(x.startedAtMs)===atMs))}));
  return {
    schemaVersion:DIFFICULTY_INDICATORS_SCHEMA,generatedAtMs:nowMs,filters,
    solo:{rows:soloRows,total:rowsSummary(selectedGames),knownDifficulty:selectedGames.filter(x=>LEVELS.includes(x.difficulty)).length,
      mixed:selectedGames.filter(x=>x.difficulty==='mixed').length,unknownDifficulty:selectedGames.filter(x=>x.difficulty==='unknown').length,
      observationStarts:[...attempts.values()].filter(x=>inRange(x.startedAtMs)).length},
    tournaments:tournament,versions,timeSeries,
    options:{botVersions:[...new Set(contexts.map(x=>x.botVersion))].sort(),buildIds:[...new Set(contexts.map(x=>x.buildId))].sort(),
      policies:[...new Set(runs.map(x=>x.policyKey))].sort()},
    coverage:{soloReceiptGames:games.length,missingSoloDates:missingDates,excludedGuided,runs:runs.length,
      missingRunDates:runs.filter(x=>!x.startedAtMs).length,sessions:sessions.size,
      accountsMissing:new Set([...(input.soloResults||[]),...(input.soloRewards||[]),...(input.runs||[])].map(x=>String(x.uid||'')).filter(uid=>uid&&!accounts.has(uid))).size}
  };
}
