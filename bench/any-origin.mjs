// Where the census's `any`s come from (bench/any-census.mjs, 2026-11-28). For each `any` a draft writes as the
// library's own (cause `vendor-any`):
//  - its PLACE in the row, read as the checker reads a row (ref/src/parse.ts's own reading of a `.d.rx`): a type
//    parameter's bound or default, a type alias's body, a callback's parameter, what a callback answers, a type
//    argument of a named type, a field or element of a parameter or result, or the whole of one. What the checker reads
//    of each place (09 MO-10k, 08 CN-7d; compiler/src/check.rs's ty_* readers, parse.rs's shape_of and prop flags) is
//    what the `any` costs there;
//  - its ORIGIN: the smallest piece of the row around it (`Record<string, any>`, `value?: any`, `=> any`), looked for in
//    the declaration files of the module's own package, then of every other package the module's program reads (names'
//    qualifiers and spacing set aside). Found in the package's own files: the library wrote it. In another package's
//    only: a type of that package the row spells out. Nowhere: TypeScript printed it (an `any` it inferred, or a name it
//    could not resolve — the module's diagnostics say which).
//   node bench/any-origin.mjs [--in dir]   (the census's folder; writes origin.json and origin.txt beside it)
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseDeclarations } from "../ref/src/parse.ts";

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.dirname(here);
const require_ = createRequire(path.join(repo, "tooling/rx-language-server/package.json"));
const ts = require_("typescript");
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const dir = path.resolve(opt("--in") ?? path.join(here, ".out/census"));
const mods = JSON.parse(readFileSync(path.join(dir, "modules.json"), "utf8"));
const K = ts.SyntaxKind;

