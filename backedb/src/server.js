import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { handleRequest } from './app.js';

export { handleRequest } from './app.js';

const publicRoot = resolve(process.cwd());
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

async function serveStatic(request, response) {
  const url = new URL(request.url, 'http://localhost');
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { response.writeHead(400); return response.end('URL inválida.'); }
  const requested = pathname === '/' ? '/index.html' : pathname;
  const candidates = extname(requested) ? [requested] : [`${requested}.html`, `${requested}/index.html`];
  for (const candidate of candidates) {
    const filePath = resolve(publicRoot, `.${candidate}`);
    if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${sep}`)) continue;
    try {
      const info = await stat(filePath);
      if (!info.isFile()) continue;
      response.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
      return createReadStream(filePath).pipe(response);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Arquivo não encontrado.');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  createServer((request, response) => request.url?.startsWith('/api/') ? handleRequest(request, response) : serveStatic(request, response)).listen(config.port, () => {
    console.log(`BECO local em http://localhost:${config.port}`);
  });
}
