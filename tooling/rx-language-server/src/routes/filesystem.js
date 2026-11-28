// filesystem-routing: a routes directory, scanned by the project's own package, or the module that exports its router.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { posix, rel, code, componentsOf } = require("./common.js");

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

module.exports = { takes: () => true, read: (source, text) => text === undefined ? readDirectory(source) : readRouter(source) };
