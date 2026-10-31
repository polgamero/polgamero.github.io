"""Build the Pages artifact: editorial root + canonical game at /jugar/.

No Firebase writes, GitHub dispatches or private filesystem dependencies.
The owner runs validation; calling this entry point only constructs files.
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote
from xml.sax.saxutils import escape as xml_escape
sys.dont_write_bytecode=True
from editorial_layout import chrome,intro,link,extract_body,esc,relative
from editorial_game import home,cards,evolutions
from editorial_feed import read_release,latest_release,NoApprovedRelease

SIBLINGS=('band','botonera','clima','curso_js','curso_react','cv','top5','trivia','privacidad','terminos')
INDEXED=('/', '/leyendas/','/ranking/','/manual/','/matito/','/sobre-el-proyecto/','/criterios-editoriales/','/contacto/','/privacidad/','/terminos/','/jugar/')
ALIASES={'/aboutUs.html':'/sobre-el-proyecto/','/manual.html':'/manual/','/leyendas.html':'/leyendas/','/argentinia/':'/jugar/','/jugar/aboutUs.html':'/sobre-el-proyecto/','/jugar/manual.html':'/manual/','/jugar/leyendas.html':'/leyendas/'}
MAX_PUBLISHED_BYTES=1_000_000_000


def remote_asset(path,policy):
    value=str(path).replace('\\','/').strip('/')
    # Match files, never their parent directories: metadata and canonical cache
    # resources must survive beside offloaded media in the same source folder.
    return value not in policy['localFiles'] and any(value.lower().endswith(ext) for ext in policy['remoteExtensions']) and (value in policy['remoteFiles'] or any(value.startswith(p) for p in policy['remotePrefixes']))


def game_document(source,revision):
    text=source.read_text(encoding='utf-8-sig')
    marker='data-shared-asset-revision=""'
    if text.count(marker)!=1 or '<base href="/">' not in text:raise ValueError('Game document must declare the single shared resource base')
    return text.replace(marker,'data-shared-asset-revision="'+revision+'"',1)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def copy_tree(source,target,ignore=None):
    if source.is_symlink() or any(p.is_symlink() for p in source.rglob('*')):
        raise ValueError('Symlinks are not projected from public source: '+str(source))
    def copy_file(src,dst):
        # Owner-only local artifacts can share immutable binaries instead of
        # multiplying the real retained card art/music for each projection.
        if os.environ.get('ARG_OWNER_LINK_ASSETS')=='1' and Path(src).suffix.lower() in {'.png','.jpg','.jpeg','.webp','.gif','.ico','.ttf','.woff','.woff2','.mp3','.opus','.ogg','.wav','.mp4','.pdf'}:
            os.link(src,dst);return dst
        return shutil.copy2(src,dst)
    shutil.copytree(source,target,dirs_exist_ok=True,ignore=ignore,copy_function=copy_file)


def redirect(target,manifest=False):
    # This is an HTML redirect, not an HTTP 301. Keep exact query/hash values.
    destination=json.dumps(target).replace('<','\\u003c')
    return '<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="robots" content="noindex,follow"><meta name="viewport" content="width=device-width,initial-scale=1">'+('<link rel="manifest" href="/assets/manifest.webmanifest">' if manifest else '')+f'<link rel="canonical" href="https://magiayleyenda.com.ar{esc(target)}"><meta http-equiv="refresh" content="0;url={esc(target)}"><title>ARGENTINIA — Magia y Leyenda</title></head><body><p><a href="{esc(target)}">Continuar en ARGENTINIA</a></p><script>const u=new URL({destination},location.origin);u.search=location.search;u.hash=location.hash;location.replace(u.href);</script></body></html>'


def write_route(output,route,text):
    file=output/(route.lstrip('/')+'index.html' if route.endswith('/') else route.lstrip('/'))
    file.parent.mkdir(parents=True,exist_ok=True);file.write_text(text,encoding='utf-8',newline='\n')


def portal_page(route,title,description,body,settings,script=None,classes='',jsonld=None):
    config={**settings,'robots':'noindex,follow' if route in ('/editor/','/404.html') else 'index,follow,max-image-preview:large'}
    result=chrome(route,title,description,body,config,active=route,extra_class=classes)
    result=result.replace('<html lang="es-AR">','<html lang="es-AR" data-shared-asset-revision="'+settings['sharedRevision']+'">',1)
    canonical=settings['origin']+route
    head=f'<link rel="canonical" href="{esc(canonical)}"><meta property="og:site_name" content="ARGENTINIA — Magia y Leyenda"><meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(description)}"><meta property="og:url" content="{esc(canonical)}"><link rel="stylesheet" href="{relative(route,"/stage2.css")}"><meta name="google-adsense-account" content="ca-pub-6181395403710642">'
    if route=='/':head+='<link rel="manifest" href="/assets/manifest.webmanifest">'
    if jsonld:head+='<script type="application/ld+json">'+jsonld+'</script>'
    result=result.replace('</head>',head+'</head>')
    if script:result=result.replace('</body>',f'<script type="module" src="{relative(route,"/runtime/"+script)}"></script></body>')
    if route=='/404.html':
        result=re.sub(r'(href|src)="(?![a-z]+:|/|#)([^"]+)"',lambda m:m[1]+'="/'+m[2]+'"',result)
    return result


def build(repo,output,allow_incomplete=False,mode_override=None,owner_config=None,owner_snapshot=None):
    repo=repo.resolve();output=output.resolve();app=repo/'argentinia';portal=repo/'portal'
    if os.environ.get('ARG_OWNER_LINK_ASSETS')=='1' and os.environ.get('GITHUB_ACTIONS')=='true':raise ValueError('Owner hardlinked artifacts are forbidden in production Actions')
    if output==repo or repo.is_relative_to(output) or output.is_relative_to(app) or output.is_relative_to(portal) or output.exists():
        raise ValueError('Output must be a new artifact directory, outside source directories')
    if allow_incomplete and os.environ.get('GITHUB_ACTIONS')=='true':
        raise ValueError('Incomplete preview is forbidden in GitHub Actions')
    cfg=json.loads((repo/'.github/portal-publisher.json').read_text(encoding='utf-8-sig'))
    if cfg.get('schemaVersion')!=1 or cfg.get('assetLayout')!='shared-root-v1' or tuple(cfg.get('retainedSites',[]))!=SIBLINGS or cfg.get('source') not in ('bootstrap','feed','auto'):
        raise ValueError('Invalid publisher configuration')
    mode=mode_override or cfg['mode']
    if mode not in ('portal','game-compat') or cfg.get('origin')!='https://magiayleyenda.com.ar':
        raise ValueError('Invalid projection mode/origin')
    missing=[]

    def require(path):
        if path.exists():return True
        missing.append(path.relative_to(repo).as_posix())
        if not allow_incomplete:raise ValueError('Missing retained public source: '+missing[-1])
        return False

    for name in SIBLINGS:
        require(repo/name)
        require(repo/name/('package.json' if name=='curso_react' else 'index.html'))
    for name in ('CNAME','ads.txt','robots.txt','css/landing.css','css/legal.css','js/landing.js','img/logo.png','img/logoTop5.png','img/bandas'):
        require(repo/name)
    for name in ('index.html','build-manifest.json','assets/manifest.webmanifest','manual.html','cartas/index.html'):
        if not (app/name).is_file():raise ValueError('Missing game source: '+name)
    if (repo/'CNAME').read_text(encoding='utf-8-sig').strip()!=cfg['origin'].removeprefix('https://'):
        raise ValueError('Unexpected Pages custom domain')
    public_config=json.loads((owner_config or portal/'portal-config.json').read_text(encoding='utf-8-sig'))
    if not owner_config and public_config.get('emulators') is not None:
        raise ValueError('Emulator configuration cannot enter a production artifact')
    actual_source=cfg['source']
    snapshot=None
    if owner_snapshot:
        if os.environ.get('GITHUB_ACTIONS')=='true':raise ValueError('Owner snapshot override is not a production input')
        snapshot=json.loads(owner_snapshot.read_text(encoding='utf-8-sig'));media_files={p.stem:p.read_bytes() for p in (owner_snapshot.parent/'media').glob('*.webp')}
    elif cfg['source'] in ('feed','auto'):
        try:
            snapshot,media_files=read_release(cfg['feedUrl']);actual_source='feed'
        except NoApprovedRelease:
            if cfg['source']!='auto':raise
            actual_source='bootstrap'
    if snapshot is None:
        initial=json.loads((portal/'content/bootstrap.json').read_text(encoding='utf-8-sig'))
        snapshot={'releaseId':None,'articles':[{'article':a,'publication':None} for a in initial]};media_files={}
    command=['node','--experimental-default-type=module',str(repo/'.github/scripts/render_editorial.mjs')]
    payload=json.loads(subprocess.run(command,input=json.dumps(snapshot,ensure_ascii=False),text=True,encoding='utf-8',capture_output=True,check=True).stdout)
    rendered=payload['articles'];policy=payload['sharedAssets']
    revision=os.environ.get('GITHUB_SHA') or policy['fallbackRevision']
    if not re.fullmatch(r'[a-f0-9]{40}',revision) or policy['repository']!='polgamero/polgamero.github.io':raise ValueError('Invalid immutable shared-media revision/repository')
    game_manifest=json.loads((app/'build-manifest.json').read_text(encoding='utf-8-sig'))
    for url in game_manifest['refreshAssets']:
        if url.startswith('./assets/') and remote_asset(url[len('./assets/'):],policy):
            raise ValueError('CANONICAL_REFRESH_ASSET_MUST_REMAIN_LOCAL: '+url)
    external=[]
    for path in sorted((app/'assets').rglob('*')):
        if path.is_file() and remote_asset(path.relative_to(app/'assets'),policy):
            rel=path.relative_to(app/'assets').as_posix()
            external.append({'path':rel,'bytes':path.stat().st_size,'sha256':sha(path),'url':'https://raw.githubusercontent.com/'+policy['repository']+'/'+revision+'/argentinia/assets/'+quote(rel,safe='/')})
    if actual_source=='bootstrap' and not owner_snapshot:
        snapshot['releaseId']='bootstrap-'+hashlib.sha256(json.dumps(rendered,sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:20]
    output.mkdir(parents=True)
    # Preserve the released /js, /css and /assets URLs. Both the portal and the
    # /jugar/ document use these same files; no second runtime or asset tree.
    for directory in ('js','css'):
        copy_tree(app/directory,output/directory,ignore=(lambda parent,names:[n for n in names if n.startswith('build-')]) if directory=='js' else None)
    def ignore_media(parent,names):
        relative=Path(parent).relative_to(app/'assets')
        return [name for name in names if remote_asset(relative/name,policy)]
    copy_tree(app/'assets',output/'assets',ignore=ignore_media)
    shutil.copyfile(app/'favicon.png',output/'favicon.png')
    write_route(output,'/jugar/',game_document(app/'index.html',revision))
    published_manifest={**game_manifest,'refreshAssets':['./jugar/index.html' if name=='./index.html' else name for name in game_manifest['refreshAssets']]}
    (output/'build-manifest.json').write_text(json.dumps(published_manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    retained={}
    for name in SIBLINGS:
        source=repo/name
        if source.is_dir():copy_tree(source,output/name)
        retained[name]={p.relative_to(source).as_posix():sha(p) for p in source.rglob('*') if p.is_file()} if source.is_dir() else None
    if (repo/'img').is_dir():copy_tree(repo/'img',output/'img')
    for name in ('css/landing.css','css/legal.css','js/landing.js'):
        if (repo/name).is_file():
            target=output/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(repo/name,target)
    landing=output/'css/landing.css'
    if landing.is_file():landing.write_text(landing.read_text(encoding='utf-8-sig').replace('/argentinia/assets/','/assets/'),encoding='utf-8')
    # Public card gallery retains its URLs/noindex. Only asset/play references move.
    copy_tree(app/'cartas',output/'cartas')
    for path in (output/'cartas').rglob('*.html'):
        text=path.read_text(encoding='utf-8-sig').replace('href="/"','href="/jugar/"')
        path.write_text(text,encoding='utf-8')
    (output/'css').mkdir(exist_ok=True);shutil.copyfile(app/'css/public-info.css',output/'css/public-info.css')
    copy_tree(portal/'runtime',output/'runtime')
    # The editor uses the actual game-owned models/dialogs. Source copies remain
    # only for isolated authoring/Functions; deployed stubs share one ESM owner.
    for name in ('editorialModel.js','editorialFrames.js','editorialShapes.js','gameDialogs.js'):
        (output/'runtime/vendor'/name).write_text("export * from '/js/"+name+"';\n",encoding='utf-8')
    for name in ('portal.css','stage2.css'):shutil.copyfile(portal/name,output/name)
    (output/'portal-config.json').write_text(json.dumps(public_config,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    # The original logo, backgrounds, frame and licensed fonts already exist
    # exactly once in /assets/. Portal CSS/HTML refer to those same URLs.
    settings={'origin':cfg['origin'],'playUrl':'/jugar/','contactEmail':'magiayleyenda@gmail.com','sharedRevision':revision}
    site_pages={};listing=[]
    for item in rendered:
        article=item['article'];kinds=[t[6:] for t in article['tags'] if t.startswith('sitio:')]
        if kinds:
            if len(kinds)!=1 or kinds[0] not in ('portada','matito') or kinds[0] in site_pages:raise ValueError('Duplicate or unknown site content page')
            site_pages[kinds[0]]=item
        else:listing.append({**article,'gameCard':item.get('gameCard')})
    write_route(output,'/',portal_page('/','ARGENTINIA — Magia y Leyenda','Cartas coleccionables, estrategia y fantasía argentina. Conocé a Matito, las leyendas, el ranking y jugá ARGENTINIA.',home(listing[:6],payload['gameCards'],payload['gameMedia'],site_pages.get('portada',{}).get('article'),site_pages.get('matito',{}).get('article'),'<section class="page-shell home-editorial-copy">'+site_pages.get('portada',{}).get('bodyHTML','')+'</section>'),settings,script='home.js'))
    write_route(output,'/leyendas/',portal_page('/leyendas/','Mitos y leyendas de Argentina','Relatos argentinos, variantes y fuentes para seguir leyendo.',intro('Un territorio de relatos','Relatos, lugares y fuentes para recorrer el imaginario argentino.','MITOS Y LEYENDAS DE ARGENTINA')+'<section class="page-shell section-space">'+(cards('/leyendas/',listing) if listing else '<p>No hay artículos en esta edición.</p>')+'</section>',settings))
    for name,title,description in [('sobre-el-proyecto','El proyecto','El universo de ARGENTINIA y sus inspiraciones.'),('criterios-editoriales','Cómo contamos estas historias','Fuentes, variantes, autoría y correcciones.'),('contacto','Hablemos de una historia','Contacto público del proyecto ARGENTINIA.'),('ranking','Ranking del juego','La clasificación real de los jugadores de ARGENTINIA.')]:
        route='/'+name+'/'
        body=(portal/'templates'/(name+'.html')).read_text(encoding='utf-8')
        write_route(output,route,portal_page(route,title,description,body,settings,script='ranking.js' if name=='ranking' else 'editor.js' if name=='editor' else None))
    write_route(output,'/editor/',redirect('/jugar/'))
    (output/'editorial-admin.html').write_text('<!doctype html><meta name="robots" content="noindex,nofollow">'+(portal/'templates/editor.html').read_text(encoding='utf-8'),encoding='utf-8')
    manual=payload['manualHTML']
    write_route(output,'/manual/',portal_page('/manual/','Cómo se juega ARGENTINIA','Turnos, maná, combate, pila y modos de juego.','<div class="page-shell manual-body" data-game-manual>'+manual+'</div>',settings,script='manual.js',classes='manual-page'))
    for name,title in [('privacidad','Política de Privacidad'),('terminos','Términos y Condiciones')]:
        source=repo/name/'index.html'
        if source.is_file():
            route='/'+name+'/';body=extract_body(source,'legal',route,settings)
            write_route(output,route,portal_page(route,title,title+' de ARGENTINIA.','<div class="page-shell legal-body">'+body+'</div>',settings))
    matito=site_pages.get('matito')
    matito_body=(matito['html'] if matito else intro('Matito te invita a la ronda','Conocé a Matito y sus evoluciones.'))+evolutions(payload['gameMedia'])
    write_route(output,'/matito/',portal_page('/matito/','Matito y sus evoluciones','El compañero de ARGENTINIA: Matito, Mator y Materex.','<div class="page-shell article-shell">'+matito_body+'</div>',settings))
    article_routes=[]
    for item in rendered:
        article=item['article'];is_site=any(t.startswith('sitio:') for t in article['tags']);route='/leyendas/'+article['slug']+'/'
        if is_site:continue
        body='<div class="page-shell article-shell"><nav class="breadcrumbs" aria-label="Ubicación">'+link(route,'/','Inicio')+' / '+link(route,'/leyendas/','Leyendas')+'</nav>'+item['html']+'<div class="section-space">'+link(route,'/leyendas/','Volver al índice','text-link')+'</div></div>'
        write_route(output,route,portal_page(route,article['title'],article['excerpt'],body,settings,jsonld=item['jsonld']));article_routes.append(route)
    for mid in sorted({mid for item in rendered for mid in item['media']}):
        data=media_files.get(mid)
        if data is None or hashlib.sha256(data).hexdigest()!=mid:raise ValueError('Missing approved editorial media')
        target=output/'media'/(mid+'.webp');target.parent.mkdir(exist_ok=True);target.write_bytes(data)
    write_route(output,'/404.html',portal_page('/404.html','Página no encontrada','Volvé al índice de ARGENTINIA.',intro('Este camino no llega a una página','Podés volver al inicio o elegir otra historia desde el índice.','PÁGINA NO ENCONTRADA')+'<div class="page-shell section-space">'+link('/404.html','/','Volver al inicio','text-link')+'</div>',settings))
    for route,target in ALIASES.items():write_route(output,route,redirect(target))
    if mode=='game-compat':write_route(output,'/',redirect('/jugar/',manifest=True))
    routes=sorted([p for p in INDEXED if not (p=='/' and mode=='game-compat')]+article_routes)
    sitemap='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+''.join('  <url><loc>'+xml_escape(cfg['origin']+p)+'</loc></url>\n' for p in routes)+'</urlset>\n'
    (output/'sitemap.xml').write_text(sitemap,encoding='utf-8')
    for name in ('CNAME','ads.txt','robots.txt','.nojekyll'):
        if (repo/name).is_file():shutil.copyfile(repo/name,output/name)
    (output/'.nojekyll').touch()
    (output/'editorial').mkdir(exist_ok=True)
    receipt={'schemaVersion':1,'releaseId':snapshot['releaseId'],'source':'owner-snapshot' if owner_snapshot else actual_source,'gameBuildId':game_manifest['buildId'],'articles':[{'id':r['article']['id'],'slug':r['article']['slug'],'route':'/' if 'sitio:portada' in r['article']['tags'] else '/matito/' if 'sitio:matito' in r['article']['tags'] else '/leyendas/'+r['article']['slug']+'/','revision':r['revision'],'contentHash':r['contentHash']} for r in rendered]}
    (output/'editorial/release.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (output/'editorial/game-cards.json').write_text(json.dumps(payload['gameCards'],ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (output/'editorial/routes.json').write_text(json.dumps({'schemaVersion':1,'indexedRoutes':routes,'mode':mode},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (output/'editorial/shared-assets.json').write_text(json.dumps({'schemaVersion':1,'layout':'shared-root-v1','revision':revision,'policy':policy,'externalOriginals':external},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    total_bytes=sum(path.stat().st_size for path in output.rglob('*') if path.is_file())
    if total_bytes>MAX_PUBLISHED_BYTES:raise ValueError('PAGES_SIZE_LIMIT: '+str(total_bytes)+' bytes exceeds '+str(MAX_PUBLISHED_BYTES)+'; no upload permitted')
    return {'kind':'BUILD_REPORT_NOT_TEST_RESULT','mode':mode,'source':receipt['source'],'gameBuildId':game_manifest['buildId'],'releaseId':snapshot['releaseId'],'output':str(output),'missingRetainedSources':missing,'retainedSourceHashes':retained,'indexedRoutes':routes,'assetLayout':'shared-root-v1','publishedBytes':total_bytes,'sizeLimitBytes':MAX_PUBLISHED_BYTES,'remainingBytes':MAX_PUBLISHED_BYTES-total_bytes,'externalOriginalBytes':sum(e['bytes'] for e in external),'validation':'NOT_RUN','deployExecuted':False}


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--repo',type=Path,default=Path.cwd());parser.add_argument('--output',type=Path,default=Path('.pages-root'));parser.add_argument('--report',type=Path);parser.add_argument('--mode',choices=['portal','game-compat']);parser.add_argument('--allow-incomplete-preview',action='store_true');parser.add_argument('--owner-config',type=Path);parser.add_argument('--owner-snapshot',type=Path);parser.add_argument('--assert-current-release',type=Path);args=parser.parse_args()
    if args.assert_current_release:
        cfg=json.loads((args.repo/'.github/portal-publisher.json').read_text(encoding='utf-8-sig'));receipt=json.loads((args.assert_current_release/'editorial/release.json').read_text(encoding='utf-8-sig'))
        if receipt['source']=='feed' and latest_release(cfg['feedUrl'])!=receipt['releaseId']:raise SystemExit('EDITORIAL_RELEASE_SUPERSEDED: rebuild before uploading')
        print('Editorial release is still current; no upload performed by this command.')
    else:
        result=build(args.repo,args.output,args.allow_incomplete_preview,args.mode,args.owner_config,args.owner_snapshot)
        if args.report:args.report.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print('Pages artifact constructed; missing retained sources='+str(len(result['missingRetainedSources']))+'. Validation NOT RUN; deploy not performed.')
