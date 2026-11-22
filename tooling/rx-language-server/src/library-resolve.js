// MO-8o: a row's types are the library's declaration's, so a package a row names (`import("@solid-primitives/utils")
// .Many<T>`) is the one the *library* imports — found from where the library is installed, whether npm put that
// dependency beside the app (hoisted) or under the library (nested), and whatever other copy of it the app's folder
// can see. Resolving such a name from the app's folder made a draft depend on the install's layout: the same
// package.json gave `Many<Target>` on one machine and `Target | Target[]` on another, and a hoisted copy of another
// version was a different type under the same name.
const path = require("node:path");

/** A specifier TypeScript resolves through node_modules (not a relative or an absolute path). */
const bare = name => !name.startsWith(".") && !path.isAbsolute(name) && !/^[A-Za-z]:[\\/]/.test(name);

/** `spec` as the library resolves it: from `lib` (a file of the library) first, then from `from` (the app's file).
 *  @returns the resolved module, or undefined */
function resolveAsLibrary(ts, spec, lib, from, options, host) {
  if (lib && bare(spec)) { const r = ts.resolveModuleName(spec, lib, options, host).resolvedModule; if (r) return r; }
  return ts.resolveModuleName(spec, from, options, host).resolvedModule;
}

/** The directory `pkg` is installed in, as the library sees it: up from `lib`, then up from `from`. */
function packageDir(pkg, lib, from) {
  const fs = require("node:fs");
  for (const start of [lib, from]) {
    if (!start) continue;
    for (let d = path.dirname(start); ; d = path.dirname(d)) {
      // a folder named node_modules holds packages itself: `…/node_modules/kit/node_modules/dep`, `…/node_modules/dep`
      const at = path.basename(d) === "node_modules" ? path.join(d, pkg) : path.join(d, "node_modules", pkg);
      if (fs.existsSync(path.join(at, "package.json"))) return fs.realpathSync(at);
      if (path.dirname(d) === d) break;
    }
  }
  return undefined;
}

/** Makes `host` resolve the bare specifiers written in each unit (`units`: unit file → a file of the library it checks)
 *  as that library does: from the library's location first, then from the unit's own. Relative specifiers, and every
 *  other file's imports, are resolved as before. */
function resolveUnitsAsLibrary(ts, host, units) {
  const prior = host.resolveModuleNameLiterals?.bind(host);
  host.resolveModuleNameLiterals = (literals, containingFile, redirected, options, sourceFile, reused) => {
    const lib = units.get(path.resolve(containingFile));
    if (!lib) return prior ? prior(literals, containingFile, redirected, options, sourceFile, reused) : literals.map(l => ts.resolveModuleName(l.text, containingFile, options, host, undefined, redirected, sourceFile && ts.getModeForUsageLocation ? ts.getModeForUsageLocation(sourceFile, l, options) : undefined));
    return literals.map(l => {
      const mode = sourceFile && ts.getModeForUsageLocation ? ts.getModeForUsageLocation(sourceFile, l, options) : undefined;
      if (bare(l.text)) { const r = ts.resolveModuleName(l.text, lib, options, host, undefined, redirected, mode); if (r.resolvedModule) return r; }
      return ts.resolveModuleName(l.text, containingFile, options, host, undefined, redirected, mode);
    });
  };
}

module.exports = { resolveAsLibrary, packageDir, resolveUnitsAsLibrary, bare };
