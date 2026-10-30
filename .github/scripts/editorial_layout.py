"""Public editorial HTML primitives; original ARGENTINIA assets and text-only imports."""
import html,json,math,posixpath,re
from html.parser import HTMLParser
from urllib.parse import urlsplit
BRAND="ARGENTINIA — Magia y Leyenda"
def esc(value):
    return html.escape(str(value), quote=True)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def safe_url(value, schemes=("https",)):
    if not isinstance(value, str) or any(ord(c) < 33 for c in value):
        raise ValueError("URL inválida")
    parsed = urlsplit(value)
    if parsed.scheme not in schemes or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Se requiere una URL HTTPS sin credenciales")
    return value

def play_url(value):
    if value!='/jugar/':
        raise ValueError('The public play destination must be the same-origin /jugar/ route')
    return value


def relative(route, target):
    """Directory links work on localhost and directly from an unpacked preview."""
    if not route.startswith("/") or not target.startswith("/") or ".." in route.split("/") or ".." in target.split("/"):
        raise ValueError("Ruta fuera del portal")
    filename = target.lstrip("/") + ("index.html" if target.endswith("/") else "")
    directory = route.strip("/") if route.endswith("/") else posixpath.dirname(route.lstrip("/"))
    return posixpath.relpath(filename, directory or ".")


def logo(route, extra="", priority=False):
    attr = 'fetchpriority="high"' if priority else 'loading="lazy"'
    return f'<span class="logo-window {extra}"><img src="{relative(route, "/assets/images/ui/logo.png")}" width="1536" height="1024" alt="{BRAND}" decoding="async" {attr}></span>'


def link(route, target, label, cls=""):
    return f'<a href="{relative(route, target)}"' + (f' class="{cls}"' if cls else '') + f'>{esc(label)}</a>'


