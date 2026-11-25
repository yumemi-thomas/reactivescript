// MO-8l: generated declarations (src/generate.js). A program imports a package that nothing declares: a draft from its
// types lands in node_modules/.rx-types, the crate finds it (MO-8k) and the program checks; it is kept while the installed
// version stands and redone when it moves; a project declaration (rx-types/) or RX_GENERATE=0 means none is drafted; a
// package with no types gets none; a row the notation cannot say is left out, not the whole file.
//   node test/generate.js            VERBOSE=1 prints each check's detail
// (MO-8v) The modules these tests draft are stand-ins for their types: a body of one line that does nothing. What the code
// proves is test/words.js's; here the draft is the types' alone, as `rx-declare --no-infer` writes it.
process.env.RX_DECLARE_INFER = "0";
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repo = path.resolve(__dirname, "../../..");
const ws = path.join(__dirname, "../.test/generate");
fs.rmSync(ws, { recursive: true, force: true });
fs.mkdirSync(path.join(ws, "node_modules"), { recursive: true });
for (const d of fs.readdirSync(path.join(repo, "ref/node_modules"))) fs.symlinkSync(path.join(repo, "ref/node_modules", d), path.join(ws, "node_modules", d), "dir");
const pkg = (name, version, files) => {
  const d = path.join(ws, "node_modules", name); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, "package.json"), JSON.stringify({ name, version, type: "module", main: "./index.js", ...(files["index.d.ts"] ? { types: "./index.d.ts" } : {}) }));
  for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(d, f), t);
};
const kitTypes = [
  "import type { JSX } from \"@solidjs/web\";",
  "export declare function Badge(props: { label: string }): JSX.Element;",
  "export declare function useCount(): import(\"solid-js\").Accessor<number>;",
  "export declare function formatDate(d: number): string;",
  "export declare function weird(x: { [K in \"a\" | \"b\"]: number }): void;",
  "",
].join("\n");
pkg("kit-ui", "1.2.0", { "index.js": "export const Badge = p => p.label; export const useCount = () => () => 1; export const formatDate = d => String(d); export const weird = () => {};\n", "index.d.ts": kitTypes });
pkg("untyped", "0.1.0", { "index.js": "export const go = () => 1;\n" });
fs.writeFileSync(path.join(ws, "main.rx"), [
  "import { Badge, useCount } from \"kit-ui\"",
  "import { go } from \"untyped\"",
  "import \"./styles.css\"",
  "export default component App() {",
  "  n = useCount()",
  "  <Badge label=\"new\" /> <p>{n}</p>",
  "}",
  "",
].join("\n"));
fs.writeFileSync(path.join(ws, "styles.css"), "p { color: red }\n");

