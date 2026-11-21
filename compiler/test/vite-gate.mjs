// TY-1a/TY-1d, the production type-check gate, through the front end's own API (`rx().compile`, `buildStart`), as Solid's
// plugin calls it: two entries of one build under two tsconfigs are two checks (one passing does not stand for the
// other, and each is re-checked on its own), and a `wholeProgram` build's gate reads the crate's rows as the build does
// (E-5a), keeping TypeScript's errors. Needs the crate's Node-API build (`npm run build` in compiler/), the language
// server's WebAssembly build, and ref/node_modules (Solid).   node compiler/test/vite-gate.mjs
import { mkdirSync, rmSync, symlinkSync, writeFileSync, readdirSync, utimesSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import rx from "../vite.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const ws = path.join(here, ".out/vite-gate"); rmSync(ws, { recursive: true, force: true });
const tsconfig = include => JSON.stringify({ compilerOptions: { jsx: "preserve", jsxImportSource: "@solidjs/web", strict: true, noImplicitAny: false, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", allowImportingTsExtensions: true, noEmit: true, skipLibCheck: true, lib: ["ES2022", "DOM"], types: [] }, include });
function project(name, files) {
  const dir = path.join(ws, name);
  mkdirSync(path.join(dir, "node_modules/@reactivescript"), { recursive: true });
  for (const d of readdirSync(path.join(repo, "ref/node_modules")).filter(f => !f.startsWith("."))) symlinkSync(path.join(repo, "ref/node_modules", d), path.join(dir, "node_modules", d), "dir");
  symlinkSync(path.join(repo, "runtime"), path.join(dir, "node_modules/@reactivescript/runtime"), "dir");
  symlinkSync(path.join(repo, "tooling/rx-language-server"), path.join(dir, "node_modules/@reactivescript/language-server"), "dir");
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, type: "module" }));
  for (const [f, t] of Object.entries(files)) writeFileSync(path.join(dir, f), t);
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

rmSync(ws, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
