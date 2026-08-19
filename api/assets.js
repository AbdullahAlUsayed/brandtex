const fs = require('fs');
const path = require('path');

const ASSET_DIR = path.join(process.cwd(), 'assets');
const IMAGE_RE = /^img_(\d+)\.(jpg|jpeg|png)$/i;
const DESCRIPTION_RE = /^description_(\d+)\.(txt|md)$/i;

function collectAssets() {
  const map = new Map();
  if (!fs.existsSync(ASSET_DIR)) return [];
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

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ items: collectAssets() });
};
