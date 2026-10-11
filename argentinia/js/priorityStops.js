// Argentinia 23.22.0 — Prioridad Inteligente Stage C.
// Preferencias LOCALES de paradas, nunca compartidas con Tano, Firestore ni recovery.
export const PRIORITY_STOP_KEYS = Object.freeze([
  'upkeep','draw','main1','combat_begin','combat_attackers',
  'combat_blockers','combat_damage','combat_end','main2','end_step'
]);
const ALLOWED = new Set(PRIORITY_STOP_KEYS);
export const PRIORITY_STOP_DOTS = Object.freeze({
  'dot-upkeep':'upkeep','dot-draw':'draw','dot-main1':'main1',
  'dot-main2':'main2','dot-end':'end_step'
});
export const COMBAT_STOP_PHASES = Object.freeze(PRIORITY_STOP_KEYS.filter(x=>x.startsWith('combat_')));
export function createPriorityStops({onChange=()=>{}}={}) {
  let stops = new Set();
  const emit = () => onChange([...stops]);
  return Object.freeze({
    get phases() { return [...stops]; },
    has(key) { return ALLOWED.has(key) && stops.has(key); },
    toggle(key) {
      if (!ALLOWED.has(key)) return false;
      if (stops.has(key)) stops.delete(key); else stops.add(key);
      emit();return true;
    },
    clear() { stops.clear();emit(); },
    reset() { stops.clear();emit(); }
  });
}
