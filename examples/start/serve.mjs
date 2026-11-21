// node serve.mjs (PORT=…): after `npx vite build`
// A Node adapter for the built Start app: static client assets, everything else through its fetch handler.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
const server = (await import(path.resolve("dist/server/server.js"))).default;
const types = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const http = createServer(async (req, res) => {
  const file = path.join("dist/client", decodeURIComponent(req.url.split("?")[0]));
  if (req.url !== "/" && existsSync(file) && statSync(file).isFile()) { res.setHeader("content-type", types[path.extname(file)] ?? "application/octet-stream"); return res.end(readFileSync(file)); }
  const r = await server.fetch(new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers }));
  res.writeHead(r.status, Object.fromEntries(r.headers));
  if (r.body) Readable.fromWeb(r.body).pipe(res); else res.end();
});
http.listen(Number(process.env.PORT ?? 0), "127.0.0.1", () => console.log(`listening ${http.address().port}`));
