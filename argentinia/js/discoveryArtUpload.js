// Private art upload orchestration. No private paths, URLs or raw SDK errors in diagnostics.
export const DISCOVERY_ART_MAX_BYTES = 12 * 1024 * 1024;
const STAGES = new Set(['validate','authorize','transfer','finalize','refresh']);
const REASONS = new Set(['STALE_UPLOAD','UPLOAD_NOT_FOUND','UPLOAD_PATH_MISMATCH','PNG_REQUIRED','SIZE_INVALID','DISCOVERY_REQUIRED','DISCOVERY_ASSET_UPLOAD_URL_UNAVAILABLE','STORAGE_BUCKET_UNCONFIGURED','STORAGE_BUCKET_NOT_FOUND','STORAGE_SIGNING_PERMISSION_DENIED','STORAGE_SIGNING_API_DISABLED']);
const CODES = new Set(['functions/internal','internal','INTERNAL','AUTH_REQUIRED','ADMIN_REQUIRED','functions/unauthenticated','functions/permission-denied','functions/unavailable','functions/deadline-exceeded','functions/resource-exhausted','INVALID_ECONOMY_REQUEST','DISCOVERY_PNG_REQUIRED','DISCOVERY_ART_SIZE_INVALID','DISCOVERY_ART_LANDSCAPE_REQUIRED','DISCOVERY_PNG_UNREADABLE','DISCOVERY_CARD_ID_REQUIRED','DISCOVERY_UPLOAD_URL_UNAVAILABLE','DISCOVERY_ART_FINALIZE_FAILED','DISCOVERY_ART_UPLOAD_FAILED']);

export function discoveryUploadError(stage, error) {
  const wrapped = new Error('No se pudo completar la carga del arte privado.');
  wrapped.stage = STAGES.has(stage) ? stage : 'validate';
  const code=String(error?.code || '');
  wrapped.code=CODES.has(code)?code:'DISCOVERY_ART_UPLOAD_FAILED';
  const reason=String(error?.details?.reason || error?.details?.details?.reason || '');
  if(REASONS.has(reason))wrapped.reason=reason;
  const status=Number(error?.status);
  if(Number.isInteger(status)&&status>=400&&status<=599)wrapped.status=status;
  return wrapped;
}
function localError(code,message){const error=new Error(message);error.code=code;error.stage='validate';return error;}

export async function validateDiscoveryAdminPng(file) {
  if(!(file instanceof Blob)||(file.type&&file.type!=='image/png'))throw localError('DISCOVERY_PNG_REQUIRED','Elegí un archivo PNG. JPEG no está permitido.');
  if(!file.size||file.size>DISCOVERY_ART_MAX_BYTES)throw localError('DISCOVERY_ART_SIZE_INVALID','El PNG debe pesar entre 1 byte y 12 MiB.');
  const signature=new Uint8Array(await file.slice(0,8).arrayBuffer());
  if(![137,80,78,71,13,10,26,10].every((n,i)=>signature[i]===n))throw localError('DISCOVERY_PNG_REQUIRED','Elegí un archivo PNG real. Cambiar la extensión del archivo no lo convierte en PNG.');
  let width=0,height=0,bitmap=null;
  try{
    if(typeof createImageBitmap==='function'){bitmap=await createImageBitmap(file);width=bitmap.width;height=bitmap.height;}
    else{
      const url=URL.createObjectURL(file);
      try{const img=await new Promise((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=reject;el.src=url;});width=img.naturalWidth;height=img.naturalHeight;}
      finally{URL.revokeObjectURL(url);}
    }
  }catch{throw localError('DISCOVERY_PNG_UNREADABLE','No se pudo leer el PNG. Exportalo de nuevo y volvé a intentarlo.');}
  finally{try{bitmap?.close?.();}catch{}}
  if(!width||!height)throw localError('DISCOVERY_PNG_UNREADABLE','No se pudieron validar las dimensiones del PNG.');
  if(width<=height)throw localError('DISCOVERY_ART_LANDSCAPE_REQUIRED',`El arte debe ser horizontal (ancho mayor que alto). Este archivo es ${width}×${height}.`);
  return {width,height};
}

