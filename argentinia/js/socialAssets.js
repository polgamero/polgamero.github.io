// One deploy-generated inventory; no speculative HEAD requests for missing formats.
let inventoryPromise;
export function loadSocialAssetInventory() {
  if (!inventoryPromise) inventoryPromise = fetch('./assets/images/cards/cards-image-manifest.json', { cache: 'no-cache', credentials: 'same-origin' })
    .then(response => response.ok ? response.json() : null)
    .then(manifest => {
      const social = manifest?.socialAssets;
      if (social?.schemaVersion !== 1) return null;
      return new Set([
        ...(Array.isArray(social.images) ? social.images : []).map(name => `./assets/images/emotes/${name}`),
        ...(Array.isArray(social.audio) ? social.audio : []).map(name => `./assets/sounds/sfx/${name}`)
      ]);
    }).catch(() => null);
  return inventoryPromise;
}
export async function resolveSocialAsset(candidates = []) {
  const available = await loadSocialAssetInventory();
  // An older/missing manifest keeps the built-in emoji rather than guessing filenames.
  return candidates.find(url => available?.has(url)) || null;
}
