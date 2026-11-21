// TY-1a/TY-1d, the production type-check gate, through the front end's own API (`rx().compile`, `buildStart`), as Solid's
// plugin calls it: two entries of one build under two tsconfigs are two checks (one passing does not stand for the
// other, and each is re-checked on its own), and a `wholeProgram` build's gate reads the crate's rows as the build does
// (E-5a), keeping TypeScript's errors. Needs the crate's Node-API build (`npm run build` in compiler/), the language
// server's WebAssembly build, and ref/node_modules (Solid).   node compiler/test/vite-gate.mjs
import { mkdirSync, rmSync, symlinkSync, writeFileSync, readdirSync, utimesSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import rx from "../vite.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const ws = path.join(here, ".out/vite-gate"); rmSync(ws, { recursive: true, force: true });
const tsconfig = (include, extra = {}) => JSON.stringify({ compilerOptions: { jsx: "preserve", jsxImportSource: "@solidjs/web", strict: true, noImplicitAny: false, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", allowImportingTsExtensions: true, noEmit: true, skipLibCheck: true, lib: ["ES2022", "DOM"], types: [], ...extra }, include });
function project(name, files) {
  const dir = path.join(ws, name);
  mkdirSync(path.join(dir, "node_modules/@reactivescript"), { recursive: true });
  for (const d of readdirSync(path.join(repo, "ref/node_modules")).filter(f => !f.startsWith("."))) symlinkSync(path.join(repo, "ref/node_modules", d), path.join(dir, "node_modules", d), "dir");
  symlinkSync(path.join(repo, "runtime"), path.join(dir, "node_modules/@reactivescript/runtime"), "dir");
  symlinkSync(path.join(repo, "tooling/rx-language-server"), path.join(dir, "node_modules/@reactivescript/language-server"), "dir");
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, type: "module" }));
  for (const [f, t] of Object.entries(files)) { mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); writeFileSync(path.join(dir, f), t); }
  return dir;
}
const app = 'export default component App() {\n  source n := 1\n  <p>{n}</p>\n}\n';
const a = project("a", { "tsconfig.json": tsconfig(["*.rx", "*.ts"]), "main.rx": app, "ok.ts": "export const n: number = 1;\n" });
const b = project("b", { "tsconfig.json": tsconfig(["*.rx", "*.ts"]), "main.rx": app, "bad.ts": 'export const n: number = "bad";\n' });
const ctx = (file, root) => ({ id: file, moduleId: file, root, solid: { generate: "dom", hydratable: false }, addWatchFile() {} });
const compile = (fe, file, root) => { try { const r = fe.compile("", ctx(file, root)); return r && typeof r.then === "function" ? r.then(() => null, e => e) : null; } catch (e) { return e; } };

let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) pass++; else fail++; console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n  ${String(detail?.message ?? detail).slice(0, 1500)}`}`); };

process.env.RX_TYPECHECK = "1";
process.env.RX_GENERATE = "0";
{
  const fe = rx();
  const ea = await compile(fe, path.join(a, "main.rx"), ws);
  check("an entry whose project type-checks compiles", ea === null, ea);
  const eb = await compile(fe, path.join(b, "main.rx"), ws);
  check("an entry of another project in the same build is checked against its own tsconfig (TS2322), not passed on the first's result", eb && /TS2322/.test(eb.message), eb ?? "it compiled");
  const ea2 = await compile(fe, path.join(a, "main.rx"), ws);
  check("...and the first project's entry still compiles: each project's outcome is its own", ea2 === null, ea2);
  let start = null; try { fe.buildStart(); } catch (e) { start = e; }
  check("a build that starts with one project failing fails", start && /TS2322/.test(start.message), start ?? "it did not fail");
  writeFileSync(path.join(b, "bad.ts"), "export const n: number = 2;\n");
  const later = new Date(Date.now() + 5000); utimesSync(path.join(b, "bad.ts"), later, later);
  start = null; try { fe.buildStart(); } catch (e) { start = e; }
  check("once that project's file is fixed, a rebuild re-checks it alone and starts", start === null, start);
  const eb2 = await compile(fe, path.join(b, "main.rx"), ws);
  check("...and its entry compiles", eb2 === null, eb2);
}

