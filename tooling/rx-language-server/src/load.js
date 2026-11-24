// The module a declaration declares, and what it takes to run it: what rx-declare (--audit) and rx-verify share.
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

/** The module a `.d.rx` declares, as an import of it is written, and the folder it is imported from: a project's
 *  declaration of a package (`rx-types/<spec>.d.rx`, 09 MO-8k) by its name, a file beside a JS module by that module. */
function declares(file) {
  const abs = path.resolve(file); const parts = abs.split(path.sep); const i = parts.lastIndexOf("rx-types");
  if (i > 0) return { spec: parts.slice(i + 1).join("/").replace(/\.d\.rx$/, ""), from: parts.slice(0, i).join(path.sep) };
  const stem = abs.replace(/\.d\.rx$/, "");
  if (fs.existsSync(stem) && fs.statSync(stem).isFile()) return { spec: `./${path.basename(stem)}`, from: path.dirname(abs) };   // `x.tsx.d.rx`
  const ext = [".js", ".mjs", ".jsx", ".ts", ".tsx", ".mts"].find(x => fs.existsSync(stem + x));
  return ext ? { spec: `./${path.basename(stem)}${ext}`, from: path.dirname(abs) } : undefined;
}

/** Where `spec` resolves from `from`, as a browser bundle would import it: CommonJS resolution first, else the package's
 *  `exports` under the `browser`, `import` and `default` conditions (an ESM-only package has no `require` one), a subpath
 *  pattern (`./*`) included. */
function resolveModule(spec, from) {
  try { return require.resolve(spec, { paths: [from] }); } catch {}
  if (spec.startsWith(".")) return null;
  const parts = spec.split("/"), name = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  const sub = "." + spec.slice(name.length);
  for (let dir = path.resolve(from); ; dir = path.dirname(dir)) {
    const pkgDir = path.join(dir, "node_modules", name), pj = path.join(pkgDir, "package.json");
    if (fs.existsSync(pj)) {
      const pkg = JSON.parse(fs.readFileSync(pj, "utf8"));
      const pick = e => typeof e === "string" ? e : Array.isArray(e) ? e.map(pick).find(Boolean) : e && typeof e === "object" ? ["browser", "import", "default"].map(k => k in e ? pick(e[k]) : null).find(Boolean) : null;
      const ex = pkg.exports;
      const map = typeof ex === "object" && ex && !Array.isArray(ex) && Object.keys(ex).some(k => k.startsWith(".")) ? ex : null;
      // a subpath pattern (`"./*": "./dist/*.js"`), as Node resolves it: the longest part before `*` wins, then the longest
      // key — the crate's and ref/src/modules.ts's `packageDeclaration`
      const pattern = () => {
        let best;
        for (const k of Object.keys(map)) { const star = k.indexOf("*"); if (star < 0 || k.lastIndexOf("*") !== star) continue; const pre = k.slice(0, star), post = k.slice(star + 1); if (sub.startsWith(pre) && sub.endsWith(post) && sub.length >= k.length && (best === undefined || star > best.indexOf("*") || (star === best.indexOf("*") && k.length > best.length))) best = k; }
        if (best === undefined) return null;
        const star = best.indexOf("*"), post = best.length - star - 1, t = pick(map[best]);
        return t ? t.split("*").join(sub.slice(star, sub.length - post)) : null;
      };
      const entry = ex === undefined ? (sub === "." ? pkg.module ?? pkg.main ?? "index.js" : sub) : map ? (sub in map ? pick(map[sub]) : pattern()) : sub === "." ? pick(ex) : null;
      const f = entry && path.join(pkgDir, entry);
      return f && fs.existsSync(f) ? f : null;
    }
    if (path.dirname(dir) === dir) return null;
  }
}

/** A package that ships only `.jsx` (its `solid` build) runs once compiled: the project's Solid compiler, through a
 *  module hook (src/jsx-hook.mjs). Without one the package is not run, and the note says why. */
let jsxHook = null;
function compileJsx(from) {
  if (jsxHook !== null) return jsxHook;
  try {
    const compiler = require.resolve("@solidjs/compiler", { paths: [from, path.join(from, "node_modules/@solidjs/vite-plugin")] });
    require("node:module").register(pathToFileURL(path.join(__dirname, "jsx-hook.mjs")).href, { data: { compiler, from: path.join(from, "package.json") } });
    jsxHook = true;
  } catch { jsxHook = false; }
  return jsxHook;
}

module.exports = { declares, resolveModule, compileJsx };
