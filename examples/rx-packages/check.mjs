// 12 one-line mistakes and 8 correct changes of one good program per package (check/<name>.mjs): as .rx over the rewrite, as .rx
// over the original with rx-declare's drafts, as .tsx over the original (TypeScript alone).   node check.mjs [filter]   V=1: each
// A part is written once: `$x` reads the state x, `$x := e` writes it (`x` and `x := e` in .rx; `x()` and `setx(e)` in .tsx).
import { execFileSync, spawnSync } from "node:child_process"; import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url";
import { both, loadRef } from "../../bench/harness.mjs";
const here = import.meta.dirname, repo = path.resolve(here, "../.."), tools = path.join(repo, "tooling/rx-language-server/bin"), rxc = path.join(repo, "compiler/target/release/rxc");
const ORIG = JSON.parse(readFileSync(path.join(here, "originals.json"), "utf8"));
const cfg = { compilerOptions: { jsx: "preserve", jsxImportSource: "@solidjs/web", strict: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", noEmit: true, skipLibCheck: true, types: [], lib: ["ES2022", "DOM", "DOM.Iterable"], allowImportingTsExtensions: true } };
const origOf = (spec) => { const [, pkg, part] = /^#([\w-]+)(?:\/(.+))?$/.exec(spec), o = ORIG[pkg]; return part && o.parts !== false ? `${o.name}/${part}` : o.name; };
const rxOf = (spec) => { const [, pkg, part] = /^#([\w-]+)(?:\/(.+))?$/.exec(spec); return `@rx-packages/${pkg}${part ? "/" + part : ""}`; };
const imports = (list, of) => list.map(([names, spec]) => `import { ${names} } from "${of(spec)}"`).join("\n");
const rx = (t) => t.replace(/\$(\w)/g, "$1");
const tsx = (t) => t.replace(/\$(\w+) := ((?:[^;{}]|\{[^{}]*\})+?)(?=\s*[;}])/g, "set$1($2)").replace(/\$(\w+)/g, "$1()");
/** The good program around a part. */
function program(s, kind) {
  const T = kind === "tsx" || kind === "tsxrx", w = T ? tsx : rx, imp = kind === "rx" ? imports(s.rx ?? s.imports, rxOf) : imports(s.imports, origOf);
  const state = [["n", "number", "0"], ["other", "number", "0"], ["list", "string[]", `["a", "b"]`], ["extra", "boolean", "false"], ...(s.state ?? [])];
  if (T) return `import { createSignal, createMemo, createEffect, Show, For, Loading, Errored } from "solid-js";\nimport { load } from "./api.js";\n${imp}\n${s.tsTop ?? ""}/*TOP*/\nexport default function App() {\n${state.map(([n, t, v]) => `  const [${n}, set${n}] = createSignal<${t}>(${v});`).join("\n")}\n  const slow = createMemo(() => load(n()));\n  const bump = () => { setn(n() + 1) };\n  ${s.tsDecl ? w(s.tsDecl) : ""}/*DECL*/\n  return <main><p>{n()} {other()} {list().join("+")}</p>\n    <button onClick={() => { bump(); setextra(!extra()); setlist([...list(), "c"]) }}>b</button>\n    <div>/*A*/${w(s.part)}/*B*/</div>\n    <Errored fallback={<i>e</i>}><Loading fallback={<i>l</i>}><b>{slow()}</b></Loading></Errored>\n  </main>;\n}\n`;
  return `import pure { load } from "./api.js"\n${imp}\n${s.rxTop ?? ""}/*TOP*/\nexport default component App() {\n${state.map(([n, t, v]) => `  source ${n}: ${t} := ${v}`).join("\n")}\n  slow = await load(n)\n  action bump() { n := n + 1 }\n  ${s.rxDecl ? w(s.rxDecl) : ""}/*DECL*/\n  <main><p>{n} {other} {list.join("+")}</p>\n    <button onClick={() => { bump(); extra := !extra; list := [...list, "c"] }}>b</button>\n    <div>/*A*/${w(s.part)}/*B*/</div>\n    {errored fallback { <i>e</i> } { {loading fallback { <i>l</i> } { <b>{slow}</b> }} }}\n  </main>\n}\n`;
}
const one = (t, a, b) => { if (!t.includes(a)) throw new Error("not in the program: " + a); return t.replace(a, () => b); };
/** name → { rx: edit, tsx: edit } of the program's text. */
function variants(s) {
  const P = rx(s.part), Q = tsx(s.part), both_ = (a, b) => ({ rx: (t) => one(t, rx(a), rx(b)), tsx: (t) => one(t, tsx(a), tsx(b)) }), alone = (b) => ({ rx: (t) => one(t, "/*B*/", "/*B*/" + rx(b)), tsx: (t) => one(t, "/*B*/", "/*B*/" + tsx(b)) });
  const wrap = (a, b) => ({ rx: (t) => one(t, `/*A*/${P}/*B*/`, a + P + b), tsx: (t) => one(t, `/*A*/${Q}/*B*/`, a + Q + b) });
  const CHILD = s.child ?? "CHILD"; const child = (r, t) => ({ rx: (x) => one(x, CHILD, r), tsx: (x) => one(x, CHILD, t) });
  const [hFrom, hName] = s.handler;   // the text of an attribute that takes a handler, and its name
  const mist = {
    "R1 an action called while the content renders": child("{bump()}", "{bump() as any}"),
    "R2 a handler called, not passed": { rx: (t) => one(t, rx(hFrom), `${hName}={bump()}`), tsx: (t) => one(t, tsx(hFrom), `${hName}={bump() as any}`) },
    "R3 a list mutated in place in the part's handler": { rx: (t) => one(t, rx(hFrom), `${hName}={() => { list.push("x") }}`), tsx: (t) => one(t, tsx(hFrom), `${hName}={() => { list().push("x") }}`) },
    "R4 a value read once, shown as if it changed": { rx: (t) => one(one(t, "/*DECL*/", "let once = n"), CHILD, "{once}"), tsx: (t) => one(one(t, "/*DECL*/", "const once = n();"), CHILD, "{once}") },
    "R5 state derived through an effect": { rx: (t) => one(t, "/*DECL*/", "effect (n) { other := $0 * 2 }"), tsx: (t) => one(t, "/*DECL*/", "createEffect(n, (v) => { setother(v * 2) });") },
    "R6 a prop written by the child it is given to": { rx: (t) => one(one(t, "/*TOP*/", "component Mine(props: { v: number }) { <b onClick={() => { props.v := 1 }}>{props.v}</b> }"), CHILD, "<Mine v={n} />"), tsx: (t) => one(one(t, "/*TOP*/", "function Mine(props: { v: number }) { return <b onClick={() => { props.v = 1 }}>{props.v}</b> }"), CHILD, "<Mine v={n()} />") },
    "P1 a part outside its root": s.outside ? alone(s.outside) : s.p1 ? both_(...s.p1) : wrap("<table>", "</table>"),
    "P2 block content in a paragraph": s.p2 ? both_(...s.p2) : wrap("<p>", "</p>"),
    "P3 the part where a table's rows are": s.p3 ? both_(...s.p3) : wrap("<table><tbody>", "</tbody></table>"),
    "A1 an awaited value with no boundary": child("{slow}", "{slow()}"),
    "A2 a prop of the wrong type": both_(...s.wrong),
    "A3 a prop that is not one, or left out": both_(...s.unknown),
  };
  const good = {
    "C1 the part under a condition": { rx: (t) => one(t, `/*A*/${P}/*B*/`, `{if extra { ${P} }}`), tsx: (t) => one(t, `/*A*/${Q}/*B*/`, `<Show when={extra()}>${Q}</Show>`) },
    "C2 the part in a loop": { rx: (t) => one(t, `/*A*/${P}/*B*/`, `{for it in list { ${P} }}`), tsx: (t) => one(t, `/*A*/${Q}/*B*/`, `<For each={list()}>{(it) => ${/^<[\s\S]*>$/.test(Q) ? Q : `<>${Q}</>`}}</For>`) },
    "C3 an element of the app's own inside": { rx: (t) => one(one(t, "/*TOP*/", "component Mine(props: { v: number }) { <b>{props.v}</b> }"), CHILD, "<Mine v={n} />"), tsx: (t) => one(one(t, "/*TOP*/", "function Mine(props: { v: number }) { return <b>{props.v}</b> }"), CHILD, "<Mine v={n()} />") },
    "C4 an awaited value inside, under its boundaries": child("{errored fallback { <i>e</i> } { {loading fallback { <i>l</i> } { <b>{slow}</b> }} }}", "<Errored fallback={<i>e</i>}><Loading fallback={<i>l</i>}><b>{slow()}</b></Loading></Errored>"),
    "C5 an action given by name as the handler": { rx: (t) => one(t, rx(hFrom), `${hName}={bump}`), tsx: (t) => one(t, tsx(hFrom), `${hName}={bump}`) },
    "C6 a data attribute and a class list": s.attrs === false ? child("{n}", "{n()}") : both_(s.tag, s.tag + ` data-k="v" class={["a", { b: true }]}`),
    "C7 a ref that keeps the element": s.attrs === false || s.ref === false ? child("{str(n + 1)}", "{n() + 1}") : { rx: (t) => one(t, rx(s.tag), rx(s.tag) + ` ref={(e: ${s.el ?? "Element"}) => { other := 1 }}`), tsx: (t) => one(t, tsx(s.tag), tsx(s.tag) + ` ref={(e: ${s.el ?? "Element"}) => { setother(1) }}`) },
    "C8 the state the part is given, shown elsewhere": s.c8 ? both_(...s.c8) : { rx: (t) => one(t, "/*B*/", "/*B*/<i>{n + 1}</i>"), tsx: (t) => one(t, "/*B*/", "/*B*/<i>{n() + 1}</i>") },
  };
  return { mist, good };
}
const codesIn = (text) => [...new Set(text.match(/\b(TS\d+|[A-Z][A-Z]+(?:_[A-Z]+)+|PARSE|CYCLE|UNBOUND)\b(?=[:\s[])/g) ?? [])].filter((c) => !/^DECLARATION_(STALE|UNPINNED)/.test(c));
const byFile = (text) => { const m = new Map(); let f; for (const l of text.split("\n")) { const x = /^(?:\S*\/)?([a-z]\w*)\.(?:rx|tsx)[(:]/.exec(l); if (x) f = x[1]; else if (!/^\s/.test(l)) f = undefined; if (f && x) m.set(f, (m.get(f) ?? "") + l + "\n"); } return m; };
await loadRef();
const all = existsSync(path.join(here, "check.json")) ? JSON.parse(readFileSync(path.join(here, "check.json"))) : {};
const out = path.join(here, ".out/check");
for (const file of readdirSync(path.join(here, "check")).filter((f) => f.endsWith(".mjs") && (!process.argv[2] || f.includes(process.argv[2])))) {
  const name = file.slice(0, -4), s = (await import(pathToFileURL(path.join(here, "check", file)).href)).default, v = variants(s), res = {};
  for (const kind of ["rx", "orig", "tsx", "tsxrx"]) {
    const dir = path.join(out, name, kind); mkdirSync(dir, { recursive: true }); const ext = kind.startsWith("tsx") ? "tsx" : "rx"; const T = ext === "tsx";
    for (const f of readdirSync(dir)) if (/\.(rx|tsx)$/.test(f)) rmSync(path.join(dir, f));
    writeFileSync(path.join(dir, "api.js"), "export const load = async (n) => String(n);\n"); writeFileSync(path.join(dir, "api.d.ts"), "export declare function load(n: number): Promise<string>;\n"); writeFileSync(path.join(dir, "api.d.rx"), "export pure fn load(n: number): Promise<string>\n");
    writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ ...cfg, include: T ? ["*.tsx"] : ["*.rx", "rx-types/**/*.d.rx"] }));
    if (kind === "orig") for (const [, spec] of s.imports) { const m = origOf(spec), f = path.join(dir, "rx-types", m + ".d.rx"); if (existsSync(f + ".asdrafted")) writeFileSync(f, readFileSync(f + ".asdrafted")); if (!existsSync(f)) { mkdirSync(path.dirname(f), { recursive: true }); const r = spawnSync(process.execPath, ["--conditions=browser", "--max-old-space-size=2048", path.join(tools, "declare.js"), m, "--out", f], { cwd: here, encoding: "utf8", timeout: 180000, env: { ...process.env, RXC: rxc } }); if (!existsSync(f)) { console.log(name, "no draft:", (r.stderr || "").slice(-300)); } else { const t = readFileSync(f, "utf8"); writeFileSync(f + ".asdrafted", t); } } }
    const base = program(s, kind), files = { good: base }; let i = 0; const key = {};
    for (const [g, list] of [["m", v.mist], ["c", v.good]]) for (const [n, e] of Object.entries(list)) { const id = g + String(++i); key[n] = id; files[id] = (T ? e.tsx : e.rx)(base); }
    if (kind === "tsxrx") for (const k of Object.keys(files)) if (k !== "good") delete files[k];
    if (kind === "tsxrx") files.good = files.good.replace(imports(s.imports, origOf), imports(s.rx ?? s.imports, rxOf));
    for (const [k, t] of Object.entries(files)) writeFileSync(path.join(dir, k + "." + ext), t);
    const codes = {}, agree = []; const types = () => { const r = T ? spawnSync(process.execPath, [path.join(here, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], { cwd: dir, encoding: "utf8" }) : spawnSync(process.execPath, [path.join(tools, "tsc.js"), "--noEmit", "-p", "tsconfig.json"], { cwd: dir, encoding: "utf8", env: { ...process.env, RXC: rxc } }); return r.status === 0 ? "" : r.stdout + r.stderr; };
    const run = () => { const by = byFile(types()); for (const k of Object.keys(files)) { const c = new Set(codesIn(by.get(k) ?? "")); if (!T) { const b = both(path.join(dir, k + ".rx")); for (const d of b.crate.diagnostics) c.add(d.code); for (const d of b.crate.advice) c.add("advice:" + d.code); if (!b.agree) agree.push(k); if (process.env.VV && k === process.env.VV) console.log(b.crate.diagnostics, by.get(k)); } codes[k] = [...c]; } };
    run();
    // the words a person must add to the drafts before the good program is accepted: `handler` on callbacks
    if (kind === "orig" && codes.good.length) { let added = 0; for (const [, spec] of s.imports) { const f = path.join(dir, "rx-types", origOf(spec) + ".d.rx"); if (!existsSync(f)) continue; const t = readFileSync(f + ".asdrafted", "utf8"); const u = t.replace(/((?:[{;,&(]|\b)\s*on[A-Z]\w*\??: )(?=\()/g, (m) => { added++; return m + "handler "; }); writeFileSync(f, u); } res.byHand = added; const before = codes.good; run(); res.asDrafted = before; }
    res[kind] = { codes, key, disagree: [...new Set(agree)] };
  }
  const caught = (kind, n) => { const r = res[kind], g = new Set(r.codes.good); return r.codes[r.key[n]].filter((c) => !g.has(c)); };
  const row = { caught: {}, refused: {}, good: {}, missed: {}, refusedWhat: {}, disagree: [...res.rx.disagree, ...res.orig.disagree], asDrafted: res.asDrafted, byHand: res.byHand, tsxOverRewrite: res.tsxrx.codes.good };
  for (const kind of ["rx", "orig", "tsx"]) { const m = Object.keys(v.mist), c = Object.keys(v.good); row.good[kind] = res[kind].codes.good; row.caught[kind] = m.filter((n) => caught(kind, n).length).length; row.missed[kind] = m.filter((n) => !caught(kind, n).length).map((n) => n.slice(0, 2)); row.refusedWhat[kind] = Object.fromEntries(c.filter((n) => caught(kind, n).length).map((n) => [n.slice(0, 2), caught(kind, n)])); row.refused[kind] = Object.keys(row.refusedWhat[kind]).length; }
  if (process.env.V) for (const n of [...Object.keys(v.mist), ...Object.keys(v.good)]) console.log(`   ${n.padEnd(52)} ${["rx", "orig", "tsx"].map((k) => caught(k, n).join(",") || "—").join("  |  ")}`);
  all[name] = row; console.log(`${name.padEnd(24)} caught ${row.caught.rx}/${row.caught.orig}/${row.caught.tsx} of 12 (missed rx ${row.missed.rx.join(" ") || "-"}; draft ${row.missed.orig.join(" ") || "-"})  refused ${row.refused.rx}/${row.refused.orig}/${row.refused.tsx} of 8 ${JSON.stringify(row.refusedWhat.rx)}  good ${row.good.rx.join(",") || "ok"}/${row.good.orig.join(",") || "ok"}/${row.good.tsx.join(",") || "ok"}  drafted: ${(row.asDrafted ?? []).join(",") || "ok"}${row.byHand ? ` (+${row.byHand} handler)` : ""}  tsx over rewrite: ${row.tsxOverRewrite.join(",") || "ok"}${row.disagree.length ? "  CHECKERS DISAGREE " + row.disagree : ""}`);
}
writeFileSync(path.join(here, "check.json"), JSON.stringify(all, null, 1) + "\n");
process.exit(0);
