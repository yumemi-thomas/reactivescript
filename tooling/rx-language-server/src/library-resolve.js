// MO-8o: a row's types are the library's declaration's, so a package a row names (`import("@solid-primitives/utils")
// .Many<T>`) is the one the *library* imports — found from where the library is installed, whether npm put that
// dependency beside the app (hoisted) or under the library (nested), and whatever other copy of it the app's folder
// can see. Resolving such a name from the app's folder made a draft depend on the install's layout: the same
// package.json gave `Many<Target>` on one machine and `Target | Target[]` on another, and a hoisted copy of another
// version was a different type under the same name.
const path = require("node:path");

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

module.exports = { packageDir };
