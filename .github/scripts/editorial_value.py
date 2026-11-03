"""Static, reader-facing card commentary. No game rules or network calls."""
from html import escape
import json

INTERNAL_FUTURE_PURCHASE_COPY = 'Si en el futuro se incorporan compras, suscripciones u otras funciones pagas, podrán aplicarse condiciones adicionales antes de su utilización.'


def remove_internal_future_copy(body):
    # Only the exact known roadmap paragraph; preserve the rest of the legal text.
    return body.replace('<p>' + INTERNAL_FUTURE_PURCHASE_COPY + '</p>', '')


def load_guides(portal):
    rows = json.loads((portal / 'content/card-guides.json').read_text(encoding='utf-8'))
    guides = {}
    for row in rows:
        if row['slug'] in guides:
            raise ValueError('Duplicate reviewed card guide')
        guides[row['slug']] = row
    return guides


def card_guide(slug, text, guides):
    row = guides.get(slug)
    if not row:
        return text
    # The authoring receipt pins the original public page. Verify at promotion;
    # the runtime title anchor also fails closed instead of attaching another guide.
    if '<h1>' + escape(row['name']) + '</h1>' not in text:
        raise ValueError('Reviewed guide no longer matches public card: ' + slug)
    marker = '<nav class="public-detail-actions">'
    if text.count(marker) != 1:
        raise ValueError('Card commentary insertion anchor changed: ' + slug)
    sections = ''.join('<section><h2>' + escape(s['title']) + '</h2><p>' + escape(s['text']) + '</p></section>' for s in row['sections'])
    related = ''.join('<li><a href="/cartas/' + escape(other, quote=True) + '/">' + escape(guides[other]['name']) + '</a></li>' for other in row['related'])
    legend = '<p><a href="' + escape(row['legend'], quote=True) + '">Leé la historia y sus fuentes</a></p>' if row.get('legend') else ''
    guide = '<section class="public-card-guide" aria-labelledby="guia-carta"><h2 id="guia-carta">Cómo jugar esta carta</h2>' + sections + legend + '<h2>Cartas para comparar</h2><ul>' + related + '</ul><p><a href="/manual/">Consultá el manual</a>. El estado de la partida y el texto vigente de la carta determinan sus opciones legales.</p></section>'
    return text.replace(marker, guide + marker, 1)
