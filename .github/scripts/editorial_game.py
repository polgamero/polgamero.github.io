"""Game presentation from original public card data and existing media URLs."""
from editorial_layout import esc,link,relative,reading_minutes,article_path

def site_copy(article,id,title,text):
    section=next((s for s in (article or {}).get('sections',[]) if s['id']==id),None)
    if section:
        title=section['title']
        text=' '.join(b['text'] for b in section['blocks'] if b['type']=='paragraph') or text
    return esc(title),esc(text)


def cards(route,articles):
    items=[]
    for article in articles:
        card=article.get('gameCard')
        image=f'<a class="story-art" href="{relative(route,article_path(article))}"><img src="{esc(card["imageURL"])}" alt="{esc(card["name"])}: ilustración original de ARGENTINIA" loading="lazy" decoding="async"></a>' if card else ''
        items.append(f'<article class="story-card">{image}<div class="story-copy"><p class="eyebrow">{esc(article["region"])}</p><h3>{link(route,article_path(article),article["title"])}</h3><p>{esc(article["excerpt"])}</p><a class="text-link" href="{relative(route,article_path(article))}">Leer la historia →</a><span class="reading-time">{reading_minutes(article)} min de lectura</span></div></article>')
    return '<div class="story-grid">'+''.join(items)+'</div>'


def game_card(card,flashera=False):
    if not card:return ''
    flag=' data-flashera-preview="true"' if flashera else ''
    return f'<article class="portal-card card"{flag}><div class="card-inner"><a href="/jugar/" aria-label="Jugar ARGENTINIA"><img src="{esc(card["imageURL"])}" alt="{esc(card["name"])}" loading="lazy" decoding="async"><div class="portal-card-copy"><span class="eyebrow">{esc(card["type"])}</span><h3>{esc(card["name"])}</h3><p>{esc(card["flavorText"] or card["text"])}</p></div></a></div></article>'


def evolutions(media):
    return '<div class="matito-evolutions" aria-label="Las formas de Matito">'+''.join(f'<figure><img src="{esc(media[key])}" alt="{esc(name)}" loading="lazy" decoding="async"><figcaption>{esc(name)}</figcaption></figure>' for key,name in [('matitoBase','Matito'),('matitoEvo1','Mator · Caballero feroz'),('matitoEvo2','Materex · El destructor')])+'</div>'


