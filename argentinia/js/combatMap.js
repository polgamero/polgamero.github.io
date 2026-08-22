// js/combatMap.js — Entrega 23.13.38
// Mapa visual derivado del estado de combate. Presentation-only: no escribe estado, no sync,
// no altera asignación ni resolución de daño. Las líneas se reconstruyen después de cada render.
// @game-text-surface strict

function n(value) { return Math.max(0, Number(value) || 0); }

function unitKey(unit, side, index = -1) {
  const stable = unit?._syncObjectId || unit?._syncDescriptor?.syncObjectId || unit?.card?.instanceId || null;
  return stable ? `${side}:${stable}` : `${side}:idx:${index}:${unit?.card?.id || 'unknown'}`;
}

export function captureCombatPairs(state) {
  if (!state || !['combat_blockers', 'combat_damage'].includes(state.phase)) return [];
  const isLocalAttacking = state.activePlayer === 'local';
  const attackers = isLocalAttacking ? (state.localCombat || []) : (state.rivalCombat || []);
  const defenders = isLocalAttacking ? (state.rivalCombat || []) : (state.localCombat || []);
  const attackerSide = isLocalAttacking ? 'local' : 'rival';
  const defenderSide = isLocalAttacking ? 'rival' : 'local';
  return defenders.flatMap((blocker, blockerIndex) => {
    const attackerIndex = Number(blocker?.blockingIndex);
    if (!Number.isInteger(attackerIndex) || attackerIndex < 0 || attackerIndex >= attackers.length) return [];
    const attacker = attackers[attackerIndex];
    if (!attacker?.isAttacking) return [];
    return [{
      attackerKey: unitKey(attacker, attackerSide, attackerIndex),
      blockerKey: unitKey(blocker, defenderSide, blockerIndex)
    }];
  });
}

function remainingToughness(item, getToughness) {
  return Math.max(0, n(getToughness(item)) - n(item?.damageTaken));
}

function hasFlexibleAttackerAssignment({ state, attacker, blockers, hasKeyword }) {
  if (!blockers.length) return false;
  const trample = hasKeyword(attacker, 'trample');
  // El jugador atacante decide reparto si hay varios bloqueadores o Arrollar. En multiplayer
  // siempre hay un humano al otro lado; en Solitario, sólo el jugador local usa el modal.
  if (state?.currentMatch) return blockers.length > 1 || trample;
  return state?.activePlayer === 'local' && (blockers.length > 1 || trample);
}

function automaticAttackerDistribution(attacker, blockers, helpers) {
  const { getPower, getToughness, hasKeyword } = helpers;
  const power = n(getPower(attacker));
  const trample = hasKeyword(attacker, 'trample');
  const deathtouch = hasKeyword(attacker, 'deathtouch');
  let remaining = power;
  const creatureDamage = [];

  blockers.forEach((blocker, idx) => {
    const lethal = deathtouch ? (remainingToughness(blocker, getToughness) > 0 ? 1 : 0) : remainingToughness(blocker, getToughness);
    let assigned = Math.min(remaining, lethal);
    if (idx === blockers.length - 1 && remaining > 0 && !trample) assigned = remaining;
    creatureDamage.push(Math.max(0, assigned));
    remaining = Math.max(0, remaining - assigned);
  });

  return { creatureDamage, overflow: trample ? remaining : 0 };
}

function route(kind, source, target, amount, extra = {}) {
  return { kind, source, target, amount: Math.max(0, n(amount)), ...extra };
}

