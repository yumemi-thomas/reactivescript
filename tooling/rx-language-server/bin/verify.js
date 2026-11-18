#!/usr/bin/env node
// `rx-verify <file.d.rx>...`: run a declaration's JS module and check the rows that running can check (09 MO-8f's sibling:
// TY-6 checks what types can, this checks what running can). For each declared export: it exists, and a fn is a function.
// For each hook declared `uses(…)` that needs no arguments: called with nothing providing its context, it must throw
// (Solid's `useContext` finds nothing, and the library refuses), or the row claims a need the hook does not have. The
// rest (`pure`, `holds`, `fails`, `provides`, a hook that needs arguments) is listed as not verified, with why: running
// it needs arguments only the app has.
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const JS = [".js", ".mjs", ".jsx"];

/** The declaration's exports, as far as the runner needs them. */
function exportsOf(text) {
  const out = [];
  text.split("\n").forEach((l0, i) => {
    const l = l0.replace(/\/\/.*$/, "");
    let m;
    if ((m = /^\s*export\s+(?:server\s+|client\s+)?(pure\s+)?fn\s+([A-Za-z_$][\w$]*)(?:<[^(]*>)?\s*\(([^)]*)\)/.exec(l))) {
      const params = m[3].split(",").map(p => p.trim()).filter(Boolean);
      out.push({ kind: "fn", name: m[2], line: i + 1, pure: !!m[1], required: params.filter(p => !/^(ref\s+)?[\w$]+\?/.test(p)).length, uses: /\buses\(/.test(l), holds: /\bholds\b|\bfails\(/.test(l) });
    } else if ((m = /^\s*export\s+component\s+([A-Za-z_$][\w$]*)/.exec(l))) out.push({ kind: "component", name: m[1], line: i + 1, provides: /\bprovides\(/.test(l) });
    else if ((m = /^\s*export\s+error\s+([A-Za-z_$][\w$]*)/.exec(l))) out.push({ kind: "error", name: m[1], line: i + 1 });
  });
  return out;
}

async function verify(file) {
  const base = file.slice(0, -".d.rx".length);
  const js = JS.map(x => base + x).find(f => fs.existsSync(f));
  if (!js) return [{ line: 1, status: "fail", what: `no JS module beside ${path.basename(file)}` }];
  const mod = await import(pathToFileURL(path.resolve(js)).href);
  const { createRoot } = await import(pathToFileURL(require.resolve("solid-js", { paths: [path.dirname(path.resolve(js))] })).href);
  const out = [];
  for (const x of exportsOf(fs.readFileSync(file, "utf8"))) {
    const v = mod[x.name];
    if (v === undefined) { out.push({ line: x.line, status: "fail", what: `${x.name}: ${path.basename(js)} exports nothing by that name` }); continue; }
    if (x.kind === "error") { const ok = typeof v === "function" && v.prototype instanceof Error; out.push({ line: x.line, status: ok ? "ok" : "fail", what: `${x.name}: ${ok ? "an Error subclass" : "declared an error, but is not an Error subclass"}` }); continue; }
    if (typeof v !== "function") { out.push({ line: x.line, status: "fail", what: `${x.name}: declared a ${x.kind}, but is a ${typeof v}` }); continue; }
    if (x.kind === "fn" && x.uses) {
      if (x.required) { out.push({ line: x.line, status: "unverified", what: `${x.name}: uses(…) not run, it needs ${x.required} argument${x.required > 1 ? "s" : ""}` }); continue; }
      let threw = null;
      createRoot(dispose => { try { v(); } catch (e) { threw = e; } dispose(); });
      out.push(threw ? { line: x.line, status: "ok", what: `${x.name}: uses(…) holds: with no provider it throws (${String(threw.message || threw.name || threw).slice(0, 60)})` }
        : { line: x.line, status: "fail", what: `${x.name}: declared uses(…), but called with no provider it does not throw: does it read a context?` });
      continue;
    }
    const left = [x.pure && "pure", x.holds && "holds/fails", x.provides && "provides"].filter(Boolean);
    out.push({ line: x.line, status: left.length ? "unverified" : "ok", what: `${x.name}: a ${x.kind}${left.length ? `; ${left.join(", ")} not run (it needs what the app passes)` : ""}` });
  }
  return out;
}

(async () => {
  const files = process.argv.slice(2);
  if (!files.length) { process.stderr.write("usage: rx-verify <file.d.rx>...\n"); process.exit(2); }
  let fails = 0;
  for (const f of files) {
    for (const r of await verify(f)) {
      if (r.status === "fail") fails++;
      process.stdout.write(`${path.relative(process.cwd(), f)}:${r.line} ${r.status === "ok" ? "ok        " : r.status === "fail" ? "MISMATCH  " : "unverified"} ${r.what}\n`);
    }
  }
  process.exit(fails ? 1 : 0);
})();
