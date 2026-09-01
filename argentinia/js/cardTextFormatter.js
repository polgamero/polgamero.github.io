import { PUBLIC_KEYWORD_LABELS, publicKeywordLabel, publicTerminologyText } from './publicTerminology.js';
// js/cardTextFormatter.js — Argentinia 23.15.5.3
// Normalización de presentation text para cards. No altera reglas ni estado de juego.
// Convierte el texto legacy de cada JSON en una jerarquía visual propia de Argentinia:
// keywords impresas/efectivas -> habilidades/reglas en párrafos -> flavor al final.

export const CARD_KEYWORD_LABELS = PUBLIC_KEYWORD_LABELS;

const KEYWORD_TEXT_ALIASES = Object.freeze({
  flying: ['Vuela', 'Volar'],
  trample: ['Arrolla', 'Arrollar'],
  hexproof: ['Intocable'],
  haste: ['Apuro', 'Prisa'],
  menace: ['Intimidante', 'Amenaza'],
  vigilance: ['Alerta', 'Vigilancia'],
  reach: ['Alcance'],
  defender: ['Muralla', 'Defensora', 'Defensor'],
  lifelink: ['Absorción', 'Vínculo vital'],
  deathtouch: ['Letal', 'Toque Mortal', 'Toque mortal'],
  firststrike: ['Iniciativa', 'Primer golpe'],
  doublestrike: ['Dos golpes', 'Doble golpe'],
  indestructible: ['Irrompible', 'Indestructible'],
  flash: ['Al toque', 'Destello'],
  infect: ['Contagio', 'Infectar'],
  protection_W: ['Protección de Blanco'],
  protection_U: ['Protección de Azul'],
  protection_B: ['Protección de Negro'],
  protection_R: ['Protección de Rojo'],
  protection_G: ['Protección de Verde']
});

export function cardKeywordLabel(keyword) {
  return publicKeywordLabel(keyword);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stripDuplicatedLeadingKeywords(text, keywords = []) {
  let out = String(text || '').trim();
  if (!out) return '';

  const aliases = [];
  for (const keyword of keywords || []) {
    const k = String(keyword || '');
    if (k.startsWith('ward_')) {
      const n = escapeRegExp(k.slice(5));
      aliases.push(`(?:Impuesto|Ward)\\s*\\{?${n}\\}?`);
      continue;
    }
    for (const label of KEYWORD_TEXT_ALIASES[k] || []) aliases.push(escapeRegExp(label));
  }
  if (!aliases.length) return out;

  // Sólo retira keywords impresas repetidas al COMIENZO del rules text. Si una palabra
  // aparece dentro de una habilidad real no se toca.
  const duplicate = new RegExp(`^(?:${aliases.join('|')})\\s*[.,]\\s*`, 'i');
  let previous;
  do {
    previous = out;
    out = out.replace(duplicate, '').trimStart();
  } while (out !== previous);
  return out;
}

function splitOutsideParentheses(text) {
  const chunks = [];
  let buf = '';
  let depth = 0;
  let quote = null;

  const flush = () => {
    const value = buf.trim();
    if (value) chunks.push(value);
    buf = '';
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if ((ch === '"' || ch === '“' || ch === '”') && depth === 0) {
      if (!quote) quote = ch;
      else if (ch === quote || (quote === '“' && ch === '”')) quote = null;
    }
    if (!quote) {
      if (ch === '(') depth += 1;
      else if (ch === ')' && depth > 0) depth -= 1;
    }
    buf += ch;

    if (ch !== '.' || depth !== 0 || quote) continue;
    const rest = text.slice(i + 1);
    const next = rest.match(/^\s*(\S)/)?.[1];
    if (!next) {
      flush();
      continue;
    }
    // Un punto seguido por un nuevo símbolo/coste, viñeta o mayúscula suele separar
    // habilidades/sentencias en el texto legacy. No dividimos decimales.
    const prev = text[i - 1] || '';
    if (/\d/.test(prev) && /\d/.test(next)) continue;
    if (next === '{' || next === '•' || /[A-ZÁÉÍÓÚÑ¡¿]/.test(next)) flush();
  }
  flush();
  return chunks;
}

function normalizeModalText(text) {
  const source = String(text || '').replace(/\r/g, '').trim();
  if (!source.includes('•')) return null;
  const [head, ...rawModes] = source.split('•');
  const header = head.trim();
  const modes = rawModes.map(x => x.trim()).filter(Boolean);
  if (!modes.length) return null;
  return [
    ...(header ? [{ kind: 'mode-header', text: header }] : []),
    ...modes.map(textValue => ({ kind: 'mode-option', text: `• ${textValue}` }))
  ];
}

function parseAbilityWord(text) {
  const m = String(text || '').match(/^([^—–]{2,40})\s*[—–]\s*(.+)$/);
  if (!m) return { text: String(text || '') };
  const word = m[1].trim();
  const rest = m[2].trim();
  // Landfall y los nombres de habilidades temáticas existentes son presentation-only.
  // Escape usa guion como sintaxis de coste y no es ability word.
  if (/^(?:Escape|Zafar)$/i.test(word) || /^Elegí uno$/i.test(word)) return { text: String(text || '') };
  return { abilityWord: word, text: rest };
}

function hasParentheticalReminder(text) {
  return /\([^)]{18,}\)/.test(String(text || ''));
}

