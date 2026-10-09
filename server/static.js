// Archivos estáticos del juego: tipos MIME, revalidación con ETag (304) y compresión gzip en memoria.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
};
// Se comprimen los de texto y los modelos 3D (las imágenes ya vienen comprimidas).
const COMPRESS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.md', '.txt', '.svg', '.glb', '.gltf', '.bin']);

export function createStatic(root) {
  const gz = new Map(); // ruta → { tag, buf }
  return (req, res, rel) => {
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(root, path.normalize(rel));
    // Nada fuera del proyecto ni ficheros/carpetas ocultos (.git, .github…).
    if (!file.startsWith(root + path.sep) || path.relative(root, file).split(path.sep).some((s) => s.startsWith('.'))) {
      res.writeHead(404).end();
      return;
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404'); return; }
      const ext = path.extname(file).toLowerCase();
      const tag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
      const head = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: tag, Vary: 'Accept-Encoding' };
      if (req.headers['if-none-match'] === tag) { res.writeHead(304, head).end(); return; }
      const wantsGzip = COMPRESS.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && st.size > 1024;
      if (!wantsGzip) {
        res.writeHead(200, { ...head, 'Content-Length': st.size });
        if (req.method === 'HEAD') { res.end(); return; }
        fs.createReadStream(file).pipe(res);
        return;
      }
      const send = (buf) => {
        res.writeHead(200, { ...head, 'Content-Encoding': 'gzip', 'Content-Length': buf.length });
        res.end(req.method === 'HEAD' ? undefined : buf);
      };
      const hit = gz.get(file);
      if (hit && hit.tag === tag) { send(hit.buf); return; }
      fs.readFile(file, (e, data) => {
        if (e) { res.writeHead(500).end(); return; }
        zlib.gzip(data, { level: 6 }, (ze, buf) => {
          if (ze) { res.writeHead(500).end(); return; }
          gz.set(file, { tag, buf });
          send(buf);
        });
      });
    });
  };
}
