// A `.d.rx` pinned to the package it declares: `//@ for @tanstack/solid-query ^6.0.0` on a line of its own. A declaration
// states rows the checker trusts (09 MO-8b); written for one version of a library, it may say the wrong thing about the
// next. rx-tsc refuses a declaration whose pinned package is installed at a version outside the range (DECLARATION_VERSION).
// Ranges are npm's, evaluated by npm's own `semver`: space-separated comparators all hold (`>=1.0.0 <2.0.0`), `||`
// joins alternatives, hyphen ranges, x-ranges, `^`, `~`. As in npm, a prerelease satisfies a range only when the range
// names a prerelease of the same version (`2.0.0-rc.10` satisfies `>=2.0.0-rc.2`, identifiers compared numerically).
// A range npm cannot read is reported, not taken to hold.
const fs = require("node:fs");
const path = require("node:path");
const semver = require("semver");

const PIN = /^\s*\/\/@\s*for\s+(\S+)\s+(.+?)\s*$/;

/** Whether `version` is in `range`, as npm decides; null when the range is not one npm reads. */
function satisfies(version, range) {
  if (semver.validRange(range) === null) return null;
  return semver.satisfies(version, range);
}
/** The installed version of `pkg`, resolved from `dir` as Node would, or undefined. */
function installed(pkg, dir) {
  for (let d = dir; ; d = path.dirname(d)) {
    const f = path.join(d, "node_modules", pkg, "package.json");
    if (fs.existsSync(f)) { try { return JSON.parse(fs.readFileSync(f, "utf8")).version; } catch { return undefined; } }
    if (path.dirname(d) === d) return undefined;
  }
}
/** Each pin in `file` that the installed package does not satisfy: `{ line, message }`. `from`: the modules whose imports
 *  consumed the declaration — the package is resolved from each, as its import resolves it (one workspace may install
 *  two versions); by default, from the declaration's own directory. */
function checkPins(file, from) {
  const out = [];
  const dirs = [...new Set((from?.length ? from : [file]).map(f => path.dirname(path.resolve(f))))];
  fs.readFileSync(file, "utf8").split("\n").forEach((l, i) => {
    const m = PIN.exec(l); if (!m) return;
    const [, pkg, range] = m;
    if (satisfies("0.0.0", range) === null) { out.push({ line: i + 1, message: `${range} is not a version range npm reads: write it as npm would (\`^2.0.0\`, \`>=1.0.0 <2.0.0\`)` }); return; }
    const seen = new Set();
    for (const dir of dirs) {
      const v = installed(pkg, dir);
      const where = dirs.length > 1 ? ` (from ${path.relative(process.cwd(), dir) || "."})` : "";
      const msg = !v ? `${pkg} is pinned (${range}) but not installed here${where}`
        : !satisfies(v, range) ? `written for ${pkg} ${range}, but ${v} is installed${where}: check the declaration against this version, then update the pin` : null;
      if (msg && !seen.has(msg)) { seen.add(msg); out.push({ line: i + 1, message: msg }); }
    }
  });
  return out;
}

module.exports = { checkPins, satisfies, installed, PIN };