def home(articles,game_cards,game_media,presentation=None,matito=None,presentation_body=''):
    catalog={card['id']:card for card in game_cards}
    featured=[tag.split(':',1)[1] for tag in (presentation or {}).get('tags',[]) if tag.startswith('destacada:')]
    if not featured:featured=['crea_020','crea_018','crea_142','crea_146','crea_150','crea_185']
    gallery=''.join(game_card(catalog.get(id)) for id in featured[:6])
    flashy=''.join(game_card(catalog.get(id),True) for id in featured[:3])
    title=esc((presentation or {}).get('title') or 'Armá tu mazo. Jugá tu leyenda.')
    lead=esc((presentation or {}).get('excerpt') or 'Un juego de cartas coleccionables bien argentino. Enfrentá al Tano, desafiá a otros jugadores y llevá tu estrategia hasta la final del torneo.')
    matito_title=esc((matito or {}).get('title') or 'Matito te invita a la ronda')
    matito_lead=esc((matito or {}).get('excerpt') or 'Un mate, una bombilla y lugar para alguien más. Conocé al compañero que te recibe en ARGENTINIA y descubrí hasta dónde puede llegar.')
    solo_title,solo_text=site_copy(presentation,'modo-solo','Una partida con el Tano','Conocé tus cartas, probá combinaciones y encontrá tu manera de jugar contra la IA.')
    torneo_title,torneo_text=site_copy(presentation,'modo-torneo','Camino a la copa','Cada cruce te acerca a la final. Adaptá tu plan, conocé a tus rivales y disputá el torneo.')
    mazos_title,mazos_text=site_copy(presentation,'modo-mazos','Un mazo que sea tuyo','Combiná colores, armá tu colección y desafiá a otros jugadores en PvP.')
    flashy_title,flashy_text=site_copy(presentation,'flasheras','Cartas que brillan por lo que son','Conocé las Flasheras: acabados visuales que le dan otra presencia a tus cartas. Mové el puntero sobre estas muestras y miralas de cerca.')
    invitation_title,invitation_text=site_copy(presentation,'invitacion','Hay lugar para uno más.','Conocé a sus jugadores, encontrá tu mazo y sumate a la próxima partida.')
    return f'''<section class="hero game-hero page-shell" aria-labelledby="hero-title"><div class="hero-copy"><p class="eyebrow">CARTAS, ESTRATEGIA Y FANTASÍA ARGENTINA</p><h1 id="hero-title">{title}</h1><p class="lead">{lead}</p><div class="hero-actions"><a class="play-link hero-play" href="/jugar/">JUGAR AHORA ↗</a><a class="text-link" href="/manual/">Aprendé a jugar →</a></div><p class="hero-caption">Más de 900 cartas originales · Solo · PvP · Torneos</p></div><div class="hero-character"><img src="/assets/images/matito/27_matito_saludando.png" width="512" height="512" alt="Matito te saluda y te da la bienvenida a ARGENTINIA" fetchpriority="high"><span class="matito-introduction">Él es Matito.<br>Y ya te está esperando.</span></div></section>
<section class="game-facts page-shell" aria-label="El juego"><span><strong>900+</strong> cartas originales</span><span><strong>5</strong> colores para combinar</span><span><strong>Tu mazo</strong> tu estrategia</span><span><strong>Una ronda</strong> muchas historias</span></section>
{presentation_body}
<section class="page-shell section-space matito-section" aria-labelledby="matito-title"><div class="matito-story"><img src="/assets/images/matito/29_matito_guino.png" width="512" height="512" alt="Matito guiña un ojo" loading="lazy"><div><p class="eyebrow">EL COMPAÑERO DE ARGENTINIA</p><h2 id="matito-title">{matito_title}</h2><p class="lead">{matito_lead}</p><p>Su ronda empieza con una invitación: siempre alcanza para convidar a uno más. Pero ese pequeño compañero también tiene su costado de héroe.</p><a class="text-link" href="/matito/">Conocé su historia y sus evoluciones →</a></div></div>{evolutions(game_media)}</section>
<section class="page-shell section-space" aria-labelledby="cards-title"><div class="section-heading"><div><p class="eyebrow">MITOS QUE YA TIENEN SU CARTA</p><h2 id="cards-title">Tu próxima leyenda está en el mazo</h2></div><a class="text-link" href="/cartas/">Explorá las cartas →</a></div><div class="game-card-grid">{gallery}</div></section>
<section class="page-shell section-space game-modes" aria-labelledby="modes-title"><div class="section-heading"><div><p class="eyebrow">ENTRÁ A LA MESA</p><h2 id="modes-title">Elegí cómo querés jugar</h2></div></div><div class="mode-grid"><article><img src="/assets/images/manual/manual1.png" alt="Mesa real de ARGENTINIA" loading="lazy"><h3>{solo_title}</h3><p>{solo_text}</p></article><article><img src="/assets/images/manual/manual6.png" alt="Fixture real del torneo de ARGENTINIA" loading="lazy"><h3>{torneo_title}</h3><p>{torneo_text}</p></article><article><img src="/assets/images/manual/manual10.png" alt="Constructor de mazos y colección del juego" loading="lazy"><h3>{mazos_title}</h3><p>{mazos_text}</p></article></div></section>
<section class="page-shell section-space flashera-section" aria-labelledby="flasheras-title"><div class="section-heading"><div><p class="eyebrow">UNA COLECCIÓN CON PERSONALIDAD</p><h2 id="flasheras-title">{flashy_title}</h2></div><img src="/assets/images/matito/35_matito_sorprendido.png" alt="Matito sorprendido con las Flasheras" width="150" height="150" loading="lazy"></div><p class="lead">{flashy_text}</p><div class="game-card-grid flashera-showcase">{flashy}</div></section>
<section class="page-shell section-space" aria-labelledby="stories-title"><div class="section-heading"><div><p class="eyebrow">LAS HISTORIAS DETRÁS DE LAS CARTAS</p><h2 id="stories-title">Leyendas argentinas para seguir descubriendo</h2></div><a class="text-link" href="/leyendas/">Todas las historias →</a></div>{cards('/',articles)}</section>
<section class="page-shell final-invitation"><img src="/assets/images/matito/34_matito_senalando.png" width="220" height="220" alt="Matito señala el botón para jugar" loading="lazy"><div><h2>{invitation_title}</h2><p>{invitation_text}</p><div class="hero-actions"><a class="play-link" href="/jugar/">JUGAR ↗</a><a class="text-link" href="/ranking/">Conocé a los jugadores →</a></div></div></section>'''
