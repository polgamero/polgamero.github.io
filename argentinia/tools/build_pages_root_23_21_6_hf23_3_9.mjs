import fs from 'node:fs';
import path from 'node:path';

function arg(name, fallback) {
  const i=process.argv.indexOf(name);
  return i>=0 && process.argv[i+1] ? process.argv[i+1] : fallback;
}
const source=path.resolve(arg('--source','argentinia'));
const dest=path.resolve(arg('--dest','.pages-root'));
const repoRoot=path.resolve(arg('--repo-root','.'));
if (!fs.existsSync(path.join(source,'index.html'))) throw new Error(`Argentinia source missing index.html: ${source}`);
if (dest===source || dest.startsWith(source+path.sep)) throw new Error('Destination must live outside Argentinia source');
fs.rmSync(dest,{recursive:true,force:true});
fs.mkdirSync(dest,{recursive:true});
fs.cpSync(source,dest,{recursive:true});

// Preserve root-level domain/crawler verification files if the repository already owns them.
const preserve=['CNAME','ads.txt','robots.txt','sitemap.xml','favicon.ico','.nojekyll'];
for (const name of preserve) {
  const src=path.join(repoRoot,name);
  if (fs.existsSync(src) && fs.statSync(src).isFile()) fs.copyFileSync(src,path.join(dest,name));
}
for (const name of fs.readdirSync(repoRoot)) {
  if (/^google[^/]*\.html$/i.test(name)) {
    const src=path.join(repoRoot,name);
    if (fs.statSync(src).isFile()) fs.copyFileSync(src,path.join(dest,name));
  }
}

// Legacy public route: old bookmarks to /argentinia/ land on the new root.
const legacyDir=path.join(dest,'argentinia');
fs.mkdirSync(legacyDir,{recursive:true});
const legacy=`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0;url=/"><title>Argentinia se mudó</title></head>
<body><p>Argentinia ahora vive en <a href="/">la raíz del sitio</a>.</p>
<script>try{const u=new URL('/',location.origin);u.search=location.search;u.hash=location.hash;location.replace(u.href);}catch{location.replace('/');}</script>
</body></html>`;
fs.writeFileSync(path.join(legacyDir,'index.html'),legacy,'utf8');
console.log(`PAGES_ROOT_BUILD_OK source=${source} dest=${dest} legacy=/argentinia/`);
