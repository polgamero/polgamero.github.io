// HF23.3.16.1 — Carta Favorita: helpers puros compartidos por Perfil/Mercado/Taller.
import { TRUSTED_CARD_IDS } from '../trusted/cardCatalog.js';

export function favoriteCardIdIfOwned(profile={}) {
  const id=String(profile?.favoriteCardId||'').trim();
  if(!id || !TRUSTED_CARD_IDS.has(id)) return '';
  const collection=Array.isArray(profile?.collection) ? profile.collection : [];
  return collection.some(raw=>String(raw)===id) ? id : '';
}

export function favoriteCardPatchForCollection(profile={}, nextCollection=[]) {
  const id=String(profile?.favoriteCardId||'').trim();
  if(!id) return {};
  return Array.isArray(nextCollection) && nextCollection.some(raw=>String(raw)===id) ? {} : {favoriteCardId:''};
}
