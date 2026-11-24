// 09 MO-1d, 11 CP-4: a name is its binding's. Every function of the language (compiler/src/names.rs), under every kind of
// binding: both checkers agree, the interpreter and the compiled program give what the binding gives (never what the
// language's function of that name does), a JS import is in the compiled module and in the TSX projection. And a word that
// begins an expression (`peek`, `latest`) is not called where the module binds it; and nothing but names.rs and names.ts lists the functions.
// CP-4c: `fetch` and `fail` unimported, wherever a name can stand: the scenario prelude's in a conformance build, UNBOUND in
// an app; and a compiled app whose imported `fetch` makes its request.
// Needs the runtime's build and the crate's (rxc, the Node-API build).   node --experimental-strip-types compiler/test/names.mjs
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { HARNESS, NAMES } from "../../ref/src/names.ts";
import { loadModules } from "../../ref/src/modules.ts";
import { checkModules } from "../../ref/src/check.ts";
import { Runtime } from "../../ref/src/runtime.ts";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, "../..");
const { app: compile } = createRequire(import.meta.url)("../index.js");
const rxc = path.join(root, "compiler/target/release/rxc");
const tmp = mkdtempSync(path.join(tmpdir(), "rx-names-")); mkdirSync(path.join(tmp, "node_modules/@reactivescript"), { recursive: true });
symlinkSync(path.join(root, "runtime"), path.join(tmp, "node_modules/@reactivescript/runtime"));
for (const d of ["solid-js", "@solidjs", "seroval", "seroval-plugins"]) symlinkSync(path.join(root, "runtime/node_modules", d), path.join(tmp, "node_modules", d));
const write = (f, s) => { mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); writeFileSync(path.join(tmp, f), s); };
let fail = 0; const bad = (what, why) => { fail++; console.log(`✗ ${what}: ${why}`); };

const names = [...NAMES.keys()], OWN = "x => \"own\" + x";
const js = `export const own = ${OWN};\n${names.map(n => `export { own as ${n} };`).join("\n")}\n`;
write("lib.js", js); write("decl.js", js); write("dflt.js", `export default ${OWN};\n`); write("prelude.js", js);
write("decl.d.rx", names.map(n => `export pure fn ${n}(x: any): string\n`).join(""));
write("node_modules/own/package.json", `{"name":"own","type":"module","exports":"./index.js"}`); write("node_modules/own/index.js", js);
write("own.rx", names.map(n => `export fn ${n}(x: number): string => \`own\${x}\`\n`).join(""));

