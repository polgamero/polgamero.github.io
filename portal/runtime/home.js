import {decorateFlasheraCard} from '/js/flasheraRenderer.js';
for(const card of document.querySelectorAll('[data-flashera-preview]'))decorateFlasheraCard(card,{mode:'standard',lockEffect:true});