function reminderForRulesText(text) {
  const value = String(text || '');
  if (hasParentheticalReminder(value)) return '';

  let m = value.match(/\b(?:Anticipá|Anticipa|Adiviná|Adivina|Scry)\s+(\d+)\b/i);
  if (m) {
    const n = Number(m[1]);
    return `Mirá ${n === 1 ? 'la primera carta' : `las ${n} primeras cartas`} de tu biblioteca. Poné cualquier cantidad de ellas en el fondo de tu biblioteca y el resto arriba en cualquier orden.`;
  }

  m = value.match(/\b(?:Chusmeá|Chusmea|Vigilá|Vigila|Surveil)\s+(\d+)\b/i);
  if (m) {
    const n = Number(m[1]);
    return `Mirá ${n === 1 ? 'la primera carta' : `las ${n} primeras cartas`} de tu biblioteca. Podés poner cualquier cantidad de ellas en tu cementerio y el resto arriba en cualquier orden.`;
  }

  if (/(?:Amplific(?:á|a)|Prolifer(?:á|a))/i.test(value)) {
    return 'Elegí cualquier cantidad de permanentes y/o jugadores con contadores. Poné sobre cada uno otro contador de cada tipo que ya tenga.';
  }

  m = value.match(/\bTripular\s*\{?(\d+)\}?\b/i);
  if (m) {
    const n = Number(m[1]);
    return `Girás cualquier cantidad de otras criaturas enderezadas que controlás con fuerza total de ${n} o más: este Transporte se convierte en una criatura artefacto hasta el final del turno.`;
  }

  m = value.match(/\b(?:Yapa|Kicker)\s+((?:\{[^}]+\})+)/i);
  if (m) return `Podés pagar ${m[1]} adicional al lanzar este hechizo.`;

  m = value.match(/\b(?:Otra vuelta|Flashback)\s+((?:\{[^}]+\})+)/i);
  if (m) return `Podés lanzar esta carta desde tu cementerio pagando ${m[1]} en vez de su coste de maná. Luego exiliala.`;

  if (/\b(?:Zafar|Escape)\b/i.test(value)) {
    return 'Podés lanzar esta carta desde tu cementerio pagando su coste de Zafar y exiliando las cartas indicadas.';
  }

  if (/\b(?:Vaquita|Convoke|Convocar)\b/i.test(value)) {
    return 'Tus criaturas pueden ayudar a lanzar este hechizo. Cada criatura que gires al lanzarlo paga {1} o un maná de uno de sus colores.';
  }

  if (/\b(?:Rebuscar|Delve|Excavar)\b/i.test(value)) {
    return 'Cada carta que exilies de tu cementerio al lanzar este hechizo paga {1} de su coste genérico.';
  }

  if (/\b(?:Conexión|Affinity|Afinidad)\b/i.test(value)) {
    return 'Este hechizo cuesta {1} menos por cada permanente del tipo indicado que controlás.';
  }

  return '';
}

