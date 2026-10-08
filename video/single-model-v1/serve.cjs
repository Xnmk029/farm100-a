const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
const allowed=new Set(['index.html','app.js','app.js.map','data.json','timeline.json']);
const s=http.createServer(async(req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(!allowed.has(name)){res.writeHead(404);res.end();return;}try{const b=await fs.readFile(path.join(__dirname,'public',name));res.setHeader('Content-Type',name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.js')?'text/javascript':name.endsWith('.json')?'application/json':'application/octet-stream');res.end(b);}catch{res.writeHead(500);res.end();}});
s.listen(0,'127.0.0.1',()=>console.log(`Preview: http://127.0.0.1:${s.address().port}`));
