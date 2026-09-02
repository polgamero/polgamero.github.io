import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const CARD_FILES = ['tierras.json','artefactos.json','criaturas.json','instantaneos.json','conjuros.json','encantamientos.json','planeswalkers.json'];

function load() {
  const all = [];
  for (const file of CARD_FILES) {
    const p = path.join(here, 'cards', file);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!Array.isArray(data)) throw new Error(`TRUSTED_CARD_DATA_INVALID:${file}`);
    all.push(...data);
  }
  const ids = new Set();
  for (const card of all) {
    if (!card?.id || ids.has(card.id)) throw new Error(`TRUSTED_CARD_ID_INVALID:${card?.id || 'missing'}`);
    ids.add(card.id);
  }
  if (all.length !== 880) throw new Error(`TRUSTED_POOL_COUNT_MISMATCH:${all.length}`);
  return Object.freeze(all);
}

export const TRUSTED_CARD_POOL = load();
export const TRUSTED_CARD_IDS = Object.freeze(new Set(TRUSTED_CARD_POOL.map(card => card.id)));
export const TRUSTED_CARD_POOL_FINGERPRINT = crypto.createHash('sha256')
  .update(JSON.stringify(TRUSTED_CARD_POOL.map(card => card.id)))
  .digest('hex');
