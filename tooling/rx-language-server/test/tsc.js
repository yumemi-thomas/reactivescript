// `rx-tsc` (bin/tsc.js) on a copy of examples/shop: a clean program passes; a TypeScript type error, a parse error and a
// checker error each fail it, placed on the .rx. The README's entry (`app.mount(main(app))`) type-checks against the
// runtime's types, and a `.d.rx` in `include` is no file of the program's. Same prerequisites as test/run.js, and the
// runtime built (`npm run build` in runtime/).
//   node test/tsc.js            VERBOSE=1 prints each run's output
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repo = path.resolve(__dirname, "../../..");
const ws = path.join(__dirname, "../.test/tsc");
fs.rmSync(ws, { recursive: true, force: true });
fs.mkdirSync(ws, { recursive: true });
for (const f of fs.readdirSync(path.join(repo, "examples/shop"))) fs.copyFileSync(path.join(repo, "examples/shop", f), path.join(ws, f));
fs.writeFileSync(path.join(ws, "api.d.ts"), [
  "export declare function checkout(items: { id: number; qty: number }[], coupon: string): Promise<{ id: number }>;",
  "export declare function fetchProducts(): Promise<{ id: number; name: string; price: number }[]>;",
  "export declare function validateCoupon(code: string): Promise<number>;",
  "",
].join("\n"));
const nm = path.join(ws, "node_modules");
fs.mkdirSync(path.join(nm, "@reactivescript"), { recursive: true });
for (const f of fs.readdirSync(path.join(repo, "ref/node_modules")).filter(f => !f.startsWith("."))) fs.symlinkSync(path.join(repo, "ref/node_modules", f), path.join(nm, f), "dir");
fs.symlinkSync(path.join(repo, "runtime"), path.join(nm, "@reactivescript/runtime"), "dir");
// TY-6: a JS module with its own types and a .d.rx that declares it
fs.writeFileSync(path.join(ws, "lib.js"), "export const twice = n => n * 2;\n");
fs.writeFileSync(path.join(ws, "lib.d.ts"), "export declare function twice(n: number): number;\n");
const libDecl = "export pure fn twice(n: number): number\n";
fs.writeFileSync(path.join(ws, "lib.d.rx"), libDecl);
const tsconfig = include => fs.writeFileSync(path.join(ws, "tsconfig.json"), JSON.stringify({
  compilerOptions: { jsx: "preserve", jsxImportSource: "@solidjs/web", strict: true, noImplicitAny: false, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", allowImportingTsExtensions: true, noEmit: true, skipLibCheck: true, lib: ["ES2022", "DOM"], types: [] },
  include,
}, null, 2));

const original = Object.fromEntries(fs.readdirSync(ws).filter(f => f.endsWith(".rx") && !f.endsWith(".d.rx")).map(f => [f, fs.readFileSync(path.join(ws, f), "utf8")]));
const added = new Set();
function run(...edits) {
  for (const f of added) fs.rmSync(path.join(ws, f));
  added.clear();
  tsconfig(["*.rx", "*.ts"]);
  for (const [f, t] of Object.entries(original)) fs.writeFileSync(path.join(ws, f), t);
  for (const edit of edits) {
    if (edit.include) { tsconfig(edit.include); continue; }
    if (!(edit.file in original)) added.add(edit.file);
    fs.writeFileSync(path.join(ws, edit.file), edit.text(original[edit.file]));
  }
  const r = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js")], { cwd: ws, encoding: "utf8" });
  return { status: r.status, out: r.stdout + r.stderr };
}

let pass = 0, fail = 0;
function check(name, ok, got) {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok || process.env.VERBOSE ? `\n      ${JSON.stringify(got).slice(0, 2000)}` : ""}`);
}

const clean = run();
check("the shop passes", clean.status === 0 && clean.out.trim() === "", clean);

const type = run({ file: "cart.rx", text: t => t.replace("qtyOf(p.id)", 'qtyOf("x")') });
const typeLine = original["cart.rx"].slice(0, original["cart.rx"].indexOf("qtyOf(p.id)")).split("\n").length;
check("a type error fails, on the .rx line", type.status !== 0 && new RegExp(`cart\\.rx\\(${typeLine},\\d+\\): error TS2345`).test(type.out), type);

const parse = run({ file: "catalog.rx", text: t => t + "\nexport fn broken( {\n" });
check("a parse error fails (no projection, so TypeScript alone would pass it)", parse.status !== 0 && /catalog\.rx:\d+:\d+ - error PARSE/.test(parse.out), parse);

const write = run({ file: "main.rx", text: t => t + "\naction wipe() { products := [] }\n" });
check("a checker error fails, with its rule", write.status !== 0 && /main\.rx:\d+:\d+ - error WRITE_TO_NON_SOURCE: .*\(MO-2\)/.test(write.out), write);

fs.writeFileSync(path.join(ws, "lib.d.rx"), "export pure fn twice(n: string): number\nexport pure fn thrice(n: number): number\n");
const declBad = run();
fs.writeFileSync(path.join(ws, "lib.d.rx"), libDecl);
check("a .d.rx that disagrees with its module's types fails, on the declaration's line (TY-6)",
  declBad.status !== 0 && /lib\.d\.rx:1:1 - error DECLARATION_MISMATCH: twice: /.test(declBad.out) && /lib\.d\.rx:2:1 - error DECLARATION_MISMATCH: thrice: .*does not exist/.test(declBad.out), declBad);

fs.writeFileSync(path.join(ws, "lib.d.rx"), "//@ for typescript ^1.0.0\n" + libDecl);
const pin = run();
fs.writeFileSync(path.join(ws, "lib.d.rx"), "//@ for typescript >=1.0.0\n" + libDecl);
const pinOk = run();
fs.writeFileSync(path.join(ws, "lib.d.rx"), libDecl);
check("a .d.rx pinned to a version range the installed package is outside fails (MO-8f)", pin.status !== 0 && /lib\.d\.rx:1:1 - error DECLARATION_VERSION: written for typescript \^1\.0\.0/.test(pin.out), pin);
check("a pin the installed package satisfies passes", pinOk.status === 0, pinOk);
fs.writeFileSync(path.join(ws, "lib.d.rx"), "//@ for typescript >=1.0.0 <2.0.0\n" + libDecl);
const pinBoth = run();
fs.writeFileSync(path.join(ws, "lib.d.rx"), "//@ for typescript one point oh\n" + libDecl);
const pinBad = run();
fs.writeFileSync(path.join(ws, "lib.d.rx"), libDecl);
check("a range's comparators all hold, as npm's: >=1.0.0 <2.0.0 refuses typescript 6 (MO-8f)", pinBoth.status !== 0 && /DECLARATION_VERSION: written for typescript >=1\.0\.0 <2\.0\.0/.test(pinBoth.out), pinBoth);
check("a range npm cannot read is reported, not taken to hold", pinBad.status !== 0 && /DECLARATION_VERSION: one point oh is not a version range npm reads/.test(pinBad.out), pinBad);
const { satisfies } = require("../src/versions.js");
check("prereleases compare as npm's: 2.0.0-rc.10 satisfies >=2.0.0-rc.2, not ^2.0.0", satisfies("2.0.0-rc.10", ">=2.0.0-rc.2") === true && satisfies("2.0.0-rc.10", "^2.0.0") === false && satisfies("2.0.0-rc.10", ">=2.0.0-rc.11") === false, null);

// a package that ships only declarations: no .rx module of its own, its .d.rx named by the tsconfig, still checked (TY-6)
const only = path.join(ws, "decl-only"); fs.mkdirSync(only, { recursive: true });
for (const f of fs.readdirSync(ws)) if (/^lib\.(js|d\.ts)$/.test(f)) fs.copyFileSync(path.join(ws, f), path.join(only, f));
fs.symlinkSync(path.join(ws, "node_modules"), path.join(only, "node_modules"), "dir");
fs.writeFileSync(path.join(only, "tsconfig.json"), JSON.stringify({ compilerOptions: JSON.parse(fs.readFileSync(path.join(ws, "tsconfig.json"), "utf8")).compilerOptions, include: ["*.d.rx"] }));
fs.writeFileSync(path.join(only, "lib.d.rx"), "export pure fn twice(n: string): number\n");
const onlyBad = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js")], { cwd: only, encoding: "utf8" });
check("a .d.rx the tsconfig names, with no .rx module beside it, is checked too (TY-6)", onlyBad.status !== 0 && /lib\.d\.rx:1:1 - error DECLARATION_MISMATCH: twice: /.test(onlyBad.stdout), { status: onlyBad.status, out: onlyBad.stdout + onlyBad.stderr });

// MO-8j: strict declarations — `--rx-strict` refuses a row rx-verify has not recorded as verified, unless it says `trusted`
const strictRun = () => spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js"), "--rx-strict"], { cwd: only, encoding: "utf8" });
fs.writeFileSync(path.join(only, "lib.d.rx"), "export pure fn twice(n: number): number\n");
const unrec = strictRun();
check("strict: a row nothing verified is refused (UNVERIFIED_ROW)", unrec.status !== 0 && /lib\.d\.rx:1:1 - error UNVERIFIED_ROW: twice: nothing verified it/.test(unrec.stdout), { status: unrec.status, out: unrec.stdout + unrec.stderr });
// the strict setting in a tsconfig named with -p, rx-tsc run from elsewhere: that tsconfig is the one read
const onlyCfg = path.join(only, "tsconfig.json"), onlyCfgText = fs.readFileSync(onlyCfg, "utf8");
fs.writeFileSync(onlyCfg, JSON.stringify({ ...JSON.parse(onlyCfgText), reactivescript: { strict: true } }));
const fromParent = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js"), "-p", path.relative(ws, onlyCfg)], { cwd: ws, encoding: "utf8" });
check("strict: a tsconfig named with -p sets it, run from another folder (UNVERIFIED_ROW)", fromParent.status !== 0 && /UNVERIFIED_ROW: twice: nothing verified it/.test(fromParent.stdout), { status: fromParent.status, out: fromParent.stdout + fromParent.stderr });
const fromParentDir = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js"), "--project", path.relative(ws, only)], { cwd: ws, encoding: "utf8" });
check("...and -p naming its folder", fromParentDir.status !== 0 && /UNVERIFIED_ROW: twice/.test(fromParentDir.stdout), { status: fromParentDir.status, out: fromParentDir.stdout + fromParentDir.stderr });
// the setting in a base the tsconfig extends: TypeScript does not merge a key it does not know, rx-tsc follows it
fs.writeFileSync(path.join(ws, "tsconfig.base.json"), JSON.stringify({ reactivescript: { strict: true } }));
fs.writeFileSync(onlyCfg, JSON.stringify({ ...JSON.parse(onlyCfgText), extends: "../tsconfig.base.json" }));
const inherited = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js")], { cwd: only, encoding: "utf8" });
check("strict: set in a tsconfig this one extends (UNVERIFIED_ROW)", inherited.status !== 0 && /UNVERIFIED_ROW: twice/.test(inherited.stdout), { status: inherited.status, out: inherited.stdout + inherited.stderr });
fs.writeFileSync(onlyCfg, JSON.stringify({ ...JSON.parse(onlyCfgText), extends: ["../tsconfig.base.json"], reactivescript: { strict: false } }));
const overridden = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js")], { cwd: only, encoding: "utf8" });
check("...and the tsconfig's own setting overrides its base's", overridden.status === 0, { status: overridden.status, out: overridden.stdout + overridden.stderr });
fs.rmSync(path.join(ws, "tsconfig.base.json"));
fs.writeFileSync(onlyCfg, onlyCfgText);
fs.writeFileSync(path.join(only, "lib.d.rx"), "export pure fn twice(n: number): number trusted\n");
const trusted = strictRun();
check("strict: a row marked trusted passes", trusted.status === 0, { status: trusted.status, out: trusted.stdout + trusted.stderr });

// MO-8k: packages declared by the project, `rx-types/<spec>.d.rx`, with no re-export file beside the app
const pk = path.join(ws, "rx-types-app"); fs.mkdirSync(path.join(pk, "node_modules"), { recursive: true });
for (const d of fs.readdirSync(path.join(repo, "ref/node_modules"))) fs.symlinkSync(path.join(repo, "ref/node_modules", d), path.join(pk, "node_modules", d), "dir");
const pkgDir = (name, files) => { const d = path.join(pk, "node_modules", name); fs.mkdirSync(d, { recursive: true }); for (const [f, t] of Object.entries(files)) fs.writeFileSync(path.join(d, f), t); };
pkgDir("plain-kit", { "package.json": JSON.stringify({ name: "plain-kit", type: "module", main: "./index.js" }), "index.js": "export const twice = n => n * 2;\n" });
pkgDir("typed-kit", { "package.json": JSON.stringify({ name: "typed-kit", type: "module", main: "./index.js", types: "./index.d.ts" }), "index.js": "export const half = n => n / 2;\n", "index.d.ts": "export declare function half(n: number): number;\n" });
fs.mkdirSync(path.join(pk, "rx-types"), { recursive: true });
fs.writeFileSync(path.join(pk, "rx-types/plain-kit.d.rx"), "export pure fn twice(n: number): number\n");
fs.writeFileSync(path.join(pk, "rx-types/typed-kit.d.rx"), "export pure fn half(n: number): number\n");
fs.writeFileSync(path.join(pk, "tsconfig.json"), JSON.stringify({ compilerOptions: JSON.parse(fs.readFileSync(path.join(ws, "tsconfig.json"), "utf8")).compilerOptions, include: ["*.rx"] }));
const appRx = 'import { twice } from "plain-kit"\nimport { half } from "typed-kit"\nexport default component App() {\n  a = twice(2)\n  b = half(4)\n  <p>{a} {b}</p>\n}\n';
const pkRun = (app, decls = {}) => { fs.writeFileSync(path.join(pk, "main.rx"), app); for (const [f, t] of Object.entries(decls)) fs.writeFileSync(path.join(pk, "rx-types", f), t); const r = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js")], { cwd: pk, encoding: "utf8" }); return { status: r.status, out: r.stdout + r.stderr }; };
const pkOk = pkRun(appRx);
check("rx-types: a JS-only package and a typed one, declared by the project, pass (MO-8k)", pkOk.status === 0 && pkOk.out.trim() === "", pkOk);
const pkType = pkRun(appRx.replace("twice(2)", 'twice("2")'));
check("rx-types: a package with no types of its own is typed by its rx-types declaration (TS2345 on the .rx)", pkType.status !== 0 && /main\.rx\(4,\d+\): error TS2345/.test(pkType.out), pkType);
const pkMismatch = pkRun(appRx, { "typed-kit.d.rx": "export pure fn half(n: string): number\n" });
check("rx-types: a declaration that disagrees with the package's own types fails, on its line (TY-6)", pkMismatch.status !== 0 && /rx-types[\\/]typed-kit\.d\.rx:1:1 - error DECLARATION_MISMATCH: half: /.test(pkMismatch.out), pkMismatch);
fs.rmSync(pk, { recursive: true });   // the next checks include the whole workspace

// TY-4b (RFC 23): a `.mjs` or `.cjs` module with a `.d.rx` beside it and no types of its own: TypeScript asks for
// `lib.d.mts` (`lib.d.cts`), not `lib.d.ts`, and the declaration answers for that name too
const esm = path.join(ws, "esm"); fs.mkdirSync(esm, { recursive: true });
fs.symlinkSync(path.join(ws, "node_modules"), path.join(esm, "node_modules"), "dir");
fs.writeFileSync(path.join(esm, "tsconfig.json"), JSON.stringify({ compilerOptions: JSON.parse(fs.readFileSync(path.join(ws, "tsconfig.json"), "utf8")).compilerOptions, include: ["main.rx"] }));
fs.writeFileSync(path.join(esm, "lib.mjs"), "export const twice = n => n * 2;\n");
fs.writeFileSync(path.join(esm, "lib.d.rx"), "export pure fn twice(n: number): number\n");
fs.writeFileSync(path.join(esm, "old.cjs"), "exports.half = n => n / 2;\n");
fs.writeFileSync(path.join(esm, "old.d.rx"), "export pure fn half(n: number): number\n");
const esmApp = 'import { twice } from "./lib.mjs"\nimport { half } from "./old.cjs"\nexport default component App() {\n  a = twice(2)\n  b = half(4)\n  <p>{a} {b}</p>\n}\n';
const esmRun = app => { fs.writeFileSync(path.join(esm, "main.rx"), app); const r = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js")], { cwd: esm, encoding: "utf8" }); return { status: r.status, out: r.stdout + r.stderr }; };
const esmOk = esmRun(esmApp);
check("a .mjs and a .cjs module typed by the .d.rx beside them pass (no TS7016: lib.d.mts, old.d.cts, TY-4b)", esmOk.status === 0 && esmOk.out.trim() === "", esmOk);
const esmBad = esmRun(esmApp.replace("twice(2)", 'twice("2")').replace("half(4)", 'half("4")'));
check("...and are typed by it (TS2345 on the .rx, for each)", esmBad.status !== 0 && /main\.rx\(4,\d+\): error TS2345/.test(esmBad.out) && /main\.rx\(5,\d+\): error TS2345/.test(esmBad.out), esmBad);
// MO-8 (revised after review): `./old.cjs` is also declared by `old.cjs.d.rx` (its whole name), which wins over `old.d.rx`;
// `./view.jsx` by `view.jsx.d.rx` — the names the checker reads, in its order
fs.rmSync(path.join(esm, "old.d.rx"));
fs.writeFileSync(path.join(esm, "old.cjs.d.rx"), "export pure fn half(n: number): number\n");
fs.writeFileSync(path.join(esm, "view.jsx"), "export const third = n => n / 3;\n");
fs.writeFileSync(path.join(esm, "view.jsx.d.rx"), "export pure fn third(n: number): number\n");
const named = 'import { half } from "./old.cjs"\nimport { third } from "./view.jsx"\nexport default component App() {\n  b = half(4)\n  c = third(3)\n  <p>{b} {c}</p>\n}\n';
const namedOk = esmRun(named);
check("old.cjs.d.rx and view.jsx.d.rx declare ./old.cjs and ./view.jsx (no TS7016)", namedOk.status === 0 && namedOk.out.trim() === "", namedOk);
const namedBad = esmRun(named.replace("half(4)", 'half("4")').replace("third(3)", 'third("3")'));
check("...and type them (TS2345 on the .rx, for each)", namedBad.status !== 0 && /main\.rx\(4,\d+\): error TS2345/.test(namedBad.out) && /main\.rx\(5,\d+\): error TS2345/.test(namedBad.out), namedBad);
fs.writeFileSync(path.join(esm, "old.d.rx"), "export pure fn half(n: string): number\n");
const both = esmRun(named);
check("old.cjs.d.rx wins over old.d.rx beside it", both.status === 0 && both.out.trim() === "", both);
const { declarationOf, jsOf } = require("../src/beside.js");
check("the boundary check and rx-verify pair them alike (old.cjs.d.rx ↔ old.cjs, view.jsx.d.rx ↔ view.jsx, old.d.rx declares nothing then)",
  declarationOf(path.join(esm, "old.cjs")) === path.join(esm, "old.cjs.d.rx") && jsOf(path.join(esm, "old.cjs.d.rx")) === path.join(esm, "old.cjs") && jsOf(path.join(esm, "view.jsx.d.rx")) === path.join(esm, "view.jsx") && jsOf(path.join(esm, "old.d.rx")) === undefined && jsOf(path.join(esm, "lib.d.rx")) === path.join(esm, "lib.mjs"), null);
fs.rmSync(esm, { recursive: true });

// E-5a (RFC 35): --rx-whole-program covers every module, also two that import each other (no module is imported by
// none, so a cycle's root is picked), and keeps the loader's own diagnostics (MODULE_CYCLE)
const cyc = path.join(ws, "cycle"); fs.mkdirSync(cyc, { recursive: true });
fs.symlinkSync(path.join(ws, "node_modules"), path.join(cyc, "node_modules"), "dir");
fs.writeFileSync(path.join(cyc, "tsconfig.json"), JSON.stringify({ compilerOptions: JSON.parse(fs.readFileSync(path.join(ws, "tsconfig.json"), "utf8")).compilerOptions, include: ["*.rx"] }));
fs.writeFileSync(path.join(cyc, "a.rx"), 'import { B } from "./b.rx"\nexport component A() {\n  source n := 0\n  shown = [1].map(k => { n := k; k })\n  <p>{shown}</p> <B />\n}\n');
fs.writeFileSync(path.join(cyc, "b.rx"), 'import { A } from "./a.rx"\nexport component B() {\n  <i>b</i>\n}\n');
const cycRun = (...args) => { const r = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js"), ...args], { cwd: cyc, encoding: "utf8" }); return { status: r.status, out: r.stdout + r.stderr }; };
const cycPer = cycRun();
check("two .rx modules that import each other: per module, the write fails", cycPer.status !== 0 && /error (REACTIVE_WRITE_IN_OWNED_SCOPE|MODULE_CYCLE)/.test(cycPer.out), cycPer);
const cycWhole = cycRun("--rx-whole-program");
check("...and --rx-whole-program checks them too, from a cycle's root (no entry is imported by none)", cycWhole.status !== 0 && /a\.rx:4:3 - error REACTIVE_WRITE_IN_OWNED_SCOPE/.test(cycWhole.out) && /error MODULE_CYCLE/.test(cycWhole.out), cycWhole);
fs.rmSync(cyc, { recursive: true });

// MO-8f, MO-8j, TY-6 follow the declarations the compiler consumed, wherever they are, and only those: an entry that
// imports `./sub/lib.js`, whose real types say string → string and whose .d.rx says number → number, pinned to a package
// that is not installed, with no record; the tsconfig names only the entry
const nest = path.join(ws, "nested"); fs.mkdirSync(path.join(nest, "sub"), { recursive: true });
fs.symlinkSync(path.join(ws, "node_modules"), path.join(nest, "node_modules"), "dir");
fs.writeFileSync(path.join(nest, "tsconfig.json"), JSON.stringify({ compilerOptions: JSON.parse(fs.readFileSync(path.join(ws, "tsconfig.json"), "utf8")).compilerOptions, include: ["main.rx"] }));
fs.writeFileSync(path.join(nest, "main.rx"), 'import { f } from "./sub/lib.js"\nexport default component App() {\n  a = f(2)\n  <p>{a}</p>\n}\n');
fs.writeFileSync(path.join(nest, "sub/lib.js"), "export const f = s => s;\n");
fs.writeFileSync(path.join(nest, "sub/lib.d.ts"), "export declare function f(s: string): string;\n");
fs.writeFileSync(path.join(nest, "sub/lib.d.rx"), "//@ for not-installed-anywhere ^1.0.0\nexport pure fn f(n: number): number\n");
const nestRun = (...args) => { const r = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js"), "--noEmit", ...args], { cwd: nest, encoding: "utf8" }); return { status: r.status, out: r.stdout + r.stderr }; };
const nested = nestRun("--rx-strict");
check("an imported declaration in another folder is pinned (DECLARATION_VERSION, MO-8f)", nested.status !== 0 && /sub[\\/]lib\.d\.rx:1:1 - error DECLARATION_VERSION: not-installed-anywhere is pinned/.test(nested.out), nested);
check("...held to strict mode (UNVERIFIED_ROW, MO-8j)", /sub[\\/]lib\.d\.rx:2:1 - error UNVERIFIED_ROW: f: nothing verified it/.test(nested.out), nested);
check("...and checked against the types its import resolves to (DECLARATION_MISMATCH, TY-6)", /sub[\\/]lib\.d\.rx:2:1 - error DECLARATION_MISMATCH: f: /.test(nested.out), nested);
// a .d.rx beside the entry that nothing imports and the tsconfig does not name is not the program's
fs.writeFileSync(path.join(nest, "sub/lib.d.rx"), "export pure fn f(s: string): string trusted\n");
fs.writeFileSync(path.join(nest, "main.rx"), fs.readFileSync(path.join(nest, "main.rx"), "utf8").replace("f(2)", 'f("x")'));
fs.writeFileSync(path.join(nest, "spare.js"), "export const g = n => n;\n");
fs.writeFileSync(path.join(nest, "spare.d.rx"), "//@ for not-installed-anywhere ^1.0.0\nexport pure fn g(n: number): number\n");
const neighbour = nestRun("--rx-strict");
check("an unimported declaration beside the entry is not checked (no UNVERIFIED_ROW, no DECLARATION_VERSION)", neighbour.status === 0 && !/spare\.d\.rx/.test(neighbour.out), neighbour);
fs.writeFileSync(path.join(nest, "tsconfig.json"), JSON.stringify({ compilerOptions: JSON.parse(fs.readFileSync(path.join(ws, "tsconfig.json"), "utf8")).compilerOptions, include: ["main.rx", "spare.d.rx"] }));
const audited = nestRun("--rx-strict");
check("...until the tsconfig names it, to audit it", audited.status !== 0 && /spare\.d\.rx:1:1 - error DECLARATION_VERSION/.test(audited.out) && /spare\.d\.rx:2:1 - error UNVERIFIED_ROW/.test(audited.out), audited);
fs.rmSync(nest, { recursive: true });

// the README's entry, as written: a compiled entry's default export is `main(__rt)` (spec/11 CP-4a)
const readme = fs.readFileSync(path.join(repo, "README.md"), "utf8").match(/```js\n\/\/ src\/main\.js\n([^]*?)```/)[1].replace("./app.rx", "./main.rx");
const entry = run({ file: "entry.ts", text: () => readme });
check("the README's entry type-checks (the projection's default is the app's main)", entry.status === 0 && entry.out.trim() === "", entry);

const server = run({ file: "entry.ts", text: () => 'import { createApp } from "@reactivescript/runtime/server";\nimport main from "./main.rx";\nconst app = createApp();\napp.stream(main(app), { write() {}, end() {} });\n' });
check("so does the server's (`app.stream(main(app), sink)`)", server.status === 0 && server.out.trim() === "", server);

const uncalled = run({ file: "entry.ts", text: () => readme.replace("main(app)", "main") });
check("the default is typed: mounting `main` uncalled fails", uncalled.status !== 0 && /entry\.ts\(\d+,\d+\): error TS2345/.test(uncalled.out), uncalled);

// MO-8a: a `.d.rx` in `include` (the README's `"include": ["src"]`), with the JS module it declares
const decl = run(
  { include: ["."] },
  { file: "names.d.rx", text: () => "export pure fn shout(s: string): string\n" },
  { file: "names.ts", text: () => "export const shout = (s: string): string => s.toUpperCase();\n" },
  { file: "main.rx", text: t => t.replace('import { Row, Panel } from "./ui.rx"', 'import { Row, Panel } from "./ui.rx"\nimport { shout } from "./names"').replace('title="The shop"', 'title={shout("The shop")}') },
);
check("a .d.rx in include passes", decl.status === 0 && decl.out.trim() === "", decl);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
