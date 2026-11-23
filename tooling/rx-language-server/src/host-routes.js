// 09 MO-14g: a host declaration derived from the router's own tree. `//@ routes <source> [<entry.rx>…]` at the head of
// a `host.d.rx` says where the nesting comes from — the route tree a file-based router generates, or the routes
// directory it scans — and the file is then that source's, written whole by `rx-declare --host --routes` and never
// restated by hand: `drift` compares it with what the source gives now, `rx-tsc`, `rx-verify` and a build refuse a
// file that has fallen behind (`HOST_VIEW_STALE`), and the dev server rewrites it (`sync`).
//
// The sources read (the tools read them; the checkers never do, 08 CN-8 — to them the pragma is a comment):
//   - TanStack Router's generated tree (`routeTree.gen.ts`): each route's parent is its `getParentRoute`, its
//     component the `.rx` file the tree imports as a page (`?rx-page`: the generator's `routeComponentExtensions`) or
//     the `.rx` component its TS route file hands the route (`?rx-lib`);
//   - a routes directory, scanned by the project's own `filesystem-routing` (its `toPath` and its `buildRouteTree`):
//     every `.rx` file a page, nested as that package nests them — the package's own convention, so a directory is
//     refused where the Vite config gives the plugin another (`toPath`, `router`, `routers`);
//   - a module that exports the project's `filesystem-routing` router (`export default new PageFileSystemRouter({ … })`,
//     the one `fileRoutes({ router })` is given): the router's own routes — whatever its `toPath` and `toRoute` say —
//     nested by `buildRouteTree`, each with the `.rx` file of its component. Nothing of the convention is recomputed;
//   - a JSON file, `[{ "file": "./pages/home.rx", "component"?: "Home", "path"?: "/", "children"?: [...] }]`: what any
//     other host's own tooling can write.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const posix = p => p.split(path.sep).join("/");
const rel = (from, to) => { const r = posix(path.relative(from, to)); return r.startsWith(".") ? r : `./${r}`; };
const code = text => text.split("\n").map(l => l.replace(/\/\/.*$/, ""));

/** The pragma of a host declaration: `{ source, entries, line }` (as written, relative to the file), or null. Only
 *  before the file's first row. */
function pragmaOf(text) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim(); if (!t) continue;
    const m = /^\/\/@\s*routes\s+(\S+)((?:\s+\S+)*)\s*$/.exec(t);
    if (m) return { source: m[1], entries: m[2].trim() ? m[2].trim().split(/\s+/) : [], line: i + 1 };
    if (!t.startsWith("//")) return null;
  }
  return null;
}

/** An `.rx` module's default component, and each component it exports, by name. */
function componentsOf(file) {
  let src; try { src = fs.readFileSync(file, "utf8"); } catch { return { all: [], dflt: undefined }; }
  const all = [...src.matchAll(/^export\s+(default\s+)?component\s+([A-Za-z_$][\w$]*)/gm)].map(m => ({ name: m[2], dflt: !!m[1] }));
  return { all: all.map(c => c.name), dflt: all.find(c => c.dflt)?.name, src };
}

/** An `.rx` module and the `.rx` modules it imports, to any depth (the file itself first): where a component of the
 *  host's own may be applied on a layout's behalf — `Root` applies `<Frame />`, of `./chrome.rx`, which applies the
 *  router's `<Outlet />` (MO-14f, 2026-11-25). */
