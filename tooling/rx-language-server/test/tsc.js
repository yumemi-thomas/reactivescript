// `rx-tsc` (bin/tsc.js) on a copy of examples/shop: a clean program passes; a TypeScript type error, a parse error and a
// checker error each fail it, placed on the .rx. The README's entry (`app.mount(main(app))`) type-checks against the
// runtime's types, and a `.d.rx` in `include` is no file of the program's. Same prerequisites as test/run.js, and the
// runtime built (`npm run build` in runtime/).
//   node test/tsc.js            VERBOSE=1 prints each run's output
// (MO-8v) The modules these tests draft are stand-ins for their types: a body of one line that does nothing. What the code
// proves is test/words.js's; here the draft is the types' alone, as `rx-declare --no-infer` writes it.
process.env.RX_DECLARE_INFER = "0";
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

// RG-4c: the view a context holds, shown without an argument its type asks for, is reported where it is shown, at its tag
// (the error sat on a name of the projection that no place of the .rx stood for, and was not said); a view the component
// may not have been given is provided as it is; one of another type is not
const carried = body => `context item: (o: { v: string }) => View\ncomponent Part() {\n  <li>${body}</li>\n}\n`;
const lacks = run({ file: "carried.rx", text: () => carried("<use.item />") + "export component Root(p: { item: (o: { v: string }) => View; children?: View }) {\n  provide item = p.item\n  <ul>{p.children}<Part /></ul>\n}\n" });
check("<use.item /> without the argument its context's type asks for fails, at its tag", lacks.status !== 0 && /carried\.rx\(3,8\): error TS2322/.test(lacks.out), lacks);
const optional = run({ file: "carried.rx", text: () => carried('<use.item v="a" />') + "export component Root(p: { item?: (o: { v: string }) => View; children?: View }) {\n  provide item = p.item\n  <ul>{p.children}<Part /></ul>\n}\n" });
check("a view the component may not have been given is provided to a context as it is", optional.status === 0 && optional.out.trim() === "", optional);
const other = run({ file: "carried.rx", text: () => carried('<use.item v="a" />') + "export component Root(p: { item?: (o: { v: number }) => View; children?: View }) {\n  provide item = p.item\n  <ul>{p.children}<Part /></ul>\n}\n" });
check("...and one of another type is refused, on its line", other.status !== 0 && /carried\.rx\(6,\d+\): error TS2345/.test(other.out), other);

// W-6 (2026-11-26): a source of a type parameter written with a value of it is refused — a `T` may be a function, and a
// write applies a function — with what to write; `() => v` stores it for every `T`. So for a function at a path.
const keep = w => `component Keep<T>(props: { v: T; go: boolean }) {\n  source value: T | undefined := undefined\n  effect (props.go) { if ($0) { ${w} } }\n  <b>{value == undefined ? "none" : "set"}</b>\n}\nexport component Kept() { <Keep v={(x: number) => 7} go={true} /> }\n`;
const bareT = run({ file: "keep.rx", text: () => keep("value := props.v") });
check("a bare T written to a source is TS2345, with what to write", bareT.status !== 0 && /keep\.rx\(3,\d+\): error TS2345: .*W-6: .*`x := \(\) => v`/.test(bareT.out), bareT);
const fnT = run({ file: "keep.rx", text: () => keep("value := () => props.v") });
check("...and `() => v` passes", fnT.status === 0 && fnT.out.trim() === "", fnT);
const atPath = run({ file: "keep.rx", text: () => "export component P() {\n  source s := { f: (x: number) => x }\n  <p onClick={() => { s.f := (x: number) => x * 2 }}>{s.f(3)}</p>\n}\n" });
check("a function written to a path is TS2345, with what to write", atPath.status !== 0 && /keep\.rx\(3,\d+\): error TS2345: .*W-6: /.test(atPath.out), atPath);

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

