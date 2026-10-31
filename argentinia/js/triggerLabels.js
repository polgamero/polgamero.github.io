// Presentation only. Event IDs and multiplayer snapshots are never rewritten.
export const TRIGGER_LABELS=Object.freeze({
  trigger:'habilidad disparada',ability:'habilidad',etb:'entrada al campo',creature_etb:'entrada de criatura',land_etb:'Arraigo',spell_cast:'hechizo lanzado',
  dies:'al morir',any_creature_dies:'muerte de criatura',opponent_death:'muerte rival',attack:'al atacar',any_creature_attacks:'ataque',block:'al bloquear',combat_damage:'daño de combate',upkeep:'mantenimiento',end_step:'paso final',
  permanent_entered:'entrada de permanente',creature_entered:'entrada de criatura',land_entered:'entrada de Tierra',permanent_left_battlefield:'salida del campo',creature_died:'muerte de criatura',permanent_sacrificed:'sacrificio',
  cast_from_exile:'hechizo lanzado desde el exilio',card_played_from_exile:'carta jugada desde el exilio',card_exiled:'carta exiliada',spell_cast_generic:'hechizo lanzado',
  attack_declared:'ataque declarado',block_declared:'bloqueo declarado',damage_dealt:'daño hecho',combat_damage_dealt:'daño de combate',
  card_drawn:'robo de carta',card_discarded:'descarte',life_gained:'vida ganada',life_lost:'vida perdida',counter_added:'contador agregado',counter_removed:'contador removido',token_created:'ficha creada',
  permanent_tapped:'permanente girado',permanent_untapped:'permanente enderezado',land_tapped_for_mana:'Tierra girada para producir maná',spell_countered:'hechizo contrarrestado',spell_copied:'hechizo copiado',ability_copied:'habilidad copiada',permanent_became_copy:'permanente copiado',permanent_transformed:'transformación',
  saga_chapter:'capítulo de Crónica',saga_chapter_triggered:'capítulo de Crónica',suspend_tick:'En espera — Tiempo',suspend_cast:'En espera — último Tiempo',creature_type_chosen:'tipo de criatura elegido',
  turn_started:'comienzo del turno',upkeep_started:'mantenimiento',combat_started:'comienzo del combate',end_step_started:'paso final',reanimate_etb:'entrada tras reanimar',return_etb:'entrada al volver'
});
export function formatTriggerLabel(label,type=label){
  if(Object.hasOwn(TRIGGER_LABELS,type))return TRIGGER_LABELS[type];
  if(Object.hasOwn(TRIGGER_LABELS,label))return TRIGGER_LABELS[label];
  const text=String(label||'').trim();
  return text&&!/^[a-z\d]+(?:_[a-z\d]+)+$/i.test(text)?text:'Habilidad disparada';
}
