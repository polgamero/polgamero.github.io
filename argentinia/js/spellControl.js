const kinds = ['coin_control_spell','exchange_spell_control'];

export function isSpellControlEffect(effect) {
  return kinds.includes(effect?.type);
}

export function isSpellObject(item) {
  return !!item?.card && item.type !== 'ability';
}

export function controlledObjectId(item) {
  return (item.targetObj || item.target)?.stackId ?? item.source?.eventStackId ?? null;
}

export function spellControlPlan(room,top,effect) {
  const index=room.stackState.findIndex((row,index)=>index < room.stackState.length-1 && row.id===controlledObjectId(top) && isSpellObject(row));
  const originalRole=room.stackState[index]?.controllerRole || null;
  const coin=effect.type==='coin_control_spell';
  return {index,coin,role:originalRole,recipient:coin ? top.controllerRole : originalRole==='host' ? 'guest' : 'host',
    sourceId:top.source?.sourceItemRef?.syncObjectId || top.sourceItemRef?.syncObjectId || null};
}

export function spellControlExchangeRole(room,plan) {
  if (!plan.control.sourceId) return null;
  for (const role of ['host','guest']) {
    for (const zone of ['Combat','Support','Planeswalkers','Lands']) {
      if ((room[role+zone] || []).some(item=>item._syncObjectId===plan.control.sourceId)) return role;
    }
  }
  return null;
}

export function spellControlApplies(room,plan,control) {
  if (spellControlIntent(plan,control)==='none') return false;
  if (plan.control.coin) return true;
  const sourceRole=spellControlExchangeRole(room,plan);
  return !!sourceRole && sourceRole!==plan.control.role;
}

export function spellControlStep(plan,progress) {
  const {cursor,control,deadlineMs}=progress;
  if (!control || control.index!==plan.control.index || !Number.isSafeInteger(deadlineMs) || cursor > 4) return null;
  if (cursor >= 1 && (!(control.outcome===null || typeof control.outcome==='boolean') ||
    (plan.control.coin && plan.control.index>=0 && (!control.coinId || typeof control.outcome!=='boolean')))) return null;
  if (cursor >= 3 && (!Array.isArray(control.wards) || !Array.isArray(control.rows) || !Object.hasOwn(control,'target'))) return null;
  if (cursor >= 3 && (!Number.isSafeInteger(control.wardIndex) || control.wardIndex < 0 || control.wardIndex > control.wards.length)) return null;
  if (cursor === 3 && control.wards.length && control.wardIndex >= control.wards.length) return null;
  if (cursor === 4 && typeof control.wardPaid !== 'boolean') return null;
  const operations = ['control-answer','control-present','control-targets','control-ward','finish'];
  return {operation:operations[cursor],role:cursor===3 && control.wards?.length ? plan.control.recipient : plan.authorityRole};
}

export function spellControlIntent(plan,control) {
  if (plan.control.index < 0 || control.outcome === null) return 'none';
  if (control.outcome) return 'transfer';
  return plan.control.coin ? 'counter' : 'none';
}

export function spellControlFinalStack(room,plan,control,applied) {
  const stack=room.stackState.slice(0,-1);
  if (!applied) return stack;
  const original=stack[plan.control.index];
  if (!original) return stack;
  if (spellControlIntent(plan,control)==='counter' || !control.wardPaid) {
    if (!original.card?.cannotBeCountered) { stack.splice(plan.control.index,1); return stack; }
    if (spellControlIntent(plan,control)==='counter') return stack;
  }
  if (spellControlIntent(plan,control)==='transfer') {
    stack[plan.control.index]={...original,controllerRole:plan.control.recipient,castRole:original.castRole || original.controllerRole,
      ...(!original.isCopy && !original.card._ownerRole ? {card:{...original.card,_ownerRole:original.controllerRole}} : {}),
      ...(control.target ? {target:control.target} : {})};
  }
  return stack;
}

export function matchCoinReceiptId(stackId,index=0) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(String(stackId)) || !Number.isSafeInteger(index) || index < 0 || index > 99) return null;
  return `${stackId}_${index}`;
}
