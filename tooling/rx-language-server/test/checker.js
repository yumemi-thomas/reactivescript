// The checker (src/checker.js): its version, what it says where tsrs cannot run, the order of what it answers, TypeScript
// 7.1's differences the tooling stands on (each a minimal program, with what TypeScript 6.0.3 says of it), and a draft that
// is the same for any number of workers.
//   node test/checker.js
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const ws = path.join(root, ".test/checker");
fs.rmSync(ws, { recursive: true, force: true }); fs.mkdirSync(ws, { recursive: true });
let pass = 0, fail = 0;
function check(name, ok, got) { if (ok) pass++; else fail++; console.log(`${ok ? "  ✓" : "  ✗"} ${name}${ok ? "" : `\n      ${JSON.stringify(got)?.slice(0, 3000)}`}`); }
const node = (args, env = {}) => { const r = spawnSync(process.execPath, args, { cwd: ws, encoding: "utf8", env: { ...process.env, ...env } }); return { status: r.status, out: r.stdout, err: r.stderr }; };

const C = require("../src/checker.js");
const pinned = require("../package.json").dependencies.tsrs;
{
  const v = node([path.join(root, "bin/tsc.js"), "--version"]);
  check("rx-tsc --version names its own version, tsrs's and TypeScript's", v.status === 0 && v.out.includes(require("../package.json").version) && v.out.includes(`tsrs ${pinned}`) && /TypeScript 7\./.test(v.out), v);
  check("the dependency is one exact version", /^\d+\.\d+\.\d+[-\w.]*$/.test(pinned), pinned);
}

