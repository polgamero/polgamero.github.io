// js/tournamentConfig.js — v23.20.0 Tournament policy mirror.
// The server remains authoritative. This mutable client mirror exists only so Admin and
// rules/fixture UI can show the active gameConfig/settings values without hardcoding balance.

export const TOURNAMENT_DEFAULT_CONFIG = Object.freeze({
  tournamentRewardedStartsPerDay: 1,
  tournamentNpcRandomnessPercent: 18,
  tournamentRound16Points: 100,
  tournamentRound16Packs: 0,
  tournamentRound16Difficulty: 'medium',
  tournamentRound16DeckQuality: 'good',
  tournamentQuarterPoints: 150,
  tournamentQuarterPacks: 0,
  tournamentQuarterDifficulty: 'medium',
  tournamentQuarterDeckQuality: 'strong',
  tournamentSemiPoints: 250,
  tournamentSemiPacks: 1,
  tournamentSemiDifficulty: 'hard',
  tournamentSemiDeckQuality: 'strong',
  tournamentFinalPoints: 500,
  tournamentFinalPacks: 2,
  tournamentFinalDifficulty: 'hard',
  tournamentFinalDeckQuality: 'elite'
});

export const TOURNAMENT_POLICY = { ...TOURNAMENT_DEFAULT_CONFIG };

const DIFFICULTIES = new Set(['easy','medium','hard']);
const QUALITIES = new Set(['good','strong','elite']);
function int(v, fallback, min=0, max=1_000_000){
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
function enumValue(v, allowed, fallback){
  const value = String(v || '').toLowerCase();
  return allowed.has(value) ? value : fallback;
}

export function applyTournamentConfig(config = {}) {
  const d = TOURNAMENT_DEFAULT_CONFIG;
  TOURNAMENT_POLICY.tournamentRewardedStartsPerDay = int(config.tournamentRewardedStartsPerDay, d.tournamentRewardedStartsPerDay, 0, 1000);
  TOURNAMENT_POLICY.tournamentNpcRandomnessPercent = int(config.tournamentNpcRandomnessPercent, d.tournamentNpcRandomnessPercent, 0, 100);
  for (const suffix of ['Round16','Quarter','Semi','Final']) {
    const pointsKey = `tournament${suffix}Points`;
    const packsKey = `tournament${suffix}Packs`;
    const difficultyKey = `tournament${suffix}Difficulty`;
    const qualityKey = `tournament${suffix}DeckQuality`;
    TOURNAMENT_POLICY[pointsKey] = int(config[pointsKey], d[pointsKey]);
    TOURNAMENT_POLICY[packsKey] = int(config[packsKey], d[packsKey], 0, 100);
    TOURNAMENT_POLICY[difficultyKey] = enumValue(config[difficultyKey], DIFFICULTIES, d[difficultyKey]);
    TOURNAMENT_POLICY[qualityKey] = enumValue(config[qualityKey], QUALITIES, d[qualityKey]);
  }
  return TOURNAMENT_POLICY;
}

export function getTournamentRoundConfig(roundKey) {
  const suffix = ({ round16:'Round16', quarter:'Quarter', semi:'Semi', final:'Final' })[roundKey];
  if (!suffix) return null;
  return {
    points: TOURNAMENT_POLICY[`tournament${suffix}Points`],
    packs: TOURNAMENT_POLICY[`tournament${suffix}Packs`],
    difficulty: TOURNAMENT_POLICY[`tournament${suffix}Difficulty`],
    deckQuality: TOURNAMENT_POLICY[`tournament${suffix}DeckQuality`]
  };
}