// MO-8o, TY-6f: a field of the record after a props' type is held against the library's type for that prop
const over = path.join(ws, "over"); fs.mkdirSync(over, { recursive: true });
fs.symlinkSync(path.join(ws, "node_modules"), path.join(over, "node_modules"), "dir");
fs.writeFileSync(path.join(over, "tsconfig.json"), JSON.stringify({ compilerOptions: JSON.parse(fs.readFileSync(path.join(ws, "tsconfig.json"), "utf8")).compilerOptions, include: ["*.d.rx"] }));
fs.writeFileSync(path.join(over, "picker.js"), "export const Picker = () => null, Chooser = () => null, Open = () => null;\n");
fs.writeFileSync(path.join(over, "picker.d.ts"), [
  "export type PickerProps<O> = { value?: O; options: O[]; onPick?: (v: O) => void; label?: string };",
  "export type OneOrMany<O> = { multiple?: false; onChange?: (v: O | null) => void } | { multiple: true; onChange?: (v: O[]) => void; max?: number };",
  "export type OpenProps = { id: string; [name: string]: unknown };",
  "export declare function Picker<Option>(props: PickerProps<Option>): any;",
  "export declare function Chooser<Option, T extends string = \"div\">(props: T extends \"div\" ? OneOrMany<Option> : never): any;",
  "export declare function Open(props: OpenProps): any;",
  "",
].join("\n"));
const overRows = {
  Picker: 'export component Picker<Option>(props: import("./picker.js").PickerProps<Option> & { onPick?: handler (v: Option) => void })',
  Chooser: 'export component Chooser<Option, T extends string = "div">(props: (T extends "div" ? import("./picker.js").OneOrMany<Option> : never) & { onChange?: handler (v: Option | Option[]) => void; max?: number })',
  Open: 'export component Open(props: import("./picker.js").OpenProps & { onAnything?: handler () => void })',
};
const overRun = rows => { fs.writeFileSync(path.join(over, "picker.d.rx"), Object.values({ ...overRows, ...rows }).join("\n") + "\n"); const r = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js")], { cwd: over, encoding: "utf8" }); return { status: r.status, out: r.stdout + r.stderr }; };
const overGood = overRun({});
check("a props' record whose fields are the library's props, narrowed or the same, passes: a generic prop, a prop of one member of a union under a conditional, any name where the props are open (MO-8o)", overGood.status === 0 && overGood.out.trim() === "", overGood);
const overType = overRun({ Picker: overRows.Picker.replace("{ onPick?: handler (v: Option) => void }", "{ onPick?: handler (v: Option) => void; label?: number }") });
check("a field given another type than the library's fails, naming the prop and both types (DECLARATION_MISMATCH)",
  overType.status !== 0 && /picker\.d\.rx:1:1 - error DECLARATION_MISMATCH: Picker: `label` is written `number` in the record after the props' type, and the library's type for that prop does not take it[^]*Type 'number' is not assignable to type 'string/.test(overType.out) && !/onPick/.test(overType.out), overType);
const overFn = overRun({ Chooser: overRows.Chooser.replace("(v: Option | Option[]) => void", "(v: string) => void") });
check("...a callback that does not take what the library calls it with, too (the row's type parameters are held as types of their own)",
  overFn.status !== 0 && /picker\.d\.rx:2:1 - error DECLARATION_MISMATCH: Chooser: `onChange` is written `\(v: string\) => void`[^]*is not assignable to type '\(\(v: Option \| null\) => void\) \| \(\(v: Option\[\]\) => void\) \| undefined'/.test(overFn.out), overFn);
const overName = overRun({ Picker: overRows.Picker.replace("onPick?", "onPicked?") });
check("a field that names no prop of the library's fails, naming it (DECLARATION_MISMATCH)",
  overName.status !== 0 && /picker\.d\.rx:1:1 - error DECLARATION_MISMATCH: Picker: `onPicked` is written in the record after the props' type, and import\("\.\/picker\.js"\)\.PickerProps<Option> has no prop of that name/.test(overName.out) && (overName.out.match(/onPicked/g) ?? []).length === 1, overName);
fs.rmSync(over, { recursive: true });

// MO-8j: strict declarations — `--rx-strict` refuses a row rx-verify has not recorded as verified
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
// no word of a row opts it out of strict mode: `trusted` was one (MO-8j) and is refused by name
fs.writeFileSync(path.join(only, "lib.d.rx"), "export pure fn twice(n: number): number trusted\n");
const trusted = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js")], { cwd: only, encoding: "utf8" });
check("`trusted` is not a word of a row (refused by name)", trusted.status !== 0 && /`trusted` is not a word of a declaration/.test(trusted.stdout + trusted.stderr), { status: trusted.status, out: trusted.stdout + trusted.stderr });
fs.writeFileSync(path.join(only, "lib.d.rx"), "export pure fn twice(n: number): number\n");

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
// RFC 23 (revised 2026-11-22): a TypeScript module is declared as a JavaScript one is — `./view.tsx` by `view.tsx.d.rx`,
// then by `view.d.rx` — by the checker and by the tooling alike (the checker read only `view.tsx.d.rx`, the tooling only
// `view.d.rx`, so each ignored the other's file)
{
  const { declarationNames } = require("../src/beside.js");
  check("a module's declaration names are the crate's, in its order (declaration_names)", JSON.stringify(["x.js", "x.ts", "x.mjs", "x.cjs", "x.jsx", "x.tsx", "x.mts", "x.cts"].map(declarationNames)) === JSON.stringify([["x.d.rx"], ["x.d.rx"], ["x.mjs.d.rx", "x.d.rx"], ["x.cjs.d.rx", "x.d.rx"], ["x.jsx.d.rx", "x.d.rx"], ["x.tsx.d.rx", "x.d.rx"], ["x.mts.d.rx", "x.d.rx"], ["x.cts.d.rx", "x.d.rx"]]), ["x.tsx"].map(declarationNames));
  for (const f of ["old.d.rx", "old.cjs.d.rx", "view.jsx.d.rx", "view.jsx", "old.cjs", "lib.mjs", "lib.d.rx"]) fs.rmSync(path.join(esm, f), { force: true });
  fs.writeFileSync(path.join(esm, "calc.tsx"), "export const twice = (n: number) => n * 2;\n");
  const tsxApp = 'import { twice } from "./calc.tsx"\nexport default component App() {\n  a = twice(2)\n  <p>{a}</p>\n}\n';
  const undeclared = esmRun(tsxApp);
  check("with no declaration, ./calc.tsx is io: called in reactive scope it is refused (R-io-4)", undeclared.status !== 0 && /IO_IN_REACTIVE/.test(undeclared.out), undeclared);
  fs.writeFileSync(path.join(esm, "calc.d.rx"), "export pure fn twice(n: number): number\n");
  const stem = esmRun(tsxApp);
  check("calc.d.rx declares ./calc.tsx for the checker, as it does for the tooling", stem.status === 0 && stem.out.trim() === "" && declarationOf(path.join(esm, "calc.tsx")) === path.join(esm, "calc.d.rx") && jsOf(path.join(esm, "calc.d.rx")) === path.join(esm, "calc.tsx"), stem);
  fs.writeFileSync(path.join(esm, "calc.tsx.d.rx"), "export pure fn twice(n: number): number\n"); fs.writeFileSync(path.join(esm, "calc.d.rx"), "export fn twice(n: number): number\n");
  const whole = esmRun(tsxApp);
  check("calc.tsx.d.rx, the file's whole name, wins over calc.d.rx for both", whole.status === 0 && whole.out.trim() === "" && declarationOf(path.join(esm, "calc.tsx")) === path.join(esm, "calc.tsx.d.rx") && jsOf(path.join(esm, "calc.tsx.d.rx")) === path.join(esm, "calc.tsx") && jsOf(path.join(esm, "calc.d.rx")) === undefined, whole);
}
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
fs.writeFileSync(path.join(cyc, "a.rx"), 'import { B } from "./b.rx"\nexport component A() { <B /> }\n');
const cycQuiet = cycRun();
check("...and two that import each other with nothing else wrong fail per module too (MODULE_CYCLE on each, at its import)", cycQuiet.status !== 0 && /a\.rx:1:1 - error MODULE_CYCLE/.test(cycQuiet.out) && /b\.rx:1:1 - error MODULE_CYCLE/.test(cycQuiet.out), cycQuiet);
fs.writeFileSync(path.join(cyc, "a.rx"), 'import { B } from "./b.rx"\nexport component A() {\n  source n := 0\n  shown = [1].map(k => { n := k; k })\n  <p>{shown}</p> <B />\n}\n');
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
fs.writeFileSync(path.join(nest, "sub/lib.d.rx"), "export pure fn f(s: string): string\n");
fs.writeFileSync(path.join(nest, "main.rx"), fs.readFileSync(path.join(nest, "main.rx"), "utf8").replace("f(2)", 'f("x")'));
fs.writeFileSync(path.join(nest, "spare.js"), "export const g = n => n;\n");
fs.writeFileSync(path.join(nest, "spare.d.rx"), "//@ for not-installed-anywhere ^1.0.0\nexport pure fn g(n: number): number\n");
const neighbour = nestRun("--rx-strict");
check("an unimported declaration beside the entry is not checked (no UNVERIFIED_ROW, no DECLARATION_VERSION): the imported one's row is the only one held", /sub[\\/]lib\.d\.rx:1:1 - error UNVERIFIED_ROW: f: /.test(neighbour.out) && /Found 1 ReactiveScript error/.test(neighbour.out) && !/spare\.d\.rx/.test(neighbour.out), neighbour);
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

// MO-13a, MO-13d: a printed signature (`//@ signature`) beside a compiled .rx module is no JS module's declaration —
// nothing is held against the JavaScript's types (TY-6) — and its import is typed by the module's projection, `kit.rx.d.ts`
const kit = (use) => [
  { include: ["."] },
  { file: "kit.d.rx", text: () => "//@ signature kit.rx (09-modules MO-3, MO-13a).\nexport source hits := …\nexport action hit\nexport pure fn double(n)\n" },
  { file: "kit.rx.d.ts", text: () => "export declare const hits: number;\nexport declare function hit(by: number): Promise<void>;\nexport declare function double(n: number): number;\n" },
  { file: "kit.js", text: () => "export const __rx = () => ({});\nexport const hits = () => 0;\n" },
  { file: "kit.d.ts", text: () => "export declare const __rx: (rt: unknown) => Record<string, unknown>;\nexport declare const hits: () => number;\n" },
  { file: "main.rx", text: t => t.replace('import { Row, Panel } from "./ui.rx"', 'import { Row, Panel } from "./ui.rx"\nimport { hits, double } from "./kit.js"').replace('title="The shop"', `title={\`The shop \${${use}}\`}`) },
];
const printedOk = run(...kit("double(hits)"));
check("a printed signature in include: read as the .rx module's, typed by its projection's .d.ts", printedOk.status === 0 && printedOk.out.trim() === "", printedOk);
const printedBad = run(...kit('double("x")'));
check("...whose types hold: a wrong argument is TypeScript's error on the .rx", printedBad.status !== 0 && /main\.rx\(\d+,\d+\): error TS2345/.test(printedBad.out) && !/DECLARATION_MISMATCH|PARSE/.test(printedBad.out), printedBad);

// 11 CP-4d: a route file imported as its page (`?rx-page`) is typed by the module's projection — its default export
// the module's default component, its other components by name
{
  const pw = path.join(__dirname, "../.test/tsc-page");
  fs.rmSync(pw, { recursive: true, force: true }); fs.mkdirSync(path.join(pw, "node_modules/@reactivescript"), { recursive: true });
  for (const f of fs.readdirSync(path.join(repo, "ref/node_modules")).filter(f => !f.startsWith("."))) fs.symlinkSync(path.join(repo, "ref/node_modules", f), path.join(pw, "node_modules", f), "dir");
  fs.symlinkSync(path.join(repo, "runtime"), path.join(pw, "node_modules/@reactivescript/runtime"), "dir");
  fs.writeFileSync(path.join(pw, "page.rx"), "export default component Person(props: { id: string }) {\n  <p>{props.id}</p>\n}\nexport component Crumb() {\n  <i>here</i>\n}\n");
  fs.writeFileSync(path.join(pw, "tsconfig.json"), JSON.stringify({ compilerOptions: { jsx: "preserve", jsxImportSource: "@solidjs/web", strict: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", allowImportingTsExtensions: true, noEmit: true, skipLibCheck: true, lib: ["ES2022", "DOM"], types: [] }, include: ["*.rx", "*.tsx"] }));
  const host = prop => fs.writeFileSync(path.join(pw, "host.tsx"), `import Person, { Crumb } from "./page.rx?rx-page";\nexport const view = () => <><Person id=${prop} /><Crumb /></>;\n`);
  const tsc = () => { const r = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js"), "--noEmit", "-p", "tsconfig.json"], { cwd: pw, encoding: "utf8" }); return { status: r.status, out: r.stdout + r.stderr }; };
  host("\"1\""); const good = tsc();
  check("a route file imported as its page (?rx-page) is typed: its default export is the module's default component", good.status === 0, good.out);
  host("{1}"); const bad = tsc();
  check("...by that component's props: a number for its string is TypeScript's error in the host", bad.status !== 0 && /host\.tsx\(2,\d+\): error TS2322/.test(bad.out), bad.out);
}

// MO-14e: a host declaration is a declaration the program is checked by — strict mode asks for its record, though no
// module imports it (it is found by its place)
{
  const hosted = path.join(ws, "hosted"); fs.mkdirSync(hosted, { recursive: true });
  fs.writeFileSync(path.join(hosted, "tsconfig.json"), JSON.stringify({ compilerOptions: { jsx: "preserve", jsxImportSource: "@solidjs/web", strict: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", noEmit: true, skipLibCheck: true, lib: ["ES2022", "DOM"], types: [] }, include: ["*.rx"] }));
  fs.writeFileSync(path.join(hosted, "page.rx"), "export default component Page() {\n  <h1>page</h1>\n}\n");
  fs.writeFileSync(path.join(hosted, "host.d.rx"), "import { Page } from \"./page.rx\"\nexport default component = [{ component: Page }]\n");
  const tsc = (...flags) => { const r = spawnSync(process.execPath, [path.join(__dirname, "../bin/tsc.js"), ...flags], { cwd: hosted, encoding: "utf8" }); return { status: r.status, out: r.stdout + r.stderr }; };
  const plain = tsc(), unrecorded = tsc("--rx-strict");
  check("a host declaration with no record passes outside strict mode", plain.status === 0, plain);
  check("strict: the host declaration a program is under is asked for its record (UNVERIFIED_ROW)", unrecorded.status !== 0 && /host\.d\.rx:2:1 - error UNVERIFIED_ROW: default: nothing verified it/.test(unrecorded.out), unrecorded);
  require("../src/strict.js").writeRecord(path.join(hosted, "host.d.rx"), [{ line: 2, ob: "placement", status: "held", what: "the host's view holds" }]);
  const recorded = tsc("--rx-strict");
  check("...and accepted once rx-verify recorded its view", recorded.status === 0, recorded);
  fs.rmSync(hosted, { recursive: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
