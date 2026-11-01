import {hydratePublicGameManual,applyManualGameTexts} from '/js/manualUI.js';
import {applyGameTextOverrides} from '/js/gameTexts.js';
import {portalServices} from './firebasePortal.js';

export async function mountManual(root,{services=portalServices}={}) {
  // Navigation/media work immediately, even if the optional public config fails.
  hydratePublicGameManual(root);
  try {
    const documentData=await (await services()).fetchGameTexts();
    applyGameTextOverrides(documentData);
    applyManualGameTexts(root);
    root.dataset.manualTexts='loaded';
  } catch {
    root.dataset.manualTexts='fallback';
    console.warn('No se pudieron cargar los textos del manual; se muestran los originales.');
  }
}
const root=document.querySelector('[data-game-manual]');if(root)void mountManual(root);
