const fs = require('fs');
const path = require('path');

const TMP_ASSET_DIR = path.join('/tmp', 'assets');
const IMAGE_RE = /^img_(\d+)\.(jpg|jpeg|png)$/i;
const DESCRIPTION_RE = /^description_(\d+)\.(txt|md)$/i;
const MAX_FILE_SIZE = 15 * 1024 * 1024;

fs.mkdirSync(TMP_ASSET_DIR, { recursive: true });

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total <= 60 * 1024 * 1024) chunks.push(chunk);
    });
    req.on('end', () => resolve({ buffer: Buffer.concat(chunks), total }));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed.' });
    return;
  }
  const contentTypeHeader = req.headers['content-type'] || '';
  const boundaryMatch = contentTypeHeader.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    res.status(400).json({ ok: false, message: 'Multipart form data is required.' });
    return;
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2];

  try {
    const { buffer, total } = await readBody(req);
    if (total > 60 * 1024 * 1024) {
      res.status(413).json({ ok: false, message: 'Upload too large.' });
      return;
    }
    const parts = parseMultipart(buffer, boundary);
    const results = [];
    for (const part of parts) {
      const validName = IMAGE_RE.test(part.filename) || DESCRIPTION_RE.test(part.filename);
      if (!validName) {
        results.push({ name: part.filename, ok: false, message: 'Use img_N.jpg/png or description_N.txt/md.' });
        continue;
      }
      if (part.content.length > MAX_FILE_SIZE) {
        results.push({ name: part.filename, ok: false, message: 'File exceeds 15 MB.' });
        continue;
      }
      // NOTE: this only writes to /tmp, which is ephemeral on Vercel and NOT shared
      // with other function instances. Files saved here will NOT show up via
      // /api/assets (which reads the repo's committed /assets folder) and will
      // disappear on the next cold start. For real persistence, swap this out
      // for Vercel Blob (@vercel/blob) or another object storage service.
      fs.writeFileSync(path.join(TMP_ASSET_DIR, part.filename), part.content);
      results.push({ name: part.filename, ok: true });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, results, note: 'Saved to temporary storage only — not persisted. See README for a real storage setup.' });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
};
