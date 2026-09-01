// js/publicTerminology.js — Argentinia 23.19.4.14
// Diccionario público owner-approved de Wave 4.
// IMPORTANTE: presentation-only. NO renombra effect.type, keyword IDs, counter keys,
// triggerType ni otros contratos internos del motor.

export const PUBLIC_TERMINOLOGY_VERSION = '23.19.4.14';

export const PUBLIC_KEYWORD_LABELS = Object.freeze({
  flying: 'Vuela',
  trample: 'Arrolla',
  hexproof: 'Intocable',
  haste: 'Apuro',
  menace: 'Intimidante',
  vigilance: 'Alerta',
  reach: 'Alcance',
  defender: 'Muralla',
  lifelink: 'Absorción',
  deathtouch: 'Letal',
  firststrike: 'Iniciativa',
  doublestrike: 'Dos golpes',
  indestructible: 'Irrompible',
  flash: 'Al toque',
  infect: 'Contagio',
  protection_W: 'Protección de Blanco',
  protection_U: 'Protección de Azul',
  protection_B: 'Protección de Negro',
  protection_R: 'Protección de Rojo',
  protection_G: 'Protección de Verde'
});

export function publicKeywordLabel(keyword) {
  const k = String(keyword || '');
  if (k.startsWith('ward_')) return `Impuesto ${k.slice(5)}`;
  return PUBLIC_KEYWORD_LABELS[k] || k;
}

// Los tipos crudos se conservan por compatibilidad del motor/recovery. Sólo cambia su presentación.
export function publicCardTypeLine(rawType) {
  return String(rawType || '')
    .replace(/\bPlaneswalker\b/gi, 'Semidiós')
    .replace(/\bSagas\b/g, 'Crónicas')
    .replace(/\bSaga\b/g, 'Crónica')
    .replace(/\bAuras\b/g, 'Encantos')
    .replace(/\bAura\b/g, 'Encanto')
    .replace(/\bVehículos\b/g, 'Transportes')
    .replace(/\bVehículo\b/g, 'Transporte');
}

const LOWERCASE_REPLACEMENTS = Object.freeze([
  [/\bproliferar(?=$|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_])/g, 'amplificar'], [/\bproliferaron(?=$|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_])/g, 'amplificaron'], [/\bproliferó(?=$|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_])/g, 'amplificó'],
  [/\bsuspender\b/g, 'poner en espera'], [/\bsuspendida\b/g, 'en espera'], [/\bsuspendido\b/g, 'en espera'],
  [/\badiviná(?=$|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_])/g, 'anticipá'], [/\badivina\b/g, 'anticipá'], [/\badivinar\b/g, 'anticipar'],
  [/\bvigilá(?=$|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_])/g, 'chusmeá'], [/\bvigila\b/g, 'chusmeá'], [/\bvigilar\b/g, 'chusmear'],
  [/\bconvocar\b/g, 'vaquita'], [/\bexcavar\b/g, 'rebuscar'],
  [/\bkicker\b/g, 'yapa'], [/\bflashback\b/g, 'otra vuelta'], [/\bescape\b/g, 'zafar'],
  [/\bward\b/g, 'impuesto'], [/\blandfall\b/g, 'arraigo']
]);

