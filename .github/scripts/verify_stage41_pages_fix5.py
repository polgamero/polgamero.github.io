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
for rel in ('argentinia/index.html','argentinia/js/main.js','argentinia/build-manifest.json','argentinia/assets/manifest.webmanifest','argentinia/cartas/index.html','argentinia/assets/images/cards/cards-image-manifest.json'):
    if not (root/rel).is_file():fail('missing public runtime '+rel)
try:
    manifest=json.loads((app/'build-manifest.json').read_text())
    if manifest.get('engineProtocolVersion')!='mp-23.19.2-fl40':fail('stale multiplayer protocol in public manifest')
    if not re.fullmatch(r'[a-f0-9]{20}',str(manifest.get('buildId',''))):fail('missing runtime buildId')
    for rel in ('./js/main.js','./assets/images/cards/cards-image-manifest.json','./js/flasheraGameplay.js'):
        if rel not in manifest.get('refreshAssets',[]):fail('refreshAssets lacks '+rel)
except Exception as ex:fail('build-manifest invalid: '+str(ex))
try:
    images=json.loads((app/'assets/images/cards/cards-image-manifest.json').read_text())
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
    if (root/'sitemap.xml').read_text().count('<loc>')!=6:fail('sitemap !=6')
except Exception as ex:fail('gallery/sitemap invalid: '+str(ex))
for name in ('flasheraGameplay.js','flasheraRenderer.js','cardVariant.js'):
    if not (app/'js'/name).is_file():fail('flashera frontend missing '+name)
if errors:
    print('\n'.join('::error::FIX5_PAGES '+x for x in errors),file=sys.stderr)
    sys.exit(1)
print('FIX5_PAGES_RELEASE_GUARD_OK protocol=fl40 siblings=10 retainedPNGs=YES secretDirs=NONE')