export function buildCombatMapModel(state, helpers = {}) {
  const getPower = helpers.getPower || (() => 0);
  const getToughness = helpers.getToughness || (() => 0);
  const hasKeyword = helpers.hasKeyword || (() => false);
  const getProtectionMatch = helpers.getProtectionMatch || (() => null);
  const regularOnly = !!helpers.regularOnly;
  const stablePairs = Array.isArray(helpers.stablePairs) ? helpers.stablePairs : null;

  if (!state || !['combat_blockers', 'combat_damage'].includes(state.phase)) return { visible: false, routes: [], flexible: false };

  const isLocalAttacking = state.activePlayer === 'local';
  const attackers = isLocalAttacking ? (state.localCombat || []) : (state.rivalCombat || []);
  const defenders = isLocalAttacking ? (state.rivalCombat || []) : (state.localCombat || []);
  const blockersDeclared = isLocalAttacking ? !!state.rivalBlockersDeclaredThisCombat : !!state.localBlockersDeclaredThisCombat;
  if (!blockersDeclared) return { visible: false, routes: [], flexible: false };

  const routes = [];
  let flexible = false;

  attackers.forEach((attacker, attackerIndex) => {
    if (!attacker?.isAttacking) return;
    const attackerSide = isLocalAttacking ? 'local' : 'rival';
    const defenderSide = isLocalAttacking ? 'rival' : 'local';
    const attackerKey = unitKey(attacker, attackerSide, attackerIndex);
    const pairedBlockerKeys = stablePairs
      ? new Set(stablePairs.filter(pair => pair.attackerKey === attackerKey).map(pair => pair.blockerKey))
      : null;
    const blockers = defenders
      .map((unit, index) => ({ unit, index }))
      .filter(entry => pairedBlockerKeys
        ? pairedBlockerKeys.has(unitKey(entry.unit, defenderSide, entry.index))
        : entry.unit?.blockingIndex == attackerIndex);

    const attackerDealsRegular = !regularOnly || !hasKeyword(attacker, 'firststrike') || hasKeyword(attacker, 'doublestrike');
    const attackerPower = attackerDealsRegular ? n(getPower(attacker)) : 0;
    const wasBlocked = !!attacker.wasBlockedThisCombat || blockers.length > 0;
    const targetSide = isLocalAttacking ? 'rival' : 'local';

    // Daño de cada bloqueador hacia el atacante: el destino es inequívoco. Si estamos en la
    // ventana entre iniciativa y daño regular, sólo mostramos quienes efectivamente pegan en
    // el paso regular.
    blockers.forEach(({ unit: blocker, index: blockerIndex }) => {
      const blockerDealsRegular = !regularOnly || !hasKeyword(blocker, 'firststrike') || hasKeyword(blocker, 'doublestrike');
      const amount = blockerDealsRegular ? n(getPower(blocker)) : 0;
      if (amount <= 0) return;
      const prevented = !!getProtectionMatch(attacker, blocker?.card?.colors || []);
      routes.push(route('blocker',
        { type: 'combat', side: targetSide, index: blockerIndex },
        { type: 'combat', side: isLocalAttacking ? 'local' : 'rival', index: attackerIndex },
        amount,
        { prevented, labelTarget: attacker?.card?.name || '' }
      ));
    });

    if (attackerPower <= 0) return;

    if (!wasBlocked) {
      if (attacker.attackTarget) {
        routes.push(route('attacker',
          { type: 'combat', side: isLocalAttacking ? 'local' : 'rival', index: attackerIndex },
          { type: 'planeswalker', side: targetSide, item: attacker.attackTarget },
          attackerPower,
          { playerName: attacker.attackTarget?.card?.name || '' }
        ));
      } else {
        routes.push(route('attacker',
          { type: 'combat', side: isLocalAttacking ? 'local' : 'rival', index: attackerIndex },
          { type: 'player', side: targetSide },
          attackerPower,
          { playerTarget: true }
        ));
      }
      return;
    }

    // Si todos los bloqueadores desaparecieron antes del daño, un atacante bloqueado sólo
    // llega al jugador si tiene Arrollar.
    if (!blockers.length) {
      if (hasKeyword(attacker, 'trample')) {
        const target = attacker.attackTarget
          ? { type: 'planeswalker', side: targetSide, item: attacker.attackTarget }
          : { type: 'player', side: targetSide };
        routes.push(route('attacker',
          { type: 'combat', side: isLocalAttacking ? 'local' : 'rival', index: attackerIndex },
          target,
          attackerPower,
          { playerTarget: !attacker.attackTarget, playerName: attacker.attackTarget?.card?.name || '' }
        ));
      }
      return;
    }

    const blockerUnits = blockers.map(entry => entry.unit);
    const flexibleAssignment = hasFlexibleAttackerAssignment({ state, attacker, blockers: blockerUnits, hasKeyword });
    if (flexibleAssignment) {
      flexible = true;
      blockers.forEach(({ unit: blocker, index: blockerIndex }) => {
        routes.push(route('attacker',
          { type: 'combat', side: isLocalAttacking ? 'local' : 'rival', index: attackerIndex },
          { type: 'combat', side: targetSide, index: blockerIndex },
          0,
          { flexible: true, labelTarget: blocker?.card?.name || '' }
        ));
      });
      if (hasKeyword(attacker, 'trample')) {
        routes.push(route('attacker',
          { type: 'combat', side: isLocalAttacking ? 'local' : 'rival', index: attackerIndex },
          attacker.attackTarget ? { type: 'planeswalker', side: targetSide, item: attacker.attackTarget } : { type: 'player', side: targetSide },
          0,
          { flexible: true, playerTarget: !attacker.attackTarget, playerName: attacker.attackTarget?.card?.name || '' }
        ));
      }
      return;
    }

    const distribution = automaticAttackerDistribution(attacker, blockerUnits, { getPower, getToughness, hasKeyword });
    blockers.forEach(({ unit: blocker, index: blockerIndex }, idx) => {
      const amount = distribution.creatureDamage[idx] || 0;
      if (amount <= 0) return;
      const prevented = !!getProtectionMatch(blocker, attacker?.card?.colors || []);
      routes.push(route('attacker',
        { type: 'combat', side: isLocalAttacking ? 'local' : 'rival', index: attackerIndex },
        { type: 'combat', side: targetSide, index: blockerIndex },
        amount,
        { prevented, labelTarget: blocker?.card?.name || '' }
      ));
    });
    if (distribution.overflow > 0) {
      routes.push(route('attacker',
        { type: 'combat', side: isLocalAttacking ? 'local' : 'rival', index: attackerIndex },
        attacker.attackTarget ? { type: 'planeswalker', side: targetSide, item: attacker.attackTarget } : { type: 'player', side: targetSide },
        distribution.overflow,
        { playerTarget: !attacker.attackTarget, playerName: attacker.attackTarget?.card?.name || '' }
      ));
    }
  });

  return { visible: routes.length > 0, routes, flexible };
}

