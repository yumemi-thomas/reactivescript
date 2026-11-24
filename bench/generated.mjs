// A generated declaration must not refuse what an import with no declaration is accepted for (spec/09 MO-8l): each
// program is read by both checkers with no declaration and with the generated one, and what is refused only with the
// second is on the list below, with its reason, or fails.
//   - one use of each kind (USES) of each kind of export (bench/generated/kinds), under each thing an import may say
//   - the good program of every task and coverage entry, its rx-types/ taken away: as written, and with `import pure`
//   node --experimental-strip-types bench/generated.mjs [--kinds] [--shard i/n]    (the programs need bench/.out/ws installed)
//   node --experimental-strip-types bench/generated.mjs --package <spec> <dir>     the kinds' uses over a package
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { here, repo, rxc, workspace, ws } from "./harness.mjs";
import { entries } from "./coverage.mjs";
import { readDisk } from "../ref/disk.ts";
import { loadModules } from "../ref/src/modules.ts";
import { checkModules } from "../ref/src/check.ts";
const require_ = createRequire(import.meta.url);
const { ensureDeclarations } = require_("../tooling/rx-language-server/src/generate.js");
const ts = require_("../tooling/rx-language-server/node_modules/typescript");
const args = process.argv.slice(2);

const crate = (entry, spa, host) => {
  const r = spawnSync(rxc, ["check", "--json", ...(spa ? ["--spa"] : []), ...(host ? ["--whole-program", "--host", entry] : []), entry], { encoding: "utf8", maxBuffer: 1 << 28 });
  try { return JSON.parse(r.stdout).diagnostics; } catch { return [{ code: "CRASH", line: 0, file: entry, message: r.stderr }]; }
};
const ref = (entry, spa, host) => { try { return checkModules(loadModules(entry, readDisk), !!spa, !!host, host ? [entry] : []).diags.map(d => ({ ...d, message: d.msg, file: d.file ?? entry })); } catch (e) { return [{ code: e.code ?? "PARSE", line: 0, file: entry, message: e.message }]; } };
const both = (...a) => [crate(...a), ref(...a)];
const sameDiags = ([c, r]) => { const loose = [...c, ...r].some(d => d.line === 0 || d.code === "PARSE"), key = ds => ds.map(d => loose ? d.code : `${d.code}@${path.basename(d.file)}:${d.line}`).join(); return key(c) === key(r); };
const bare = s => !/^[./]/.test(s);
let fails = 0, checked = 0; const listed = new Map(), said = new Set();
const fail = (what, d) => { fails++; if (!said.has(what)) { said.add(what); console.log(`✗ ${what}${d ? `\n    ${d.message.slice(0, 300)}` : ""}`); } };
const list = (reason, what) => { if (!listed.has(reason)) listed.set(reason, new Set()); listed.get(reason).add(what); };

