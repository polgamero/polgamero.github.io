"""Project the reviewed public selection into the common editorial shell.

Never reads a private catalogue or adds a gallery route. No engine import.
"""
import html,json,re
from collections import Counter
from html.parser import HTMLParser
from editorial_layout import chrome,esc
from editorial_copy import text

LABELS={'Common':'comunes','Uncommon':'infrecuentes','Rare':'raras','Mythic':'míticas'}
MANA_NAMES={'W':'blanco','U':'azul','B':'negro','R':'rojo','G':'verde','C':'incoloro','T':'girar','X':'X'}

class Symbols(HTMLParser):
    def __init__(self,icons):super().__init__(convert_charrefs=False);self.icons=icons;self.parts=[];self.skip=0
    def handle_starttag(self,tag,attrs):
        self.parts.append(self.get_starttag_text())
        if tag in ('script','style'):self.skip+=1
    def handle_startendtag(self,tag,attrs):self.parts.append(self.get_starttag_text())
    def handle_endtag(self,tag):
        self.parts.append('</'+tag+'>')
        if tag in ('script','style'):self.skip-=1
    def handle_entityref(self,name):self.parts.append('&'+name+';')
    def handle_charref(self,name):self.parts.append('&#'+name+';')
    def handle_decl(self,decl):self.parts.append('<!'+decl+'>')
    def handle_data(self,value):
        def symbol(match):
            key=match[1].upper();url=self.icons.get(key)
            if not url:
                parts=key.split('/')
                if len(parts)==2:url=self.icons.get('/'.join(reversed(parts)))
                elif len(parts)==3 and 'P' in parts:
                    colors=[p for p in parts if p!='P']
                    url=self.icons.get('/'.join(colors+['P'])) or self.icons.get('/'.join(list(reversed(colors))+['P']))
            label=MANA_NAMES.get(key,key)
            if url:return '<img class="public-mana-icon" src="'+esc('/'+url.removeprefix('./'))+'" alt="'+esc(label)+'" title="'+esc(match[0])+'" width="24" height="24" loading="lazy">'
            return '<span class="public-mana-generic" aria-label="'+esc(key)+'">'+esc(key)+'</span>'
        self.parts.append(value if self.skip else re.sub(r'\{([0-9WUBRGCXTP/]+)\}',symbol,value))

def symbols_html(markup,icons):
    parser=Symbols(icons);parser.feed(markup);parser.close();return ''.join(parser.parts)

def selection_metadata(app,cards):
    selected=json.loads((app/'cartas/public-selection.json').read_text(encoding='utf-8-sig'))
    by_id={c['id']:c for c in cards.values()}
    rows=[by_id[id] for id in selected['ids']]
    return {**selected,'totalPool':len(by_id),'publishedEligible':sum(c.get('enabled') is not False for c in by_id.values()),'publicCount':len(rows),'rarityCounts':dict(Counter(c['rarity'] for c in rows))}

def gallery_page(raw,route,settings,selection,icons):
    match=re.search(r'<main\b[^>]*>(.*?)</main>',raw,re.S)
    if not match:raise ValueError('Gallery main missing: '+route)
    body=match[1]
    # Only play actions move to the game. The brand belongs to the portal home.
    body=body.replace('href="/"','href="/jugar/"')
    if route=='/cartas/':
        stats='<span><b>'+str(selection['publicCount'])+'</b> cartas en esta selección</span><span><b>'+str(selection['totalPool'])+'</b> cartas en el catálogo público</span>'
        stats+=''.join('<span><b>'+str(selection['rarityCounts'].get(k,0))+'</b> '+v+'</span>' for k,v in LABELS.items())
        hero='<section class="public-hero"><p class="eyebrow">'+text('gallery.eyebrow')+'</p><h1>'+text('gallery.title')+'</h1><p>'+text('gallery.lead')+'</p><div class="public-stats">'+stats+'</div></section>'
        body=re.sub(r'<section class="public-hero">.*?</section>',lambda _:hero,body,count=1,flags=re.S)
        note='<section class="public-note"><h2>'+text('gallery.selectionTitle')+'</h2><p>'+text('gallery.selectionBody')+'</p><a href="/jugar/">'+text('gallery.enter')+'</a></section>'
        body=re.sub(r'<section class="public-note">.*?</section>',lambda _:note,body,count=1,flags=re.S)
        for old,key in [('Buscar','gallery.search'),('Rareza','gallery.rarity'),('Tipo','gallery.type')]:
            body=body.replace('<label>'+old+'<','<label>'+text(key)+'<')
        if 'data-site-attribute="placeholder"' not in body:
            body=body.replace('placeholder="Nombre o texto…"','placeholder="Nombre o texto…" data-site-text="site.gallery.searchPlaceholder" data-site-attribute="placeholder"')
        body=body.replace('<option value="">Todas</option>','<option value="" data-site-text="site.gallery.allRarities">Todas</option>').replace('<option value="">Todos</option>','<option value="" data-site-text="site.gallery.allTypes">Todos</option>')
        body=re.sub(r'(<p id="public-card-empty"[^>]*>).*?(</p>)',lambda m:m[1]+text('gallery.empty')+m[2],body,flags=re.S)
        title='Cartas de ARGENTINIA';description=f"Explorá {selection['publicCount']} cartas de una selección del catálogo público de {selection['totalPool']} cartas de ARGENTINIA."
    else:
        title=html.unescape(re.search(r'<h1[^>]*>(.*?)</h1>',body)[1])
        description='Texto, coste y reglas de '+title+' en ARGENTINIA.'
        for old,key in [('← Volver a la galería','gallery.back'),('Explorar más cartas','gallery.more'),('Jugar Argentinia','gallery.enter')]:
            body=body.replace('>'+old+'</a>','>'+text(key)+'</a>')
        body=re.sub(r'<p class="public-spoiler-note">.*?</p>',lambda _:'<p class="public-spoiler-note">'+text('gallery.privacyNote')+'</p>',body,flags=re.S)
    symbols=Symbols(icons);symbols.feed(body);symbols.close()
    content='<div class="page-shell public-shell'+(' public-detail' if route!='/cartas/' else '')+'">'+''.join(symbols.parts)+'</div>'
    result=chrome(route,title,description,content,{**settings,'robots':'noindex,follow,max-image-preview:large'},active='/cartas/',extra_class='gallery-page')
    metadata='<link rel="canonical" href="'+esc(settings['origin']+route)+'"><meta property="og:site_name" content="ARGENTINIA — Magia y Leyenda"><meta property="og:title" content="'+esc(title)+'"><meta property="og:description" content="'+esc(description)+'"><meta property="og:url" content="'+esc(settings['origin']+route)+'"><meta name="google-adsense-account" content="ca-pub-6181395403710642"><link rel="stylesheet" href="/cartas/public-cards.css">'
    result=result.replace('</head>',metadata+'</head>')
    return result.replace('</body>','<script src="/cartas/public-cards.js" defer></script></body>') if route=='/cartas/' else result