const REPLACEMENTS = Object.freeze([
  [/\bPlaneswalkers\b/g, 'Semidioses'],
  [/\bPlaneswalker\b/g, 'Semidiós'],
  [/\bLealtad\b/g, 'Creencia'],
  [/\bSagas\b/g, 'Crónicas'],
  [/\bSaga\b/g, 'Crónica'],
  [/\bLore\b/g, 'Capítulo'],
  [/\bAuras\b/g, 'Encantos'],
  [/\bAura\b/g, 'Encanto'],
  [/\bVehículos\b/g, 'Transportes'],
  [/\bVehículo\b/g, 'Transporte'],
  [/\bVigilancia\b/g, 'Alerta'],
  [/\bPrisa\b/g, 'Apuro'],
  [/\bAmenaza\b/g, 'Intimidante'],
  [/\bVínculo vital\b/gi, 'Absorción'],
  [/\bToque mortal\b/gi, 'Letal'],
  [/\bInfectar\b/g, 'Contagio'],
  [/\bDestello\b/g, 'Al toque'],
  [/\bPrimer golpe\b/gi, 'Iniciativa'],
  [/\bDoble golpe\b/gi, 'Dos golpes'],
  [/\bWard\b/g, 'Impuesto'],
  [/\bDefensora\b/g, 'Muralla'],
  [/\bDefensor\b/g, 'Muralla'],
  [/\bIndestructible\b/g, 'Irrompible'],
  [/\bLandfall\b/g, 'Arraigo'],
  [/\bAdiviná(?=$|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_])/g, 'Anticipá'],
  [/\bAdivina\b/g, 'Anticipá'],
  [/\bAdivinar\b/g, 'Anticipar'],
  [/\bScry\b/g, 'Anticipar'],
  [/\bVigilá(?=$|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_])/g, 'Chusmeá'],
  [/\bVigila\b/g, 'Chusmeá'],
  [/\bVigilar\b/g, 'Chusmear'],
  [/\bSurveil\b/g, 'Chusmear'],
  [/\bProliferá(?=$|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_])/g, 'Amplificá'],
  [/\bProlifera\b/g, 'Amplificá'],
  [/\bProliferar\b/g, 'Amplificar'],
  [/\bKicker\b/g, 'Yapa'],
  [/\bKickeado\b/g, 'con Yapa'],
  [/\bkickeado\b/g, 'con Yapa'],
  [/\bFlashback\b/g, 'Otra vuelta'],
  [/\bEscape\b/g, 'Zafar'],
  [/\bSuspender\b/g, 'Poner en espera'],
  [/\bsuspender\b/g, 'poner en espera'],
  [/\bSuspendida\b/g, 'En espera'],
  [/\bsuspendida\b/g, 'en espera'],
  [/\bSuspendido\b/g, 'En espera'],
  [/\bsuspendido\b/g, 'en espera'],
  [/\bSuspend\b/g, 'En espera'],
  [/\bConvoke\b/g, 'Vaquita'],
  [/\bConvocar\b/g, 'Vaquita'],
  [/\bAfinidad por\b/g, 'Conexión con'],
  [/\bAffinity for\b/gi, 'Conexión con'],
  [/\bAffinity\b/g, 'Conexión'],
  [/\bDelve\b/g, 'Rebuscar'],
  [/\bExcavar\b/g, 'Rebuscar']
]);

export function publicTerminologyText(value) {
  let out = String(value ?? '');
  for (const [pattern, replacement] of LOWERCASE_REPLACEMENTS) out = out.replace(pattern, replacement);
  for (const [pattern, replacement] of REPLACEMENTS) out = out.replace(pattern, replacement);
  return out;
}

export const OWNER_APPROVED_PUBLIC_DICTIONARY = Object.freeze({
  Planeswalker:'Semidiós', Lealtad:'Creencia', Saga:'Crónica', Lore:'Capítulo', Aura:'Encanto',
  Vehículo:'Transporte', Tripular:'Tripular', Equipamiento:'Equipamiento', Equipar:'Equipar', Transformar:'Transformar',
  Vuela:'Vuela', Arrolla:'Arrolla', Vigilancia:'Alerta', Prisa:'Apuro', Amenaza:'Intimidante', Alcance:'Alcance',
  'Vínculo vital':'Absorción', 'Toque mortal':'Letal', Infectar:'Contagio', Destello:'Al toque',
  'Primer golpe':'Iniciativa', 'Doble golpe':'Dos golpes', Intocable:'Intocable', Ward:'Impuesto',
  Defensora:'Muralla', Indestructible:'Irrompible', Protección:'Protección', Landfall:'Arraigo',
  Adiviná:'Anticipá', Surveil:'Chusmeá', Proliferá:'Amplificá', Kicker:'Yapa', Flashback:'Otra vuelta',
  Escape:'Zafar', Suspend:'En espera', Convocar:'Vaquita', Afinidad:'Conexión', Excavar:'Rebuscar',
  Pelea:'Pelea', Escudo:'Escudo', Aturdimiento:'Aturdimiento', Tiempo:'Tiempo', Carga:'Carga', Veneno:'Veneno'
});