// ---- PLACE: what the checker reads at each place (compiler/src/check.rs, parse.rs; ref/src/check.ts, parse.ts)
export const COST = {
  bound: ["never", "a type parameter's bound or default: TypeScript's alone (project.rs's boundary check)"],
  alias: ["never", "an `export type`'s body: the checker skips JsDecl::Type; ty_undoes follows an alias only for a disposer"],
  "callback-param": ["never", "a callback's parameters: only `handler`/`draft` before them, and that it is a function"],
  "type-arg": ["never", "a type argument of a named type (`Component<any>`, `Record<string, any>`): ty_step does not open a name"],
  "callback-answer": ["one bit", "what a callback answers: whether it is a View (a render prop) or a value (ty_answers_value); `any` is neither"],
  "result-fn-answer": ["read", "what a function part of a result answers (shape_of, void_method, promise_method): `any` is a value, not io — looser"],
  "field-or-element": ["read", "a step of a parameter or result (ty_step, decl_prim, ty_list): `any` says nothing — stricter for a primitive, looser for io"],
  whole: ["read", "the whole type of a parameter, prop, result or const: `any` is not a callback, a list, a view or a primitive"],
  unparsed: ["?", "a row ref/src/parse.ts did not split"],
};
const FRAG = new Set([K.TypeReference, K.ImportType, K.PropertySignature, K.Parameter, K.FunctionType, K.ArrayType, K.IndexSignature, K.TupleType, K.TypeParameter, K.RestType, K.NamedTupleMember]);
function places(row, target = n => n.kind === K.AnyKeyword) {
  // (a method's row, `fn toaster.show(…)`, is parsed as a fn of its own: its object's row is elsewhere in the draft)
  let ds; try { ds = parseDeclarations(row.replace(/^(export\s+(?:(?:pure|server|client)\s+)*fn\s+[\w$]+)\.([\w$]+)/, "$1__$2")); } catch { return null; }
  const out = [];
  const scan = (text, role) => {
    if (!text) return;
    const src = role === "bound" ? `declare function f${text}(): void;` : role === "alias" ? `${text};` : `type __ = ${text};`;
    const sf = ts.createSourceFile("x.ts", src, ts.ScriptTarget.Latest, true);
    const inFn = f => { for (let p = f.parent; p && p.kind !== K.TypeAliasDeclaration; p = p.parent) if (p.kind === K.FunctionType) return true; return false; };
    const visit = n => {
      if (target(n, sf)) {
        let place = role === "bound" || role === "alias" ? role : "whole", c = n, frag;
        for (let p = n.parent; p && p.kind !== K.TypeAliasDeclaration && p.kind !== K.SourceFile; c = p, p = p.parent) {
          if (!frag && FRAG.has(p.kind)) frag = p.getText(sf);
          if (place !== "whole" && place !== "field-or-element") continue;
          if ((p.kind === K.FunctionType || p.kind === K.ConstructorType) && p.parameters.includes(c)) { place = "callback-param"; continue; }
          if ((p.kind === K.FunctionType || p.kind === K.ConstructorType) && p.type === c) { place = role === "result" && !inFn(p) ? "result-fn-answer" : "callback-answer"; continue; }
          if ((p.kind === K.TypeReference && p.typeArguments?.includes(c) && !/^(Array|ReadonlyArray|Promise)$/.test(p.typeName.getText(sf))) || (p.kind === K.ImportType && p.typeArguments?.includes(c))) { place = "type-arg"; continue; }
          if (p.kind === K.PropertySignature || p.kind === K.ArrayType || p.kind === K.TupleType || p.kind === K.IndexSignature || (p.kind === K.TypeReference && /^(Array|ReadonlyArray|Promise)$/.test(p.typeName.getText(sf)))) place = "field-or-element";
        }
        // the token before and after, for a second, smaller look
        const s = sf.text, a = n.getStart(sf), b = n.getEnd();
        out.push({ place, frag: frag ?? "any", mini: `${s.slice(Math.max(0, a - 12), a)}any${s.slice(b, b + 3)}` });
        if (n.kind !== K.AnyKeyword) return;   // (a part said by place: what is inside it is the place's)
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  };
  for (const d of ds) {
    if (d.kind === "type") scan(d.text, "alias");
    if (d.kind === "fn") { scan(d.tparams, "bound"); (d.ptypes ?? []).forEach(t => scan(t, "param")); scan(d.ret, "result"); }
    if (d.kind === "comp") { scan(d.tparams, "bound"); scan(d.propsType, "param"); for (const p of d.props) scan(p.type, "param"); }
    if (d.kind === "value") scan(d.type, "result");
  }
  return out;
}

// ---- ORIGIN
/** A type's text with what differs between a row and a declaration file set aside: comments, spacing, qualifiers
 *  (`import("pkg").`, `ns.`), `readonly`, a renamed parameter's `_`, `;`/`,` between members. */
const norm = s => s.replace(/'([^'"\\]*)'/g, '"$1"').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "").replace(/import\((["'])[^"']*\1\)\./g, "").replace(/\b[A-Za-z_$][\w$]*\./g, "").replace(/\breadonly\s+/g, "").replace(/\b([\w$]+)_(\??:)/g, "$1$2").replace(/[;,]/g, " ").replace(/\s+/g, " ").replace(/\s*([<>()[\]{}|&:=?])\s*/g, "$1");
const pkgOf = f => { const m = /.*node_modules\/((?:@[^/]+\/)?[^/.][^/]*)\//.exec(f.replaceAll("\\", "/")); return m ? m[1] : f.includes("/bench/.out/ws/tasks/") ? "(the task's own)" : /\/lib\.[\w.]+\.d\.ts$/.test(f) ? "(TypeScript's lib)" : "(other)"; };
const OPTIONS = { strict: true, skipLibCheck: true, noEmit: true, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve, jsxImportSource: "@solidjs/web", types: [], allowJs: true, customConditions: ["browser"] };
function programOf(m) {
  const entry = path.join(m.from, "__any_origin__.ts"), code = `import * as __m from ${JSON.stringify(m.spec)};\nexport { __m };\n`;
  const host = ts.createCompilerHost(OPTIONS);
  const read = host.readFile.bind(host), exists = host.fileExists.bind(host), getSf = host.getSourceFile.bind(host);
  host.readFile = f => f === entry ? code : read(f);
  host.fileExists = f => f === entry || exists(f);
  host.getSourceFile = (f, l) => f === entry ? ts.createSourceFile(f, code, l, true) : getSf(f, l);
  const program = ts.createProgram([entry], OPTIONS, host), ch = program.getTypeChecker();
  const mod = ch.getSymbolAtLocation(program.getSourceFile(entry).statements[0].moduleSpecifier);
  const own = mod?.declarations?.[0] ? pkgOf(mod.declarations[0].getSourceFile().fileName) : "?";
  const texts = new Map();   // package → normalized text of its declaration files
  const unresolved = [];
  for (const f of program.getSourceFiles()) {
    if (f.fileName === entry || /\/lib\.[\w.]+\.d\.ts$/.test(f.fileName)) continue;
    const p = pkgOf(f.fileName); texts.set(p, (texts.get(p) ?? "") + "\n" + norm(f.text));
    if (p === own) for (const d of program.getSemanticDiagnostics(f)) if ([2307, 2304, 2305, 2724, 2694, 2552].includes(d.code)) unresolved.push(`${path.basename(f.fileName)}: ${ts.flattenDiagnosticMessageText(d.messageText, " ").slice(0, 120)}`);
  }
  return { own, texts, unresolved };
}
function originOf(pr, x) {
  for (const probe of [norm(x.frag), norm(x.mini)]) {
    if (!/\bany\b/.test(probe)) continue;
    if (pr.texts.get(pr.own)?.includes(probe)) return "own";
    for (const [p, t] of pr.texts) if (p !== pr.own && t.includes(probe)) return `other:${p}`;
  }
  return pr.unresolved.length ? "printed-or-unresolved" : "printed";
}

// ---- the census, read
const rows = [], perModule = [];
for (const m of mods) {
  let causes; try { causes = JSON.parse(readFileSync(m.causes, "utf8")); } catch { continue; }
  const withAny = (causes.rows ?? []).filter(r => r.anys.some(a => a === "vendor-any"));
  if (!withAny.length) { perModule.push({ key: m.key, vendor: 0 }); continue; }
  let pr; try { pr = programOf(m); } catch (e) { pr = { own: "?", texts: new Map(), unresolved: [], error: String(e).slice(0, 200) }; }
  let vendor = 0;
  for (const r of withAny) {
    const n = r.anys.filter(a => a === "vendor-any").length; vendor += n;
    const ps = places(r.row) ?? [];
    // (a row whose `any`s the parse found more or fewer of than the draft counted: the extra are `unparsed`)
    const xs = ps.length >= n ? ps.slice(ps.length - n) : [...ps, ...Array(n - ps.length).fill({ place: "unparsed", frag: "any", mini: "any" })];
    for (const x of xs) rows.push({ module: m.key, pkg: pr.own, name: r.name, place: x.place, origin: originOf(pr, x), frag: x.frag.length > 160 ? x.frag.slice(0, 160) + "…" : x.frag });
  }
  perModule.push({ key: m.key, pkg: pr.own, vendor, unresolved: pr.unresolved, error: pr.error });
}
writeFileSync(path.join(dir, "origin.json"), JSON.stringify({ rows, perModule }, null, 1) + "\n");

// ---- the tables
const tally = f => { const t = {}; for (const r of rows) { const k = f(r); if (k !== undefined) t[k] = (t[k] ?? 0) + 1; } return Object.entries(t).sort((a, b) => b[1] - a[1]); };
const lines = [], line = (v, k, extra = "") => lines.push(`  ${String(v).padStart(5)}  ${k}${extra}`);
lines.push(`${rows.length} \`any\`s the drafts call the library's own, in ${new Set(rows.map(r => r.module + r.name)).size} rows of ${perModule.filter(m => m.vendor).length} modules (${mods.length} drafted)`);
lines.push("", "By place in the row — what the checker reads there:");
for (const [k, v] of tally(r => r.place)) line(v, k.padEnd(17), `${COST[k][0].padEnd(8)} ${COST[k][1]}`);
const cost = tally(r => COST[r.place][0]); lines.push("", "By what the checker reads of the place:"); for (const [k, v] of cost) line(v, k);
lines.push("", "By origin:");
for (const [k, v] of tally(r => r.origin.replace(/:.*/, ""))) line(v, k);
lines.push("", "Other packages whose declaration a row spells out:");
for (const [k, v] of tally(r => r.origin.startsWith("other:") ? r.origin.slice(6) : undefined)) line(v, k);
lines.push("", "By the module's package:");
for (const [k, v] of tally(r => r.pkg)) line(v, k);
lines.push("", "Place × origin:");
for (const [k, v] of tally(r => `${r.place} · ${r.origin.replace(/:.*/, "")}`)) line(v, k);
lines.push("", "The pieces that hold them, most frequent first (40):");
for (const [k, v] of tally(r => `${r.pkg} · ${r.place} · ${r.frag}`).slice(0, 40)) line(v, k);
const unres = perModule.filter(m => m.unresolved?.length);
lines.push("", `Modules whose package's declaration files name something TypeScript cannot resolve: ${unres.length}`);
for (const m of unres) lines.push(`  ${m.key}: ${m.unresolved.slice(0, 2).join(" · ")}${m.unresolved.length > 2 ? ` (+${m.unresolved.length - 2})` : ""}`);
// 09 MO-8x: the drafts as written — each type a draft writes again and again written once, as an alias of the file — beside
// the same drafts written out, which every count above is of (an alias is a shorter spelling: no `any` moves by it)
{
  const rowsOf = t => t.split("\n").map(l => l.replace(/\/\/.*$/, "").trim()).filter(Boolean);
  const anyIn = l => (l.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, "").replace(/^export\s+(?:(?:pure|server|client)\s+)*(?:fn|component|const|type|context|error)\s+[\w$.]+/, "").match(/\bany\b/g) ?? []).length;
  const by = mods.map(m => { let e = "", w = ""; try { e = readFileSync(m.draft, "utf8"); w = m.written ? readFileSync(m.written, "utf8") : e; } catch { /* not drafted */ } const er = rowsOf(e), wr = rowsOf(w); let aliases = 0; try { aliases = JSON.parse(readFileSync(m.causes, "utf8")).aliases?.length ?? 0; } catch { /* none */ } return { key: m.key, pkg: m.key.startsWith("@") ? m.key.split("/").slice(0, 2).join("/") : m.key.split(/[/:]/)[0], rows: [er.length, wr.length], bytes: [er.join("\n").length, wr.join("\n").length], any: [er.reduce((n, l) => n + anyIn(l), 0), wr.reduce((n, l) => n + anyIn(l), 0)], aliases }; });
  const sum = (xs, k, i) => xs.reduce((n, x) => n + x[k][i], 0);
  const say = (what, xs) => `  ${what}: ${xs.reduce((n, x) => n + x.aliases, 0)} aliases in ${xs.filter(x => x.aliases).length} of ${xs.length} drafts; rows ${sum(xs, "rows", 0)} → ${sum(xs, "rows", 1)}, characters of rows ${sum(xs, "bytes", 0)} → ${sum(xs, "bytes", 1)} (${(100 * (1 - sum(xs, "bytes", 1) / Math.max(1, sum(xs, "bytes", 0)))).toFixed(1)}% fewer), \`any\` written ${sum(xs, "any", 0)} → ${sum(xs, "any", 1)}`;
  lines.push("", "As written (09 MO-8x) — the counts above are of the drafts written out; written, each type a draft writes again and again is an alias of the file:");
  lines.push(say("all", by));
  for (const pkg of [...new Set(by.filter(x => x.aliases).map(x => x.pkg))].sort()) lines.push(say(pkg, by.filter(x => x.pkg === pkg)));
}
writeFileSync(path.join(dir, "origin.txt"), lines.join("\n") + "\n");
console.log(lines.join("\n"));

