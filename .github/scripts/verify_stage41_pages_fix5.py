#!/usr/bin/env python3
"""Fail-closed GitHub Actions check: run AFTER regenerating image manifest on live checkout."""
from pathlib import Path
import json, os, re, sys
root=Path.cwd(); app=root/'argentinia'; errors=[]
def fail(t): errors.append(t)
for sibling in ('band','botonera','clima','curso_js','curso_react','cv','top5','trivia','privacidad','terminos'):
    p=root/sibling
    if not p.is_dir(): fail('missing sibling '+sibling)
    if sibling=='curso_react':
        if not (p/'package.json').is_file():fail('missing curso_react package.json')
    elif not (p/'index.html').is_file():fail('missing sibling index '+sibling)
for rel in ('css/landing.css','css/legal.css','js/landing.js','img/logo.png','img/logoTop5.png','img/bandas'):
    if not (root/rel).exists():fail('missing shared asset '+rel)
for rel in ('functions','firebase.json','firestore.rules','08_Private_Internal','argentinia/tools'):
    if (root/rel).exists():fail('private path included '+rel)
for rel in ('argentinia/index.html','argentinia/js/main.js','argentinia/js/sharedAssets.js','argentinia/build-manifest.json','argentinia/assets/manifest.webmanifest','argentinia/cartas/index.html','argentinia/assets/images/cards/cards-image-manifest.json'):
    if not (root/rel).is_file():fail('missing public runtime '+rel)
try:
    manifest=json.loads((app/'build-manifest.json').read_text(encoding='utf-8-sig'))
    if manifest.get('engineProtocolVersion')!='mp-23.19.2-fl40':fail('stale multiplayer protocol in public manifest')
    if not re.fullmatch(r'[a-f0-9]{20}',str(manifest.get('buildId',''))):fail('missing runtime buildId')
    for rel in ('./js/main.js','./js/sharedAssets.js','./assets/images/cards/cards-image-manifest.json','./js/flasheraGameplay.js'):
        if rel not in manifest.get('refreshAssets',[]):fail('refreshAssets lacks '+rel)
    document=(app/'index.html').read_text(encoding='utf-8-sig')
    if document.count('<base href="/">')!=1 or document.count('data-shared-asset-revision=""')!=1:fail('game lost its single shared asset base/revision marker')
except Exception as ex:fail('build-manifest invalid: '+str(ex))
try:
    images=json.loads((app/'assets/images/cards/cards-image-manifest.json').read_text(encoding='utf-8-sig'))
    stats=images.get('images') or {}
    existing=int(stats.get('existingFileCount') or 0)
    missing=int(stats.get('missingCardCount') or 0)
    refs=int(stats.get('referencedFaceCount') or 0)
    if existing<=0 or refs<900 or missing>=refs: fail(f'PNG manifest all-missing or no retained art existing={existing} missing={missing} refs={refs}')
    if len(images.get('missing',[]))!=missing:fail('PNG missing[] cardinality mismatch')
    sha=os.environ.get('GITHUB_SHA')
    if sha and images.get('gitSha')!=sha:fail('PNG manifest stale relative to GITHUB_SHA')
except Exception as ex:fail('PNG manifest invalid: '+str(ex))
try:
    if sum(x.is_dir() for x in (app/'cartas').iterdir())!=180:fail('public galleries count !=180')
    # Source sitemap is retained for rollback. The new artifact sitemap is checked
    # against its concrete routes by verify_portal_pages.py after projection.
    import xml.etree.ElementTree as ET
    ET.fromstring((root/'sitemap.xml').read_text(encoding='utf-8-sig'))
except Exception as ex:fail('gallery/sitemap invalid: '+str(ex))
for name in ('flasheraGameplay.js','flasheraRenderer.js','cardVariant.js'):
    if not (app/'js'/name).is_file():fail('flashera frontend missing '+name)
for rel in ('portal/portal.css','portal/stage2.css','portal/portal-config.json','portal/content/bootstrap.json','portal/runtime/editor.js','portal/runtime/articleModel.js','portal/runtime/articleRenderer.js','.github/portal-publisher.json','.github/scripts/build_public_pages.py','.github/scripts/editorial_layout.py','.github/scripts/editorial_game.py','.github/scripts/editorial_feed.py','.github/scripts/render_editorial.mjs','.github/scripts/verify_portal_pages.py'):
    if not (root/rel).is_file():fail('missing editorial source '+rel)
for path in (root/'portal').rglob('*'):
    if path.name in ('backend','trusted','node_modules','tests','OWNER','TRANSFER'):
        fail('private editorial source path '+str(path.relative_to(root)))
    if path.is_file() and path.suffix in ('.zip','.log','.pyc','.patch','.md'):
        fail('private editorial source file '+str(path.relative_to(root)))
try:
    config=json.loads((root/'portal/portal-config.json').read_text(encoding='utf-8-sig'))
    if config.get('emulators') is not None:fail('emulator config in public source')
    publisher=json.loads((root/'.github/portal-publisher.json').read_text(encoding='utf-8-sig'))
    if publisher.get('assetLayout')!='shared-root-v1':fail('publisher does not share the original game resources')
    for name in ('editorialModel.js','editorialFrames.js','editorialShapes.js','gameDialogs.js'):
        if (root/'portal/runtime/vendor'/name).read_text(encoding='utf-8-sig')!="export * from '../../../argentinia/js/"+name+"';\n":fail('portal duplicates original component '+name)
except Exception as ex:fail('portal config invalid: '+str(ex))
if errors:
    print('\n'.join('::error::FIX5_PAGES '+x for x in errors),file=sys.stderr)
    sys.exit(1)
print('FIX5_PAGES_RELEASE_GUARD_OK protocol=fl40 siblings=10 retainedPNGs=YES secretDirs=NONE')