const app = (body, head = "") => `${head}export default component App() {\n${body}\n}\n`;
const imp = h => n => app(`  <p>{${n}(5)}</p>`, h(n) + "\n");
/** Each kind's program. `js`: its import, which the compiled module and the projection must have. `codes`: what both checkers say. */
const KINDS = {
  "import pure": { p: imp(n => `import pure { ${n} } from "./lib.js"`), js: "./lib.js" },
  "import pure { own as n }": { p: imp(n => `import pure { own as ${n} } from "./lib.js"`), js: "./lib.js" },
  "import pure { n as own }": { p: n => app(`  <p>{own(5)}</p>`, `import pure { ${n} as own } from "./lib.js"\n`), js: "./lib.js" },
  "a declared import": { p: imp(n => `import { ${n} } from "./decl.js"`), js: "./decl.js" },
  "a default import": { p: imp(n => `import pure ${n} from "./dflt.js"`), js: "./dflt.js" },
  "a package's": { p: imp(n => `import pure { ${n} } from "own"`), js: "own" },
  "a file named prelude": { p: imp(n => `import pure { ${n} } from "./prelude"`), js: "./prelude", run: false },
  "a plain import, called in a view": { p: imp(n => `import { ${n} } from "./lib.js"`), codes: ["IO_IN_REACTIVE"] },
  "a plain import, called in a handler": { p: n => app(`  <p onClick={() => { ${n}(() => 5) }}>own5</p>`, `import { ${n} } from "./lib.js"\n`), js: "./lib.js" },
  "a plain import, called in a closure's closure": { p: n => app(`  <p onClick={() => { [1].forEach((x) => { ${n}(x) }) }}>own5</p>`, `import { ${n} } from "./lib.js"\n`), js: "./lib.js" },
  "a server import": { p: n => app(`  <p onClick={() => { go() }}>own5</p>`, `import server { ${n} } from "./lib.js"\nserver fn go() { ${n}(5) }\n`), js: "./lib.js" },
  "an .rx import": { p: imp(n => `import { ${n} } from "./own.rx"`) },
  "an .rx import { n as own }": { p: n => app(`  <p>{own(5)}</p>`, `import { ${n} as own } from "./own.rx"\n`) },
  "a fn": { p: n => app(`  <p>{${n}(5)}</p>`, `fn ${n}(x: number): string => \`own\${x}\`\n`) },
  "a fn of a component": { p: n => app(`  fn ${n}(x: number): string => \`own\${x}\`\n  <p>{${n}(5)}</p>`) },
  "an equation": { p: n => app(`  ${n} = (x) => \`own\${x}\`\n  <p>{${n}(5)}</p>`) },
  "a source": { p: n => app(`  source ${n} := "own5"\n  <p>{${n}}</p>`) },
  "a fn's parameter": { p: n => app(`  <p>{f(x => \`own\${x}\`)}</p>`, `fn f(${n}: (x: number) => string): string => ${n}(5)\n`) },
  "a closure's parameter": { p: n => app(`  f = (${n}) => ${n}(5)\n  <p>{f(x => \`own\${x}\`)}</p>`) },
  "a component's props": { p: n => app(`  <C f={x => \`own\${x}\`} />`, `component C(${n}: { f: (x: number) => string }) {\n  <p>{${n}.f(5)}</p>\n}\n`) },
  "a prop, destructured": { p: n => app(`  <C ${n}={x => \`own\${x}\`} />`, `component C(props: { ${n}: (x: number) => string }) {\n  { ${n} } = props\n  <p>{${n}(5)}</p>\n}\n`) },
  "a loop's variable": { p: n => app(`  <p>{for ${n} in ["own5"] { <i>{${n}}</i> }}</p>`) },
  "a local": { p: n => app(`  <p onClick={() => { let ${n} = (x) => x; ${n}(5) }}>own5</p>`) },
  "a local of a server fn": { p: n => app(`  a = await go()\n  errored fallback(e) { <p>e</p> } { <p>{a}</p> }`, `server fn go(): Promise<string> { let ${n} = (x: number) => \`own\${x}\`; return ${n}(5) }\n`), run: false },
  "an action": { p: n => app(`  action ${n}(x: number) { }\n  <p onClick={() => { ${n}(5) }}>own5</p>`) },
  "an action's parameter": { p: n => app(`  action f(${n}: (x: number) => void) { ${n}(5) }\n  <p onClick={() => { f((x) => { }) }}>own5</p>`) },
  "a caught error": { p: n => app(`  <p onClick={() => { try { go() } catch (${n}) { b := ${n}.message } }}>own5</p>`, `import { own as go } from "./lib.js"\nsource b := ""\n`) },
  "a row keyed, rebuilt": { p: n => app(`  xs = ${n}([1], (x) => ({ t: "own5" }))\n  <p>{for x in xs { <i>{x.t}</i> }}</p>`, `fn ${n}(a: number[], f: (x: number) => { t: string }): { t: string }[] => a.length > 0 ? KEPT : []\nKEPT: { t: string }[] = [{ t: "own5" }]\n`) },
};
const read = over => p => over[p] ?? (existsSync(p) && p.startsWith(tmp) ? (() => { try { return readFileSync(p, "utf8"); } catch { return undefined; } })() : undefined);
const tests = [];
for (const [kind, k] of Object.entries(KINDS)) for (const n of names) {
  const what = `${n}, ${kind}`, id = `t${tests.length}`, file = path.join(tmp, `${id}.rx`), src = k.p(n);
  writeFileSync(file, src);
  let set, ref;
  try { set = loadModules(file, read({})); ref = checkModules(set).diags.map(d => d.code); } catch (e) { ref = [`throws ${e.message}`]; }
  const r = spawnSync(rxc, ["check", "--json", file], { encoding: "utf8" }); let crate;
  try { crate = JSON.parse(r.stdout).diagnostics.map(d => d.code); } catch { crate = [`${r.stdout}${r.stderr}`]; }
  if (String(ref) !== String(crate)) bad(what, `ref says ${ref}, the crate ${crate}`);
  if (String(ref) !== String(k.codes ?? [])) bad(what, `expected [${k.codes ?? ""}], got [${ref}]`);
  if (k.codes || ref.length) continue;
  const out = JSON.parse(compile(file, "ssr")); if (!out.modules) { bad(what, JSON.stringify(out).slice(0, 300)); continue; }
  const code = out.modules[file].code;
  const helper = n.startsWith("on") || n === "until" ? new RegExp(`__rt\\.${n}\\(`) : new RegExp(`__B\\.${n}\\b`);
  if (helper.test(code)) bad(what, `compiled to the language's ${n}`);
  if (k.js && !new RegExp(`import (\\w+ from )?.*"${k.js.replace(/\./g, "\\.")}"`).test(code)) bad(what, "the import was dropped");
  const tsx = JSON.parse(execFileSync(rxc, ["project", file], { encoding: "utf8" })).files?.find(f => f.rx === file)?.code ?? "";
  if (k.js && !tsx.includes(`from "${k.js}"`)) bad(what, "the import is not in the projection");
  if (new RegExp(`import \\{[^}]*\\b${n}\\b[^}]*\\} from "[^"]*__prelude`).test(tsx.split("\n")[0]) && /import|package|^a fn$/.test(kind)) bad(what, "the projection takes the prelude's");
  if (!k.js) {                                                         // the interpreter has no JS
    try { const rt = new Runtime(loadModules(file, read({}))); const f = JSON.stringify(rt.step([])); if (k.run !== false && !f.includes("own5")) bad(what, `interpreted: ${f.slice(0, 200)}`); } catch (e) { if (!/not in the scenario prelude/.test(e.message)) bad(what, `interpreted: ${e.message}`); }
  }
  if (k.run === false) continue;
  for (const [f, m] of Object.entries(out.modules)) writeFileSync(f === file ? path.join(tmp, `${id}.mjs`) : f.replace(/\.rx$/, ".rx.mjs"), m.code.replace(/(from ")([^"]*)\.rx(\?[^"]*)?"/g, (_, a, b) => `${a}${b.startsWith("/") ? b : path.join(tmp, b)}.rx.mjs"`));
  tests.push([what, id]);
}
// the compiled programs, each rendered by the server build
write("run.mjs", `import { createApp } from "@reactivescript/runtime";
for (const [what, id] of ${JSON.stringify(tests)}) {
  let html = "";
  try { const main = (await import("./" + id + ".mjs")).default; const app = createApp(); await new Promise(end => app.stream(main(app), { write: s => { html += s; }, end })); } catch (e) { html = String(e); }
  if (!html.replace(/<!--.*?-->/g, "").includes("own5")) console.log(what + "\\t" + html.slice(0, 200).replace(/\\n/g, " "));
}\n`);
const ran = spawnSync(process.execPath, ["run.mjs"], { cwd: tmp, encoding: "utf8" });
for (const l of (ran.stdout + (ran.status ? ran.stderr : "")).split("\n").filter(Boolean)) bad(l.split("\t")[0], `compiled: ${l.split("\t")[1]}`);

// CP-4c: the harness's names, bound by nothing. Each place: refused in an app by both checkers and by every command that takes a
// file, with the same words; in a conformance build (the mark on the load) neither checker says UNBOUND, and both say the same.
const PLACES = {
  "a view": p => app(`  <p>{${p}("/x")}</p>`), "an equation": p => app(`  a = ${p}("/x")\n  <p>{a}</p>`),
  "an awaited equation": p => app(`  a = await ${p}("/x")\n  errored fallback(e) { <p>e</p> } { <p>{a}</p> }`),
  "a question": p => app(`  source a = await ${p}("/x")\n  errored fallback(e) { <p>e</p> } { <p>{a}</p> }`),
  "a handler": p => app(`  <p onClick={() => { ${p}("/x") }}>x</p>`), "a handler's closure": p => app(`  <p onClick={() => { [1].forEach((x) => { ${p}("/x") }) }}>x</p>`),
  "an effect": p => app(`  source a := 1\n  effect (a) { ${p}("/x") }\n  <p>{a}</p>`),
  "an action": p => app(`  action go() { await ${p}("/x") catch (e) => null }\n  <p onClick={() => { go() }}>x</p>`),
  "a server fn": p => app(`  <p onClick={() => { go() }}>x</p>`, `server fn go() { ${p}("/x") }\n`),
  "a fn": p => app(`  <p>{f()}</p>`, `fn f() { ${p}("/x") }\n`), "a fn nothing calls": p => app(`  <p>x</p>`, `fn f() { ${p}("/x") }\n`), "an exported fn": p => `export fn f() { ${p}("/x") }\n`,
  "a closure": p => app(`  f = () => ${p}("/x")\n  <p>{f()}</p>`), "a value": p => app(`  f = ${p}\n  <p>{f("/x")}</p>`), "a value in a record": p => app(`  f = { go: ${p} }\n  <p>{f.go("/x")}</p>`),
  "an argument": p => app(`  <p>{map(["/x"], ${p})}</p>`), "a prop": p => app(`  <C f={${p}} />`, `component C(props: { f: any }) {\n  <p>{props.f("/x")}</p>\n}\n`),
  "a branch another binding is in": p => app(`  <p>{map([1], (${p}) => ${p})}{${p}("/x")}</p>`),
};
const run1 = (...a) => spawnSync(rxc, a, { encoding: "utf8" });
for (const [place, program] of Object.entries(PLACES)) for (const n of HARNESS.keys()) {
  const what = `${n} unimported, ${place}`, file = path.join(tmp, "harness.rx"), src = program(n); writeFileSync(file, src);
  const ref = checkModules(loadModules(file, read({}))).diags, want = `${n} is not declared here${HARNESS.get(n)}`;
  const says = { ref: ref.map(d => `${d.code} ${d.msg}`), check: JSON.parse(run1("check", "--json", file).stdout).diagnostics.map(d => `${d.code} ${d.message}`), app: (JSON.parse(compile(file, "dom")).diagnostics ?? []).map(d => `${d.code} ${d.msg}`), lib: (JSON.parse(run1("app", file, "--lib").stdout).diagnostics ?? []).map(d => `${d.code} ${d.msg}`),
    editor: (JSON.parse(spawnSync(rxc, ["serve"], { input: JSON.stringify({ id: 1, method: "analyze", params: { file, overlays: {} } }) + "\n", encoding: "utf8" }).stdout).result.diagnostics).map(d => `${d.code} ${d.message}`) };
  for (const [who, got] of Object.entries(says)) { if (!got.includes(`UNBOUND ${want}`)) bad(what, `${who}: ${JSON.stringify(got)}`); if (String(got) !== String(says.ref)) bad(what, `${who} says ${got}, ref ${says.ref}`); }
  if (run1("compile", file, "--out", path.join(tmp, "out")).status === 0) bad(what, "rxc compile compiled it");
  const held = checkModules(loadModules(file, read({}), true)).diags.map(d => d.code);
  const [c] = JSON.parse(spawnSync(rxc, ["conform"], { input: JSON.stringify([{ id: 0, entry: file, files: { [file]: src }, conformance: true }]), encoding: "utf8" }).stdout);
  if (String(held) !== String(c.diags.map(d => d.code)) || held.includes("UNBOUND")) bad(what, `a conformance build: ref says ${held}, the crate ${c.diags.map(d => d.code)}`);
  if (!held.length) { const [l] = JSON.parse(spawnSync(rxc, ["lower"], { input: JSON.stringify([{ id: 0, entry: file, files: { [file]: src }, conformance: true }]), encoding: "utf8", maxBuffer: 1 << 26 }).stdout); if (!JSON.stringify(l).includes(`__B.${n}`)) bad(what, "a conformance build lost the prelude's"); }
}
// the prelude of an app has neither, beside what is the language's
{ const file = path.join(tmp, "nopre/main.rx"); write("nopre/main.rx", app(`  <p>{len([1])}</p><b onClick={() => { fetch("/x") }}>x</b>`, `import { len } from "./prelude"\nimport { fetch } from "./prelude"\n`).replace("import { len }", "import pure { len }"));
  const m = JSON.parse(compile(file, "ssr")); if (!/import \{ fetch as \w+\$fetch \} from "\.\/prelude"/.test(m.modules?.[file]?.code ?? "") || /__B\.fetch/.test(m.modules[file].code)) bad("import { fetch } from ./prelude, in an app", JSON.stringify(m).slice(0, 400)); }
// an .rx module of the program, and a package's
for (const n of HARNESS.keys()) { write("mod.rx", `export fn go() { ${n}("/x") }\n`); const file = path.join(tmp, "usemod.rx"); write("usemod.rx", app(`  <p>{go()}</p>`, `import { go } from "./mod.rx"\n`));
  const ref = checkModules(loadModules(file, read({}))).diags.map(d => d.code), crate = JSON.parse(run1("check", "--json", file).stdout).diagnostics.map(d => d.code);
  if (String(ref) !== String(crate) || !ref.includes("UNBOUND")) bad(`${n} in a module of the program`, `${ref} / ${crate}`); }
// a compiled app's imported `fetch`, and its own `fail`
{ const file = path.join(tmp, "net.rx");
  write("net.js", `export const fetch = async u => (await globalThis.fetch(globalThis.__at + u)).text();\n`);
  write("net.rx", app(`  a = await fetch("/hello")\n  errored fallback(e) { <p>{e.message}</p> } { loading fallback { <p>…</p> } { <p>{a} {fail("b")}</p> } }`, `import pure { fetch } from "./net.js"\nfn fail(x: string): string => \`own\${x}\`\n`));
  const m = JSON.parse(compile(file, "ssr")); if (!m.modules) bad("an app's imported fetch", JSON.stringify(m)); else {
    write("net.mjs", m.modules[file].code);
    write("netrun.mjs", `import { createServer } from "node:http"; import { createApp } from "@reactivescript/runtime";
const asked = []; const s = createServer((q, r) => { asked.push(q.url); r.end("world"); }); await new Promise(r => s.listen(0, r)); globalThis.__at = "http://localhost:" + s.address().port;
let html = ""; const main = (await import("./net.mjs")).default; const a = createApp(); await new Promise(end => a.stream(main(a), { write: x => { html += x; }, end })); s.close();
console.log(JSON.stringify({ asked, html })); process.exit(0);\n`);
    const r = spawnSync(process.execPath, ["netrun.mjs"], { cwd: tmp, encoding: "utf8", timeout: 30000 }); let o; try { o = JSON.parse(r.stdout.trim().split("\n").pop()); } catch { o = { asked: [], html: r.stdout + r.stderr }; }
    if (o.asked[0] !== "/hello" || !/world/.test(o.html) || !/ownb/.test(o.html)) bad("an app's imported fetch", JSON.stringify(o).slice(0, 400)); } }

// a word that begins an expression
for (const w of ["peek", "latest", "throw", "await"]) for (const [src, ok] of [[`import pure { ${w} } from "./lib.js"`], [`import pure { own as ${w} } from "./lib.js"`], [`import pure ${w} from "./dflt.js"`], [`fn ${w}(x: number): number => x`], [`fn f(${w}: number): number => ${w}(1)`], [`import pure { ${w} as x } from "./lib.js"`, true], [`fn ${w}(x: number): number => x`, true, "<p>a</p>"], [`fn f(${w}: number): number => 1`, true, "<p>a</p>"], [`export fn ${w}(x: number): number => x`, true, "<p>a</p>"]]) {
  const file = path.join(tmp, "w.rx"); writeFileSync(file, app(`  ${src.includes(" as x ") ? "<p>a</p>" : ok ? "<p>a</p>" : `<p>{${w}(1)}</p>`}`, src + "\n"));
  let ref = ""; try { loadModules(file, read({})); } catch (e) { ref = e.message; }
  const crate = JSON.parse(spawnSync(rxc, ["check", "--json", file], { encoding: "utf8" }).stdout).diagnostics.map(d => d.message).join(" ");
  for (const [who, said] of [["ref", ref], ["the crate", crate]]) if (said.includes("is the form") === !!ok) bad(src, `${who} says "${said}"`);
}

// one list: a comparison of a name with one of the functions', outside names.rs and names.ts, is a place that does not ask by scope
for (const dir of ["compiler/src", "ref/src", "ref/compile", "ref/oracle", "ref/types"]) for (const f of readdirSync(path.join(root, dir))) {
  if (/^names\./.test(f) || !/\.(rs|ts)$/.test(f)) continue;
  readFileSync(path.join(root, dir, f), "utf8").split("\n").forEach((l, i) => {
    const s = l.replace(/const DRAFT_CALLBACKS.*|const ARRAY_.*/, "").replace(/\/\/.*/, "");
    if (/"len",\s*"str"|(name|\bn|fname)(\.as_str\(\))? ?={2,3} ?"(len|str|filter|sum|fail|fetch|every|indexOf|log|until)"/.test(s)) bad(`${dir}/${f}:${i + 1}`, l.trim().slice(0, 120));
  });
}
rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `${fail} failed` : `✓ ${names.length} names × ${Object.keys(KINDS).length} kinds of binding: each is its binding's (${tests.length} programs run compiled); ${HARNESS.size} of the harness × ${Object.keys(PLACES).length} places, in an app and in a conformance build`);
process.exit(fail ? 1 : 0);
