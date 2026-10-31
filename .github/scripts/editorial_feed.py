"""Read only an approved, immutable release. No credentials or draft access."""
import hashlib
import json
import re
import urllib.parse
import urllib.request

FEED='https://southamerica-east1-argentinia-tcg.cloudfunctions.net/editorialFeed'
ID=re.compile(r'^[a-z0-9][a-z0-9-]{0,79}$')
HASH=re.compile(r'^[a-f0-9]{64}$')

class NoApprovedRelease(ValueError):
    """The deployed service explicitly reports that no first release exists."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):
        raise ValueError('Editorial feed redirects are not accepted')


def read_release(feed=FEED,owner_emulator=False):
    u=urllib.parse.urlsplit(feed)
    if feed!=FEED and (not owner_emulator or u.scheme!='http' or u.hostname not in ('localhost','127.0.0.1') or u.path!='/argentinia-editorial-stage2/southamerica-east1/editorialFeed' or u.query or u.fragment or u.username):
        raise ValueError('Unapproved editorial feed origin')
    opener=urllib.request.build_opener(NoRedirect)

    def download(query,maximum):
        request=urllib.request.Request(feed+'?'+urllib.parse.urlencode(query),headers={'Cache-Control':'no-cache'})
        with opener.open(request,timeout=30) as response:
            data=response.read(maximum+1)
        if len(data)>maximum:
            raise ValueError('Editorial response exceeds its limit')
        return data

    release=json.loads(download({},200000))
    # This is the service's exact empty initial state, before any publication.
    # HTTP failures, invalid manifests and missing releases remain fatal.
    if release=={'version':1,'releaseId':None,'articles':[],'media':[]}:
        raise NoApprovedRelease('No first approved release')
    rid=release.get('releaseId')
    if release.get('version')!=1 or not isinstance(rid,str) or not ID.fullmatch(rid):
        raise ValueError('No approved editorial release; do not fall back to bootstrap')
    articles=release.get('articles');media=release.get('media')
    if not isinstance(articles,list) or len(articles)>300 or not isinstance(media,list) or len(media)>200 or any(not isinstance(m,str) or not HASH.fullmatch(m) for m in media):
        raise ValueError('Invalid editorial manifest')
    seen=set();entries=[]
    for item in articles:
        aid=item.get('id')
        if not isinstance(aid,str) or not ID.fullmatch(aid) or aid in seen or not HASH.fullmatch(item.get('contentHash','')) or not isinstance(item.get('revision'),int) or item['revision']<1:
            raise ValueError('Invalid/duplicate article reference')
        seen.add(aid)
        body=json.loads(download({'release':rid,'article':aid},400000))
        canonical=json.dumps(body.get('article'),ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
        if body.get('contentHash')!=item['contentHash'] or hashlib.sha256(canonical).hexdigest()!=item['contentHash'] or body['article']['id']!=aid or body['article']['slug']!=item['slug']:
            raise ValueError('Approved article hash does not match')
        entries.append({**body,'revision':item['revision']})
    files={}
    for mid in media:
        data=download({'release':rid,'media':mid},350000)
        if hashlib.sha256(data).hexdigest()!=mid:
            raise ValueError('Approved image hash does not match')
        files[mid]=data
    return {'schemaVersion':1,'releaseId':rid,'articles':entries},files


def latest_release(feed=FEED):
    if feed!=FEED:
        raise ValueError('Unapproved production feed')
    with urllib.request.build_opener(NoRedirect).open(urllib.request.Request(feed,headers={'Cache-Control':'no-cache'}),timeout=30) as response:
        data=response.read(200001)
    if len(data)>200000:
        raise ValueError('Editorial response too large')
    return json.loads(data).get('releaseId')
