// One policy for existing public media. No uploads, resampling or image copies.
export const SHARED_ASSETS = Object.freeze({
  repository:'polgamero/polgamero.github.io',
  fallbackRevision:'906f0ffc7363639ec364c4804d539c8396b1578e',
  remoteExtensions:Object.freeze(['.png','.jpg','.jpeg','.webp','.gif','.mp3','.opus','.ogg','.wav','.mp4']),
  // These original images are required by the canonical cache refresh contract.
  localFiles:Object.freeze(['images/logros/soloWins_bronze.png','images/logros/soloWins_copper.png','images/logros/soloWins_diamond.png','images/logros/soloWins_gold.png','images/logros/soloWins_silver.png']),
  remotePrefixes:Object.freeze(['images/npcs/','images/truco/','images/logros/','images/evolutions/','sounds/music/']),
  remoteFiles:Object.freeze(['images/manual/manual2.webp','images/manual/manual3.webp','images/manual/manual5.webp'])
});

export function sharedAssetPath(value){
  if(typeof value!=='string')return null;
  const match=/^(?:\.\/|\/)?assets\/(.+)$/.exec(value);
  if(!match||/[\\%?#\u0000-\u001f\u007f]/.test(match[1])||match[1].split('/').some(p=>!p||p==='.'||p==='..'))return null;
  return match[1];
}
export function isSharedRemoteAsset(value){
  const path=sharedAssetPath(value);
  return !!path&&!SHARED_ASSETS.localFiles.includes(path)&&SHARED_ASSETS.remoteExtensions.some(ext=>path.toLowerCase().endsWith(ext))&&(SHARED_ASSETS.remoteFiles.includes(path)||SHARED_ASSETS.remotePrefixes.some(prefix=>path.startsWith(prefix)));
}
export function sharedAssetRemoteURL(value,revision=SHARED_ASSETS.fallbackRevision){
  const path=sharedAssetPath(value);
  if(!path||!isSharedRemoteAsset(value)||!/^[a-f0-9]{40}$/.test(revision))throw Error('INVALID_SHARED_ASSET_REFERENCE');
  return `https://raw.githubusercontent.com/${SHARED_ASSETS.repository}/${revision}/argentinia/assets/`+path.split('/').map(encodeURIComponent).join('/');
}
export function sharedAssetURL(value,{hostname=globalThis.location?.hostname||'',revision=globalThis.document?.documentElement?.dataset?.sharedAssetRevision||SHARED_ASSETS.fallbackRevision}={}){
  if(!isSharedRemoteAsset(value)||!hostname||['localhost','127.0.0.1','::1','[::1]'].includes(hostname))return value;
  return sharedAssetRemoteURL(value,revision);
}
