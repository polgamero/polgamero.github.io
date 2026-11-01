import {recordServiceUsage} from './serviceUsage.js';

// Web SDK setDoc is an upsert; a transaction's initial get is denied for a
// nonexistent room by the existing Rules. REST exposes atomic create-only writes.
// Firebase ID tokens still use the same Rules. No Admin/service-account authority.
function fieldValue(value) {
  if (value === null) return {nullValue:null};
  if (typeof value === 'string') return {stringValue:value};
  if (typeof value === 'boolean') return {booleanValue:value};
  if (Number.isSafeInteger(value)) return {integerValue:String(value)};
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,fieldValue(v)]))}};
  }
  throw new Error('MULTIPLAYER_CREATE_INVALID_FIELD');
}

export async function createMatchDocument({projectId, code, data, idToken, appCheckToken=null}) {
  if (!/^[a-z0-9-]+$/.test(projectId) || !/^[A-HJ-NP-Z2-9]{6}$/.test(code) || !idToken) {
    throw new Error('MULTIPLAYER_CREATE_INVALID_REQUEST');
  }
  const documentRoot=`projects/${projectId}/databases/(default)/documents`;
  const headers={'Content-Type':'application/json',Authorization:`Bearer ${idToken}`};
  if (appCheckToken) headers['X-Firebase-AppCheck']=appCheckToken;
  // These two values stay serverTimestamp() in the SDK-facing result; the
  // actual document receives REQUEST_TIME in the same atomic create commit.
  const {createdAt,updatedAt,...fields}=data;
  recordServiceUsage('Firestore / Multiplayer','writeAttempts');
  try {
    const response=await fetch(`https://firestore.googleapis.com/v1/${documentRoot}:commit`,{
      method:'POST',headers,credentials:'omit',cache:'no-store',
      body:JSON.stringify({writes:[{
        update:{name:`${documentRoot}/matches/${code}`,fields:fieldValue(fields).mapValue.fields},
        currentDocument:{exists:false},
        updateTransforms:['createdAt','updatedAt'].map(fieldPath=>({fieldPath,setToServerValue:'REQUEST_TIME'}))
      }]})
    });
    if (!response.ok) {
      const result=await response.json().catch(()=>null);
      const status=result?.error?.status;
      const error=new Error(status==='PERMISSION_DENIED'
        ? 'No se pudo crear la partida: permisos insuficientes.'
        : 'No se pudo confirmar la creación de la partida. Probá de nuevo.');
      error.name='FirebaseError';
      error.code=({ALREADY_EXISTS:'already-exists',FAILED_PRECONDITION:'failed-precondition',PERMISSION_DENIED:'permission-denied',UNAUTHENTICATED:'unauthenticated'})[status]||'unavailable';
      throw error;
    }
  } catch (error) {
    recordServiceUsage('Firestore / Multiplayer','errors');
    throw error;
  }
}
