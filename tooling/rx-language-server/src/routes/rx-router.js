// A router made in an `.rx` module of the program (code-based routes): the router object is asked for its tree.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { rel, code, componentsOf, rxReach, outletIn } = require("./common.js");

/** A router made in an `.rx` module — code-based routes (2026-11-25): `export router = createRouter({ routeTree })`.
 *  The module is compiled and run, and the router it exports is asked for its tree: each route's children are the
 *  router object's own, and its component is the `.rx` component of the program whose compiled function the route was
 *  given (found by identity among the modules' exports). Nothing of the calls that built the tree is read
 *  (`getParentRoute`, `addChildren`): what the router has is what it renders. Run in a child process, with a
 *  browser's globals (happy-dom, from the project) and the browser's builds, as rx-verify --dom runs a library. */
const asked = new Map();   // source → { stamp, result }: a build asks once per entry it compiles
function readRxRouter(source) {
  const kind = "router-object"; const none = problem => ({ kind, nodes: [], through: [], imports: [], problems: [problem] });
  const files = rxReach(source);
  const stamp = files.map(f => { try { return `${f}:${fs.statSync(f).mtimeMs}`; } catch { return f; } }).join("|");
  const had = asked.get(source); if (had && had.stamp === stamp) return had.result;
  const keep = result => { asked.set(source, { stamp, result }); return result; };
  const dir = path.dirname(source);
  // the program compiled whatever the checkers say of it: the declaration this writes is what it is checked by
  let out;
  try {
    if (process.env.RXC) { const r = spawnSync(process.env.RXC, ["app", source, "--target", "dom", "--lib", "--unchecked"], { encoding: "utf8", maxBuffer: 1 << 28 }); out = JSON.parse(r.stdout); }
    else out = JSON.parse(require(require.resolve("@reactivescript/compiler", { paths: [dir, __dirname] })).app(source, "dom", undefined, true, true, false, [], true));
  } catch (e) { return none(`${source}: a router made in \`.rx\` is read by compiling its module and asking the router, and the compiler was not found (${String(e?.message ?? e).split("\n")[0].slice(0, 160)}): install @reactivescript/compiler in the project`); }
  if (!out.modules) return keep(none(`${source}: a router made in \`.rx\` is read by compiling its module and asking the router, and it does not compile: ${out.error ?? (out.diagnostics ?? []).map(d => `${d.code} line ${d.line}`).join(", ")}`));
  let root = dir; while (!fs.existsSync(path.join(root, "node_modules")) && path.dirname(root) !== root) root = path.dirname(root);
  const tmp = path.join(root, "node_modules", ".reactivescript", `routes-${process.pid}-${asked.size}`);
  const at = p => path.join(tmp, `${Object.keys(out.modules).indexOf(p)}.mjs`);
  const { pathToFileURL } = require("node:url");
  let hd; try { hd = require.resolve("@happy-dom/global-registrator", { paths: [dir, __dirname] }); } catch { return none(`${source}: a router made in \`.rx\` is asked for its routes with a browser's globals: install @happy-dom/global-registrator in the project`); }
  // the runtime: the project's, else the compiler's own (11 CP-4a: an app lists the compiler and nothing else)
  const runtime = (() => { const dirs = [path.join(root, "node_modules/@reactivescript/runtime")]; try { const c = path.dirname(fs.realpathSync(require.resolve("@reactivescript/compiler", { paths: [dir, __dirname] }))); dirs.push(path.join(c, "node_modules/@reactivescript/runtime"), path.join(c, "../runtime")); } catch {} dirs.push(path.resolve(__dirname, "../../../runtime")); return dirs.map(d => path.join(d, "dist/web.js")).find(f => fs.existsSync(f)); })();
  if (!runtime) return none(`${source}: @reactivescript/runtime was not found beside the compiler`);
  try {
    fs.mkdirSync(tmp, { recursive: true });
    for (const [p, m] of Object.entries(out.modules)) {
      const rel2 = spec => { const abs = path.resolve(path.dirname(p), spec); return out.modules[abs] ? pathToFileURL(at(abs)).href : pathToFileURL(abs).href; };
      fs.writeFileSync(at(p), m.code.replace(/^import\s+(["'])(\.{1,2}\/[^"']+\.css)\1;?$/gm, "").replace(/(\bfrom\s*|\bimport\s*\(\s*|^import\s+)(["'])(\.{1,2}\/[^"']+)\2/gm, (_, pre, q, spec) => `${pre}${q}${rel2(spec)}${q}`));
    }
    const driver = `import { createRequire } from "node:module";
createRequire(${JSON.stringify(source)})(${JSON.stringify(hd)}).GlobalRegistrator.register({ url: "http://localhost/" });
const rt = await import(${JSON.stringify(pathToFileURL(runtime).href)});
const app = rt.createApp({ root: document.createElement("div") });
const mods = ${JSON.stringify(Object.keys(out.modules).map(p => [p, pathToFileURL(at(p)).href]))}; const entry = ${JSON.stringify(out.entry)};
const named = new Map(); let own;
for (const [p, url] of mods) { const m = (await import(url)).default; const ex = p === entry ? (own = m(app)) : app.module(m, m); for (const [n, v] of Object.entries(ex ?? {})) if (typeof v === "function" && !named.has(v)) named.set(v, { file: p, name: n }); }
const comps = new Set(${JSON.stringify(out.components ?? [])}); const routers = [];
for (const [n, v] of Object.entries(own ?? {})) { if (comps.has(n)) continue; let x = v; if (typeof v === "function" && v.length === 0) { try { x = v(); } catch { continue; } } if (x && typeof x === "object" && x.routeTree && typeof x.routeTree === "object") routers.push([n, x]); }
const problems = [];
if (routers.length !== 1) { console.log(JSON.stringify({ problems: [routers.length ? "it exports " + routers.map(r => r[0]).join(" and ") + ", each a router: which one the app renders is not the tool's to say" : "it exports no router: \\\`export router = createRouter({ routeTree })\\\` (a value with a \\\`routeTree\\\`), the one the app gives its provider"] })); process.exit(0); }
const kids = r => Array.isArray(r.children) ? r.children : Object.values(r.children ?? {});
const node = r => { const c = r.options?.component; const at = typeof c === "function" ? named.get(c) : undefined; if (typeof c === "function" && !at && /^V\\$/.test(c.name)) problems.push("the route " + (r.id ?? r.path) + " is given the component " + c.name.slice(2) + ", which its module does not export: \\\`export component " + c.name.slice(2) + "\\\` (the declaration imports the components it places by name)"); return { id: r.id, path: r.fullPath ?? r.path, file: at?.file, name: at?.name, children: kids(r).map(node) }; };
console.log(JSON.stringify({ nodes: [node(routers[0][1].routeTree)], problems }));
process.exit(0);
`;
    fs.writeFileSync(path.join(tmp, "ask.mjs"), driver);
    const r = spawnSync(process.execPath, ["--conditions=browser", path.join(tmp, "ask.mjs")], { cwd: dir, encoding: "utf8", timeout: 60000 });
    if (r.status !== 0) return keep(none(`${source}: a router made in \`.rx\` is read by running its module, which did not run: ${String(r.stderr).trim().split("\n").filter(l => /Error|error/.test(l)).pop()?.slice(0, 300) ?? `exit ${r.status}`}`));
    const got = JSON.parse(r.stdout.trim().split("\n").pop());
    if (!got.nodes) return keep(none(`${rel(dir, source)}: ${got.problems.join("; ")}`));
    const text = files.map(f => componentsOf(f).src ?? "").join("\n");
    const pkg = /from\s+(["'])(@tanstack\/[\w-]+-router)\1/.exec(text)?.[2];
    const node = n => ({ ...n, route: n.file, children: n.children.map(node) });
    const nodes = got.nodes.map(node);
    const through = pkg && outletIn(nodes) ? [{ name: "Outlet", from: pkg }] : [];
    // the router's own provider is what the app renders the tree through (the entry applies it, or an `.rx` component it applies does)
    return keep({ kind, pkg, nodes, through, imports: [], provider: pkg ? { name: "RouterProvider", from: pkg } : undefined, problems: got.problems });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
module.exports = { takes: source => source.endsWith(".rx"), read: readRxRouter };
