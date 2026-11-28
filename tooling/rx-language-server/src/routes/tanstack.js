// TanStack Router's generated tree (`routeTree.gen.ts`): each route's parent is its `getParentRoute`, its component the
// `.rx` file the tree imports as a page (`?rx-page`) or the `.rx` component its TS route file hands the route (`?rx-lib`).
const fs = require("node:fs");
const path = require("node:path");
const { posix, rel, stripExt, componentsOf, outletIn } = require("./common.js");

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
  // (with the file's route options beside it, where it exports them: `{ default as XRouteComponent, route as XRouteOptions }`)
  for (const m of text.matchAll(/^import\s*\{\s*default\s+as\s+(\w+?)RouteComponent\s*(?:,\s*[\w$]+\s+as\s+\w+?RouteOptions\s*,?\s*)?\}\s*from\s*(["'])([^"'?]+)(\?[^"']*)?\2/gm)) {
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
  return { kind: "tanstack", pkg, imports: [stripExt(posix(source))], nodes: [root], through: outletIn([root]) ? [{ name: "Outlet", from: pkg }] : [], problems };
}
module.exports = { takes: (source, text) => /@tanstack\/[\w-]*router|\bgetParentRoute\b/.test(text), read: readTanstack };
