// A `.d.rx` pinned to the package it declares: `//@ for @tanstack/solid-query ^6.0.0` on a line of its own. A declaration
// states rows the checker trusts (09 MO-8b); written for one version of a library, it may say the wrong thing about the
// next. rx-tsc refuses a declaration whose pinned package is installed at a version outside the range (DECLARATION_VERSION).
// Ranges: an exact version, `^x.y.z`, `~x.y.z`, `>=x.y.z`, or several joined by `||`. Prereleases compare by their base
// version and then by their tag, as npm's do.
const fs = require("node:fs");
const path = require("node:path");

const PIN = /^\s*\/\/@\s*for\s+(\S+)\s+(.+?)\s*$/;

/** `"2.0.0-rc.6"` → `[2, 0, 0, "rc.6"]`. */
function parse(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(v.trim());
  return m ? [+m[1], +m[2], +m[3], m[4] ?? ""] : null;
}
function cmp(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  if (a[3] === b[3]) return 0;
  if (!a[3]) return 1; if (!b[3]) return -1;   // a release is above its prereleases
  return a[3] < b[3] ? -1 : 1;
}
function satisfies(version, range) {
  const v = parse(version); if (!v) return false;
  return range.split("||").some(r0 => {
    const r = r0.trim();
    if (r === "*" || r === "") return true;
    const op = /^(\^|~|>=|<=|>|<|=)?\s*(.+)$/.exec(r); const want = parse(op[2]); if (!want) return false;
    const c = cmp(v, want);
    switch (op[1] ?? "=") {
      case "^": return c >= 0 && (want[0] > 0 ? v[0] === want[0] : want[1] > 0 ? v[0] === 0 && v[1] === want[1] : v[0] === 0 && v[1] === 0 && v[2] === want[2]);
      case "~": return c >= 0 && v[0] === want[0] && v[1] === want[1];
      case ">=": return c >= 0; case ">": return c > 0; case "<=": return c <= 0; case "<": return c < 0;
      default: return c === 0;
    }
  });
}
/** The installed version of `pkg`, resolved from `dir` as Node would, or undefined. */
function installed(pkg, dir) {
  for (let d = dir; ; d = path.dirname(d)) {
    const f = path.join(d, "node_modules", pkg, "package.json");
    if (fs.existsSync(f)) { try { return JSON.parse(fs.readFileSync(f, "utf8")).version; } catch { return undefined; } }
    if (path.dirname(d) === d) return undefined;
  }
}
/** Each pin in `file` that the installed package does not satisfy: `{ line, message }`. */
function checkPins(file) {
  const out = [];
  fs.readFileSync(file, "utf8").split("\n").forEach((l, i) => {
    const m = PIN.exec(l); if (!m) return;
    const [, pkg, range] = m; const v = installed(pkg, path.dirname(file));
    if (!v) out.push({ line: i + 1, message: `${pkg} is pinned (${range}) but not installed here` });
    else if (!satisfies(v, range)) out.push({ line: i + 1, message: `written for ${pkg} ${range}, but ${v} is installed: check the declaration against this version, then update the pin` });
  });
  return out;
}

module.exports = { checkPins, satisfies, installed, PIN };
