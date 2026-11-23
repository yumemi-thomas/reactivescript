// What the readers of a router's tree (src/routes/) and src/host-routes.js share.
const fs = require("node:fs");
const path = require("node:path");

const posix = p => p.split(path.sep).join("/");
const rel = (from, to) => { const r = posix(path.relative(from, to)); return r.startsWith(".") ? r : `./${r}`; };
const code = text => text.split("\n").map(l => l.replace(/\/\/.*$/, ""));

const stripExt = f => f.replace(/\.(m?[jt]sx?|c[jt]s)$/, "");


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

/** A layout that renders its pages with the router's own component, not `props.children` — itself, or through an
 *  `.rx` component it applies: the host renders through it (MO-14f). */
function outletIn(nodes) {
  const all = []; const walk = ns => ns.forEach(n => { all.push(n); walk(n.children); }); walk(nodes);
  return all.some(r => r.file && r.children.length && !/\bprops\.children\b/.test(componentsOf(r.file).src ?? "") && rxReach(r.file).some(f => /<Outlet\b/.test(componentsOf(f).src ?? "")));
}

module.exports = { posix, rel, code, stripExt, componentsOf, rxReach, outletIn };
