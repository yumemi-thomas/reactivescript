// What a coverage entry's `use.mjs` is written with (bench/README.md, "The coverage suite"). An entry is one program that
// uses one package (or one family of a larger library's modules) the way its documentation does, with the declarations
// `rx-declare` drafts for it kept to the rows the program uses. `use(import.meta, { … })` makes of it what bench/run.mjs
// judges as it judges a task — accepted by both checkers, typed by the library's own types, run — and names the modules
// that are drafted whole (09 MO-8q: no `any` of the draft's own).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ws } from "./harness.mjs";

/** The modules of a package an app can import: its main entry and each subpath its package.json exports (a pattern, a
 *  stylesheet and package.json itself are not modules to declare). */
export function modulesOf(pkg) {
  const p = JSON.parse(readFileSync(path.join(ws, "node_modules", pkg, "package.json"), "utf8"));
  const ex = p.exports;
  if (!ex || typeof ex !== "object" || !Object.keys(ex).some(k => k.startsWith("."))) return [pkg];
  return Object.keys(ex).filter(k => k.startsWith(".") && !k.includes("*") && !/\.(json|css)$/.test(k)).map(k => k === "." ? pkg : pkg + k.slice(1));
}
/** The specifiers an entry's own files import (its `.rx`, and the JavaScript beside it). */
function imported(dir) {
  const out = new Set();
  const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== "rx-types" && e.name !== "node_modules") walk(p); } else if (/\.(rx|js|mjs|ts|tsx|jsx)$/.test(e.name) && !/\.d\.(rx|ts)$/.test(e.name) && e.name !== "use.mjs") for (const m of readFileSync(p, "utf8").matchAll(/\bfrom\s+["']([^"'.][^"']*)["']|\bimport\s+["']([^"'.][^"']*)["']/g)) out.add(m[1] ?? m[2]); } };
  walk(dir);
  return [...out];
}
/**
 * @param meta    the entry's `import.meta`
 * @param spec.pkg / spec.pkgs   the package(s) the entry covers
 * @param spec.modules           the modules drafted whole for it (default: every module of those packages)
 * @param spec.ssr               what the server's render must say (a RegExp), or `false` with `server`: why the package
 *                               is not rendered on the server
 * @param spec.dom               what the page must say once mounted (a RegExp), or `async (h, page) => { h.check(…) }`
 */
export function use(meta, spec) {
  const dir = path.dirname(fileURLToPath(meta.url));
  const pkgs = spec.pkg ? [spec.pkg] : spec.pkgs;
  const modules = spec.modules ?? pkgs.flatMap(modulesOf);
  const of = s => pkgs.find(p => s === p || s.startsWith(p + "/"));
  const uses = imported(dir).filter(of).sort();
  if (spec.ssr === false && !spec.server) throw new Error(`${dir}: an entry that is not rendered on the server says why (\`server\`)`);
  return {
    title: spec.title, pkgs, modules, uses, declare: spec.declare, known: spec.known, spa: spec.spa, types: spec.types ?? [],
    server: spec.ssr === false ? spec.server : true, hydrates: spec.ssr === false ? false : spec.hydration ?? true, note: spec.note,
    async run(h) {
      if (spec.ssr) { const r = await h.ssr("/"); h.check(`server: rendered (${spec.ssr.source})`, !r.error && spec.ssr.test(r.text), r.error?.message ?? r.text); }
      // `hydration`: why the server's page is not hydrated (the library's server path and its browser path do not make the
      // same page): the program is then rendered on the server and mounted in the browser, apart
      const base = await h.serve({ ssr: !!spec.ssr && !spec.hydration });
      // `before`: what the page is given before it loads (a permission, a position, a clock)
      let page;
      if (spec.before) { page = await h.page(); await spec.before(page, h); await page.goto(base + "/"); await page.waitForFunction(() => window.__mounted, null, { timeout: 10000 }).catch(() => h.problems.push("the client never mounted")); }
      else page = await h.open(base);
      if (spec.dom instanceof RegExp) h.check(`browser${spec.ssr && !spec.hydration ? " (hydrated)" : ""}: ${spec.dom.source}`, await h.until(async () => spec.dom.test(await h.text(page))), await h.text(page));
      else if (spec.dom) await spec.dom(h, page);
      h.check("no console errors or warnings", h.problems.length === 0, h.problems);
    },
  };
}
export { existsSync };
