"""Owner/CI validation of the complete artifact; no network, mutation or deploy."""
import argparse
import hashlib
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit,unquote
import xml.etree.ElementTree as ET
sys.dont_write_bytecode=True
from build_public_pages import INDEXED,ALIASES,SIBLINGS,MAX_PUBLISHED_BYTES,game_document,remote_asset
from editorial_layout import extract_body


class Page(HTMLParser):
    def __init__(self,text):
        super().__init__();self.tags=[];self.feed(text)
    def handle_starttag(self,tag,attrs):self.tags.append((tag,dict(attrs)))


def verify(repo,artifact,report):
    repo=repo.resolve();artifact=artifact.resolve();errors=[]
    def check(condition,message):
        if not condition:errors.append(message)
    def read(path):return path.read_text(encoding='utf-8-sig')
    cfg=json.loads(read(repo/'.github/portal-publisher.json'))
    receipt=json.loads(read(artifact/'editorial/release.json'))
    route_data=json.loads(read(artifact/'editorial/routes.json'))
    expected=set(INDEXED)|{a.get('route','/leyendas/'+a['slug']+'/') for a in receipt['articles']}
    if report['mode']=='game-compat':expected.discard('/')
    check(not report['missingRetainedSources'],'incomplete retained sources; not publishable')
    check(set(route_data['indexedRoutes'])==expected,'route manifest differs from explicit editorial/game routes')
    actual={node.text for node in ET.fromstring(read(artifact/'sitemap.xml')).findall('{*}url/{*}loc')}
    check(actual=={cfg['origin']+p for p in expected},'sitemap differs from the exact expected route set')
    for route in expected:
        path=artifact/(route.lstrip('/')+'index.html')
        if not path.is_file():check(False,'indexed page missing '+route);continue
        tags=Page(read(path)).tags
        check(any(t=='link' and a.get('rel')=='canonical' and a.get('href')==cfg['origin']+route for t,a in tags),'canonical differs '+route)
        check(not any(t=='meta' and a.get('name')=='robots' and 'noindex' in a.get('content','') for t,a in tags),'indexed page has noindex '+route)
    for route in ('/editor/','/404.html',*ALIASES):
        path=artifact/(route.lstrip('/')+'index.html' if route.endswith('/') else route.lstrip('/'))
        check(path.is_file(),'missing non-indexed route '+route)
        if path.is_file():check('noindex' in read(path),'non-indexed route lost noindex '+route)
    shared=json.loads(read(artifact/'editorial/shared-assets.json'));revision=shared['revision'];policy=shared['policy']
    check(cfg.get('assetLayout')==shared.get('layout')=='shared-root-v1','resource layout mismatch')
    check(read(artifact/'jugar/index.html')==game_document(repo/'argentinia/index.html',revision),'game document differs outside the declared immutable-media revision')
    check('<base href="/">' in read(artifact/'jugar/index.html'),'game must resolve the original shared resource URLs')
    for directory in ('js','css','assets/data'):
        for source in (repo/'argentinia'/directory).rglob('*'):
            if not source.is_file() or any(part.startswith('build-') for part in source.relative_to(repo/'argentinia').parts):continue
            target=artifact/source.relative_to(repo/'argentinia')
            check(target.is_file() and target.read_bytes()==source.read_bytes(),'shared runtime changed/missing '+str(source.relative_to(repo)))
    for directory in ('js','css','assets'):
        check(not (artifact/'jugar'/directory).exists(),'duplicate game resource tree /jugar/'+directory)
    for source in (repo/'argentinia/assets').rglob('*'):
        if not source.is_file():continue
        rel=source.relative_to(repo/'argentinia/assets');target=artifact/'assets'/rel
        if remote_asset(rel,policy):check(not target.exists(),'external original also copied into Pages '+rel.as_posix())
        else:check(target.is_file() and target.read_bytes()==source.read_bytes(),'shared local asset changed/missing '+rel.as_posix())
    expected_remote={p.relative_to(repo/'argentinia/assets').as_posix() for p in (repo/'argentinia/assets').rglob('*') if p.is_file() and remote_asset(p.relative_to(repo/'argentinia/assets'),policy)}
    check({row['path'] for row in shared['externalOriginals']}==expected_remote,'external original manifest incomplete')
    for row in shared['externalOriginals']:
        source=repo/'argentinia/assets'/row['path']
        check(hashlib.sha256(source.read_bytes()).hexdigest()==row['sha256'],'external original changed '+row['path'])
        check(row['url'].startswith('https://raw.githubusercontent.com/polgamero/polgamero.github.io/'+revision+'/argentinia/assets/'),'external original revision mismatch')
    for name in ('editorialModel.js','editorialFrames.js','editorialShapes.js','gameDialogs.js'):
        check(read(artifact/'runtime/vendor'/name)=="export * from '/js/"+name+"';\n",'portal duplicates game-owned component '+name)
    total_bytes=sum(p.stat().st_size for p in artifact.rglob('*') if p.is_file())
    check(total_bytes==report['publishedBytes'] and total_bytes<=MAX_PUBLISHED_BYTES,'published size limit/report mismatch')
    pwa=json.loads(read(artifact/'assets/manifest.webmanifest'))
    check(pwa.get('id')=='/' and pwa.get('start_url')=='/jugar/' and pwa.get('scope')=='/jugar/','PWA identity/start/scope regression')
    game=json.loads(read(artifact/'build-manifest.json'));original=json.loads(read(repo/'argentinia/build-manifest.json'))
    check(game=={**original,'refreshAssets':['./jugar/index.html' if p=='./index.html' else p for p in original['refreshAssets']]},'published cache manifest differs beyond entry route')
    check(game['buildId']==receipt['gameBuildId'],'game/cache/receipt buildId differs')
    check(game['protocolVersion']=='mp-23.19.2-fl40','multiplayer protocol changed')
    for url in game['refreshAssets']:check((artifact/url.lstrip('/')).is_file(),'missing canonical refresh asset '+url)
    for site in SIBLINGS:
        source=repo/site;target=artifact/site
        check(target.is_dir(),'lost retained site '+site)
        if site in ('privacidad','terminos'):
            expected_body=extract_body(source/'index.html','legal','/'+site+'/',{'playUrl':'/jugar/','contactEmail':'magiayleyenda@gmail.com'})
            check(expected_body in read(target/'index.html'),'legal body changed '+site)
        else:
            for p in source.rglob('*'):
                if p.is_file():check((target/p.relative_to(source)).is_file() and (target/p.relative_to(source)).read_bytes()==p.read_bytes(),'retained site changed '+site+'/'+p.relative_to(source).as_posix())
    for source in (repo/'img').rglob('*'):
        if source.is_file():check((artifact/'img'/source.relative_to(repo/'img')).is_file() and (artifact/'img'/source.relative_to(repo/'img')).read_bytes()==source.read_bytes(),'retained root image changed '+source.name)
    for name in ('CNAME','ads.txt','robots.txt'):check((artifact/name).read_bytes()==(repo/name).read_bytes(),'root publisher/crawler file changed '+name)
    gallery=artifact/'cartas'
    check(sum(p.is_dir() for p in gallery.iterdir())==180,'gallery cardinality changed')
    for p in gallery.rglob('*.html'):
        text=read(p);check('noindex,follow' in text,'gallery noindex changed '+p.name);check('/jugar/assets/' not in text,'gallery must use the single shared asset tree '+p.name)
    for rel in ('functions','firebase.json','firestore.rules','.github','portal','08_Private_Internal','seed-articles.json','preview-manifest.json','backend','jugar/tools'):
        check(not (artifact/rel).exists(),'private/source artifact path '+rel)
    forbidden={'trusted','node_modules','OWNER','TRANSFER','__pycache__'}
    for base in ('runtime','js','css','assets/data','media'):
        folder=artifact/base
        if not folder.exists():continue
        for path in folder.rglob('*'):
            check(path.name not in forbidden,'private artifact directory '+path.name)
            if path.is_file():check(path.suffix not in ('.zip','.log','.patch','.pyc','.md','.mjs','.cjs','.py'),'private artifact extension '+str(path.relative_to(artifact)))
    # Editorial pages must have usable local links and no engine startup script.
    editorial_routes=(expected-{'/jugar/'})|{'/editor/','/404.html'}
    if report['mode']=='game-compat':editorial_routes.discard('/')
    for route in editorial_routes:
        file=artifact/(route.lstrip('/')+'index.html' if route.endswith('/') else route.lstrip('/'));text=read(file);page=Page(text)
        for tag,attrs in page.tags:
            if tag=='script':check('/jugar/js/' not in attrs.get('src','') and '/js/main.js' not in attrs.get('src',''),'editorial route starts game engine '+route)
            value=attrs.get('href') if tag in ('a','link') else attrs.get('src') if tag in ('img','script') else None
            if not value:continue
            url=urlsplit(value)
            if url.scheme or url.netloc or not url.path:continue
            local=(artifact/url.path.lstrip('/')) if url.path.startswith('/') else file.parent/unquote(url.path)
            if local.is_dir():local=local/'index.html'
            check(local.resolve().is_relative_to(artifact) and local.is_file(),'broken editorial local link '+route+' -> '+value)
        if route not in ('/404.html','/editor/'):check('class="play-link" href="/jugar/"' in text,'JUGAR destination incorrect '+route)
    check((artifact/'favicon.png').read_bytes()==(repo/'argentinia/favicon.png').read_bytes(),'original favicon differs')
    home=Page(read(artifact/'index.html')).tags
    if report['mode']=='portal':
        check(sum(t=='img' and '/images/ui/logo.png' in a.get('src','') for t,a in home)==1,'home must have only the navbar logo')
        check(any(t=='img' and '/images/matito/' in a.get('src','') for t,a in home),'home lacks original Matito art')
        check(any(t=='img' and '/images/cards/' in a.get('src','') for t,a in home),'home lacks real game card art')
    manual=read(artifact/'manual/index.html')
    check(manual.count('data-manual-base=')==10,'public manual must retain every original figure')
    check('/runtime/manual.js' in manual or '../runtime/manual.js' in manual,'public manual loader missing')
    for name in ('siteEditorialAdmin.js','rankingTable.js','triggerLabels.js'):
        check((artifact/'js'/name).is_file(),'missing shared game component '+name)
    check((artifact/'editorial-admin.html').is_file(),'embedded Admin template missing')
    if errors:raise ValueError('\n'.join(errors))
    return {'status':'PASS','indexedRoutes':len(expected),'retainedSites':10,'gameBuildId':game['buildId'],'protocol':'mp-23.19.2-fl40','publishedBytes':total_bytes,'externalOriginals':len(shared['externalOriginals']),'deployExecuted':False}


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--repo',type=Path,default=Path.cwd());parser.add_argument('--artifact',type=Path,default=Path('.pages-root'));parser.add_argument('--report',type=Path,required=True);parser.add_argument('--result',type=Path);args=parser.parse_args()
    try:
        result=verify(args.repo,args.artifact,json.loads(args.report.read_text(encoding='utf-8-sig')))
        if args.result:args.result.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
        print('PORTAL_PAGES_GUARD_PASS '+json.dumps(result))
    except Exception as error:
        print('::error::PORTAL_PAGES '+str(error),file=sys.stderr);raise SystemExit(1)
