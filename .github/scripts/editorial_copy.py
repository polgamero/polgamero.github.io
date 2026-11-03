"""Static defaults plus plain-text bindings; article prose remains in the CMS."""
import json
from html import escape

_defaults={}
def configure(defaults):
    _defaults.clear();_defaults.update(defaults)

def text(key,**variables):
    full='site.'+key
    value=_defaults[full]
    for name,replacement in variables.items():value=value.replace('{'+name+'}',str(replacement))
    return '<span data-site-text="'+full+'" data-site-vars="'+escape(json.dumps(variables,ensure_ascii=False),quote=True)+'">'+escape(value)+'</span>'
