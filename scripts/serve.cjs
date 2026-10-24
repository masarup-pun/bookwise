const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const files=new Set(['index.html','Readwise-glass.html','app.js','cover-images.js','reader.js','cloud-sync.js','supabase-config.js','bookwise-catalog.js','app-base.css','app-experience.css','favicon.ico','favicon.svg','favicon-32.png','apple-touch-icon.png','icon-192.png','icon-512.png','site.webmanifest']);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';}catch{res.writeHead(400).end();return;}
  if(!files.has(name)){res.writeHead(404).end('Not found');return;}
  res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  fs.createReadStream(path.join(root,name)).pipe(res);
});
server.listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log('Bookwise: http://127.0.0.1:'+server.address().port));