// ---- SOURCE: where the package ships the TypeScript it was built from — files under `src/` (not `.d.ts`), or the
// `sourcesContent` of its source maps — whether that source writes the same piece. A piece the source writes is the
// author's `any`: reading the source gives nothing more. One it does not write is where the declaration file lost a type.
import { readdirSync, statSync, realpathSync, existsSync } from "node:fs";
const ws = path.join(here, ".out/ws");
const sourceOf = new Map();
function sources(pkg) {
  if (sourceOf.has(pkg)) return sourceOf.get(pkg);
  let root; try { root = realpathSync(path.join(ws, "node_modules", pkg)); } catch { sourceOf.set(pkg, null); return null; }
  const texts = [], kinds = new Set();
  const walk = (d, depth) => { if (depth > 8) return; for (const e of readdirSync(d, { withFileTypes: true })) { if (e.name === "node_modules") continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p, depth + 1); else if (/\.(ts|tsx|mts)$/.test(e.name) && !/\.d\.[mc]?ts$/.test(e.name) && /[\\/]src[\\/]/.test(p.slice(root.length))) { texts.push(readFileSync(p, "utf8")); kinds.add("src/"); } else if (/\.map$/.test(e.name)) { try { const j = JSON.parse(readFileSync(p, "utf8")); (j.sourcesContent ?? []).forEach((c, i) => { if (c && /\.(ts|tsx|mts)$/.test(j.sources?.[i] ?? "")) { texts.push(c); kinds.add("sourcesContent"); } }); } catch { /* not a map */ } } } };
  walk(root, 0);
  const r = texts.length ? { text: norm(texts.join("\n")), kinds: [...kinds] } : null;
  sourceOf.set(pkg, r); return r;
}
const src = { none: 0, same: 0, differs: 0 }, byPkg = {}, differs = [];
for (const r of rows) {
  if (r.origin !== "own" || r.pkg.startsWith("(")) continue;
  const s = sources(r.pkg), b = (byPkg[r.pkg] ??= { anys: 0, same: 0, differs: 0, kinds: s?.kinds ?? [] }); b.anys++;
  if (!s) { src.none++; continue; }
  if (s.text.includes(norm(r.frag))) { src.same++; b.same++; } else { src.differs++; b.differs++; differs.push(`${r.pkg} · ${r.name} · ${r.place} · ${r.frag}`); }
}
const sl = ["", `Source (the \`any\`s found in the package's own declaration files): ${src.same + src.differs + src.none}; the package ships no TypeScript source: ${src.none}; the source writes the same piece: ${src.same}; it does not: ${src.differs}`];
for (const [p, b] of Object.entries(byPkg).sort((a, b) => b[1].anys - a[1].anys)) sl.push(`  ${p}: ${b.anys} — ${b.kinds.length ? `${b.kinds.join(" + ")}: ${b.same} the same, ${b.differs} not` : "no source in the package"}`);
if (differs.length) { sl.push("", "  not in the source as written:"); for (const d of [...new Set(differs)]) sl.push(`    ${d}`); }
writeFileSync(path.join(dir, "origin.txt"), lines.join("\n") + "\n" + sl.join("\n") + "\n");
console.log(sl.join("\n"));

