"""Google CMP uses the publisher's existing AdSense tag, never a homemade CMP."""
ADSENSE_CLIENT='ca-pub-6181395403710642'
ADSENSE_SCRIPT='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+ADSENSE_CLIENT

def consent_head(route):
    # Admin, gallery and game do not acquire editorial ad placements.
    if route in ('/editor/','/404.html') or route.startswith('/cartas/'):
        return ''
    return '<meta name="referrer" content="strict-origin-when-cross-origin"><script async src="'+ADSENSE_SCRIPT+'" crossorigin="anonymous"></script>'