// E-5a: the only application of Show passes a literal; per module, `peek props.value` is SNAPSHOT_KEPT, as the whole
// program, it is not (the prop never changes). The gate reads it as the build does, and keeps TypeScript's own errors.
const show = 'export component Show(props: { value: number }) {\n  <p>{peek props.value}</p>\n}\n';
const main = 'import { Show } from "./show.rx"\nexport default component App() {\n  <Show value={1} />\n}\n';
const c = project("c", { "tsconfig.json": tsconfig(["*.rx", "*.ts"]), "show.rx": show, "main.rx": main });
{
  const fe = rx({ wholeProgram: true });
  const e = await compile(fe, path.join(c, "main.rx"), ws);
  check("a whole-program build the whole-program checker accepts passes its type-check gate (no per-module SNAPSHOT_KEPT)", e === null, e);
}
{
  const fe = rx();
  const e = await compile(fe, path.join(c, "main.rx"), ws);
  check("per module (no wholeProgram), the same program is refused, as the editor refuses it", e && /SNAPSHOT_KEPT/.test(e.message), e ?? "it compiled");
}
{
  writeFileSync(path.join(c, "extra.ts"), 'export const s: string = 1;\n');
  const fe = rx({ wholeProgram: true });
  const e = await compile(fe, path.join(c, "main.rx"), ws);
  check("whole-program, TypeScript's errors still fail the gate (TS2322)", e && /TS2322/.test(e.message) && !/SNAPSHOT_KEPT/.test(e.message), e ?? "it compiled");
}

// TY-1d (RFC 25): the gate is stale when the project's files change in number, not only when one is newer — deleting a
// module another re-exports breaks the project (TS2307) though no surviving file is newer, and deleting the only file
// with an error fixes it though none is either
{
  const d = project("d", { "tsconfig.json": tsconfig(["*.rx", "*.ts"]), "main.rx": app, "ok.ts": 'export * from "./dep";\n', "dep.ts": "export const n: number = 1;\n" });
  const fe = rx();
  const e0 = await compile(fe, path.join(d, "main.rx"), ws);
  check("a project whose ok.ts re-exports ./dep compiles", e0 === null, e0);
  rmSync(path.join(d, "dep.ts"));
  let start = null; try { fe.buildStart(); } catch (e) { start = e; }
  check("once dep.ts is deleted, the next build start re-checks and fails (TS2307), though no file is newer", start && /TS2307/.test(start.message), start ?? "it did not fail");
  const fresh = await compile(rx(), path.join(d, "main.rx"), ws);
  check("...as a fresh front end does", fresh && /TS2307/.test(fresh.message), fresh ?? "it compiled");
}
{
  const g = project("g", { "tsconfig.json": tsconfig(["*.rx", "*.ts"]), "main.rx": app, "bad.ts": 'export const n: number = "bad";\n' });
  const fe = rx();
  const e0 = await compile(fe, path.join(g, "main.rx"), ws);
  check("a project with an erroneous bad.ts is refused (TS2322)", e0 && /TS2322/.test(e0.message), e0 ?? "it compiled");
  rmSync(path.join(g, "bad.ts"));
  let start = null; try { fe.buildStart(); } catch (e) { start = e; }
  check("deleting the only erroneous .ts file lets the next build start, with no file newer than the failed check", start === null, start);
}
{
  const f = project("f", { "tsconfig.json": tsconfig(["*.rx", "*.ts"]), "main.rx": app });
  const fe = rx();
  const e0 = await compile(fe, path.join(f, "main.rx"), ws);
  check("a project with no .ts module compiles", e0 === null, e0);
  writeFileSync(path.join(f, "late.ts"), 'export const s: string = 1;\n');
  const old = new Date(Date.now() - 3600_000); utimesSync(path.join(f, "late.ts"), old, old);
  let start = null; try { fe.buildStart(); } catch (e) { start = e; }
  check("a file added with an older mtime (copied, checked out) is still checked at the next build start (TS2322)", start && /TS2322/.test(start.message), start ?? "it did not fail");
}