// ---- SOURCE at the release's tag (`--tags dir`: checkouts of the packages' repositories at the git tag of the version
// installed, a folder each). A package's folder in the checkout is the one whose package.json has the package's name
// and the installed version; its source is the TypeScript under it (not `.d.ts`), and each `any` found in the package's
// declaration files is looked for there as above.
const tagsAt = opt("--tags");
if (tagsAt) {
  const pkgJsons = []; const walkPj = (d, depth) => { if (depth > 5) return; for (const e of readdirSync(d, { withFileTypes: true })) { if (e.name === "node_modules" || e.name.startsWith(".")) continue; const p = path.join(d, e.name); if (e.isDirectory()) walkPj(p, depth + 1); else if (e.name === "package.json") pkgJsons.push(p); } };
  walkPj(path.resolve(tagsAt), 0);
  const at = new Map(); for (const p of pkgJsons) { try { const j = JSON.parse(readFileSync(p, "utf8")); if (j.name) at.set(`${j.name}@${j.version}`, path.dirname(p)); } catch { /* not one */ } }
  const tl = ["", "Source at the release's tag (a checkout of each repository at the git tag of the installed version; `--tags`):"]; const tdiff = [];
  for (const [pkg, b] of Object.entries(byPkg).sort((a, b) => b[1].anys - a[1].anys)) {
    if (b.kinds.length) continue;
    let v; try { v = JSON.parse(readFileSync(path.join(ws, "node_modules", pkg, "package.json"), "utf8")).version; } catch { continue; }
    const d = at.get(`${pkg}@${v}`); if (!d) { tl.push(`  ${pkg}@${v}: ${b.anys} — no checkout at its tag`); continue; }
    const texts = []; const walk = (x, depth) => { if (depth > 8) return; for (const e of readdirSync(x, { withFileTypes: true })) { if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue; const p = path.join(x, e.name); if (e.isDirectory()) walk(p, depth + 1); else if (/\.(ts|tsx|mts)$/.test(e.name) && !/\.(test|spec)\.|\.d\.[mc]?ts$/.test(e.name)) texts.push(readFileSync(p, "utf8")); } };
    walk(d, 0); const t = norm(texts.join("\n"));
    let same = 0, not = 0; for (const r of rows) if (r.pkg === pkg && r.origin === "own") { if (t.includes(norm(r.frag))) same++; else { not++; tdiff.push(`${pkg} · ${r.name} · ${r.place} · ${r.frag}`); } }
    tl.push(`  ${pkg}@${v} (${path.relative(path.resolve(tagsAt), d)}): ${b.anys} — ${same} written the same in the source, ${not} not`);
  }
  if (tdiff.length) { tl.push("", "  not in the tag's source as written:"); for (const x of [...new Set(tdiff)]) tl.push(`    ${x}`); }
  writeFileSync(path.join(dir, "origin.txt"), readFileSync(path.join(dir, "origin.txt"), "utf8") + tl.join("\n") + "\n");
  console.log(tl.join("\n"));
}