// where tsrs cannot run, nothing else checks in its place
fs.writeFileSync(path.join(ws, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, noEmit: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", types: [] }, include: ["*.ts"] }));
fs.writeFileSync(path.join(ws, "a.ts"), "export const a: number = 1;\n");
{
  const r = node([path.join(root, "bin/tsc.js"), "--noEmit"], { TSRS_BINARY: path.join(ws, "none") });
  check("no binary: rx-tsc exits 2, says which version is needed, that nothing stands in for it, and tsrs's own reason", r.status === 2 && r.err.includes(`tsrs ${pinned}`) && /with nothing else/.test(r.err) && /TSRS_BINARY/.test(r.err), r);
  const hide = path.join(ws, "hide.cjs");
  fs.writeFileSync(hide, `const M = require("node:module"), real = M._resolveFilename; M._resolveFilename = function (r, ...a) { if (r === "tsrs" || r.startsWith("tsrs/")) { const e = new Error("Cannot find module 'tsrs'"); e.code = "MODULE_NOT_FOUND"; throw e; } return real.call(this, r, ...a); };\n`);
  const m = node(["--require", hide, path.join(root, "bin/tsc.js"), "--noEmit"]);
  check("not installed: the same, and what to install", m.status === 2 && /is not installed with @reactivescript\/language-server/.test(m.err), m);
  const other = path.join(ws, "other.cjs");
  fs.writeFileSync(other, `const M = require("node:module"), real = M._load; M._load = function (r, ...a) { const v = real.call(this, r, ...a); return r === "tsrs" ? { ...v, version: "0.0.1" } : v; };\n`);
  const o = node(["--require", other, path.join(root, "bin/tsc.js"), "--noEmit"]);
  check("another version installed: refused, naming both", o.status === 2 && o.err.includes("tsrs 0.0.1 is installed") && o.err.includes(pinned), o);
  fs.writeFileSync(path.join(ws, "mod.js"), "export const x = 1;\n"); fs.writeFileSync(path.join(ws, "mod.d.ts"), "export declare const x: number;\nexport declare function f<T extends string>(a: T): T;\n");
  const d = node([path.join(root, "bin/declare.js"), "./mod.js"], { TSRS_BINARY: path.join(ws, "none") });
  check("rx-declare fails too: no draft is written unchecked", d.status !== 0 && d.out === "" && /type-checks with tsrs/.test(d.err), d);
}

const options = { strict: true, noEmit: true, skipLibCheck: true, target: 9, module: 99, moduleResolution: 100, types: [], lib: ["lib.es2022.d.ts"] };
const ck = C.checker(ws);
const errors = text => { const f = path.join(ws, "probe.ts"); return ck.check({ roots: [f], files: new Map([[f, text]]), options }); };
{
  const ds = errors("export const a: string = 1;\nexport const b: {\n  x: number } = { x: '' };\nlet c: number = 1; let c: number = 2;\n");
  check("a diagnostic has its file, its place in UTF-16, its code and its chain; a name declared twice is among them", ds.map(d => `${d.line}:${d.column}:${d.code}`).join(" ") === "1:13:2322 3:18:2322 4:4:2451 4:23:2451", ds);
  const u = errors("export const s = '𝒳é'; export const a: string = 1;\n");
  check("...whatever is before it on the line", u[0]?.column === "export const s = '𝒳é'; export const ".length, u);
  const again = [1, 2, 3].map(() => JSON.stringify(errors("export const a: string = 1; export const b: number = '';\n")));
  check("...and asked again, the same", new Set(again).size === 1, again);
  check("the order is by file, place, code; each once", C.ordered([{ file: "b", start: 1, length: 1, code: 1, message: "" }, { file: "a", start: 9, length: 1, code: 1, message: "" }, { file: "a", start: 9, length: 1, code: 1, message: "" }, { code: 5, message: "" }]).map(d => `${d.file}:${d.code}`).join() === "undefined:5,a:1,b:1");
}

// TypeScript 7.1 beta (the pinned tsrs) and TypeScript 6.0.3 on the same text: each difference the tooling met
{
  // microsoft/TypeScript#64673, a regression of #64237: two identical signatures that write a conditional which distributes
  const decl = "export declare function f<T>(value: T): (T extends any[] ? T[number] : NonNullable<T>)[];\n";
  const asWritten = errors(decl + "export const g: <T>(value: T) => (T extends any[] ? T[number] : NonNullable<T>)[] = f;\n");
  check("TypeScript 7.1 beta refuses `<T>(v: T) => T extends …` for itself (TS2719, microsoft/TypeScript#64673; TypeScript 6 accepts it) — when this fails, project.rs `as_instance` is needed no more", asWritten.some(d => d.code === 2719), asWritten);
  const { boundary } = require("../src/rxc.js");
  const held = row => errors(boundary(path.join(ws, "x.d.rx"), "./kit.js", row).code.replace(/^import \* as __real.*$/m, `${decl}declare const __real: { asArray: typeof f };`).replace(/^type View.*$/m, "type View = object;"));
  check("...so a row with such a conditional is held as an instance of its type, and the library's own signature holds", held("export pure fn asArray<T>(value: T): (T extends any[] ? T[number] : NonNullable<T>)[]\n").length === 0, held("export pure fn asArray<T>(value: T): (T extends any[] ? T[number] : NonNullable<T>)[]\n"));
  for (const [what, row] of [["another branch", "export pure fn asArray<T>(value: T): (T extends any[] ? T[number] : string)[]\n"], ["another condition", "export pure fn asArray<T>(value: T): (T extends string ? T : NonNullable<T>)[]\n"], ["a narrower answer", "export pure fn asArray<T>(value: T): (T extends any[] ? T[number] : never)[]\n"]])
    check(`...and a row that says ${what} does not`, held(row).some(d => d.code === 2322), held(row));
}

// the same draft for any number of workers; the checks are big enough to go to them
{
  const many = Array.from({ length: 260 }, (_, i) => `export declare function use${i}<T extends { id: string; n${i}: number }>(a: T, b: Internal<T>, c: { [K in keyof T]?: (v: T[K], at: ${i}) => void }): Internal<T> & { last: T };\nexport declare const part${i}: { open: (o: { ${Array.from({ length: 12 }, (_, k) => `field${k}?: (v: Hidden${i % 7}, n: ${k}) => Hidden${(i + k) % 7} | undefined`).join("; ")} }) => Hidden${i % 7} };`).join("\n");
  fs.writeFileSync(path.join(ws, "big.js"), "export const x = 1;\n");
  fs.writeFileSync(path.join(ws, "big.d.ts"), `interface Internal<T> { value: T; map<U>(f: (v: T) => U): Internal<U> }\n${Array.from({ length: 7 }, (_, i) => `interface Hidden${i} { kind: ${i}; of: Hidden${(i + 1) % 7}[] }`).join("\n")}\n${many}\nexport {};\n`);
  const drafts = [1, 2, 4, 8].map(n => node([path.join(root, "bin/declare.js"), "./big.js", "--no-infer"], { RX_CHECKERS: String(n) }));
  check("a draft is the same for 1, 2, 4 and 8 workers", drafts.every(d => d.status === 0 && d.out.length > 10_000 && d.out === drafts[0].out), drafts.map(d => [d.status, d.out.length, d.err.slice(0, 300)]));
}
C.closeAll();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