def chrome(route, title, description, content, config, active="", extra_class="", structured=None):
    nav = [("/leyendas/", "Leyendas"), ("/ranking/", "Ranking"), ("/manual/", "Cómo jugar"), ("/sobre-el-proyecto/", "El proyecto")]
    nav_html = "".join(f'<a href="{relative(route, path)}"' + (' aria-current="page"' if active == path else '') + f'>{label}</a>' for path, label in nav)
    footer = "".join(link(route, path, label) for path, label in [("/leyendas/", "Leyendas"), ("/criterios-editoriales/", "Criterios editoriales"), ("/sobre-el-proyecto/", "El proyecto"), ("/contacto/", "Contacto"), ("/privacidad/", "Privacidad"), ("/terminos/", "Términos")])
    data = ''
    if structured:
        # Prevent user text from closing a JSON-LD script element.
        payload = json.dumps(structured, ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
        data = f'<script type="application/ld+json">{payload}</script>'
    page_title = BRAND if route == "/" else f"{title} | {BRAND}"
    return f'''<!doctype html>
<html lang="es-AR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#07130f"><meta name="color-scheme" content="dark">
<meta name="robots" content="{esc(config.get('robots', 'index,follow'))}"><title>{esc(page_title)}</title>
<meta name="description" content="{esc(description)}">
<link rel="icon" href="{relative(route, '/assets/images/ui/logo.png')}" type="image/png">
<link rel="stylesheet" href="{relative(route, '/portal.css')}">
{data}</head>
<body class="{esc(extra_class)}"><a class="skip-link" href="#contenido">Ir al contenido</a>
<header class="site-header"><a class="brand" href="{relative(route, '/')}" aria-label="{BRAND}, inicio">{logo(route, priority=True)}</a>
<nav aria-label="Principal">{nav_html}</nav>
<a class="play-link" href="{esc(play_url(config['playUrl']))}">JUGAR <span aria-hidden="true">↗</span></a></header>
<main id="contenido">{content}</main>
<footer class="site-footer"><div class="page-shell footer-grid"><div><a class="footer-brand" href="{relative(route, '/')}">{logo(route)}</a><p>Historias para leer.<br>Un mundo para jugar.</p></div><nav aria-label="Información y contacto">{footer}</nav><p class="footer-note">{BRAND}<br>Tradiciones, fuentes y ficción: cada una con su lugar.</p></div></footer>
</body></html>
'''


def article_path(article):
    return f"/leyendas/{article['slug']}/"


def reading_minutes(article):
    body = ' '.join(block.get('text', ' '.join(block.get('items', []))) for section in article['sections'] for block in section['blocks'])
    return max(1, math.ceil(len(body.split()) / 200))


def cards(route, articles):
    return '<div class="story-grid">' + ''.join(f'''<article class="story-card"><p class="eyebrow">{esc(a['region'])}</p><h3>{link(route, article_path(a), a['title'])}</h3><p>{esc(a['excerpt'])}</p><a class="text-link" href="{relative(route, article_path(a))}">Leer el artículo <span aria-hidden="true">→</span><span class="sr-only">: {esc(a['title'])}</span></a><span class="reading-time">{reading_minutes(a)} min de lectura</span></article>''' for a in articles) + '</div>'


def intro(title, lead, eyebrow="ARGENTINIA", breadcrumb=True):
    return f'<header class="page-intro page-shell">' + ('<p class="eyebrow">' + esc(eyebrow) + '</p>' if breadcrumb else '') + f'<h1>{esc(title)}</h1><p class="lead">{esc(lead)}</p></header>'


def home(articles):
    return f'''<section class="hero page-shell" aria-labelledby="hero-title"><div class="hero-copy"><h1 id="hero-title">{logo('/', 'hero-logo', True)}</h1><p class="hero-subtitle">Mitos y leyendas de Argentina</p><p class="lead">Del silbido en el monte a una luz en la noche. Historias que cambian de voz, viajan con quienes las cuentan y encuentran nuevas formas de seguir vivas.</p><a class="text-link" href="leyendas/index.html">Explorar las leyendas <span aria-hidden="true">↓</span></a></div><div class="hero-aside"><p class="eyebrow">EL TERRITORIO DE LOS RELATOS</p><p>Un lugar para leer sobre las tradiciones que inspiran nuestro universo. Con contexto regional, fuentes para seguir investigando y espacio para las diferencias.</p><a href="criterios-editoriales/index.html">Cómo leemos y contamos estas historias</a></div></section>
<section class="page-shell section-space" aria-labelledby="stories-title"><div class="section-heading"><div><p class="eyebrow">PARA EMPEZAR A EXPLORAR</p><h2 id="stories-title">Historias para seguir explorando</h2></div><a class="text-link" href="leyendas/index.html">Ver todos los artículos →</a></div>{cards('/', articles)}</section>
<section class="page-shell project-band" aria-labelledby="project-title"><div><p class="eyebrow">DE LOS RELATOS A LA MESA</p><h2 id="project-title">Historias para leer.<br>Un mundo para jugar.</h2></div><div><p>ARGENTINIA — Magia y Leyenda es un juego de cartas para navegador. Paisajes, costumbres y relatos argentinos inspiran un universo fantástico donde cada partida se decide con estrategia.</p><p>La tradición cultural y su adaptación tienen recorridos propios. Acá podés conocer las fuentes; en el juego, descubrir cómo se transforman en cartas.</p><div class="link-row"><a class="text-link" href="sobre-el-proyecto/index.html">Conocer el proyecto →</a><a class="text-link" href="manual/index.html">Leer cómo se juega →</a></div></div></section>
<section class="page-shell section-space reading-invitation"><p class="eyebrow">UNA HISTORIA PUEDE TENER MUCHAS VOCES</p><h2>¿Conocés otra versión?</h2><p>El lugar, la persona que la cuenta y los detalles que cambian también forman parte de una historia. Podés acercarnos una referencia o señalar una corrección.</p><a class="text-link" href="contacto/index.html">Escribir al proyecto →</a></section>'''


class TrustedPageBody(HTMLParser):
    """Allowlisted extraction of existing manual/legal markup, without scripts.

    Input here is the owner's existing public files, never CMS-provided HTML.
    Remove authoring placeholders and image slots missing from this working copy.
    No raw callbacks, tracking, iframe, Cloudflare injected scripts or nested main.
    """
    ALLOWED = {'div', 'section', 'article', 'aside', 'nav', 'h1', 'h2', 'h3', 'h4', 'p', 'a', 'b', 'strong', 'em', 'i', 'small', 'span', 'ul', 'ol', 'li', 'br', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'dl', 'dt', 'dd', 'time'}
    DROP = {'script', 'style', 'iframe', 'object', 'embed', 'figure', 'form', 'button', 'svg'}

    def __init__(self, mode, route, config):
        super().__init__(convert_charrefs=True)
        self.mode, self.route, self.config = mode, route, config
        self.result, self.stack = [], []
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in {'meta', 'link', 'input', 'img', 'source', 'hr', 'wbr'}:
            return
        if self.skip_depth:
            if tag != 'br':
                self.skip_depth += 1
            return
        if tag in self.DROP or 'arg-manual-public-cards' in attrs.get('class', ''):
            self.skip_depth = 1
            return
        mapped = 'div' if tag == 'main' else tag
        if mapped not in self.ALLOWED:
            self.stack.append(None)
            return
        clean = {}
        for key in ('class', 'id', 'aria-label', 'datetime'):
            if key in attrs:
                clean[key] = attrs[key]
        if mapped == 'a':
            href = attrs.get('href', '')
            if href.startswith('/cdn-cgi/l/email-protection'):
                clean['href'] = 'mailto:' + self.config['contactEmail']
            elif href.startswith('#'):
                clean['href'] = href
            elif href in ('/', './', '/argentinia/', '/jugar/'):
                clean['href'] = self.config['playUrl']
            elif href.startswith('https://'):
                clean['href'] = safe_url(href)
            elif href.startswith('mailto:'):
                clean['href'] = href
            else:
                # Existing links must be consciously mapped, not silently retained.
                mapping = {'/manual.html': '/manual/', '/aboutUs.html': '/sobre-el-proyecto/', '/leyendas.html': '/leyendas/', '/privacidad/': '/privacidad/', '/terminos/': '/terminos/'}
                if href not in mapping:
                    raise ValueError(f'Enlace existente sin mapear: {href}')
                clean['href'] = relative(self.route, mapping[href])
        self.result.append('<' + mapped + ''.join(f' {k}="{esc(v)}"' for k, v in clean.items()) + '>')
        if tag != 'br':
            self.stack.append(mapped)

    def handle_endtag(self, tag):
        if tag in {'meta', 'link', 'input', 'img', 'source', 'hr', 'wbr', 'br'}:
            return
        if self.skip_depth:
            self.skip_depth -= 1
            return
        if self.stack:
            mapped = self.stack.pop()
            if mapped:
                self.result.append(f'</{mapped}>')

    def handle_data(self, data):
        if not self.skip_depth:
            # Replace only Cloudflare's masked contact label, not arbitrary text.
            self.result.append(esc(data.replace('[email\u00a0protected]', self.config['contactEmail']).replace('[email protected]', self.config['contactEmail'])))


def extract_body(path, mode, route, config):
    source = path.read_text(encoding='utf-8-sig')
    if mode == 'manual':
        start = source.index('<div class="arg-manual-shell"')
        end = source.rindex('</main>')
        fragment = source[start:end]
    else:
        start = source.index('>', source.index('<main ')) + 1
        fragment = source[start:source.index('</main>', start)]
    parser = TrustedPageBody(mode, route, config)
    parser.feed(fragment)
    parser.close()
    if parser.stack or parser.skip_depth:
        raise ValueError(f'Estructura incompleta en fuente pública: {path.name}')
    return ''.join(parser.result)


