// Static file server with HTTP Range support, for testing COG reads locally.
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = process.argv[2], port = +process.argv[3];
const types = { '.html': 'text/html', '.tif': 'image/tiff', '.parquet': 'application/octet-stream' };
http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const size = fs.statSync(f).size, h = { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Range, Content-Length' };
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (!m) { res.writeHead(200, { ...h, 'Content-Length': size }); return req.method === 'HEAD' ? res.end() : fs.createReadStream(f).pipe(res); }
  let a = m[1] === '' ? size - +m[2] : +m[1], b = m[1] !== '' && m[2] !== '' ? Math.min(+m[2], size - 1) : size - 1;
  res.writeHead(206, { ...h, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': b - a + 1 });
  req.method === 'HEAD' ? res.end() : fs.createReadStream(f, { start: a, end: b }).pipe(res);
}).listen(port, '127.0.0.1');