// ---- BY PLACE: the parts a draft says by their place in the library's declaration (`Parameters<typeof import(…)>`,
// `ReturnType<…>`): a type TypeScript holds and the checker cannot read into, by where they stand.
const byPlace = n => n.kind === K.TypeReference && /^(Parameters|ReturnType|Awaited|NonNullable)$/.test(n.typeName.getText()) && /\b(Parameters|ReturnType)</.test(n.getText());
const bp = {}, bpEx = {};
for (const m of mods) {
  let causes; try { causes = JSON.parse(readFileSync(m.causes, "utf8")); } catch { continue; }
  for (const r of causes.rows ?? []) { if (!/\b(Parameters|ReturnType)</.test(r.row)) continue; for (const x of places(r.row, byPlace) ?? []) { bp[x.place] = (bp[x.place] ?? 0) + 1; (bpEx[x.place] ??= []).push(`${m.key} · ${r.name}`); } }
}
const bl = ["", `Parts said by place (09 MO-8m), by where they stand: ${Object.values(bp).reduce((a, b) => a + b, 0)}`];
for (const [k, v] of Object.entries(bp).sort((a, b) => b[1] - a[1])) bl.push(`  ${String(v).padStart(5)}  ${k.padEnd(17)} ${COST[k]?.[0] ?? ""}   e.g. ${[...new Set(bpEx[k])].slice(0, 4).join(", ")}`);
writeFileSync(path.join(dir, "origin.txt"), readFileSync(path.join(dir, "origin.txt"), "utf8") + bl.join("\n") + "\n");
writeFileSync(path.join(dir, "byplace.json"), JSON.stringify(bpEx, null, 1) + "\n");
console.log(bl.join("\n"));
