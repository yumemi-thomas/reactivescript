// MO-8l: generated declarations (src/generate.js). A program imports a package that nothing declares: a draft from its
// types lands in node_modules/.rx-types, the crate finds it (MO-8k) and the program checks; it is kept while the installed
// version stands and redone when it moves; a project declaration (rx-types/) or RX_GENERATE=0 means none is drafted; a
// package with no types gets none; a row the notation cannot say is left out, not the whole file.
//   node test/generate.js            VERBOSE=1 prints each check's detail
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
  "export declare function useCount(): () => number;",
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
check("a typed package is drafted into node_modules/.rx-types", status(first, "kit-ui") === "written" && /^\/\/@ generated kit-ui@1\.2\.0/.test(text) && /export component Badge\(props: \{ label: string \}\)/.test(text), { first, text });
const scratch = path.join(ws, "node_modules/.rx-types/scratch.d.rx");
const kept = require("../src/generate.js").parsing("export pure fn ok(n: number): number\nexport pure fn broken(x: { y: number ): number\nexport component Fine(props: { a: string })\n", scratch);
check("a row the notation cannot say is left out, the rest kept", /^export pure fn ok/m.test(kept) && /^\/\/ left out, the \.d\.rx notation cannot say it: export pure fn broken/m.test(kept) && /^export component Fine/m.test(kept), kept);
fs.rmSync(scratch);
check("a package with no types is not drafted", status(first, "untyped") === "failed" && !fs.existsSync(path.join(ws, "node_modules/.rx-types/untyped.d.rx")), first);
check("an import for effect (a stylesheet) is not a package", !first.some(r => r.spec.endsWith(".css")), first);
const after = checkRx();
check("the crate reads the generated declaration (MO-8k): the program checks", after.status === 0, after);

const again = ensureDeclarations(path.join(ws, "main.rx"));
check("kept while the installed version stands", status(again, "kit-ui") === "current", again);

const pj = path.join(ws, "node_modules/kit-ui/package.json");
fs.writeFileSync(pj, JSON.stringify({ ...JSON.parse(fs.readFileSync(pj, "utf8")), version: "1.3.0" }));
const moved = ensureDeclarations(path.join(ws, "main.rx"));
check("redone when the installed version moves", status(moved, "kit-ui") === "written" && /^\/\/@ generated kit-ui@1\.3\.0/.test(fs.readFileSync(gen, "utf8")), moved);

fs.mkdirSync(path.join(ws, "rx-types"), { recursive: true });
fs.writeFileSync(path.join(ws, "rx-types/kit-ui.d.rx"), "export component Badge(props: { label: string })\nexport pure fn useCount(): ref number\n");
const own = ensureDeclarations(path.join(ws, "main.rx"));
check("a project declaration (rx-types/) comes first: nothing is drafted", status(own, "kit-ui") === "declared" && /rx-types[\\/]kit-ui\.d\.rx$/.test(own.find(r => r.spec === "kit-ui").file), own);

// the Vite plugin (compiler/vite.mjs) drafts before it compiles, and the compiled module imports the package as written
fs.rmSync(path.join(ws, "rx-types"), { recursive: true });
fs.rmSync(path.join(ws, "node_modules/.rx-types"), { recursive: true, force: true });
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
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