function centerOf(rect) { return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; }

function endpointBetween(sourceRect, targetRect) {
  const a = centerOf(sourceRect), b = centerOf(targetRect);
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / len, uy = dy / len;
  const sourceInset = Math.min(sourceRect.width, sourceRect.height) * 0.38;
  const targetInset = Math.min(targetRect.width, targetRect.height) * 0.38;
  return {
    start: { x: a.x + ux * sourceInset, y: a.y + uy * sourceInset },
    end: { x: b.x - ux * targetInset, y: b.y - uy * targetInset }
  };
}

function findPlaneswalkerElement(item, side) {
  const container = document.getElementById(side === 'local' ? 'local-planeswalkers' : 'rival-planeswalkers');
  if (!container) return null;
  const syncId = item?._syncObjectId || item?._syncDescriptor?.syncObjectId || null;
  if (syncId) {
    const escaped = (globalThis.CSS?.escape ? CSS.escape(syncId) : syncId.replace(/"/g, '\\"'));
    const found = container.querySelector(`[data-sync-object-id="${escaped}"]`);
    if (found) return found;
  }
  const cardId = item?.card?.id || null;
  if (cardId) return [...container.children].find(el => el.dataset.cardId === String(cardId)) || null;
  return null;
}

function resolveElement(ref) {
  if (!ref) return null;
  if (ref.type === 'combat') {
    const container = document.getElementById(ref.side === 'local' ? 'local-combat' : 'rival-combat');
    return container?.children?.[Number(ref.index)] || null;
  }
  if (ref.type === 'player') {
    return ref.side === 'local'
      ? (document.getElementById('local-player-name') || document.querySelector('.player-card.local-card'))
      : (document.querySelector('.rival-card .player-info h3') || document.querySelector('.player-card.rival-card'));
  }
  if (ref.type === 'planeswalker') return findPlaneswalkerElement(ref.item, ref.side);
  return null;
}

function playerNameForSide(side, getLocalPlayerName, getRivalName) {
  return side === 'local' ? getLocalPlayerName() : getRivalName();
}

function damageWidth(amount) {
  return Math.max(2.2, Math.min(14, 1.6 + n(amount) * 1.25));
}

function curveControl(start, end, index, kind) {
  const mx = (start.x + end.x) / 2, my = (start.y + end.y) / 2;
  const dx = end.x - start.x, dy = end.y - start.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const px = -dy / len, py = dx / len;
  const direction = kind === 'attacker' ? 1 : -1;
  const magnitude = direction * (14 + (index % 4) * 5);
  return { x: mx + px * magnitude, y: my + py * magnitude };
}

function makeSvgEl(name, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
  return el;
}

let scheduled = 0;
let rememberedCombatKey = null;
let rememberedPairs = null;

function stablePairsForState(state) {
  if (!state || !['combat_blockers', 'combat_damage'].includes(state.phase)) {
    rememberedCombatKey = null;
    rememberedPairs = null;
    return null;
  }
  const blockersDeclared = state.activePlayer === 'local'
    ? !!state.rivalBlockersDeclaredThisCombat
    : !!state.localBlockersDeclaredThisCombat;
  if (!blockersDeclared) return null;
  const key = `${state.turnCount || 0}:${state.activePlayer}`;
  if (rememberedCombatKey !== key || !rememberedPairs) {
    rememberedCombatKey = key;
    rememberedPairs = captureCombatPairs(state);
  }
  return rememberedPairs;
}

export function removeCombatMap() {
  if (scheduled) cancelAnimationFrame(scheduled);
  scheduled = 0;
  document.getElementById('combat-map-overlay')?.remove();
  document.getElementById('combat-map-legend')?.remove();
}

export function scheduleCombatMapRender({ state, getPower, getToughness, hasKeyword, getProtectionMatch, getLocalPlayerName, getRivalName, regularOnly = false, gameText } = {}) {
  if (scheduled) cancelAnimationFrame(scheduled);
  scheduled = requestAnimationFrame(() => {
    scheduled = 0;
    renderCombatMap({ state, getPower, getToughness, hasKeyword, getProtectionMatch, getLocalPlayerName, getRivalName, regularOnly, gameText });
  });
}

export function renderCombatMap({ state, getPower, getToughness, hasKeyword, getProtectionMatch, getLocalPlayerName = () => 'Vos', getRivalName = () => 'Rival', regularOnly = false, gameText = key => key } = {}) {
  document.getElementById('combat-map-overlay')?.remove();
  document.getElementById('combat-map-legend')?.remove();
  const stablePairs = stablePairsForState(state);
  const model = buildCombatMapModel(state, { getPower, getToughness, hasKeyword, getProtectionMatch, regularOnly, stablePairs });
  if (!model.visible) return model;

  const width = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const height = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  const svg = makeSvgEl('svg', { id: 'combat-map-overlay', width, height, viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true' });
  svg.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:7000;pointer-events:none;overflow:visible;';

  const defs = makeSvgEl('defs');
  const marker = (id, color) => {
    const m = makeSvgEl('marker', { id, markerWidth: 9, markerHeight: 9, refX: 7.2, refY: 4.5, orient: 'auto', markerUnits: 'strokeWidth' });
    m.appendChild(makeSvgEl('path', { d: 'M0,0 L9,4.5 L0,9 z', fill: color }));
    return m;
  };
  defs.appendChild(marker('combat-arrow-red', '#ef4444'));
  defs.appendChild(marker('combat-arrow-blue', '#38bdf8'));
  svg.appendChild(defs);

  const validRoutes = model.routes.map((r, index) => {
    const sourceEl = resolveElement(r.source), targetEl = resolveElement(r.target);
    if (!sourceEl || !targetEl) return null;
    const sr = sourceEl.getBoundingClientRect(), tr = targetEl.getBoundingClientRect();
    if (!sr.width || !sr.height || !tr.width || !tr.height) return null;
    const { start, end } = endpointBetween(sr, tr);
    const control = curveControl(start, end, index, r.kind);
    return { ...r, index, start, end, control };
  }).filter(Boolean);

  validRoutes.forEach(r => {
    const color = r.kind === 'attacker' ? '#ef4444' : '#38bdf8';
    const markerId = r.kind === 'attacker' ? 'combat-arrow-red' : 'combat-arrow-blue';
    const path = makeSvgEl('path', {
      d: `M ${r.start.x.toFixed(1)} ${r.start.y.toFixed(1)} Q ${r.control.x.toFixed(1)} ${r.control.y.toFixed(1)} ${r.end.x.toFixed(1)} ${r.end.y.toFixed(1)}`,
      fill: 'none', stroke: color,
      'stroke-width': r.flexible ? 2.2 : damageWidth(r.amount),
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      opacity: r.prevented ? 0.42 : (r.flexible ? 0.72 : 0.88),
      'marker-end': `url(#${markerId})`
    });
    if (r.flexible || r.prevented) path.setAttribute('stroke-dasharray', r.flexible ? '8 7' : '3 6');
    svg.appendChild(path);

    const t = 0.5;
    const lx = (1-t)*(1-t)*r.start.x + 2*(1-t)*t*r.control.x + t*t*r.end.x;
    const ly = (1-t)*(1-t)*r.start.y + 2*(1-t)*t*r.control.y + t*t*r.end.y;
    const label = r.flexible
      ? gameText('combat.map.pending')
      : r.prevented
        ? gameText('combat.map.prevented', { damage: r.amount })
        : r.playerTarget
          ? gameText('combat.map.playerDamage', { damage: r.amount, player: playerNameForSide(r.target.side, getLocalPlayerName, getRivalName) })
          : r.playerName
            ? gameText('combat.map.playerDamage', { damage: r.amount, player: r.playerName })
            : String(r.amount);
    if (!label) return;
    const group = makeSvgEl('g');
    const text = makeSvgEl('text', { x: lx, y: ly, fill: '#fff', 'font-size': 12, 'font-weight': 800, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    text.textContent = label;
    group.appendChild(text);
    svg.appendChild(group);
    const box = text.getBBox();
    const bg = makeSvgEl('rect', { x: box.x - 5, y: box.y - 3, width: box.width + 10, height: box.height + 6, rx: 7, fill: 'rgba(4,8,6,.86)', stroke: color, 'stroke-width': 1 });
    group.insertBefore(bg, text);
  });

  if (validRoutes.length) {
    const legend = document.createElement('div');
    legend.id = 'combat-map-legend';
    legend.style.cssText = 'position:fixed;left:50%;bottom:82px;transform:translateX(-50%);z-index:7001;pointer-events:none;background:rgba(4,8,6,.82);border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:5px 11px;color:#e8e5dc;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,.35);';
    legend.textContent = model.flexible ? gameText('combat.map.legendFlexible') : gameText('combat.map.legend');
    document.body.appendChild(legend);
    svg.dataset.legendId = legend.id;
  }

  document.body.appendChild(svg);
  return model;
}
