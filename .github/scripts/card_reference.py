"""Reader reference for the existing 180 public pages, from public data only.

No engine decisions, recommendations about hidden cards, or new catalogue IDs.
The longer authored strategy guides live separately in card-guides.json.
"""
import html
import json
import re

KEYWORDS={
    'flying':('Volar','Esta criatura puede ser bloqueada por criaturas con Volar o Alcance. Revisá esas habilidades antes de contar un ataque como daño libre.'),
    'firststrike':('Golpe primero','Hace daño en el subpaso de golpe primero. Una criatura que muere allí no llega a devolver daño en el subpaso normal.'),
    'haste':('Rapidez','Permite atacar y usar habilidades de girar sin esperar al siguiente turno por el mareo de invocación. No endereza a la criatura ni reemplaza los otros requisitos de la acción.'),
    'menace':('Intimidante','No puede ser bloqueada por una sola criatura: el rival necesita al menos dos bloqueadores legales para bloquearla.'),
    'reach':('Alcance','Puede bloquear criaturas con Volar. Alcance no le da Volar ni evita que sea bloqueada al atacar.'),
    'vigilance':('Alerta','Atacar no la gira. Puede conservarse enderezada para acciones posteriores y para bloquear si sigue disponible.'),
    'lifelink':('Vínculo vital','El daño que hace también te hace ganar esa cantidad de vidas. La cuenta depende del daño efectivamente realizado, después de prevenciones.'),
    'hexproof':('Intocable','El rival no puede elegir este permanente como objetivo. No evita por sí sola los bloqueos ni efectos que no hacen objetivo.'),
    'trample':('Arrolla','Al asignar daño de combate, podés llevar el excedente al defensor después de asignar daño letal a los bloqueadores. Importan su resistencia efectiva y el daño que ya tienen.'),
    'deathtouch':('Letal','Una cantidad positiva de daño de esta fuente puede ser letal para una criatura. No equivale a destruir antes de que el daño se realice ni ignora Indestructible.'),
    'infect':('Contagio','Su daño a jugadores se convierte en contadores de veneno; su daño a criaturas, en contadores -1/-1. No sumes ese daño a la pérdida normal de vidas.'),
    'ward_1':('Protección de objetivo con coste adicional','Cuando el rival elige esta criatura como objetivo, puede tener que pagar el coste adicional de {1} indicado por su protección. Revisá la decisión que aparece en la Pila; no equivale a Intocable.')
}


def public_cards(app):
    result={}
    for name in ('tierras','criaturas','instantaneos','conjuros','artefactos','encantamientos','planeswalkers'):
        for card in json.loads((app/'assets/data'/(name+'.json')).read_text(encoding='utf-8-sig')):
            if card['name'] in result:raise ValueError('Ambiguous public card name')
            result[card['name']]=card
    return result


def reference(text,cards):
    title=re.search(r'<h1\b[^>]*>(.*?)</h1>',text)
    if not title:return text
    name=html.unescape(title[1])
    # Index is a list, never a new card or a new route.
    if 'class="public-card-detail"' not in text:return text
    card=cards.get(name)
    if not card:raise ValueError('Public gallery card missing from public source: '+name)
    kind=card['type'];paragraphs=[]
    if kind.startswith('Tierra'):
        paragraphs.append(('Jugar esta Tierra','Una Tierra se juega mediante una acción especial, no se lanza como hechizo. En condiciones normales, la jugás en tu fase principal con la Pila vacía y dentro del límite de tierras de ese turno. Su texto determina cómo entra y qué recursos puede producir.'))
    elif kind.startswith('Instantáneo') or 'flash' in card.get('keywords',[]):
        paragraphs.append(('Cuándo podés lanzarla','Podés lanzarla cuando tengas prioridad y se cumplan sus requisitos, incluso para responder a otra acción. Pagarla y ponerla en la Pila no garantiza que su efecto ya se haya realizado: el rival puede tener una respuesta.'))
    else:
        paragraphs.append(('Cuándo podés lanzarla','Su lanzamiento normal se realiza durante tu fase principal, con prioridad y la Pila vacía, salvo que una habilidad permita otro momento. Diferenciá el coste de lanzar la carta de los costes de activar habilidades una vez que está en la mesa.'))
    if 'Criatura' in kind:
        paragraphs.append(('Al llegar a la mesa','Sin un permiso adicional como Rapidez, una criatura recién entrada no puede atacar ni pagar habilidades propias con el símbolo de girar por el mareo de invocación. Puede bloquear si está enderezada y cumple las restricciones del bloqueo.'))
    elif 'Equipamiento' in kind:
        paragraphs.append(('Lanzar y equipar son acciones distintas','Poner el Equipamiento en la mesa no lo anexa automáticamente. Revisá el coste de Equipar y la criatura que lo recibirá; no cuentes la mejora como aplicada mientras la activación siga pendiente.'))
    elif 'Vehículo' in kind:
        paragraphs.append(('Antes de contar otro atacante','Un Vehículo no es automáticamente una criatura por estar en la mesa. Leé su condición de Tripular y comprobá su estado después de resolver esa habilidad antes de planear ataques o bloqueos con él.'))
    elif 'Aura' in kind:
        paragraphs.append(('Revisá qué puede encantar','El texto del Aura determina qué permanente puede recibirla. La mejora o restricción no está aplicada antes de resolver el hechizo, y una respuesta que retire su objetivo puede dejarte sin el resultado que buscabas.'))
    elif 'Saga' in kind:
        paragraphs.append(('Un efecto en capítulos','Sus capítulos reparten el efecto a lo largo de su avance. Evaluá qué capítulo corresponde ahora, en lugar de contar todos los efectos como si se resolvieran juntos al lanzar la carta.'))
    elif kind.startswith('Planeswalker'):
        paragraphs.append(('Habilidades de Creencia','Cada habilidad muestra un cambio de Creencia y un efecto. Poder pagar un coste no significa que todas las opciones tengan el mismo valor; revisá sus objetivos y el resultado que puede resolver sobre la mesa actual.'))
    for keyword in card.get('keywords',[]):
        if keyword in KEYWORDS:paragraphs.append(KEYWORDS[keyword])
    if card.get('requiresTarget') and 'Aura' not in kind:
        paragraphs.append(('El objetivo también importa','Revisá que el objetivo sea legal tanto al elegirlo como cuando corresponda resolver el efecto. Tener el maná disponible no reemplaza restricciones de tipo, control o protección.'))
    if not kind.startswith('Tierra'):
        paragraphs.append(('Coste y efecto son decisiones diferentes','La ficha conserva el coste y el texto de esta carta. Reservá recursos para las otras acciones de tu turno: una jugada pagable puede dejarte sin una respuesta que necesitabas conservar.'))
    markup='<section class="public-card-reference" aria-labelledby="reglas-carta" style="margin:2rem 0"><h2 id="reglas-carta">Reglas para usar '+html.escape(name)+'</h2>'
    markup+=''.join('<section><h3>'+html.escape(title)+'</h3><p>'+html.escape(body)+'</p></section>' for title,body in paragraphs)
    markup+='<p><a href="/manual/">Consultá el manual de ARGENTINIA</a> para seguir las fases, la prioridad y las decisiones de combate.</p></section>'
    anchor='<nav class="public-detail-actions">'
    if text.count(anchor)!=1:raise ValueError('Public card reference anchor changed')
    return text.replace(anchor,markup+anchor,1)
