// Lines by kind, and gzip bytes of each case's app: the original; the rewrite in an app that already has the runtime (the
// runtime left out, as Solid is); the rewrite alone (the runtime counted). Production builds, minified. node size.mjs
import { gzipSync } from "node:zlib"; import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs"; import path from "node:path";
import { bundle } from "./live.mjs";
const here = import.meta.dirname, out = {};
const lines = (f) => readFileSync(f, "utf8").split("\n").filter((l) => l.trim() && !/^\s*(\/\/|\/\*|\*)/.test(l)).length;
const walk = (d) => existsSync(d) ? readdirSync(d).flatMap((f) => statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]) : [];
for (const p of readdirSync(path.join(here, "packages"))) {
  const src = walk(path.join(here, "packages", p, "src")), fac = walk(path.join(here, "packages", p, "facade"));
  const sum = (fs) => fs.reduce((n, f) => n + lines(f), 0);
  out[p] = { rx: sum(src.filter((f) => f.endsWith(".rx") && !f.endsWith(".d.rx"))), js: sum(src.filter((f) => f.endsWith(".js"))), decl: sum(src.filter((f) => f.endsWith(".d.rx") || f.endsWith(".d.ts"))), facade: sum(fac) };
}
const SOLID = ["solid-js", /^@solidjs\//, "seroval", /^seroval/];
const gz = (code) => gzipSync(code).length;
for (const f of readdirSync(path.join(here, "cases")).filter((f) => f.endsWith(".tsx") && (!process.argv[2] || f.includes(process.argv[2])))) {
  const c = f.slice(0, -4), app = `import { render } from "@solidjs/web"; import App from "./cases/${f}"; render(() => <App />, document.body);`;
  try {
    const orig = gz(await bundle("orig", app, { dev: false, minify: true, external: SOLID }));
    const withRt = gz(await bundle("rx", app, { dev: false, minify: true, external: [...SOLID, /^@reactivescript\/runtime/] }));
    const alone = gz(await bundle("rx", app, { dev: false, minify: true, external: SOLID }));
    const base = gz(await bundle("orig", `import { render } from "@solidjs/web"; render(() => "", document.body);`, { dev: false, minify: true, external: SOLID }));
    (out.cases ??= {})[c] = { orig: orig - base, withRuntime: withRt - base, alone: alone - base };
    console.log(c.padEnd(26), "orig", orig - base, " rx+runtime-in-app", withRt - base, " rx alone", alone - base);
  } catch (e) { console.log(c, "FAILED", String(e).slice(0, 200)); }
}
writeFileSync(path.join(here, "size.json"), JSON.stringify(out, null, 1) + "\n");
