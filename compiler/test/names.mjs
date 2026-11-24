// 09 MO-1d, 11 CP-4: a name is its binding's. Every function of the language (compiler/src/names.rs), under every kind of
// binding: both checkers agree, the interpreter and the compiled program give what the binding gives (never what the
// language's function of that name does), a JS import is in the compiled module and in the TSX projection. And a word that
// begins an expression (`peek`, `latest`) cannot be bound; and nothing but names.rs and names.ts lists the functions.
// Needs the runtime's build and the crate's (rxc, the Node-API build).   node --experimental-strip-types compiler/test/names.mjs
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { NAMES } from "../../ref/src/names.ts";
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

// a word that begins an expression
for (const w of ["peek", "latest", "throw", "await"]) for (const [src, ok] of [[`import pure { ${w} } from "./lib.js"`], [`import pure { own as ${w} } from "./lib.js"`], [`import pure ${w} from "./dflt.js"`], [`fn ${w}(x: number): number => x`], [`fn f(${w}: number): number => 1`], [`import pure { ${w} as x } from "./lib.js"`, true]]) {
  const file = path.join(tmp, "w.rx"); writeFileSync(file, app("  <p>a</p>", src + "\n"));
  let ref = ""; try { loadModules(file, read({})); } catch (e) { ref = e.message; }
  const crate = JSON.parse(spawnSync(rxc, ["check", "--json", file], { encoding: "utf8" }).stdout).diagnostics.map(d => d.message).join(" ");
  for (const [who, said] of [["ref", ref], ["the crate", crate]]) if (said.includes("begins an expression") === !!ok) bad(src, `${who} says "${said}"`);
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
console.log(fail ? `${fail} failed` : `✓ ${names.length} names × ${Object.keys(KINDS).length} kinds of binding: each is its binding's (${tests.length} programs run compiled)`);
process.exit(fail ? 1 : 0);