let pass = 0, fail = 0;
function check(name, ok, got) {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok || process.env.VERBOSE ? `\n      ${JSON.stringify(got).slice(0, 2000)}` : ""}`);
}
const { ensureDeclarations } = require("../src/generate.js");
const rxc = path.join(repo, "compiler/target/release/rxc");
const checkRx = () => { const r = spawnSync(rxc, ["check", path.join(ws, "main.rx")], { encoding: "utf8" }); return { status: r.status, out: r.stdout + r.stderr }; };
const gen = path.join(ws, "node_modules/.rx-types/kit-ui.d.rx");
const status = (rs, spec) => rs.find(r => r.spec === spec)?.status;

const before = checkRx();
check("without a declaration, the component is unknown, and the message names rx-types and rx-declare", before.status !== 0 && /UNKNOWN_COMPONENT.*rx-types\/kit-ui\.d\.rx.*npx rx-declare kit-ui/.test(before.out), before);

process.env.RX_GENERATE = "0";
const off = ensureDeclarations(path.join(ws, "main.rx"));
delete process.env.RX_GENERATE;
check("RX_GENERATE=0 drafts nothing", off.length === 0 && !fs.existsSync(gen), off);

const first = ensureDeclarations(path.join(ws, "main.rx"));
const text = fs.existsSync(gen) ? fs.readFileSync(gen, "utf8") : "";
check("a typed package is drafted into node_modules/.rx-types", status(first, "kit-ui") === "written" && /^\/\/@ generated kit-ui@1\.2\.0 \(MO-8l, draft \d+, types [0-9a-f]+\)/.test(text) && /export component Badge\(props: \{ label: string \}\)/.test(text), { first, text });
const scratch = path.join(ws, "node_modules/.rx-types/scratch.d.rx");
const kept = require("../src/generate.js").parsing("export pure fn ok(n: number): number\nexport pure fn broken(x: { y: number ): number\nexport component Fine(props: { a: string })\n", scratch);
check("a row the notation cannot say is left out, the rest kept", /^export pure fn ok/m.test(kept) && /^\/\/ left out, the \.d\.rx notation cannot say it: export pure fn broken/m.test(kept) && /^export component Fine/m.test(kept), kept);
fs.rmSync(scratch, { force: true });
check("a package with no types is not drafted", status(first, "untyped") === "failed" && !fs.existsSync(path.join(ws, "node_modules/.rx-types/untyped.d.rx")), first);
check("an import for effect (a stylesheet) is not a package", !first.some(r => r.spec.endsWith(".css")), first);
const after = checkRx();
check("the crate reads the generated declaration (MO-8k): the program checks", after.status === 0, after);

const again = ensureDeclarations(path.join(ws, "main.rx"));
check("kept while the installed version stands", status(again, "kit-ui") === "current", again);

// the package's types change at the same version (a linked workspace package): redrafted, with the new export
const typesFile = path.join(ws, "node_modules/kit-ui/index.d.ts"), typesBefore = fs.readFileSync(typesFile, "utf8");
fs.writeFileSync(typesFile, typesBefore + "export declare function later(): number;\n");
const sameVersion = ensureDeclarations(path.join(ws, "main.rx"));
check("redone when the package's types change at the same version", status(sameVersion, "kit-ui") === "written" && /^export fn later\(\): number/m.test(fs.readFileSync(gen, "utf8")), { sameVersion, draft: fs.readFileSync(gen, "utf8") });
fs.writeFileSync(typesFile, typesBefore);
ensureDeclarations(path.join(ws, "main.rx"));
check("no trial or half-written file is left beside the draft", !fs.readdirSync(path.dirname(gen)).some(f => /\.trial\.d\.rx$|\.tmp$/.test(f)), fs.readdirSync(path.dirname(gen)));

// the types the entry file re-exports change, the entry itself and the version do not: redrafted too
fs.mkdirSync(path.join(ws, "node_modules/kit-ui/parts"), { recursive: true });
const partFile = path.join(ws, "node_modules/kit-ui/parts/more.d.ts");
fs.writeFileSync(partFile, "export declare function part(): number;\n");
fs.writeFileSync(typesFile, typesBefore + "export * from \"./parts/more\";\n");
ensureDeclarations(path.join(ws, "main.rx"));
fs.writeFileSync(partFile, "export declare function part(): number;\nexport declare function partLater(): number;\n");
const reexported = ensureDeclarations(path.join(ws, "main.rx"));
check("redone when a file the package's types re-export changes", status(reexported, "kit-ui") === "written" && /^export fn partLater\(\): number/m.test(fs.readFileSync(gen, "utf8")), { reexported, draft: fs.readFileSync(gen, "utf8") });
check("and kept while they stand", status(ensureDeclarations(path.join(ws, "main.rx")), "kit-ui") === "current", null);
fs.writeFileSync(typesFile, typesBefore); fs.rmSync(path.join(ws, "node_modules/kit-ui/parts"), { recursive: true });
ensureDeclarations(path.join(ws, "main.rx"));

// a draft is written under node_modules/.rx-types and nowhere else: an import whose path climbs out of its package
// would put one beside a source file (read as that module's declaration, MO-8a) or outside the project
fs.mkdirSync(path.join(ws, "src"), { recursive: true });
fs.writeFileSync(path.join(ws, "src/local.d.ts"), "export declare function local(): number;\n");
fs.writeFileSync(path.join(ws, "src/local.js"), "export const local = () => 1;\n");
fs.writeFileSync(path.join(ws, "climb.rx"), "import { local } from \"kit-ui/../../src/local\"\nimport { up } from \"kit-ui/../../../up\"\nexport default component App() {\n  <p>hi</p>\n}\n");
fs.writeFileSync(path.join(ws, "../up.d.ts"), "export declare function up(): number;\n");
const climbed = ensureDeclarations(path.join(ws, "climb.rx"));
check("an import that climbs out of its package gets no draft, and nothing is written outside .rx-types",
  climbed.filter(r => /\.\./.test(r.spec)).every(r => r.status === "failed" && /not a package path/.test(r.reason)) && climbed.filter(r => /\.\./.test(r.spec)).length === 2
  && !fs.existsSync(path.join(ws, "src/local.d.rx")) && !fs.existsSync(path.join(ws, "node_modules/src/local.d.rx")) && !fs.existsSync(path.join(ws, "../up.d.rx")) && !fs.existsSync(path.join(ws, "up.d.rx")), climbed);
fs.rmSync(path.join(ws, "climb.rx")); fs.rmSync(path.join(ws, "src"), { recursive: true }); fs.rmSync(path.join(ws, "../up.d.ts"));

const pj = path.join(ws, "node_modules/kit-ui/package.json");
fs.writeFileSync(pj, JSON.stringify({ ...JSON.parse(fs.readFileSync(pj, "utf8")), version: "1.3.0" }));
const moved = ensureDeclarations(path.join(ws, "main.rx"));
check("redone when the installed version moves", status(moved, "kit-ui") === "written" && /^\/\/@ generated kit-ui@1\.3\.0/.test(fs.readFileSync(gen, "utf8")), moved);

// a draft written under an earlier rule (it guessed `pure`), at the installed version: redrafted once, then kept
fs.writeFileSync(gen, "//@ generated kit-ui@1.3.0 (MO-8l): drafted from kit-ui's TypeScript types\nexport component Badge(props: { label: string })\nexport pure fn useCount(): ref number\n");
const stale = ensureDeclarations(path.join(ws, "main.rx"));
const redrafted = fs.readFileSync(gen, "utf8");
check("a draft from an earlier drafting rule is redone, though the version stands", status(stale, "kit-ui") === "written" && /\(MO-8l, draft \d+, types [0-9a-f]+\)/.test(redrafted) && /^export fn useCount\(\): ref number/m.test(redrafted) && !/^export pure fn/m.test(redrafted), { stale, redrafted });
const reused = ensureDeclarations(path.join(ws, "main.rx"));
check("...and the redrafted file is kept on the next run", status(reused, "kit-ui") === "current", reused);

// an outdated draft that cannot be redone (the package's types are gone) is removed, not left to be read
const typesAt = path.join(ws, "node_modules/kit-ui/index.d.ts"), typesKept = fs.readFileSync(typesAt, "utf8");
const pjKit = path.join(ws, "node_modules/kit-ui/package.json"), pjKept = fs.readFileSync(pjKit, "utf8");
fs.writeFileSync(gen, "//@ generated kit-ui@1.3.0 (MO-8l): drafted from kit-ui's TypeScript types\nexport component Badge(props: { label: string })\nexport pure fn useCount(): ref number\n");
fs.rmSync(typesAt); fs.writeFileSync(pjKit, JSON.stringify({ ...JSON.parse(pjKept), types: undefined }));
const gone = ensureDeclarations(path.join(ws, "main.rx"));
const afterGone = checkRx();
check("an outdated draft that cannot be redone is removed: the import is undeclared again, not read with its old `pure`", status(gone, "kit-ui") === "failed" && gone.find(r => r.spec === "kit-ui").removed === true && !fs.existsSync(gen) && afterGone.status !== 0 && /UNKNOWN_COMPONENT/.test(afterGone.out), { gone, afterGone });
fs.writeFileSync(typesAt, typesKept); fs.writeFileSync(pjKit, pjKept);
const current = ensureDeclarations(path.join(ws, "main.rx"));
fs.rmSync(typesAt);
const keptCurrent = ensureDeclarations(path.join(ws, "main.rx"));
check("...as is a current one whose package's types are then gone: what it was drafted from changed", status(current, "kit-ui") === "written" && status(keptCurrent, "kit-ui") === "failed" && keptCurrent.find(r => r.spec === "kit-ui").removed === true && !fs.existsSync(gen), { current, keptCurrent });
fs.writeFileSync(typesAt, typesKept);

fs.mkdirSync(path.join(ws, "rx-types"), { recursive: true });
fs.writeFileSync(path.join(ws, "rx-types/kit-ui.d.rx"), "export component Badge(props: { label: string })\nexport pure fn useCount(): ref number\n");
const own = ensureDeclarations(path.join(ws, "main.rx"));
check("a project declaration (rx-types/) comes first: nothing is drafted", status(own, "kit-ui") === "declared" && /rx-types[\\/]kit-ui\.d\.rx$/.test(own.find(r => r.spec === "kit-ui").file), own);

// the Vite plugin (compiler/vite.mjs) drafts before it compiles, and the compiled module imports the package as written
fs.rmSync(path.join(ws, "rx-types"), { recursive: true });
fs.rmSync(path.join(ws, "node_modules/.rx-types"), { recursive: true, force: true });
// MO-8l: one specifier, two installed copies in a workspace — each sibling's own — gets a draft for each, as each
// importer resolves it; deduplicating by the import's text drafted one copy and left the other sibling undeclared
{
  const wsp = path.join(ws, "workspace"); fs.mkdirSync(wsp, { recursive: true });
  for (const [side, version, extra] of [["left", "1.0.0", "export declare function one(): number;"], ["right", "2.0.0", "export declare function two(): string;"]]) {
    const d = path.join(wsp, side, "node_modules", "shared-kit"); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "package.json"), JSON.stringify({ name: "shared-kit", version, type: "module", main: "./index.js", types: "./index.d.ts" }));
    fs.writeFileSync(path.join(d, "index.js"), "export const one = () => 1; export const two = () => \"2\";\n");
    fs.writeFileSync(path.join(d, "index.d.ts"), extra + "\n");
    fs.writeFileSync(path.join(wsp, side, "page.rx"), `import { ${side === "left" ? "one" : "two"} } from "shared-kit"\nexport component Page() {\n  <p>{${side === "left" ? "one" : "two"}()}</p>\n}\n`);
  }
  fs.symlinkSync(path.join(ws, "node_modules"), path.join(wsp, "node_modules"), "dir");
  fs.writeFileSync(path.join(wsp, "main.rx"), 'import { Page as L } from "./left/page.rx"\nimport { Page as R } from "./right/page.rx"\nexport default component App() {\n  <L /> <R />\n}\n');
  const both = ensureDeclarations(path.join(wsp, "main.rx"));
  const left = path.join(wsp, "left/node_modules/.rx-types/shared-kit.d.rx"), right = path.join(wsp, "right/node_modules/.rx-types/shared-kit.d.rx");
  const lt = fs.existsSync(left) ? fs.readFileSync(left, "utf8") : "", rt = fs.existsSync(right) ? fs.readFileSync(right, "utf8") : "";
  check("a specifier two siblings resolve to two installed copies is drafted for each (MO-8l)", both.filter(r => r.spec === "shared-kit" && r.status === "written").length === 2 && /shared-kit@1\.0\.0/.test(lt) && /fn one\(/.test(lt) && /shared-kit@2\.0\.0/.test(rt) && /fn two\(/.test(rt), { both, lt, rt });
  const again = ensureDeclarations(path.join(wsp, "main.rx"));
  check("...and each is current on the next run", again.filter(r => r.spec === "shared-kit" && r.status === "current").length === 2, again);
}

(async () => {
  const { default: rx } = await import(path.join(repo, "compiler/vite.mjs"));
  const plugin = rx();
  const log = console.info; const said = []; console.info = m => said.push(m);
  let code = "", error;
  try { code = plugin.compile("", { id: path.join(ws, "main.rx"), moduleId: path.join(ws, "main.rx"), solid: { generate: "dom", hydratable: true }, addWatchFile() {} }).code; } catch (e) { error = String(e); }
  console.info = log;
  check("the Vite plugin drafts the declaration, then compiles against it", !error && fs.existsSync(gen) && said.some(m => /drafted a declaration for kit-ui/.test(m)) && /from "kit-ui"/.test(code), { error, said, code: code.slice(0, 400) });
  const quiet = rx({ generate: false });
  fs.rmSync(path.join(ws, "node_modules/.rx-types"), { recursive: true, force: true });
  let refused; try { quiet.compile("", { id: path.join(ws, "main.rx"), moduleId: path.join(ws, "main.rx") + "?x=1", solid: { generate: "dom", hydratable: true }, addWatchFile() {} }); } catch (e) { refused = String(e); }
  check("rx({ generate: false }) drafts nothing, and the import is unknown", !fs.existsSync(gen) && /UNKNOWN_COMPONENT/.test(refused ?? ""), refused);
  // TY-1d: a type check that was asked for and cannot run fails the build; RX_TYPECHECK=0 builds without it
  const compileWith = (flag, env = {}) => {
    const saved = { RX_TYPECHECK: process.env.RX_TYPECHECK, NODE_ENV: process.env.NODE_ENV, RX_GENERATE: process.env.RX_GENERATE };
    Object.assign(process.env, { RX_TYPECHECK: flag, RX_GENERATE: "0" }, env);
    const warned = []; const w = console.warn; console.warn = m => warned.push(m);
    try { rx().compile("", { id: path.join(ws, "main.rx"), moduleId: path.join(ws, "main.rx"), solid: { generate: "dom", hydratable: true }, addWatchFile() {} }); return { ok: true, warned }; }
    catch (e) { return { ok: false, error: String(e.message ?? e), warned }; }
    finally { console.warn = w; for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  };
  fs.writeFileSync(path.join(ws, "main.rx"), "export default component App() {\n  <p>hi</p>\n}\n");
  const noTsconfig = compileWith("1");
  check("RX_TYPECHECK=1 with no tsconfig.json fails the build (TY-1d)", !noTsconfig.ok && /types not checked: no tsconfig\.json/.test(noTsconfig.error), noTsconfig);
  const prodNoTsconfig = compileWith(undefined, { NODE_ENV: "production" });
  check("a production build with no tsconfig.json only warns", prodNoTsconfig.ok && prodNoTsconfig.warned.some(m => /types not checked: no tsconfig\.json/.test(m)), prodNoTsconfig);
  fs.writeFileSync(path.join(ws, "tsconfig.json"), "{}\n");
  const noChecker = compileWith(undefined, { NODE_ENV: "production" });
  check("a production build of a TypeScript project with no language server fails (TY-1d)", !noChecker.ok && /no @reactivescript\/language-server/.test(noChecker.error), noChecker);
  const skipped = compileWith("0", { NODE_ENV: "production" });
  check("RX_TYPECHECK=0 builds without the check", skipped.ok, skipped);
  fs.rmSync(path.join(ws, "tsconfig.json"));

  // TY-1d: the check is once per build, not once per process: a rebuild (`vite build --watch`) that compiles an entry
  // whose program changed since the last check is checked again
  {
    const tp = path.join(ws, "typed"); fs.mkdirSync(path.join(tp, "node_modules/@reactivescript"), { recursive: true });
    for (const d of fs.readdirSync(path.join(repo, "ref/node_modules")).filter(d => !d.startsWith("."))) fs.symlinkSync(path.join(repo, "ref/node_modules", d), path.join(tp, "node_modules", d), "dir");
    fs.symlinkSync(path.join(repo, "runtime"), path.join(tp, "node_modules/@reactivescript/runtime"), "dir");
    fs.symlinkSync(path.join(repo, "tooling/rx-language-server"), path.join(tp, "node_modules/@reactivescript/language-server"), "dir");
    fs.writeFileSync(path.join(tp, "package.json"), "{}\n");
    fs.writeFileSync(path.join(tp, "tsconfig.json"), JSON.stringify({ compilerOptions: { jsx: "preserve", jsxImportSource: "@solidjs/web", strict: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", noEmit: true, skipLibCheck: true, lib: ["ES2022", "DOM"], types: [] }, include: ["*.rx"] }));
    const good = "export default component App() {\n  source n: number := 1\n  <button onClick={() => { n := n + 1 }}>{n}</button>\n}\n";
    const bad = good.replace("n := n + 1", "n := \"one\"");
    const saved = { NODE_ENV: process.env.NODE_ENV, RX_GENERATE: process.env.RX_GENERATE }; process.env.NODE_ENV = "production"; process.env.RX_GENERATE = "0";
    const plugin = rx(); let runs = 0;
    const once = target => { try { plugin.compile("", { id: path.join(tp, "main.rx"), moduleId: path.join(tp, "main.rx"), root: tp, solid: { generate: target, hydratable: true }, addWatchFile() {} }); return "ok"; } catch (e) { return /type errors \(rx-tsc\)[^]*main\.rx/.test(String(e.message)) ? "type error" : String(e.message); } };
    const write = text => { fs.writeFileSync(path.join(tp, "main.rx"), text); const t = new Date(Date.now() + 2000 * ++runs); fs.utimesSync(path.join(tp, "main.rx"), t, t); };   // a later save, whatever the clock's grain
    try {
      write(good); const first = [once("dom"), once("ssr")];
      write(bad); const rebuilt = [once("dom"), once("ssr")];
      write(good); const fixed = [once("dom"), once("ssr")];
      check("a rebuild in the same process is type-checked again: an edit that breaks a type fails it, the fix builds (TY-1d)",
        first.join() === "ok,ok" && rebuilt.join() === "type error,type error" && fixed.join() === "ok,ok", { first, rebuilt, fixed });
    } finally { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }

  // a build is made from its declarations too: one plugin (a dev server, a watch build) re-checks the program when a
  // .d.rx it read changes, and when one it looked for appears, as it does for a module; and watches them
  {
    const dp = path.join(ws, "declared"); fs.mkdirSync(dp, { recursive: true });
    fs.writeFileSync(path.join(dp, "lib.js"), "export const twice = n => n * 2;\n");
    fs.writeFileSync(path.join(dp, "main.rx"), "import { twice } from \"./lib.js\"\nexport default component App() {\n  source n := 1\n  t = twice(n)\n  <p>{t}</p>\n}\n");
    const saved = process.env.RX_GENERATE; process.env.RX_GENERATE = "0";
    const plugin = rx(); const watched = new Set(); let saves = 0;
    const once = () => { try { plugin.compile("", { id: path.join(dp, "main.rx"), moduleId: path.join(dp, "main.rx"), root: dp, solid: { generate: "dom", hydratable: true }, addWatchFile(f) { watched.add(path.basename(f)); } }); return "ok"; } catch (e) { return /IO_IN_REACTIVE/.test(String(e.message)) ? "IO_IN_REACTIVE" : String(e.message); } };
    const declare = text => { const f = path.join(dp, "lib.d.rx"); fs.writeFileSync(f, text); const t = new Date(Date.now() + 2000 * ++saves); fs.utimesSync(f, t, t); };
    try {
      const undeclared = once();
      declare("export pure fn twice(n: number): number\n"); const declared = once();
      declare("export fn twice(n: number): number\n"); const io = once();
      declare("export pure fn twice(n: number): number\n"); const pure = once();
      check("a declaration that appears, or changes, re-checks the program in the same plugin, and is watched",
        undeclared === "IO_IN_REACTIVE" && declared === "ok" && io === "IO_IN_REACTIVE" && pure === "ok" && watched.has("lib.d.rx"), { undeclared, declared, io, pure, watched: [...watched] });
    } finally { if (saved === undefined) delete process.env.RX_GENERATE; else process.env.RX_GENERATE = saved; }
  }

  // E-5a: rx({ wholeProgram: true }) checks a build as the whole program; a module a JS host imports with ?rx-lib is
  // applied from outside
  const wp = path.join(ws, "whole"); fs.mkdirSync(wp, { recursive: true });
  fs.writeFileSync(path.join(wp, "show.rx"), "export component Show(props: { value: number }) {\n  <b>{peek props.value}</b>\n}\n");
  fs.writeFileSync(path.join(wp, "main.rx"), "import { Show } from \"./show.rx\"\nexport default component App() {\n  source n := 1\n  <Show value={n} />\n}\n");
  const buildWith = (opts) => { const saved = process.env.RX_GENERATE; process.env.RX_GENERATE = "0"; try { rx(opts).compile("", { id: path.join(wp, "main.rx"), moduleId: path.join(wp, "main.rx"), root: wp, solid: { generate: "dom", hydratable: true }, addWatchFile() {} }); return { ok: true }; } catch (e) { return { ok: false, error: String(e.message ?? e) }; } finally { if (saved === undefined) delete process.env.RX_GENERATE; else process.env.RX_GENERATE = saved; } };
  const perModule = buildWith({});
  check("by default a build checks per module: a peek of a prop is refused (E-5a)", !perModule.ok && /SNAPSHOT_KEPT/.test(perModule.error), perModule);
  const whole = buildWith({ wholeProgram: true });
  check("rx({ wholeProgram: true }): nothing writes n, so the peek is accepted", whole.ok, whole);
  fs.writeFileSync(path.join(wp, "host.tsx"), "import { Show } from \"./show.rx?rx-lib\";\nexport const page = () => <Show value={Math.random()} />;\n");
  const hosted = buildWith({ wholeProgram: true });
  check("...unless a JS file imports show.rx with ?rx-lib: JS applies Show, so the peek is refused", !hosted.ok && /SNAPSHOT_KEPT/.test(hosted.error), hosted);
  // a host is whatever the plugin would compile as a library: other parameters beside rx-lib, a dynamic import in
  // backticks, a .cts module, a single-file component's script
  fs.rmSync(path.join(wp, "host.tsx"));
  const spelled = Object.entries({
    "host.ts": "import { Show } from \"./show.rx?v=1&rx-lib\";\n", "host.mjs": "import { Show } from './show.rx?rx-lib&v=1';\n",
    "host.js": "const m = await import(`./show.rx?rx-lib`);\n", "host.cts": "const { Show } = require(\"./show.rx?rx-lib\");\n",
    "host.vue": "<script setup>\nimport { Show } from \"./show.rx?rx-lib\";\n</script>\n",
  }).map(([f, text]) => { fs.writeFileSync(path.join(wp, f), text); const r = buildWith({ wholeProgram: true }); fs.rmSync(path.join(wp, f)); return [f, !r.ok && /SNAPSHOT_KEPT/.test(r.error)]; });
  check("...however the import is spelled (more parameters, backticks, require, a .cts or .vue file)", spelled.every(([, refused]) => refused), spelled);
  fs.writeFileSync(path.join(wp, "nohost.ts"), "// not a library import: ./show.rx?raw, ./show.rxx?rx-lib\nimport text from \"./show.rx?raw\";\n");
  const notHost = buildWith({ wholeProgram: true }); fs.rmSync(path.join(wp, "nohost.ts"));
  check("...and an import of the file that is not ?rx-lib is not a host", notHost.ok, notHost);
  // a host found through the project's aliases, as Vite resolves the import, not the import's text joined to its folder
  fs.mkdirSync(path.join(wp, "pages"), { recursive: true });
  fs.writeFileSync(path.join(wp, "pages/host.tsx"), "import { Show } from \"@/show.rx?rx-lib\";\nexport const page = () => <Show value={Math.random()} />;\n");
  const warned = []; const w0 = console.warn; console.warn = m => warned.push(m);
  const unaliased = buildWith({ wholeProgram: true });
  console.warn = w0;
  check("an aliased ?rx-lib import the plugin cannot resolve is not counted, and the build says so", unaliased.ok && warned.some(m => /@\/show\.rx\?rx-lib, which names no \.rx file here: pass the project's aliases as rx\(\{ alias \}\)/.test(m)), { unaliased, warned });
  const aliased = buildWith({ wholeProgram: true, alias: { "@": wp } });
  check("with the alias Vite is given (rx({ alias })), @/show.rx is show.rx: the peek is refused (E-5a)", !aliased.ok && /SNAPSHOT_KEPT/.test(aliased.error), aliased);
  const arrayAlias = buildWith({ wholeProgram: true, alias: [{ find: /^@\//, replacement: wp + "/" }] });
  check("...and with Vite's { find, replacement } form", !arrayAlias.ok && /SNAPSHOT_KEPT/.test(arrayAlias.error), arrayAlias);
  // with Solid's plugin handing a resolver (context.resolve), Vite resolves the import: no alias option needed
  const viaVite = async (opts, resolve) => {
    const saved = process.env.RX_GENERATE; process.env.RX_GENERATE = "0";
    try {
      const r = rx(opts).compile("", { id: path.join(wp, "main.rx"), moduleId: path.join(wp, "main.rx"), root: wp, solid: { generate: "dom", hydratable: true }, addWatchFile() {}, resolve });
      const isAsync = typeof r?.then === "function";
      await r; return { ok: true, isAsync };
    } catch (e) { return { ok: false, error: String(e.message ?? e) }; }
    finally { if (saved === undefined) delete process.env.RX_GENERATE; else process.env.RX_GENERATE = saved; }
  };
  const asked = [];
  const vite = async (spec, importer) => { asked.push([spec, importer]); return spec === "@/show.rx" ? path.join(wp, "show.rx") + "?v=1" : null; };
  const resolvedByVite = await viaVite({ wholeProgram: true }, vite);
  check("context.resolve (Vite's resolver) names @/show.rx: the peek is refused, with no alias option", !resolvedByVite.ok && /SNAPSHOT_KEPT/.test(resolvedByVite.error) && asked.some(([s, i]) => s === "@/show.rx" && i === path.join(wp, "pages/host.tsx")), { resolvedByVite, asked });
  const nothing = await viaVite({ wholeProgram: true, alias: { "@": wp } }, async () => null);
  check("...an import Vite does not resolve falls back to the alias option", !nothing.ok && /SNAPSHOT_KEPT/.test(nothing.error), nothing);
  // two Vite configurations in one process that resolve the alias differently each get their own answer
  fs.writeFileSync(path.join(wp, "other.rx"), "export component Other() {\n  <i>o</i>\n}\n");
  const elsewhere = await viaVite({ wholeProgram: true }, async s => s === "@/show.rx" ? path.join(wp, "other.rx") : null);
  const here = await viaVite({ wholeProgram: true }, async s => s === "@/show.rx" ? path.join(wp, "show.rx") : null);
  check("another configuration resolving @ elsewhere does not decide this one's hosts (a resolution cache per plugin)", elsewhere.ok && !here.ok && /SNAPSHOT_KEPT/.test(here.error), { elsewhere, here });
  fs.rmSync(path.join(wp, "other.rx"));
  const perModuleAsync = await viaVite({}, vite);
  check("...and without wholeProgram the resolver is not asked, and the compile stays synchronous", !perModuleAsync.isAsync && asked.length === 1, { perModuleAsync, asked });
  // a project opened through a symlink: the hosts are named as the checker names its modules, through the link
  const link = path.join(ws, "whole-link"); fs.rmSync(link, { force: true }); fs.symlinkSync(wp, link, "dir");
  fs.writeFileSync(path.join(wp, "pages/host.tsx"), "import { Show } from \"../show.rx?rx-lib\";\nexport const page = () => <Show value={Math.random()} />;\n");
  const throughLink = (() => { const saved = process.env.RX_GENERATE; process.env.RX_GENERATE = "0";
    try { rx({ wholeProgram: true }).compile("", { id: path.join(link, "main.rx"), moduleId: path.join(link, "main.rx"), root: link, solid: { generate: "dom", hydratable: true }, addWatchFile() {} }); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e.message ?? e) }; } finally { if (saved === undefined) delete process.env.RX_GENERATE; else process.env.RX_GENERATE = saved; } })();
  check("a project opened through a symlink: the host is still the module the checker sees, and the peek is refused", !throughLink.ok && /SNAPSHOT_KEPT/.test(throughLink.error), throughLink);
  fs.rmSync(link);
  // links below the root: a linked folder holding the host, show.rx itself a link, and Vite naming the real paths
  const compileAt = (dir, resolve) => { const saved = process.env.RX_GENERATE; process.env.RX_GENERATE = "0";
    try { const r = rx({ wholeProgram: true }).compile("", { id: path.join(dir, "main.rx"), moduleId: path.join(dir, "main.rx"), root: dir, solid: { generate: "dom", hydratable: true }, addWatchFile() {}, ...(resolve ? { resolve } : {}) });
      return Promise.resolve(r).then(() => ({ ok: true }), e => ({ ok: false, error: String(e.message ?? e) })); }
    catch (e) { return Promise.resolve({ ok: false, error: String(e.message ?? e) }); } finally { if (saved === undefined) delete process.env.RX_GENERATE; else process.env.RX_GENERATE = saved; } };
  const outside = path.join(ws, "outside-pages"); fs.rmSync(outside, { recursive: true, force: true }); fs.mkdirSync(outside);
  fs.renameSync(path.join(wp, "pages/host.tsx"), path.join(outside, "host.tsx")); fs.rmSync(path.join(wp, "pages"), { recursive: true });
  fs.symlinkSync(outside, path.join(wp, "pages"), "dir");
  fs.writeFileSync(path.join(outside, "host.tsx"), "import { Show } from \"../whole/show.rx?rx-lib\";\nexport const page = () => <Show value={Math.random()} />;\n");
  const linkedDir = await compileAt(wp);
  check("a host in a linked folder below the root is found: the peek is refused", !linkedDir.ok && /SNAPSHOT_KEPT/.test(linkedDir.error), linkedDir);
  fs.writeFileSync(path.join(outside, "host.tsx"), "import { Show } from \"@/show.rx?rx-lib\";\nexport const page = () => <Show value={Math.random()} />;\n");
  const realByVite = await compileAt(wp, async s => s === "@/show.rx" ? fs.realpathSync(path.join(wp, "show.rx")) : null);
  check("...and with Vite naming the real paths (context.resolve)", !realByVite.ok && /SNAPSHOT_KEPT/.test(realByVite.error), realByVite);
  const showAt = path.join(ws, "show-real.rx"); fs.renameSync(path.join(wp, "show.rx"), showAt); fs.symlinkSync(showAt, path.join(wp, "show.rx"));
  const fileLink = await compileAt(wp, async s => s === "@/show.rx" ? showAt : null);
  check("show.rx a file link, the host naming its target: the same module, refused", !fileLink.ok && /SNAPSHOT_KEPT/.test(fileLink.error), fileLink);
  fs.rmSync(path.join(wp, "show.rx")); fs.renameSync(showAt, path.join(wp, "show.rx"));
  fs.rmSync(path.join(wp, "pages")); fs.mkdirSync(path.join(wp, "pages")); fs.renameSync(path.join(outside, "host.tsx"), path.join(wp, "pages/host.tsx")); fs.rmSync(outside, { recursive: true });
  fs.writeFileSync(path.join(wp, "pages/host.tsx"), "import { Show } from \"@/show.rx?rx-lib\";\nexport const page = () => <Show value={Math.random()} />;\n");
  fs.writeFileSync(path.join(wp, "tsconfig.json"), JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./*"] } } }));
  const tsPaths = buildWith({ wholeProgram: true });
  check("...and through tsconfig.json's paths", !tsPaths.ok && /SNAPSHOT_KEPT/.test(tsPaths.error), tsPaths);
  fs.rmSync(path.join(wp, "tsconfig.json"));
  // one plugin, as a dev server keeps it: a host import that comes or goes makes the cached check stale
  fs.rmSync(path.join(wp, "pages"), { recursive: true });
  const kept = (() => { const saved = process.env.RX_GENERATE; process.env.RX_GENERATE = "0"; const plugin = rx({ wholeProgram: true });
    const run = () => { try { plugin.compile("", { id: path.join(wp, "main.rx"), moduleId: path.join(wp, "main.rx"), root: wp, solid: { generate: "dom", hydratable: true }, addWatchFile() {} }); return "ok"; } catch (e) { return /SNAPSHOT_KEPT/.test(String(e.message)) ? "SNAPSHOT_KEPT" : String(e.message); } };
    const first = run(); fs.writeFileSync(path.join(wp, "late.tsx"), "import { Show } from \"./show.rx?rx-lib\";\nexport const p = () => <Show value={1} />;\n");
    const second = run(); fs.rmSync(path.join(wp, "late.tsx")); const third = run();
    if (saved === undefined) delete process.env.RX_GENERATE; else process.env.RX_GENERATE = saved; return { first, second, third }; })();
  check("the same plugin re-checks when a JS file starts, then stops, importing a module with ?rx-lib", kept.first === "ok" && kept.second === "SNAPSHOT_KEPT" && kept.third === "ok", kept);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
