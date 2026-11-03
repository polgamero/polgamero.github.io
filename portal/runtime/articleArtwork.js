// Generated from stage5/content/artwork-registry.json by prepare_candidate.py.
// Article artwork does not require a card, ID, catalogue entry or account.
export const ARTICLE_ARTWORK = Object.freeze({
  "la-difunta-correa": Object.freeze({"name": "La Difunta Correa", "file": "difunta_correa_leyenda.png"}),
  "la-telesita": Object.freeze({"name": "La Telesita", "file": "telesita.png"}),
  "la-mulanima": Object.freeze({"name": "La Mulánima", "file": "mulanima.png"}),
  "el-basilisco": Object.freeze({"name": "El Basilisco", "file": "basilisco.png"}),
  "el-yastay": Object.freeze({"name": "El Yastay", "file": "yastay.png"}),
  "leyenda-de-la-yerba-mate": Object.freeze({"name": "La leyenda de la yerba mate", "file": "leyenda_yerba_mate.png"}),
  "el-futre": Object.freeze({"name": "El Futre", "file": "futre.png"}),
  "el-kurupi": Object.freeze({"name": "El Kurupí", "file": "kurupi.png"}),
  "el-toro-muerto": Object.freeze({"name": "El Toro Muerto", "file": "toro_muerto.png"}),
  "el-anima-sola": Object.freeze({"name": "El Ánima Sola", "file": "anima_sola.png"}),
  "el-chancho-de-monte": Object.freeze({"name": "El Chancho de Monte", "file": "chancho_de_monte.png"}),
});
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function articleArtworkHTML(article) {
  const art=Object.hasOwn(ARTICLE_ARTWORK,article.slug)?ARTICLE_ARTWORK[article.slug]:null;
  if(!art || article.cover)return '';
  // Native object fallback also works without JavaScript and never retries a
  // missing PNG. Once the owner uploads the same filename, the art loads as-is.
  return `<figure class="article-reserved-art"><object data="/assets/images/cards/${art.file}" type="image/png" aria-label="Ilustración de ${esc(art.name)}"><div class="article-art-fallback"><img src="/assets/images/ui/logo.png" alt="ARGENTINIA — Magia y Leyenda"><p>${esc(art.name)}</p></div></object><figcaption>${esc(art.name)} · Una interpretación visual del universo de ARGENTINIA.</figcaption></figure>`;
}
