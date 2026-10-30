// Dispatch acceptance never means the HTML is already public. Only the current
// deployed Pages receipt can attest to the release visible on this origin.
export async function deployedRelease(path='/editorial/release.json'){
  const response=await fetch(path,{cache:'no-store',credentials:'omit'});if(!response.ok)return null;const data=await response.json();if(data?.schemaVersion!==1||typeof data.releaseId!=='string'||!Array.isArray(data.articles))return null;return data;
}
export function publicationLabel(head,desired,live){
  const visible=live?.articles?.find(a=>a.id===head?.id);
  if(desired?.desiredRelease&&live?.releaseId===desired.desiredRelease){if(!visible)return 'Retirada de la edición pública.';return visible.revision===head.revision?'Esta revisión está publicada.':`Está publicada la revisión ${visible.revision}; tus cambios siguen en borrador.`;}
  if(desired?.dispatch?.state==='failed')return 'Borrador guardado. Falló el envío a Pages; podés reintentarlo.';
  if(desired?.dispatch?.workflowStatus==='completed'&&desired.dispatch.conclusion&&desired.dispatch.conclusion!=='success')return 'GitHub no completó la edición pública. La versión anterior sigue visible; podés reintentar.';
  if(desired?.desiredRelease)return visible?`Está publicada la revisión ${visible.revision}. Hay otra edición pendiente de Pages.`:'Publicación solicitada. Esperando la edición de Pages.';
  return 'Todavía no se verificó una edición pública de esta entrada.';
}
