// server.js (Render-ready, no dependencies; SSE realtime)
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 8787;
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'boards.json');

function loadState(){
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch(e){ return null; }
}
function saveState(s){
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(s || {}, null, 2));
  } catch(e){ console.error('Save error:', e); }
}
let state = loadState() || null;

// --- SSE clients ---
const clients = new Set();
function broadcast(s){
  const payload = `data: ${JSON.stringify({ type:'patch', state: s })}\n\n`;
  for(const res of clients){
    try { res.write(payload); } catch(e){ /* ignore */ }
  }
}

function sendFile(res, filePath, contentType){
  fs.readFile(filePath, (err, data)=>{
    if(err){ res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function serveStatic(req, res){
  let p = url.parse(req.url).pathname;
  if(p === '/') p = '/drag_portal_locations_v3.9_sse.html';
  const filePath = path.join(__dirname, p);
  const ext = path.extname(filePath).toLowerCase();
  const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8' };
  const type = types[ext] || 'application/octet-stream';
  sendFile(res, filePath, type);
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  if(req.method === 'GET' && parsed.pathname === '/events'){
    res.writeHead(200, {
      'Content-Type':'text/event-stream',
      'Cache-Control':'no-cache',
      'Connection':'keep-alive',
      'Access-Control-Allow-Origin':'*'
    });
    res.write(`data: ${JSON.stringify({ type:'hello', state })}\n\n`);
    clients.add(res);
    req.on('close', ()=> clients.delete(res));
    return;
  }

  if(req.method === 'GET' && parsed.pathname === '/state'){
    res.writeHead(200, { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' });
    return res.end(JSON.stringify({ state }));
  }

  if(req.method === 'OPTIONS'){
    res.writeHead(204, {
      'Access-Control-Allow-Origin':'*',
      'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type'
    });
    return res.end();
  }

  if(req.method === 'POST' && parsed.pathname === '/patch'){
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try{
        const data = JSON.parse(body||'{}');
        if(data && data.state){
          state = data.state;
          saveState(state);
          broadcast(state);
        }
        res.writeHead(200, { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' });
        return res.end(JSON.stringify({ ok:true }));
      }catch(e){
        res.writeHead(400); return res.end('Bad JSON');
      }
    });
    return;
  }

  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log('Server listening on :' + PORT);
  console.log('DATA_FILE:', DATA_FILE);
});
