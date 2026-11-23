// node serve.mjs (PORT=…): after `npx vite build` — the built client, every other URL answered with index.html
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
const types = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".html": "text/html" };
const http = createServer((req, res) => {
  const file = path.join("dist", decodeURIComponent(req.url.split("?")[0]));
  const hit = req.url !== "/" && existsSync(file) && statSync(file).isFile() ? file : "dist/index.html";
  res.setHeader("content-type", types[path.extname(hit)] ?? "application/octet-stream"); res.end(readFileSync(hit));
});
http.listen(Number(process.env.PORT ?? 0), "127.0.0.1", () => console.log(`listening ${http.address().port}`));
