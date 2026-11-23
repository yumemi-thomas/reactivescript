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
const { rel, code, posix, stripExt, componentsOf, rxReach } = require("./routes/common.js");
// the readers of a router's tree, each `{ takes(source, text), read(source, text) }`, the first that takes a source:
// what knows a router is in its own file, and answers one tree (`readRoutes`)
const READERS = ["rx-router", "json", "tanstack", "filesystem"].map(n => require(`./routes/${n}.js`));

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

/** The router's tree, from its own source (absolute): `{ kind, nodes: [{ file, name, id, path, children }], through,
 *  imports, problems }` — `through`, the components of the router's own a layout renders its pages with; `imports`,
 *  how a JS module of the app names the source when it imports it (the app's component that does is the one the host
 *  renders the tree through). A route with no `.rx` component is left out, its children its parent's. */
function readRoutes(source) {
  let st; try { st = fs.statSync(source); } catch { return { kind: "none", nodes: [], through: [], imports: [], problems: [`${source}: no such file or directory (the router's plugin writes it: build, or start the dev server, first)`] }; }
  // (a directory has no text; the last reader takes any other JavaScript module: the project's router)
  const text = st.isDirectory() ? undefined : fs.readFileSync(source, "utf8");
  const r = READERS.find(x => text === undefined ? x === READERS.at(-1) : x.takes(source, text)).read(source, text);
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
