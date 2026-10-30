import {MEDIA_MAX_BYTES,mediaPattern} from './articleModel.js';
export async function prepareImage(file){
  if(!file||file.size>12000000||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Elegí un PNG, JPG o WebP de hasta 12 MB.');
  // Same decode, resize and WebP quality ladder as editorialStudio::assetPicker.
  const bitmap=await createImageBitmap(file);
  try{
    if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>40000000)throw Error('La imagen tiene demasiados píxeles. Usá una versión más pequeña.');
    const ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    const encode=quality=>new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));let blob=await encode(.82);if(blob?.size>MEDIA_MAX_BYTES)blob=await encode(.5);
    if(!blob||blob.type!=='image/webp'||blob.size>MEDIA_MAX_BYTES)throw Error('La imagen sigue siendo demasiado grande o no se pudo convertir a WebP.');
    const bytes=await blob.arrayBuffer(),id=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(blob);});
    return {id,blob,base64,width:canvas.width,height:canvas.height};
  }finally{bitmap.close();}
}
export function mediaCache(action){
  const cache=new Map(),pending=new Map();let generation=0;
  function set(id,blob){if(!mediaPattern.test(id))throw Error('INVALID_MEDIA_ID');if(cache.has(id))URL.revokeObjectURL(cache.get(id));cache.set(id,URL.createObjectURL(blob));return cache.get(id);}
  async function load(id){if(cache.has(id))return cache.get(id);if(pending.has(id))return pending.get(id);const serial=generation;const promise=(async()=>{const {media}=await action({action:'mediaGet',mediaId:id});if(serial!==generation)throw Error('La sesión cambió. Volvé a abrir la entrada.');const bytes=Uint8Array.from(atob(media.base64),c=>c.charCodeAt(0));return set(id,new Blob([bytes],{type:'image/webp'}));})().finally(()=>{if(pending.get(id)===promise)pending.delete(id);});pending.set(id,promise);return promise;}
  return {set,load,url:id=>cache.get(id)||'',clear(){generation++;cache.forEach(url=>URL.revokeObjectURL(url));cache.clear();pending.clear();}};
}
