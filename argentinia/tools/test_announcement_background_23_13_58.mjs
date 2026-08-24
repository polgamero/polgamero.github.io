import fs from 'node:fs';
const src = fs.readFileSync(new URL('../js/campaignsUI.js', import.meta.url), 'utf8');
const must = [
  'function announcementImageUrl(filename)',
  'new URL(`assets/images/ui/${encodeURIComponent(name)}`, document.baseURI)',
  'class="campaign-popup-bg"',
  'class="campaign-popup-overlay"',
  '.campaign-popup-bg{position:absolute',
  'object-fit:cover',
  "bg.addEventListener('error',()=>bg.remove(),{once:true})"
];
for (const needle of must) {
  if (!src.includes(needle)) throw new Error(`Missing announcement background contract: ${needle}`);
}
if (src.includes('background-image:url("./assets/images/ui/${ann.imageFilename')) {
  throw new Error('Legacy fragile inline background-image renderer is still present.');
}
console.log('ANNOUNCEMENT_BACKGROUND_23_13_58_OK');