export function keywordReminder(keyword) {
  const k = String(keyword || '');
  if (k === 'infect') {
    return 'Esta criatura hace daño a criaturas en forma de contadores -1/-1 y a jugadores en forma de contadores de Veneno.';
  }
  if (k === 'menace') {
    return 'Esta criatura no puede ser bloqueada excepto por dos o más criaturas.';
  }
  if (k.startsWith('ward_')) {
    const n = Math.max(0, Number(k.slice(5)) || 0);
    return `Siempre que este permanente sea objetivo de un hechizo o habilidad de un oponente, contrarrestalo a menos que ese jugador pague {${n}}.`;
  }
  return '';
}


function loyaltyCostLabel(cost) {
  const value = Number(cost) || 0;
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return '0';
}

function stripPrintedLoyaltyCost(name) {
  return publicTerminologyText(String(name || ''))
    .replace(/^\s*[+−-]?\d+\s*:\s*/, '')
    .trim();
}

export function buildLoyaltyAbilityDisplay(ability) {
  return {
    kind: 'loyalty-ability',
    loyaltyCost: loyaltyCostLabel(ability?.cost),
    abilityName: stripPrintedLoyaltyCost(ability?.name),
    text: publicTerminologyText(String(ability?.text || '')).trim()
  };
}

export function buildCardTextLayout(card, { effectiveKeywords = null, rulesTextOverride = null } = {}) {
  const keywords = Array.isArray(effectiveKeywords)
    ? [...effectiveKeywords]
    : [...(Array.isArray(card?.keywords) ? card.keywords : [])];

  const originalRules = rulesTextOverride !== null && rulesTextOverride !== undefined
    ? publicTerminologyText(String(rulesTextOverride))
    : publicTerminologyText(String(card?.text || ''));
  const stripped = stripDuplicatedLeadingKeywords(originalRules, keywords);

  let paragraphs = normalizeModalText(stripped);
  if (!paragraphs) {
    paragraphs = String(stripped || '')
      .split(/\n+/)
      .flatMap(part => splitOutsideParentheses(part.trim()))
      .filter(Boolean)
      .map(textValue => ({ kind: 'rule', ...parseAbilityWord(textValue) }));
  }

  paragraphs = paragraphs.map(entry => ({
    ...entry,
    reminder: entry.kind === 'rule' ? reminderForRulesText(entry.text) : ''
  }));

  // 23.19.4.15 — los Semidioses guardan sus habilidades en loyaltyAbilities, no en card.text.
  // El renderer histórico miraba sólo card.text y dejaba el textbox vacío. Las sintetizamos
  // como presentation-only; el motor sigue usando exactamente loyaltyAbilities/cost/effect.
  if (Array.isArray(card?.loyaltyAbilities) && card.loyaltyAbilities.length > 0) {
    const loyaltyParagraphs = card.loyaltyAbilities.map(ability => {
      const entry = buildLoyaltyAbilityDisplay(ability);
      return { ...entry, reminder: reminderForRulesText(entry.text) };
    });
    paragraphs = [...paragraphs, ...loyaltyParagraphs];
  }

  const keywordReminders = [];
  for (const keyword of keywords) {
    const reminder = keywordReminder(keyword);
    if (reminder && !keywordReminders.some(x => x.text === reminder)) {
      keywordReminders.push({ keyword, text: reminder });
    }
  }

  return {
    keywords,
    keywordLabels: keywords.map(cardKeywordLabel),
    keywordReminders,
    paragraphs,
    flavorText: String(card?.flavorText || '').trim()
  };
}
