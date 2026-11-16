import { canRedirectStackItem, replaceSingleStackTarget, singleStackTarget } from './stackRedirect.js';

export function redirectPlan(room, top, effect) {
  const index = room.stackState.findIndex((row,index)=>index < room.stackState.length-1 && row.id === top.target.stackId);
  const candidate = room.stackState[index];
  const valid = canRedirectStackItem(effect,candidate,top.controllerRole);
  return {index:valid ? index : -1,role:valid ? candidate.controllerRole : top.controllerRole,
    tax:valid ? effect.unlessPay || 0 : 0,draw:valid ? effect.drawAfter || 0 : 0};
}

export function redirectStep(plan,progress) {
  const {cursor,redirect,deadlineMs} = progress;
  if (!Number.isSafeInteger(deadlineMs) || !redirect || redirect.index !== plan.redirect.index ||
    !Array.isArray(redirect.rows) || cursor > 4) return null;
  if (cursor >= 1 && typeof redirect.taxPaid !== 'boolean') return null;
  if (cursor >= 2 && (!Object.hasOwn(redirect,'target') || !Number.isSafeInteger(redirect.ward) || redirect.ward < 0)) return null;
  if (cursor >= 3 && typeof redirect.wardPaid !== 'boolean') return null;
  if (cursor === 0) return {operation:plan.redirect.tax ? 'redirect-tax' : 'redirect-skip-tax',role:plan.redirect.tax ? plan.redirect.role : plan.authorityRole};
  if (cursor === 1) return {operation:!redirect.taxPaid && plan.redirect.index >= 0 ? 'redirect-target' : 'redirect-skip-target',role:plan.authorityRole};
  if (cursor === 2) return {operation:redirect.ward ? 'redirect-ward' : 'redirect-skip-ward',role:redirect.ward ? plan.redirect.role : plan.authorityRole};
  return {operation:cursor === 3 ? 'redirect-apply' : 'finish',role:plan.authorityRole};
}

export function redirectFinishingStack(room,plan,progress) {
  const stack = room.stackState.slice(0,-1);
  const {target,wardPaid} = progress.redirect;
  if (!target) return stack;
  const original = stack[plan.redirect.index];
  if (!wardPaid && original.card?.cannotBeCountered !== true) {
    stack.splice(plan.redirect.index,1);
  } else {
    stack[plan.redirect.index] = {...original,target:replaceSingleStackTarget(original.target,singleStackTarget(original),target)};
  }
  return stack;
}
