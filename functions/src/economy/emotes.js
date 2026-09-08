import { FieldValue } from 'firebase-admin/firestore';
import { economyError } from '../shared/errors.js';
import { EMOTE_CATALOG_PATH, EMOTE_CATALOG_SCHEMA_VERSION, normalizeEmoteCatalogItems } from '../trusted/emoteCatalog.js';

function translateValidationError(error) {
  const code = String(error?.message || 'EMOTE_CATALOG_INVALID').split(':')[0];
  throw economyError(code.startsWith('EMOTE_CATALOG_') ? code : 'EMOTE_CATALOG_INVALID');
}

export function normalizeAdminEmoteCatalog(rawItems) {
  try { return normalizeEmoteCatalogItems(rawItems, { strict:true }); }
  catch (error) { translateValidationError(error); }
}

export async function setEmoteCatalogAdminTx({ db, tx, adminUid, items, operationId }) {
  const normalized = normalizeAdminEmoteCatalog(items);
  const nowMs = Date.now();
  const catalogVersion = `23.21.3-rc3-${nowMs}`;
  const ref = db.doc(EMOTE_CATALOG_PATH);
  tx.set(ref, {
    schemaVersion:EMOTE_CATALOG_SCHEMA_VERSION,
    catalogVersion,
    items:normalized.map(row => ({ ...row })),
    updatedByUid:String(adminUid || ''),
    updatedAt:FieldValue.serverTimestamp()
  }, { merge:false });
  const actionRef = db.collection('adminActions').doc(`emote_catalog_${String(operationId || '').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,180)}`);
  tx.set(actionRef, {
    auditKind:'adminAction', type:'admin.emote_catalog.set', source:'admin_emote_catalog_server',
    adminUid:String(adminUid || ''), actorUid:String(adminUid || ''), targetUid:'gameConfig/emotes',
    operationId:String(operationId || ''), itemCount:normalized.length,
    freeCount:normalized.filter(x=>!x.premium).length, premiumCount:normalized.filter(x=>x.premium).length,
    activeCount:normalized.filter(x=>x.active).length, catalogVersion,
    immutable:true, createdAt:FieldValue.serverTimestamp()
  }, { merge:false });
  return { kind:'adminEmoteCatalogSet', schemaVersion:EMOTE_CATALOG_SCHEMA_VERSION, catalogVersion, items:normalized.map(row=>({ ...row })) };
}
