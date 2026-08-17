const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const ASSET_DIR = path.join(ROOT, 'assets');
const ALLOWED_PUBLIC = new Set(['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.txt', '.md', '.ico']);
const IMAGE_RE = /^img_(\d+)\.(jpg|jpeg|png)$/i;
const DESCRIPTION_RE = /^description_(\d+)\.(txt|md)$/i;
const MAX_FILE_SIZE = 15 * 1024 * 1024;

fs.mkdirSync(ASSET_DIR, { recursive: true });

function collectAssets() {
  const map = new Map();
  for (const entry of fs.readdirSync(ASSET_DIR, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    let m = name.match(IMAGE_RE);
    if (m) {
      const number = Number(m[1]);
      const item = map.get(number) || { number, image: null, description: '' };
      item.image = `/assets/${encodeURIComponent(name)}`;
      map.set(number, item);
      continue;
    }
    m = name.match(DESCRIPTION_RE);
    if (m) {
      const number = Number(m[1]);
      const item = map.get(number) || { number, image: null, description: '' };
      item.descriptionFile = `/assets/${encodeURIComponent(name)}`;
      try { item.description = fs.readFileSync(path.join(ASSET_DIR, name), 'utf8'); }
      catch (_) { item.description = ''; }
      map.set(number, item);
    }
  }
  return [...map.values()].sort((a, b) => a.number - b.number);
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8', '.ico': 'image/x-icon'
  })[ext] || 'application/octet-stream';
}

function safePublicPath(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath.split('?')[0]); } catch (_) { return null; }
  const relative = decoded.replace(/^\/+/, '');
  const full = path.resolve(ROOT, relative);
  if (!full.startsWith(path.resolve(ROOT) + path.sep) && full !== path.resolve(ROOT)) return null;
  return full;
}

function parseMultipart(body, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = 0;
  while (true) {
    const begin = body.indexOf(delimiter, start);
    if (begin < 0) break;
    const next = body.indexOf(delimiter, begin + delimiter.length);
    if (next < 0) break;
    const raw = body.slice(begin + delimiter.length, next);
    start = next;
    if (raw.length < 4) continue;
    let part = raw;
    if (part.slice(0, 2).equals(Buffer.from('\r\n'))) part = part.slice(2);
    if (part.slice(-2).equals(Buffer.from('\r\n'))) part = part.slice(0, -2);
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd < 0) continue;
    const headerText = part.slice(0, headerEnd).toString('utf8');
    const content = part.slice(headerEnd + 4);
    const match = headerText.match(/filename="([^"]*)"/i);
    if (!match) continue;
    parts.push({ filename: path.basename(match[1]), content });
  }
  return parts;
}

function handleUpload(req, res) {
  const contentTypeHeader = req.headers['content-type'] || '';
  const boundaryMatch = contentTypeHeader.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    res.writeHead(400, { 'Content-Type':'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok:false, message:'Multipart form data is required.' }));
    return;
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const chunks = [];
  let total = 0;
  req.on('data', chunk => {
    total += chunk.length;
    if (total <= 60 * 1024 * 1024) chunks.push(chunk);
  });
  req.on('end', () => {
    if (total > 60 * 1024 * 1024) {
      res.writeHead(413, { 'Content-Type':'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok:false, message:'Upload too large.' }));
    }
    const parts = parseMultipart(Buffer.concat(chunks), boundary);
    const results = [];
    for (const part of parts) {
      const validName = IMAGE_RE.test(part.filename) || DESCRIPTION_RE.test(part.filename);
      if (!validName) {
        results.push({ name: part.filename, ok:false, message:'Use img_N.jpg/png or description_N.txt/md.' });
        continue;
      }
      if (part.content.length > MAX_FILE_SIZE) {
        results.push({ name: part.filename, ok:false, message:'File exceeds 15 MB.' });
        continue;
      }
      fs.writeFileSync(path.join(ASSET_DIR, part.filename), part.content);
      results.push({ name: part.filename, ok:true });
    }
    res.writeHead(200, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
    res.end(JSON.stringify({ ok:true, results, assets:collectAssets() }));
  });
  req.on('error', err => {
    res.writeHead(400, { 'Content-Type':'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok:false, message:err.message }));
  });
}

http.createServer((req, res) => {
  if (req.url === '/api/assets' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
    return res.end(JSON.stringify({ items:collectAssets() }));
  }
  if (req.url === '/api/upload' && req.method === 'POST') return handleUpload(req, res);

  const target = req.url === '/' ? '/index.html' : req.url;
  const file = safePublicPath(target);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile() || !ALLOWED_PUBLIC.has(path.extname(file).toLowerCase())) {
    res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type':contentType(file), 'Cache-Control': target.includes('/assets/') ? 'no-store' : 'no-cache' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Brandtex Trading running at http://localhost:${PORT}`));