export function describeDiscoveryUploadError(error) {
  const stage=STAGES.has(error?.stage)?error.stage:'validate';
  const code=CODES.has(error?.code)?error.code:'DISCOVERY_ART_UPLOAD_FAILED';
  let message=stage==='authorize'?'El servidor falló al autorizar la carga. La imagen todavía no se transfirió. Revisar el log de economyAdminSetSanctuaryConfig.':stage==='transfer'?'Storage rechazó la transferencia de la imagen. Revisar permisos, vencimiento de la URL y CORS.':stage==='finalize'?'La imagen se transfirió, pero el servidor no confirmó su vínculo con la carta.':'No se pudo completar la carga del arte privado.';
  if(stage==='validate'&&['DISCOVERY_PNG_REQUIRED','DISCOVERY_ART_SIZE_INVALID','DISCOVERY_ART_LANDSCAPE_REQUIRED','DISCOVERY_PNG_UNREADABLE'].includes(code))message=error.message;
  if(['AUTH_REQUIRED','functions/unauthenticated'].includes(code))message='Tu sesión venció. Volvé a iniciar sesión y elegí el PNG otra vez.';
  if(['ADMIN_REQUIRED','functions/permission-denied'].includes(code))message='El servidor no autorizó esta operación para tu cuenta Admin. Revisar la sesión y los permisos.';
  if(code==='functions/resource-exhausted')message='Se alcanzó el límite de solicitudes. Esperá un minuto antes de volver a intentar.';
  if(error?.reason==='STALE_UPLOAD')message='Esta carga fue reemplazada por otra carga más reciente. Elegí nuevamente el PNG para esta carta.';
  if(error?.reason==='STORAGE_BUCKET_UNCONFIGURED')message='El servidor no tiene configurado el bucket privado de Storage. Requiere revisión del backend.';
  if(error?.reason==='STORAGE_SIGNING_PERMISSION_DENIED')message='El servidor no tiene permiso para firmar la carga privada. Requiere revisión de IAM.';
  const diagnostic=[`Etapa: ${stage}`,`Código: ${code}`,REASONS.has(error?.reason)?`Motivo: ${error.reason}`:'',error?.status?`HTTP: ${error.status}`:''].filter(Boolean).join(' · ');
  return {message,diagnostic};
}

export async function uploadDiscoveryArt(cardId,file,{authorize,put,finalize,refresh},{onProgress}={}){
  const id=String(cardId||'').trim();
  if(!id)throw localError('DISCOVERY_CARD_ID_REQUIRED','Falta la carta de destino.');
  // Recheck file at the service boundary too; callers outside the encyclopedia cannot bypass validation.
  await validateDiscoveryAdminPng(file);
  let stage='authorize',target=null,upload=null;
  const progress=next=>{stage=next;try{onProgress?.(next);}catch{}};
  try{
    for(let attempt=0;attempt<2;attempt+=1){
      progress('authorize');const response=await authorize(id);target=response?.discoveryAssetUpload;
      if(!target?.uploadUrl||!target?.uploadId||!target?.uploadObjectPath)throw {code:'DISCOVERY_UPLOAD_URL_UNAVAILABLE'};
      progress('transfer');upload=await put(target.uploadUrl,{method:'PUT',headers:{'Content-Type':'image/png'},body:file,cache:'no-store'});
      if(upload.ok)break;
      if(attempt===0&&(upload.status===401||upload.status===403))continue;
      throw {code:'DISCOVERY_ART_UPLOAD_FAILED',status:upload.status};
    }
    progress('finalize');const response=await finalize(id,target.uploadId,target.uploadObjectPath);
    const saved=response?.discoveryAssetFinalize;
    if(saved?.assetReady!==true)throw {code:'DISCOVERY_ART_FINALIZE_FAILED'};
    // Finalize is the commit point. A failed view refresh must not report a failed upload.
    progress('refresh');let card=null,refreshWarning=false;
    try{const cards=await refresh();card=cards.find(row=>String(row?.id||'')===id)||null;}
    catch{refreshWarning=true;}
    return {ok:true,finalized:saved,card,refreshWarning};
  }catch(error){throw discoveryUploadError(stage,error);}
}
