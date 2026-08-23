import assert from 'node:assert/strict';
import { computeCombatRouteGeometry } from '../js/combatMap.js';

const rect = (left, top, width=100, height=140) => ({ left, top, width, height, right:left+width, bottom:top+height });
const center = r => ({x:r.left+r.width/2,y:r.top+r.height/2});
const cubicMid = g => {
  const t=.5, mt=1-t;
  return {
    x: mt**3*g.start.x + 3*mt*mt*t*g.curve.c1.x + 3*mt*t*t*g.curve.c2.x + t**3*g.end.x,
    y: mt**3*g.start.y + 3*mt*mt*t*g.curve.c1.y + 3*mt*t*t*g.curve.c2.y + t**3*g.end.y
  };
};
const dot=(a,b)=>a.x*b.x+a.y*b.y;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const inside=(p,r)=>p.x>=r.left&&p.x<=r.right&&p.y>=r.top&&p.y<=r.bottom;

function checkPair(activePlayer, attackerRect, blockerRect) {
  const attackerSide=activePlayer==='local'?'local':'rival';
  const blockerSide=activePlayer==='local'?'rival':'local';
  const redRoute={kind:'attacker',source:{type:'combat',side:attackerSide,index:0},target:{type:'combat',side:blockerSide,index:0}};
  const blueRoute={kind:'blocker',source:{type:'combat',side:blockerSide,index:0},target:{type:'combat',side:attackerSide,index:0}};
  const red=computeCombatRouteGeometry({sourceRect:attackerRect,targetRect:blockerRect,route:redRoute,activePlayer,index:0});
  const blue=computeCombatRouteGeometry({sourceRect:blockerRect,targetRect:attackerRect,route:blueRoute,activePlayer,index:0});
  const a=center(attackerRect), b=center(blockerRect);
  const dx=b.x-a.x, dy=b.y-a.y, len=Math.hypot(dx,dy);
  const perp={x:-dy/len,y:dx/len};
  const axisMid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  const rm=cubicMid(red), bm=cubicMid(blue);
  const ro=dot(sub(rm,axisMid),perp);
  const bo=dot(sub(bm,axisMid),perp);
  assert.ok(ro*bo<0, `los carriles deben quedar en lados opuestos del eje: red=${ro}, blue=${bo}`);
  assert.ok(dist(rm,bm)>=75, `separación media insuficiente: ${dist(rm,bm)}`);
  assert.ok(dot(red.curve.canonicalPerp, blue.curve.canonicalPerp)>0.999, 'ambas rutas deben compartir el mismo perpendicular canónico');
  assert.ok(inside(red.start,attackerRect), 'la flecha roja debe nacer dentro del atacante');
  assert.ok(inside(red.end,blockerRect), 'la flecha roja debe terminar dentro del bloqueador');
  assert.ok(inside(blue.start,blockerRect), 'la flecha celeste debe nacer dentro del bloqueador');
  assert.ok(inside(blue.end,attackerRect), 'la flecha celeste debe terminar dentro del atacante');
  return {redOffset:ro,blueOffset:bo,midDistance:dist(rm,bm)};
}

const vertical=checkPair('local',rect(300,360),rect(315,160));
const diagonal=checkPair('local',rect(220,360),rect(390,170));
const rival=checkPair('rival',rect(390,170),rect(220,360));
console.log('COMBAT_MAP_CANONICAL_GEOMETRY_23_13_50_OK', {vertical,diagonal,rival});