function rxReach(file, seen = []) {
  if (seen.includes(file)) return seen; seen.push(file);
  let src; try { src = fs.readFileSync(file, "utf8"); } catch { return seen; }
  for (const m of src.matchAll(/^import\s*\{[^}]*\}\s*from\s*(["'])(\.[^"']*\.rx)\1/gm)) rxReach(path.resolve(path.dirname(file), m[2]), seen);
  return seen;
}

/** A TS route file of TanStack's (`routes/index.tsx`): the `.rx` component it hands its route — the one name it
 *  imports from an `.rx` module (`?rx-lib`, `?rx-page`) that its `component:` option names. `{ file, name }`,
 *  undefined when the route has no `.rx` component, or `{ problem }`. */
function tsRouteComponent(routeFile) {
  const src = fs.readFileSync(routeFile, "utf8");
  const found = [];
  for (const m of src.matchAll(/^\s*import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*(["'])([^"'?]+\.rx)\?[^"']*\3/gm)) {
    const file = path.resolve(path.dirname(routeFile), m[4]);
    if (m[1]) found.push({ local: m[1], file, name: componentsOf(file).dflt });
    for (const part of (m[2] ?? "").split(",").map(x => x.trim()).filter(Boolean)) { const [name, local = name] = part.split(/\s+as\s+/); found.push({ local, file, name: name === "default" ? componentsOf(file).dflt : name }); }
  }
  if (!found.length) return undefined;
  const at = src.search(/\bcomponent\s*:/); const after = at < 0 ? "" : src.slice(at);
  const used = found.filter(f => new RegExp(`(?<![\\w$.])${f.local.replace(/\$/g, "\\$")}(?![\\w$])`).test(after));
  if (used.length === 1) return used[0];
  if (!used.length) return undefined;
  // several: the first the option names (`component: () => <Layout><Card /></Layout>` is the layout's)
  return used.sort((a, b) => after.search(new RegExp(`(?<![\\w$.])${a.local}(?![\\w$])`)) - after.search(new RegExp(`(?<![\\w$.])${b.local}(?![\\w$])`)))[0];
}

/** TanStack Router's generated tree. */
function readTanstack(source, text) {
  const dir = path.dirname(source); const problems = [];
  const pkg = /from\s+(["'])(@tanstack\/[\w-]+-router)\1/.exec(text)?.[2] ?? "@tanstack/solid-router";
  const routes = new Map();   // the generator's name for a route (`Index`, `PeopleId`, `root`) → { file, name, id, path, parent }
  const at = n => { if (!routes.has(n)) routes.set(n, { key: n, children: [] }); return routes.get(n); };
  for (const m of text.matchAll(/^import\s*\{\s*default\s+as\s+(\w+?)RouteComponent\s*\}\s*from\s*(["'])([^"'?]+)(\?[^"']*)?\2/gm)) {
    const file = path.resolve(dir, m[3]); const c = componentsOf(file);
    if (!c.dflt) problems.push(`${rel(dir, file)} is a route file with no default component (the tree imports it as a page)`);
    Object.assign(at(m[1]), { file, name: c.dflt, route: file });
  }
  for (const m of text.matchAll(/^import\s*\{\s*Route\s+as\s+(\w+?)RouteImport\s*\}\s*from\s*(["'])([^"'?]+)\2/gm)) {
    const stem = path.resolve(dir, m[3]);
    const route = [stem, ...[".tsx", ".ts", ".jsx", ".js"].map(x => stem + x)].find(f => fs.existsSync(f) && fs.statSync(f).isFile());
    if (!route) { problems.push(`${m[3]}: the tree imports it, and no such route file is there`); continue; }
    const c = tsRouteComponent(route);
    Object.assign(at(m[1]), { route, ...(c ? { file: c.file, name: c.name } : {}) });
  }
  for (const m of text.matchAll(/^const\s+(\w+?)Route\s*=\s*\1RouteImport\.update\(\{([\s\S]*?)\}\s*as any\)/gm)) {
    const body = m[2]; const str = k => new RegExp(`\\b${k}:\\s*(["'])(.*?)\\1`).exec(body)?.[2];
    const parent = /getParentRoute:\s*\(\)\s*=>\s*(\w+)/.exec(body)?.[1];
    Object.assign(at(m[1]), { id: str("id"), path: str("path"), parent: parent === "rootRouteImport" ? "root" : parent?.replace(/Route$/, "") });
  }
  if (!routes.has("root")) problems.push("the tree has no root route");
  for (const r of routes.values()) if (r.key !== "root") (routes.get(r.parent ?? "root") ?? at("root")).children.push(r);
  const root = at("root"); root.id ??= "__root__"; root.path ??= "/";
  // a layout that renders its pages with the router's own component, not `props.children`: the host renders through it (MO-14f)
  // — itself, or through an `.rx` component it applies (2026-11-25)
  const outlet = [...routes.values()].some(r => r.file && r.children.length && !/\bprops\.children\b/.test(componentsOf(r.file).src ?? "") && rxReach(r.file).some(f => /<Outlet\b/.test(componentsOf(f).src ?? "")));
  return { kind: "tanstack", pkg, imports: [stripExt(posix(source))], nodes: [root], through: outlet ? [{ name: "Outlet", from: pkg }] : [], problems };
}
const stripExt = f => f.replace(/\.(m?[jt]sx?|c[jt]s)$/, "");

/** A routes directory, scanned by the project's own filesystem-routing: every `.rx` file a page (its default
 *  component), nested by that package's `buildRouteTree`. In a child process: the package is an ES module, and this
 *  is asked synchronously (a build's compile). */
function readDirectory(source) {
  // the scan below is the package's convention. A config that gives the plugin its own would be answered with a tree
  // the router does not have, in silence: refused, with the source that reads the router itself
  const config = viteConfigFor(source); const own = config ? ownConvention(fs.readFileSync(config, "utf8")) : [];
  if (own.length) return { kind: "filesystem-routing", nodes: [], through: [], imports: [], problems: [`${path.basename(config)} gives filesystem-routing ${own.map(o => `\`${o}\``).join(" and ")} of its own, and a routes directory is read with the package's convention: put the router in a module (\`export default new PageFileSystemRouter({ dir, extensions, toPath, toRoute })\`), give it to the plugin (\`fileRoutes({ router })\`), and name that module as the source (\`//@ routes ./routes.config.js\`)`] };
  const script = `import { PageFileSystemRouter, buildRouteTree } from "filesystem-routing";
const r = new PageFileSystemRouter({ dir: ${JSON.stringify(source)}, extensions: ["rx"], toRoute: (src, router) => ({ path: router.toPath(src), page: true, src }) });
const strip = n => ({ path: n.path, id: n.id, src: n.src, children: (n.children ?? []).map(strip) });
console.log(JSON.stringify(buildRouteTree((await r.getRoutes()).filter(x => x.page)).map(strip)));`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: path.dirname(source), encoding: "utf8" });
  if (r.status !== 0) return { kind: "filesystem-routing", nodes: [], through: [], imports: [], problems: [`${source}: a routes directory is read with the project's filesystem-routing, which did not run: ${String(r.stderr).trim().split("\n").pop()?.slice(0, 200)}`] };
  const problems = [];
  const node = n => { const file = path.resolve(n.src); const c = componentsOf(file); if (!c.dflt) problems.push(`${posix(path.relative(source, file))} is a route file with no default component`); return { file, name: c.dflt, route: file, id: n.id, path: n.path, children: n.children.map(node) }; };
  return { kind: "filesystem-routing", nodes: JSON.parse(r.stdout.trim().split("\n").pop()).map(node), through: [], imports: ["virtual:file-routes"], problems };
}

/** The Vite config a routes directory is scanned under: the nearest `vite.config.*` from the directory upward, as far
 *  as the project's package.json. */
function viteConfigFor(dir) {
  for (let at = dir; ; at = path.dirname(at)) {
    for (const n of ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs", "vite.config.cjs", "vite.config.cts"]) if (fs.existsSync(path.join(at, n))) return path.join(at, n);
    if (fs.existsSync(path.join(at, "package.json")) || path.dirname(at) === at) return undefined;
  }
}
/** What a Vite config gives filesystem-routing beyond the package's own convention — an option the plugin is written
 *  (`toPath:`, `router:`, `routers:`, or the shorthand), not a call of the router's own `toPath` inside `toRoute`. */
function ownConvention(text) {
  const src = code(text).join("\n"); const found = new Set();
  // inside each `fileRoutes( … )`, to its closing parenthesis: another plugin's `router:` is not this one's
  for (const m of src.matchAll(/\bfileRoutes\s*\(/g)) {
    let depth = 1, i = m.index + m[0].length; for (; i < src.length && depth; i++) { if (src[i] === "(") depth++; else if (src[i] === ")") depth--; }
    for (const o of src.slice(m.index + m[0].length, i).matchAll(/(?<![.\w$])(toPath|routers?)\s*(?=[:,}])/g)) found.add(o[1]);
  }
  return [...found];
}

/** A module that exports the project's filesystem-routing router: its routes as the router gives them (its `toPath`,
 *  its `toRoute`), nested by the package's `buildRouteTree`; a route's file is its component's (`$component.src`), else
 *  the file the router scanned for it. In a child process, as a directory is read. */
function readRouter(source) {
  const script = `import { pathToFileURL } from "node:url";
const m = await import(pathToFileURL(${JSON.stringify(source)}).href);
const router = m.default ?? m.router;
if (!router || typeof router.getRoutes !== "function") { console.error("it exports no router: \`export default new PageFileSystemRouter({ … })\` (or one named \`router\`), the one fileRoutes({ router }) is given"); process.exit(3); }
const { buildRouteTree } = await import("filesystem-routing");
const clean = s => typeof s === "string" ? s.split("?")[0] : undefined;
const flat = ((await router.getRoutes()) ?? []).filter(r => r.page).map(r => ({ ...r, __file: clean(r.$component?.src) ?? clean(router.sources?.get(r.path)) }));
const strip = n => ({ path: n.path, id: n.id, src: n.__file, children: (n.children ?? []).map(strip) });
console.log(JSON.stringify(buildRouteTree(flat).map(strip)));`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: path.dirname(source), encoding: "utf8" });
  if (r.status !== 0) return { kind: "filesystem-routing", nodes: [], through: [], imports: [], problems: [`${source}: a router's module is read by importing it${/\.[mc]?ts$/.test(source) ? " (a TypeScript module needs a Node that strips types, 22.18 or later)" : ""}, which did not run: ${String(r.stderr).trim().split("\n").pop()?.slice(0, 300)}`] };
  const problems = [];
  // a route whose component is no `.rx` file (a TSX page beside the `.rx` ones) has no name here: left out, as a
  // TanStack route with no `.rx` component is, its children its parent's
  const node = n => { const file = n.src && n.src.endsWith(".rx") ? path.resolve(path.dirname(source), n.src) : undefined; const c = file ? componentsOf(file) : undefined; if (file && !c.dflt) problems.push(`${rel(path.dirname(source), file)} is a route file with no default component`); return { file, name: c?.dflt, route: file, id: n.id, path: n.path, children: n.children.map(node) }; };
  return { kind: "filesystem-routing", nodes: JSON.parse(r.stdout.trim().split("\n").pop()).map(node), through: [], imports: ["virtual:file-routes"], problems };
}

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
/** A layout that renders its pages with the router's own component, not `props.children` — itself, or through an
 *  `.rx` component it applies: the host renders through it (MO-14f). */
function outletIn(nodes) {
  const all = []; const walk = ns => ns.forEach(n => { all.push(n); walk(n.children); }); walk(nodes);
  return all.some(r => r.file && r.children.length && !/\bprops\.children\b/.test(componentsOf(r.file).src ?? "") && rxReach(r.file).some(f => /<Outlet\b/.test(componentsOf(f).src ?? "")));
}

/** A tree another host's tooling wrote: `[{ file, component?, path?, id?, children? }]`, files against the JSON's folder. */
function readJson(source, text) {
  const problems = []; let data;
  try { data = JSON.parse(text); } catch (e) { return { kind: "json", nodes: [], through: [], imports: [], problems: [`${source}: ${e.message}`] }; }
  const node = n => { const file = path.resolve(path.dirname(source), String(n.file)); const c = componentsOf(file); const name = n.component ?? c.dflt; if (!name || !c.all.includes(name)) problems.push(`${n.file} exports no component ${n.component ?? "by default"}`); return { file, name, route: file, id: n.id, path: n.path, children: [].concat(n.children ?? []).map(node) }; };
  return { kind: "json", nodes: [].concat(data.routes ?? data).map(node), through: [].concat(data.through ?? []), imports: [].concat(data.imports ?? []), problems };
}

/** The router's tree, from its own source (absolute): `{ kind, nodes: [{ file, name, id, path, children }], through,
 *  imports, problems }` — `through`, the components of the router's own a layout renders its pages with; `imports`,
 *  how a JS module of the app names the source when it imports it (the app's component that does is the one the host
 *  renders the tree through). A route with no `.rx` component is left out, its children its parent's. */
function readRoutes(source) {
  let st; try { st = fs.statSync(source); } catch { return { kind: "none", nodes: [], through: [], imports: [], problems: [`${source}: no such file or directory (the router's plugin writes it: build, or start the dev server, first)`] }; }
  let r;
  if (st.isDirectory()) r = readDirectory(source);
  else {
    const text = fs.readFileSync(source, "utf8");
    // a generated tree of TanStack's names each route's parent; any other JS module is the project's router
    r = source.endsWith(".rx") ? readRxRouter(source) : source.endsWith(".json") ? readJson(source, text) : /@tanstack\/[\w-]*router|\bgetParentRoute\b/.test(text) ? readTanstack(source, text) : readRouter(source);
  }
  const lift = nodes => nodes.flatMap(n => { const kids = lift(n.children ?? []); return n.file && n.name ? [{ ...n, children: kids }] : kids; });
  return { ...r, nodes: lift(r.nodes) };
}

/** What a declaration beside a JS module says of an export: `{ component, provides }`. */
function rowOf(declFile, name) {
  let text; try { text = fs.readFileSync(declFile, "utf8"); } catch { return undefined; }
  for (const l of code(text)) { const m = new RegExp(`^\\s*export\\s+component\\s+${name.replace(/\$/g, "\\$")}\\b(.*)$`).exec(l); if (m) return { component: true, provides: [...m[1].matchAll(/\bprovides\(([^)]*)\)/g)].flatMap(x => x[1].split(",").map(y => y.trim()).filter(Boolean)) }; }
  return undefined;
}
const declBeside = at => [`${at}.d.rx`, stripExt(at) + ".d.rx"].find(f => fs.existsSync(f));
const jsFile = at => [at, ...[".tsx", ".ts", ".jsx", ".js", ".mjs"].map(x => at + x)].find(f => fs.existsSync(f) && fs.statSync(f).isFile());

/** An entry around the router (MO-14f): the `.rx` module's default component, and the component of the app's own it
 *  applies that renders the routes — the one imported from a JS module that imports the router's tree. */
function entryOf(file, routes, sourceAbs) {
  const c = componentsOf(file);
  if (!c.dflt) return { problem: `${path.basename(file)} has no default component to put around the routes` };
  const found = [];
  // the entry applies the router's component itself, or an `.rx` component it applies does (MO-14f, 2026-11-25)
  for (const at of rxReach(file)) { const src = componentsOf(at).src ?? "";
  for (const m of src.matchAll(/^import\s*\{([^}]*)\}\s*from\s*(["'])(\.[^"']*)\2/gm)) {
    if (m[3].endsWith(".rx")) continue;
    const js = jsFile(path.resolve(path.dirname(at), m[3])); if (!js) continue;
    const text = fs.readFileSync(js, "utf8");
    const names = [...text.matchAll(/\bfrom\s*(["'])([^"']+)\1|\bimport\s*\(\s*(["'])([^"']+)\3/g)].map(x => x[2] ?? x[4]);
    const reads = names.some(spec => routes.imports.includes(spec) || (spec.startsWith(".") && [posix(path.resolve(path.dirname(js), spec)), stripExt(posix(path.resolve(path.dirname(js), spec)))].some(p => p === posix(sourceAbs) || p === stripExt(posix(sourceAbs)))));
    if (!reads) continue;
    const decl = declBeside(js);
    for (const part of m[1].split(",").map(x => x.trim()).filter(Boolean)) {
      const [name, local = name] = part.split(/\s+as\s+/);
      if (!new RegExp(`<${local.replace(/\$/g, "\\$")}[\\s/>]`).test(src)) continue;
      const row = decl && rowOf(decl, name);
      if (row && !found.some(f => f.abs === js && f.name === name)) found.push({ name, from: m[3], abs: js, provides: row.provides });
    }
  } }
  // a router made in `.rx` is rendered by the library's own provider, which the entry (or an `.rx` component it
  // applies) imports from the package: the declaration the project has for the package says what it provides
  if (routes.provider && !found.length) for (const at of rxReach(file)) { const src = componentsOf(at).src ?? "";
    for (const m of src.matchAll(/^import\s*\{([^}]*)\}\s*from\s*(["'])([^"']*)\2/gm)) {
      if (m[3] !== routes.provider.from) continue;
      for (const part of m[1].split(",").map(x => x.trim()).filter(Boolean)) {
        const [name, local = name] = part.split(/\s+as\s+/);
        if (name !== routes.provider.name || !new RegExp(`<${local.replace(/\$/g, "\\$")}[\\s/>]`).test(src)) continue;
        let decl; try { decl = require("./rxc").lookup(at, m[3]) ?? undefined; } catch { decl = undefined; }
        const row = decl && fs.existsSync(decl) ? rowOf(decl, name) : undefined;
        if (row && !found.some(f => f.name === name)) found.push({ name, from: m[3], abs: m[3], provides: row.provides });
      }
    } }
  if (found.length !== 1) return { problem: `${path.basename(file)}: ${found.length ? `it applies ${found.map(f => f.name).join(" and ")}, each from a module that reads the routes` : "it applies no declared component of a JS module that imports the router's tree"}: which component renders the routes is then not the tool's to say (write the declaration by hand, without \`//@ routes\`)` };
  return { file, name: c.dflt, through: found[0] };
}

/** The contexts the route components' own imports are declared to use (the host must provide them): context → its module. */
function contextsUsed(files, dir) {
  const { lookup } = require("./rxc");
  const contexts = new Map();
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/^import\s+(?:(?:server|client)\s+)?(?:pure\s+)?\{([^}]*)\}\s*from\s*(["'])(.*?)\2/gm)) {
      const spec = m[3]; if (spec.endsWith(".rx")) continue;
      let decl;
      if (spec.startsWith(".")) decl = declBeside(path.resolve(path.dirname(file), spec));
      else { try { decl = lookup(file, spec) ?? undefined; } catch { decl = undefined; } }
      if (!decl || !fs.existsSync(decl)) continue;
      const uses = new Map(), from = new Map();
      for (const l of code(fs.readFileSync(decl, "utf8"))) {
        const c = /^\s*export\s+context\s+([\w$]+)(?:\s+from\s+(["'])(.*?)\2)?/.exec(l); if (c) { from.set(c[1], c[3]); continue; }
        const r = /^\s*export\s+(?:(?:pure|server|client)\s+)*(?:fn|component)\s+([\w$.]+)/.exec(l); if (!r) continue;
        const u = [...l.matchAll(/\buses\(([^)]*)\)/g)].flatMap(x => x[1].split(",").map(y => y.trim()).filter(Boolean)); if (u.length) uses.set(r[1], u);
      }
      for (const n of m[1].split(",").map(x => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) for (const c of uses.get(n) ?? []) {
        if (contexts.has(c)) continue;
        const own = from.get(c); const named = own === undefined ? spec : own;
        contexts.set(c, named.startsWith(".") ? rel(dir, path.resolve(path.dirname(own === undefined ? file : decl), named)) : named);
      }
    }
  }
  return contexts;
}

/** The declaration the source gives, as a file in `dir` writes it: `{ text, problems, routes }`. `source` and `entries`
 *  absolute. */
function derive(dir, source, entries = []) {
  const routes = readRoutes(source); const problems = [...routes.problems];
  const taken = new Map();   // a local name → the component it stands for (`file#name`)
  const local = (file, name) => { const key = `${file}#${name}`; for (let i = 1; ; i++) { const l = i === 1 ? name : `${name}${i}`; if (!taken.has(l)) { taken.set(l, key); return l; } if (taken.get(l) === key) return l; } };
  const byFile = new Map();   // module → [[name, local]], in the order the tree names them
  const use = (file, name) => { const l = local(file, name); const at = byFile.get(file) ?? []; if (!at.some(([n]) => n === name)) at.push([name, l]); byFile.set(file, at); return l; };
  const wraps = [];
  for (const e of entries) { const w = entryOf(e, routes, source); if (w.problem) problems.push(w.problem); else { wraps.push(w); use(w.file, w.name); } }
  const record = n => `{ component: ${use(n.file, n.name)}${n.children.length ? `, children: [${n.children.map(record).join(", ")}]` : ""} }`;
  let view = routes.nodes.map(record).join(", ");
  for (const w of [...wraps].reverse()) view = `{ component: ${use(w.file, w.name)}, children: [${view}] }`;
  const through = [...wraps.map(w => ({ name: w.through.name, from: w.through.from.startsWith(".") ? rel(dir, w.through.abs) : w.through.from })), ...routes.through];
  // what the routes read and nothing they are rendered through provides is the view's own to provide
  const routeFiles = []; const walk = ns => ns.forEach(n => { if (!routeFiles.includes(n.file)) routeFiles.push(n.file); walk(n.children); }); walk(routes.nodes);
  const contexts = contextsUsed(routeFiles, dir);
  for (const w of wraps) for (const c of w.through.provides) contexts.delete(c);
  const imports = [...byFile].map(([file, names]) => `import { ${names.map(([n, l]) => n === l ? n : `${n} as ${l}`).join(", ")} } from ${JSON.stringify(rel(dir, file))}`);
  const jsImports = new Map(); for (const t of through) jsImports.set(t.from, [...(jsImports.get(t.from) ?? []), t.name]);
  const text = [
    `//@ routes ${rel(dir, source)}${entries.map(e => ` ${rel(dir, e)}`).join("")}`,
    "// Derived (rx-declare --host --routes): what the router does with the app's components (09 MO-14), read from the",
    "// router's own tree. Not edited by hand — `rx-declare --host --sync` writes it again, the dev server does on its own,",
    "// and a build, rx-tsc and rx-verify refuse it once the tree has moved (HOST_VIEW_STALE).",
    ...imports,
    ...[...jsImports].map(([from, names]) => `import { ${[...new Set(names)].join(", ")} } from ${JSON.stringify(from)}`),
    ...[...contexts].map(([c, m]) => `export context ${c} from ${JSON.stringify(m)}`),
    `export default component${contexts.size ? ` provides(${[...contexts.keys()].join(", ")})` : ""} nests(children in component) = [${view}]`,
    "",
  ].join("\n");
  return { text, problems, routes, names: new Map([...taken].map(([l, key]) => [key, l])) };
}

/** A declaration's rows, comments and layout aside: what `drift` compares. */
const rowsOf = text => { const ls = code(text).map(l => l.trim()).filter(Boolean); const at = ls.findIndex(l => /^export\s+default\s+component\b/.test(l)); const all = at < 0 ? ls : [...ls.slice(0, at), ls.slice(at).join(" ")]; return all.map(l => l.replace(/\s+/g, " ").replace(/([\[{(]) /g, "$1").replace(/ ([\]})])/g, "$1").replace(/\{(?=\S)/g, "{ ").replace(/(?<=\S)\}/g, " }").replace(/\{ +/g, "{ ").replace(/ +\}/g, " }")); };
/** The components a view names, each with the one it is nested in: `Map(name → parent | null)`. */
function placesOf(text) {
  const row = rowsOf(text).find(l => /^export\s+default\s+component\b/.test(l)); const out = new Map(); if (!row) return out;
  const tree = row.slice(row.indexOf("=") + 1); const stack = [];
  for (const m of tree.matchAll(/component:\s*([\w$]+)|children:\s*\[|\]/g)) {
    if (m[1]) { out.set(m[1], stack.filter(Boolean).at(-1) ?? null); stack.last = m[1]; }
    else if (m[0] === "]") stack.pop();
    else stack.push(stack.last);
  }
  return out;
}

/** 09 MO-14g: whether a host declaration that names its routes still says what they are. Null for one that names
 *  none (written by hand: `rx-verify`'s probe is what holds it); else `{ stale, problems, expected, line }` —
 *  `problems` in words: each route component the view lacks, has and the tree has not, or nests elsewhere. */
function drift(hostFile) {
  const text = fs.readFileSync(hostFile, "utf8"); const p = pragmaOf(text); if (!p) return null;
  const dir = path.dirname(path.resolve(hostFile));
  const d = derive(dir, path.resolve(dir, p.source), p.entries.map(e => path.resolve(dir, e)));
  if (d.problems.length) return { stale: true, problems: d.problems, expected: d.text, line: p.line };
  const same = JSON.stringify(rowsOf(text)) === JSON.stringify(rowsOf(d.text));
  if (same) return { stale: false, problems: [], expected: d.text, line: p.line };
  const has = placesOf(text), wants = placesOf(d.text); const problems = [];
  for (const [n, parent] of wants) { if (!has.has(n)) problems.push(`${n} is a route of ${p.source} and is not in the view`); else if (has.get(n) !== parent) problems.push(`${n} is ${parent ? `among ${parent}'s children` : "at the top"} in ${p.source}, and ${has.get(n) ? `among ${has.get(n)}'s` : "at the top"} in the view`); }
  for (const n of has.keys()) if (!wants.has(n)) problems.push(`${n} is in the view and is no route of ${p.source}`);
  if (!problems.length) problems.push(`its rows are not the ones ${p.source} gives`);
  return { stale: true, problems, expected: d.text, line: p.line };
}
/** The nearest `host.d.rx` from a module's folder upward (as the checkers' loader finds it). */
function hostFor(file) {
  for (let dir = path.dirname(path.resolve(file)); ; dir = path.dirname(dir)) { const f = path.join(dir, "host.d.rx"); if (fs.existsSync(f)) return f; if (path.dirname(dir) === dir) return undefined; }
}
/** Writes a stale declaration again from its source. True when it wrote. A source that cannot be read leaves the file. */
function sync(hostFile) {
  const d = drift(hostFile); if (!d || !d.stale) return false;
  const text = fs.readFileSync(hostFile, "utf8"); const p = pragmaOf(text); const dir = path.dirname(path.resolve(hostFile));
  const again = derive(dir, path.resolve(dir, p.source), p.entries.map(e => path.resolve(dir, e)));
  if (again.problems.length) return false;
  fs.writeFileSync(hostFile, again.text); return true;
}
/** `HOST_VIEW_STALE`, in a sentence. */
const message = (hostFile, d) => `${path.basename(hostFile)} is derived from the router's tree (\`//@ routes\`) and has fallen behind it: ${d.problems.join("; ")}. Write it again: rx-declare --host --sync ${posix(path.relative(process.cwd(), hostFile)) || hostFile}`;

/** The probe's third argument (MO-14e): the routes as the source nests them, each with the recording component that
 *  stands for its `.rx` one — a scene built from it follows the router's tree, and restates nothing. */
function sceneRoutes(hostFile, rx) {
  const text = fs.readFileSync(hostFile, "utf8"); const p = pragmaOf(text); if (!p) return undefined;
  const dir = path.dirname(path.resolve(hostFile));
  const d = derive(dir, path.resolve(dir, p.source), p.entries.map(e => path.resolve(dir, e)));
  const node = n => { const name = d.names.get(`${n.file}#${n.name}`); return { name, component: rx[name], path: n.path, id: n.id, children: n.children.map(node) }; };
  return d.routes.nodes.map(node);
}

module.exports = { pragmaOf, readRoutes, derive, drift, sync, hostFor, message, sceneRoutes, rowsOf };
