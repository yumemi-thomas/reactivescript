// `rx-declare --host` (09 MO-14): a draft of a host declaration, from the `.rx` modules a JS host renders. What it can
// read is written: each module's exported components, as imports; the contexts those modules' own imports are declared
// to use, which the host must then provide; a view that names every component. What it cannot is said in a comment:
// which component is among which one's children is the router's own knowledge (its file names, its generated tree).
const fs = require("node:fs");
const path = require("node:path");
const { lookup } = require("./rxc");

const rel = (from, to) => { const r = path.relative(from, to).split(path.sep).join("/"); return r.startsWith(".") ? r : `./${r}`; };
/** The contexts a declaration's rows say each export uses: `{ name → [context] }`, and each context's own module
 *  (`export context c from "<module>"`, MO-12e), else undefined: it is this declaration's. */
function usesOf(text) {
  const uses = new Map(), from = new Map();
  for (const l0 of text.split("\n")) {
    const l = l0.replace(/\/\/.*$/, "");
    const c = /^\s*export\s+context\s+([\w$]+)(?:\s+from\s+(["'])(.*?)\2)?/.exec(l); if (c) { from.set(c[1], c[3]); continue; }
    const m = /^\s*export\s+(?:(?:pure|server|client)\s+)*(?:fn|component)\s+([\w$.]+)/.exec(l); if (!m) continue;
    const u = [...l.matchAll(/\buses\(([^)]*)\)/g)].flatMap(x => x[1].split(",").map(y => y.trim()).filter(Boolean));
    if (u.length) uses.set(m[1], u);
  }
  return { uses, from };
}
/** The draft, for the modules `files` (absolute), written as a declaration in `dir` would write it. */
function draftHost(files, dir) {
  const imports = [], names = [], contexts = new Map();   // context → the module that declares it, as this file names it
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    const comps = [...src.matchAll(/^export\s+(?:default\s+)?component\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    if (!comps.length) continue;
    imports.push(`import { ${comps.join(", ")} } from ${JSON.stringify(rel(dir, file))}`); names.push(...comps);
    // what this module imports from a declared JS module, and which of those rows read a context
    for (const m of src.matchAll(/^import\s+(?:(?:server|client)\s+)?(?:pure\s+)?\{([^}]*)\}\s*from\s*(["'])(.*?)\2/gm)) {
      const spec = m[3]; if (spec.endsWith(".rx")) continue;
      // a relative module's declaration is beside it (MO-8); a package's is found as an import finds it (MO-8k)
      let decl;
      if (spec.startsWith(".")) { const at = path.resolve(path.dirname(file), spec); decl = [`${at}.d.rx`, at.replace(/\.(m?[jt]sx?|c[jt]s)$/, "") + ".d.rx"].find(f => fs.existsSync(f)); }
      else { try { decl = lookup(file, spec) ?? undefined; } catch { decl = undefined; } }
      if (!decl || !fs.existsSync(decl)) continue;
      const { uses, from } = usesOf(fs.readFileSync(decl, "utf8"));
      for (const n of m[1].split(",").map(x => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) for (const c of uses.get(n) ?? []) {
        if (contexts.has(c)) continue;
        // the context's own module where the declaration takes it from one; else the module the route file imports
        const own = from.get(c);
        const named = own === undefined ? spec : own;
        contexts.set(c, named.startsWith(".") ? rel(dir, path.resolve(path.dirname(own === undefined ? file : decl), named)) : named);
      }
    }
  }
  const provides = contexts.size ? ` provides(${[...contexts.keys()].join(", ")})` : "";
  return [
    "// A draft (rx-declare --host): what the JS host does with the components it renders (09 MO-14).",
    ...imports,
    ...(contexts.size ? ["// the contexts these modules' imports are declared to use: the host provides each above every component it renders"] : []),
    ...[...contexts].map(([c, m]) => `export context ${c} from ${JSON.stringify(m)}`),
    "// TODO: every component is placed at the top: write each page among its layout's `children`, as the router nests them",
    `export default component${provides} nests(children in component) = [${names.map(n => `{ component: ${n} }`).join(", ")}]`,
    "",
  ].join("\n");
}
module.exports = { draftHost };