// TY-1d (revised after review): what decides is the content of everything the check read (rx-tsc's --rx-inputs), not
// mtimes or the folder's listing: each case below changes a file the check read with no newer mtime, or one outside the
// tsconfig's folder, or one a walk of `.ts` files would not see — and the next build start fails, as a fresh front end does
const old = () => new Date(Date.now() - 3600_000), later = () => new Date(Date.now() + 5000);
const gated = [
  ["a file restored with an older mtime (git checkout, mv of a backup)", { "tsconfig.json": tsconfig(["*.rx", "*.ts"]), "ok.ts": "export const n: number = 1;\n" },
    d => { writeFileSync(path.join(d, "ok.ts"), 'export const n: number = "bad";\n'); utimesSync(path.join(d, "ok.ts"), old(), old()); }],
  ["a checkJs .js file edited", { "tsconfig.json": tsconfig(["*.rx", "*.ts", "*.js"], { allowJs: true, checkJs: true }), "util.js": "/** @type {number} */ export const n = 1;\n" },
    d => { writeFileSync(path.join(d, "util.js"), '/** @type {number} */ export const n = "bad";\n'); utimesSync(path.join(d, "util.js"), later(), later()); }],
  ["a file outside the tsconfig's folder that its include names", { "tsconfig.json": tsconfig(["*.rx", "../h-shared/*.ts"]) },
    d => { writeFileSync(path.join(d, "../h-shared/s.ts"), 'export const n: number = "bad";\n'); }, d => { mkdirSync(path.join(d, "../h-shared"), { recursive: true }); writeFileSync(path.join(d, "../h-shared/s.ts"), "export const n: number = 1;\n"); }],
  ["a file saved while the check ran, after it was read (its mtime before the check ended)", { "tsconfig.json": tsconfig(["*.rx", "*.ts"]), "ok.ts": "export const n: number = 1;\n" },
    (d, t1) => { writeFileSync(path.join(d, "ok.ts"), 'export const n: number = "bad";\n'); const mid = new Date(t1 - 50); utimesSync(path.join(d, "ok.ts"), mid, mid); }],
  ["an imported .json edited", { "tsconfig.json": tsconfig(["*.rx", "*.ts"], { resolveJsonModule: true }), "data.json": '{"n": 1}', "ok.ts": 'import d from "./data.json";\nexport const n: number = d.n;\n' },
    d => { writeFileSync(path.join(d, "data.json"), '{"n": "bad"}'); utimesSync(path.join(d, "data.json"), later(), later()); }],
  ["two files swapped with mv (the same paths, no newer mtime)", { "tsconfig.json": tsconfig(["*.rx", "*.ts"]), "a.ts": 'import { v } from "./b";\nexport const n: number = v;\n', "b.ts": "export const v = 1;\n", "sub/b.ts": 'export const v = "s";\n' },
    d => { renameSync(path.join(d, "b.ts"), path.join(d, "tmp")); renameSync(path.join(d, "sub/b.ts"), path.join(d, "b.ts")); renameSync(path.join(d, "tmp"), path.join(d, "sub/b.ts")); }, d => utimesSync(path.join(d, "sub/b.ts"), old(), old())],
];
for (const [i, [what, files, change, setup]] of gated.entries()) {
  const d = project(`h${i}`, { "main.rx": app, ...files });
  setup?.(d);
  const fe = rx();
  const e0 = await compile(fe, path.join(d, "main.rx"), ws);
  const t1 = Date.now();
  if (e0) { check(`${what}: the project compiles first`, false, e0); continue; }
  change(d, t1);
  let start = null; try { fe.buildStart(); } catch (e) { start = e; }
  const fresh = await compile(rx(), path.join(d, "main.rx"), ws);
  check(`${what}: the next build start re-checks and fails (TS2322), as a fresh front end does`, start && /TS2322/.test(start.message) && fresh && /TS2322/.test(fresh.message), start ?? "it did not fail");
}
{   // and nothing changed: the next build start does not run the check again
  const d = project("i", { "tsconfig.json": tsconfig(["*.rx", "*.ts"]), "main.rx": app, "ok.ts": "export const n: number = 1;\n" });
  const fe = rx();
  const t0 = Date.now(); await compile(fe, path.join(d, "main.rx"), ws); const first = Date.now() - t0;
  const t1 = Date.now(); let start = null; try { fe.buildStart(); } catch (e) { start = e; } const again = Date.now() - t1;
  check(`with nothing changed, the next build start passes without checking again (${again} ms, the check took ${first} ms)`, start === null && again * 3 < first, { again, first, start });
}

rmSync(ws, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
