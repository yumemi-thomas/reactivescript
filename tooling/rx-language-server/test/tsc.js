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
