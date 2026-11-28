#!/usr/bin/env node
// The survey of solid-primitives, counted again. survey.tsv: 739 exported primitives of 98 packages, each with its class, for
// the API it has (read from the packages' TypeScript at solid-primitives b053015, 2026-11-24; not read again here):
//   A wholly .rx · B .rx and JavaScript beside · C another API · D not (or nothing to write in .rx) · E the language has it
// and, for B, what the JavaScript is for: R the result's shape · P parameters · H host objects and globals.
// Then, for B, what its published types say of its parameters (the versions bench/package.json pins).
//   node proposals/survey.mjs        after a run of bench/run.mjs (it reads bench/.out/ws/node_modules)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
const here = import.meta.dirname, ws = path.join(here, "../bench/.out/ws");
const ts = createRequire(path.join(here, "../tooling/rx-language-server/package.json"))("typescript");
const rows = readFileSync(path.join(here, "survey.tsv"), "utf8").trim().split("\n").slice(1).map(l => { const [pkg, name, cls, causes = ""] = l.split("\t"); return { pkg, name, cls, causes }; });
const count = (xs, f) => Object.entries(xs.reduce((o, x) => { const k = f(x); o[k] = (o[k] ?? 0) + 1; return o; }, {})).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ");
console.log(`${rows.length} primitives: ${count(rows, r => r.cls)}`);
const B = rows.filter(r => r.cls === "B"), has = (r, l) => r.causes.split(",").map(x => x.trim()).includes(l);
console.log(`B ${B.length}, by cause: ${count(B, r => r.causes)}; R ${B.filter(r => has(r, "R")).length}, P ${B.filter(r => has(r, "P")).length}, H ${B.filter(r => has(r, "H")).length}`);

const libs = JSON.parse(readFileSync(path.join(here, "../bench/coverage/libraries.json"), "utf8"))["@solid-primitives"].packages;
const mods = Object.values(libs).flatMap(i => i.modules), file = path.join(ws, "__survey.ts"), src = mods.map((m, i) => `import * as m${i} from "${m}";`).join("\n");
const options = { target: 99, module: 99, moduleResolution: 100, skipLibCheck: true, noEmit: true, types: [] }, host = ts.createCompilerHost(options);
const { fileExists, getSourceFile } = host; host.fileExists = f => f === file || fileExists(f); host.getSourceFile = (f, ...a) => f === file ? ts.createSourceFile(f, src, 99) : getSourceFile.call(host, f, ...a);
const program = ts.createProgram([file], options, host), ch = program.getTypeChecker(), sf = program.getSourceFile(file), types = new Map();
sf.statements.forEach((s, i) => { const m = ch.getSymbolAtLocation(s.moduleSpecifier); if (m) for (const e of ch.getExportsOfModule(m)) types.set(`${mods[i].split("/")[1]}/${e.name}`, e); else console.log(`no types: ${mods[i]}`); });
for (const b of B) {
  const e = types.get(`${b.pkg}/${b.name}`); if (!e) { console.log(`not exported: ${b.pkg}/${b.name}`); continue; }
  const sigs = ch.getTypeOfSymbolAtLocation(e, sf).getCallSignatures(); b.overloads = sigs.length > 1;
  for (const s of sigs) {
    b.generic ||= !!s.typeParameters?.length;
    for (const p of s.parameters) {
      const d = p.valueDeclaration; if (!d) continue;
      if (d.dotDotDotToken) b.rest = true; else if (d.questionToken || d.initializer) b.optional = true;
      const text = d.type?.getText() ?? "", t = ch.getTypeOfSymbolAtLocation(p, sf);
      b.either ||= /MaybeAccessor|MaybeSignal|\|\s*Accessor</.test(text) || t.isUnion() && /Accessor/.test(ch.typeToString(t));
    }
  }
}
const n = f => B.filter(f).length;
console.log(`published types of B: optional ${n(b => b.optional)}, rest ${n(b => b.rest)}, either ${n(b => b.optional || b.rest)}; type parameters ${n(b => b.generic)}; a value or an accessor ${n(b => b.either)}; overloads ${n(b => b.overloads)}`);
console.log(`  together: ${count(B, b => [(b.optional || b.rest) && "optional/rest", b.generic && "generic", b.overloads && "overloads"].filter(Boolean).join(" + ") || "none of the three")}`);