// ---- the kinds ----
const USES = {
  view: N => `<p>{${N}(1)}</p>`, eq: N => `x = ${N}(1)\n<p>{x}</p>`, eqRead: N => `x = ${N}(n)\n<p>{x}</p>`, eqXs: N => `x = ${N}(xs)\n<p>{x}</p>`,
  list: N => `[a, b] = ${N}([1, 2])\n<p>{a}</p>`, partCalled: N => `x = ${N}(1)\n<p>{x.go(1)}</p>`, elemCalled: N => `[a, b] = ${N}(1)\n<p>{a()}</p>`, resultCalled: N => `x = ${N}(1)\n<p>{x()}</p>`,
  record: N => `x = ${N}({ a: n, b: 1 })\n<p>{x.y}</p>`, given: N => `<p>{${N}(${N})}</p>`, cond: N => `<p>{n > 0 ? ${N}(1) : ""}</p>`, rows: N => `<ul>{for r in xs { <li>{${N}(r)}</li> }}</ul>`,
  mapped: N => `<p>{xs.map((r) => ${N}(r)).join("")}</p>`, passed: N => `<p>{xs.map(${N}).join("")}</p>`, value: N => `x = ${N}\n<p>{x ? 1 : 2}</p>`, inRecord: N => `x = { k: ${N} }\n<p>{x.k ? 1 : 2}</p>`,
  member: N => `<p>{${N}.k}</p>`, method: N => `<p>{${N}.k(1)}</p>`, voidMethod: N => `<p>{${N}.reset()}</p>`, rowMethod: N => `<p>{${N}.success("a")}</p>`, methodRead: N => `x = ${N}.k(n)\n<p>{x}</p>`,
  prop: N => `<Inner f={${N}} />`, propCall: N => `<Inner f={() => ${N}(n)} />`, sourceInit: N => `source s := ${N}(1)\n<p>{s}</p>`, inFn: N => `fn f(v: any) { ${N}(v) }\n<p>{f(1)}</p>`,
  callback: N => `x = ${N}((v) => v + n)\n<p>{x}</p>`, callback2: N => `x = ${N}(xs, (a, b) => a - b)\n<p>{x}</p>`, callbackRecord: N => `x = ${N}({ onChange: (v) => v + n })\n<p>{x}</p>`,
  awaitCaught: N => `x = await ${N}(1) catch (e) => 0\n{loading fallback { <i>w</i> } { <p>{x}</p> }}`, awaited: N => `x = await ${N}(n)\n{loading fallback { <i>w</i> } { <p>{x}</p> }}`,
  attr: N => `<div title={${N}(n)} class={${N}("a", "b")}></div>`, ref: N => `<div ref={${N}}></div>`, refCall: N => `<div ref={${N}(1)}></div>`, refCalls: N => `<div ref={[${N}(1), ${N}(2)]}></div>`, top: N => `TOP v_ = ${N}(1)`, topValue: N => `TOP v_ = [${N}]`,
  handler: N => `<button onClick={() => { ${N}(1) }}>a</button>`, handlerLet: N => `<button onClick={() => { let x = ${N}(n); n := x }}>a</button>`, handlerXs: N => `<button onClick={() => { ${N}(xs) }}>a</button>`,
  handlerCallback: N => `<button onClick={() => { ${N}(() => { n := 2 }) }}>a</button>`, handlerRecord: N => `<button onClick={() => { ${N}({ onChange: () => { n := 2 } }) }}>a</button>`,
  handlerMethod: N => `<button onClick={() => { ${N}.k(1) }}>a</button>`, handlerValue: N => `<button onClick={${N}}>a</button>`, handlerPass: N => `<button onClick={() => { let f = ${N}; f(1) }}>a</button>`,
  action: N => `action go() { try { await ${N}(1) } catch (e) { n := 3 } }\n<button onClick={() => { go() }}>a</button>`, actionLet: N => `action go() { try { let x = await ${N}(n); n := x } catch (e) { n := 3 } }\n<button onClick={() => { go() }}>a</button>`,
  effect: N => `effect (n) { ${N}($0) }\n<p>{n}</p>`, effectUndo: N => `effect () { let stop = ${N}(1); return () => { stop() } }\n<p>{n}</p>`, effectCallback: N => `effect () { ${N}("k", (v) => { n := v }) }\n<p>{n}</p>`,
  server: N => `TOP server fn v_(a: number) { let r = await ${N}(a); return r }`,
  thrown: N => `action go() { try { throw ${N}("a") } catch (e) { n := 3 } }\n<button onClick={() => { go() }}>a</button>`, caught: N => `action go() { try { throw ${N}("a") } catch (e: ${N}) { n := 3 } }\n<button onClick={() => { go() }}>a</button>`,
  region: N => `{errored fallback(e: ${N}) { <p>{e.message}</p> } { <p>{n}</p> }}`,
};
const pureOf = s => s.replace(/^import /, "import pure ");
const FORMS = { plain: s => s, pure: pureOf, fails: s => `${s} fails Nope`, pureFails: s => `${pureOf(s)} fails Nope`, client: s => s.replace(/^import /, "import client "), server: s => s.replace(/^import /, "import server ") };
function program(spec, names, form) {
  const lines = ["error Nope(m: string)"], unit = [], comps = []; let i = 0;
  const said = FORMS[form], named = names.filter(n => n !== "default").map(n => `${n} as ${n}_`);
  if (named.length) lines.push(said(`import { ${named.join(", ")} } from "${spec}"`));
  if (names.includes("default") && !["client", "server"].includes(form)) lines.push(said(`import default_ from "${spec}"`));   // (07: `import client` takes names)
  lines.push("component Inner(props: { f: any }) { <p>{props.f ? 1 : 2}</p> }");
  const put = (text, u) => { lines.push(text); unit[lines.length] = u; };
  for (const n of names) for (const [use, t] of Object.entries(USES)) {
    const body = t(`${n}_`), u = { name: n, use };
    if (n === "default" && ["client", "server"].includes(form)) continue;
    if (body.startsWith("TOP ")) { put(body.slice(4).replace("v_", `v${i++}`), u); continue; }
    put(`component C${i}() {`, u); comps.push(`<C${i++} />`);
    for (const l of ["source n := 1", "source xs := [1]", ...body.split("\n")]) put(`  ${l}`, u);
    put("}", u);
  }
  lines.push("export default component App() {", `  {errored fallback(e) { <p>e</p> } { ${comps.join(" ")} }}`, "}", "");
  return { text: lines.join("\n"), unit };
}
/** Why a use that is refused only with the row is refused: what the row proves, or the gain it is. Undefined: it should not be. */
function reason(d, u, row) {
  const makes = /\binstantiates\b/.test(row) || /\bref\b|\buses\(/.test(row), ref = /[(,[{:]\s*ref\s/.test(row);
  if (/^export type /.test(row) && ["UNBOUND", "NOT_AN_ERROR_CLASS", "UNCAUGHT_ACTION_FAILURE"].includes(d.code)) return "a type: the module exports no such value";
  if (/^export component /.test(row) && ["COMPONENT_AS_VALUE", "SERVER_CAPTURE", "NOT_AN_ERROR_CLASS", "UNCAUGHT_ACTION_FAILURE", "INSTANTIATION_NOT_BOUND"].includes(d.code)) return "a component: applied in a view, not called or kept as a value";
  if (makes && d.code === "INSTANTIATION_NOT_BOUND" && /^(handler|action|effect|server|thrown|caught)/.test(u.use)) return "proven `instantiates`: the call makes what its owner keeps, and a handler, an action, an effect's block and a server fn have no owner";
  if (makes && ["NOT_AN_ERROR_CLASS", "UNCAUGHT_ACTION_FAILURE"].includes(d.code)) return "proven `instantiates`: no error class";
  if (ref && ["INSTANTIATION_NOT_BOUND", "SNAPSHOT_ARGUMENT", "IO_IN_REACTIVE"].includes(d.code)) return "a `ref` (the gain): a reader is read by the name its call is bound to";
  if (/\bdraft /.test(row) && d.code === "MUTATION_IN_PLACE") return "proven `draft`: the fn changes the value it is given in place";
}
function kinds(spec, names, dir) {
  mkdirSync(dir, { recursive: true });
  const files = Object.fromEntries(Object.keys(FORMS).map(form => { const p = program(spec, names, form), f = path.join(dir, `${form}.rx`); writeFileSync(f, p.text); return [form, { f, ...p }]; }));
  let root = dir; while (!existsSync(path.join(root, "node_modules", ...spec.split("/")))) { if (root === path.dirname(root)) throw new Error(`${spec} is not installed`); root = path.dirname(root); }
  const gen = `${path.join(root, "node_modules/.rx-types", spec)}.d.rx`; rmSync(gen, { force: true });
  const base = Object.fromEntries(Object.entries(files).map(([form, x]) => [form, both(x.f)]));
  ensureDeclarations(files.plain.f);
  const rows = readFileSync(gen, "utf8").split("\n"), rowOf = n => rows.find(l => new RegExp(`^export (pure )?(fn|const|component|type|error|context) (default as )?${n.replace("$", "\\$")}\\b(?!\\.)`).test(l)) ?? rows.find(l => l.startsWith(`export component ${n}.`)) ?? "";
  for (const [form, { f, unit }] of Object.entries(files)) {
    const now = both(f);
    for (const [k, who] of ["crate", "ref"].entries()) {
      const parse = base[form][k].find(d => d.code === "PARSE" || d.code === "CRASH" || d.line === 0); if (parse) { fail(`${spec} (${form}): ${who} reads no program`, parse); continue; }
      const had = new Set(base[form][k].map(d => unit[d.line])); checked += new Set(unit.filter(u => u && !had.has(u))).size;
      for (const d of now[k]) {
        const u = unit[d.line]; if (u && had.has(u)) continue;
        const row = u ? rowOf(u.name) : "", why = u && reason(d, u, row);
        if (why) list(why, `${spec} ${u.name} (${d.code})`); else fail(`${spec} ${form}: ${u ? `${u.name} / ${u.use}` : `line ${d.line}`}: ${d.code} in the ${who}, with ${row || "no row"}`, d);
      }
    }
    if (!sameDiags(base[form]) || !sameDiags(now)) fail(`${spec} (${form}): the checkers differ`);
  }
}
if (args.includes("--package")) {
  const [spec, dir] = args.slice(args.indexOf("--package") + 1), at = path.resolve(dir, "use"); rmSync(at, { recursive: true, force: true }); mkdirSync(at, { recursive: true });
  const f = path.join(at, "x.ts"); writeFileSync(f, `import * as N from "${spec}"; N;`);
  const p = ts.createProgram([f], { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2022, skipLibCheck: true, types: [] }), c = p.getTypeChecker();
  const sf = p.getSourceFile(ts.resolveModuleName(spec, f, p.getCompilerOptions(), ts.sys).resolvedModule.resolvedFileName); rmSync(f);
  const names = c.getExportsOfModule(c.getSymbolAtLocation(sf)).filter(e => (e.flags & ts.SymbolFlags.Alias ? c.getAliasedSymbol(e) : e).flags & ts.SymbolFlags.Value).map(e => String(e.escapedName)).filter(n => /^[A-Za-z]\w*$/.test(n));
  const step = Math.ceil(names.length / 40);
  kinds(spec, names.filter((n, i) => i % step === 0), at);
} else {
  workspace();
  const at = path.join(ws, "tasks/generated"); rmSync(at, { recursive: true, force: true }); mkdirSync(path.join(at, "node_modules"), { recursive: true });
  cpSync(path.join(here, "generated/kinds"), path.join(at, "node_modules/kinds"), { recursive: true });
  kinds("kinds", "plain proven load rejecting NotFound Cart limit client double Side Merged OnlyType sortInPlace later each on makes makesFn makesRef makesPair Ctx useCtx Provider Card Dialog toast mapped default".split(" "), at);
  rmSync(path.join(at, "node_modules/.rx-types"), { recursive: true, force: true });
}

// ---- the tasks' and the coverage entries' good programs ----
if (!args.includes("--kinds") && !args.includes("--package")) {
  const shard = args.includes("--shard") ? args[args.indexOf("--shard") + 1].split("/").map(Number) : [1, 1];
  const known = JSON.parse(readFileSync(path.join(here, "generated/known.json"), "utf8"));
  const all = [...readdirSync(path.join(here, "tasks")).filter(t => existsSync(path.join(here, "tasks", t, "task.mjs"))).map(t => [t, path.join(here, "tasks", t, "src"), path.join(here, "tasks", t, "task.mjs")]),
    ...entries().map(e => [`cover-${e.replaceAll("/", "-")}`, path.join(here, "coverage", e), path.join(here, "coverage", e, "use.mjs")])].filter((x, i) => i % shard[1] === shard[0] - 1);
  const root = path.join(ws, "tasks/generated-programs"); rmSync(root, { recursive: true, force: true });
  const rxFiles = d => readdirSync(d, { recursive: true }).filter(f => f.endsWith(".rx") && !f.endsWith(".d.rx") && !f.includes("node_modules")).map(f => path.join(d, f));
  const runs = [];
  for (const [id, from, mod] of all) {
    const task = (await import(pathToFileURL(mod).href)).default;
    if (task.prepare) continue;   // (its sources are made by a run)
    for (const form of ["written", "pure"]) {
      const dir = path.join(root, `${id}-${form}`); cpSync(from, dir, { recursive: true });
      for (const f of readdirSync(dir, { recursive: true })) if (path.basename(f) === "rx-types") rmSync(path.join(dir, f), { recursive: true, force: true });
      if (form === "pure") for (const f of rxFiles(dir)) writeFileSync(f, readFileSync(f, "utf8").replace(/^import (?!pure|client|server)([^"'\n]*from\s*["'])([^"'\n]+)/gm, (m, a, s) => bare(s) ? `import pure ${a}${s}` : m));
      for (const e of task.entries ?? [task.entry ?? "main.rx"]) if (existsSync(path.join(dir, e))) runs.push({ id, form, entry: path.join(dir, e), a: [task.spa, task.host] });
    }
  }
  // no declaration: what an earlier run drafted is set aside
  const gen = path.join(ws, "node_modules/.rx-types"); rmSync(gen, { recursive: true, force: true });
  for (const r of runs) r.base = both(r.entry, ...r.a);
  // (a host's declaration names components of the package it imports from: with none of it, the program is not read)
  for (const r of runs) r.read = !r.base.flat().some(d => d.file.endsWith(".d.rx") || d.line === 0);
  for (const r of runs) ensureDeclarations(r.entry);
  const used = new Set();
  for (const r of runs) {
    const now = both(r.entry, ...r.a); if (!sameDiags(now)) fail(`${r.id} (${r.form}): the checkers differ with the generated declarations`);
    for (const [k, who] of ["crate", "ref"].entries()) {
      const key = d => `${d.file}:${d.line}`, had = new Set(r.base[k].map(key)); checked++;
      for (const d of now[k]) {
        if (!r.read || had.has(key(d))) continue;
        const what = `${r.id}/${path.basename(d.file)}: ${d.code}: ${(existsSync(d.file) ? readFileSync(d.file, "utf8").split("\n")[d.line - 1] ?? "" : "").trim()}`.replace(/import pure /, "import ");
        const why = known[what]; if (why) { used.add(what); list(why, what); } else fail(`${what}   (${r.form}, ${who})`, d);
      }
    }
  }
  for (const k of Object.keys(known)) if (all.some(([id]) => k.startsWith(`${id}/`)) && !used.has(k)) fail(`generated/known.json lists what is not refused: ${k}`);
  rmSync(gen, { recursive: true, force: true }); rmSync(root, { recursive: true, force: true });
}
for (const [why, xs] of listed) console.log(`· ${why}: ${xs.size}${process.env.VERBOSE ? `\n    ${[...xs].join("\n    ")}` : ""}`);
console.log(`generated: ${checked} accepted uses and programs read again with the generated declaration, ${fails} newly refused with no reason`);
process.exit(fails ? 1 : 0);
