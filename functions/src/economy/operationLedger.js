import { FieldValue } from 'firebase-admin/firestore';
import { ECONOMY_OPERATIONS_COLLECTION, ECONOMY_SCHEMA_VERSION, ENGINE_VERSION, ECONOMY_PROTOCOL_VERSION } from '../shared/constants.js';
import { requestDigest } from '../shared/canonical.js';
import { economyError } from '../shared/errors.js';

const OPERATION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const TYPE_RE = /^[a-z][a-z0-9_.-]{2,63}$/;

export function validateOperationId(value) {
  const operationId = String(value || '').trim();
  if (!OPERATION_ID_RE.test(operationId)) throw economyError('INVALID_OPERATION_ID');
  return operationId;
}

export function validateOperationType(value) {
  const type = String(value || '').trim();
  if (!TYPE_RE.test(type)) throw economyError('INVALID_ECONOMY_REQUEST');
  return type;
}

export function operationDocumentId(uid, operationId) {
  return `${uid}_${operationId}`;
}

export async function runIdempotentOperation(db, { uid, operationId, type, request, execute }) {
  const opId = validateOperationId(operationId);
  const opType = validateOperationType(type);
  const digest = requestDigest(request);
  const opRef = db.collection(ECONOMY_OPERATIONS_COLLECTION).doc(operationDocumentId(uid, opId));

  return db.runTransaction(async tx => {
    const existing = await tx.get(opRef);
    if (existing.exists) {
      const data = existing.data() || {};
      if (data.uid !== uid || data.operationId !== opId || data.type !== opType || data.requestDigest !== digest) {
        throw economyError('OPERATION_ID_PAYLOAD_MISMATCH', { operationId: opId });
      }
      if (data.status !== 'committed') throw economyError('INTERNAL', { operationId: opId, status: data.status || null });
      return { result: data.result || null, replayed: true, operationId: opId };
    }

    const result = await execute(tx, { operationId: opId, requestDigest: digest });
    tx.create(opRef, {
      uid,
      operationId: opId,
      type: opType,
      requestDigest: digest,
      status: 'committed',
      result: result || null,
      engineVersion: ENGINE_VERSION,
      economyProtocolVersion: ECONOMY_PROTOCOL_VERSION,
      economySchemaVersion: ECONOMY_SCHEMA_VERSION,
      createdAt: FieldValue.serverTimestamp(),
      committedAt: FieldValue.serverTimestamp()
    });
    return { result: result || null, replayed: false, operationId: opId };
  });
}

export async function readOwnOperation(db, uid, operationId) {
  const opId = validateOperationId(operationId);
  const ref = db.collection(ECONOMY_OPERATIONS_COLLECTION).doc(operationDocumentId(uid, opId));
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  if (data.uid !== uid) return null;
  return {
    operationId: data.operationId,
    type: data.type,
    status: data.status,
    result: data.result || null,
    engineVersion: data.engineVersion || null,
    economyProtocolVersion: data.economyProtocolVersion || null
  };
}
