// CP-5: the Rust crate (compiler/) against ref/ on every program the scenarios and examples hold. For each program both
// sides load the modules, parse, check, print signatures and build the resolved model (CP-6); the two must agree exactly.
// With --lower (CP-1): every program the checker accepts is also compiled by both — ref/compile/emit.ts then Solid's
// transform(), the crate's emit.rs then compile_program() — for the universal, dom and ssr targets, with a scenario table's
// handler rows as compile/run.ts passes them; the modules must agree (comments dropped, both printed by esbuild), and the
// crate's source maps onto .rx must hold (checkMap, CP-1c).
// With --project (TY-1c, CP-8): every program the checker accepts is projected to TSX by both — types/project.ts and the
// crate's project.rs — and the files must be the same text, line for line; each of the crate's mappings must join the same
// text on both sides.
// With --spa (08 CN-3d): every program is checked as a client-only build, on both sides.
// With --whole-program (E-5a): every program is checked as the whole program, on both sides.
// With --text, over the same programs with characters of several bytes in them, and broken ones (below).
// Usage: node --experimental-strip-types ref/crate.ts [--lower|--project|--spa|--whole-program] [--text] [filter]     (builds compiler/ with cargo first; VERBOSE=1 lists each;
//        DUMP=dir writes the first differing module of a failure, both sides, to dir/{ref,crate}.<target>.js)
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { parseScenario } from "./src/scenario.ts";
import { loadModules, joinPath } from "./src/modules.ts";
import { checkModules } from "./src/check.ts";
import { printSignature } from "./src/signature.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const lowerMode = process.argv.includes("--lower");
const projectMode = process.argv.includes("--project");
const spaMode = process.argv.includes("--spa");
const textMode = process.argv.includes("--text");
const wholeMode = process.argv.includes("--whole-program");   // E-5a: every program checked as the whole program, on both sides   // 08 CN-3d: every program checked as a client-only build, on both sides
const filter = process.argv.slice(2).find(a => !a.startsWith("--"));
const verbose = !!process.env.VERBOSE;
type Req = { id: string; entry: string; files: Record<string, string>; extra?: string[]; spa?: boolean; whole?: boolean; hosts?: string[]; conformance: boolean };   // conformance: a scenario's program (CP-4c); an example is an app's   // spa: 08 CN-3d
const reqs: Req[] = [];

/** A program: its entry and every file the loader reads for it (MO-8 `.d.rx`, MO-9 signatures, imported modules). */
function add(id: string, entry: string, read: (p: string) => string | undefined, extra?: string[], spa?: boolean, whole?: boolean, hosts?: string[], conformance = true) {
  if (filter && !id.includes(filter)) return;
  const files: Record<string, string> = {};
  const rec = (p: string) => { const s = read(p); if (s !== undefined) files[p] = s; return s; };
  try { loadModules(entry, rec, conformance); } catch { /* the files read up to the error are what both sides see */ }
  reqs.push({ id, entry, files, conformance, ...(extra ? { extra } : {}), ...(spa || spaMode ? { spa: true } : {}), ...(whole || wholeMode ? { whole: true } : {}), ...(hosts?.length ? { hosts: hosts.map(h => joinPath(entry, h)) } : {}) });
}
const disk = (p: string) => existsSync(p) && statSync(p).isFile() ? readFileSync(p, "utf8") : undefined;

const sdir = join(root, "scenarios");
for (const f of readdirSync(sdir).filter(f => f.endsWith(".md") && f !== "TEMPLATE.md").sort()) {
  const sc = parseScenario(f.replace(/\.md$/, ""), readFileSync(join(sdir, f), "utf8"), sdir);
  const read = (src: string) => (p: string) => p === sc.entry ? src : sc.modules.get(p) ?? disk(p);
  if (lowerMode) {                                                     // what compile/run.ts compiles: each table, with its handler rows
    const base = sc.tables.find(t => t.title === "Frames");
    for (const t of sc.tables) {
      let rows = t.rows;
      if (t !== base && base && rows.length && rows[0].instant > 0) rows = [...base.rows.filter(r => r.instant < rows[0].instant), ...rows];
      add(`${sc.name} ${t.title}`, sc.entry, read(t.program ?? sc.program), rows.filter(r => r.action.startsWith("handler")).map(r => r.action.slice(7)));
    }
    if (!sc.tables.length && sc.program) add(`${sc.name} Program`, sc.entry, read(sc.program), []);
    sc.accepted.forEach((a, i) => add(`${sc.name} accept #${i}`, sc.entry, read(a.program), []));
    continue;
  }
  if (sc.program) add(`${sc.name} Program`, sc.entry, read(sc.program));
  for (const t of sc.tables) if (t.program) add(`${sc.name} ${t.title}`, sc.entry, read(t.program));
  sc.rejected.forEach((r, i) => add(`${sc.name} ${r.types ? "types" : r.warn ? "warn" : "reject"}(${r.rule}) #${i}`, sc.entry, read(r.program), undefined, r.spa, r.whole, r.hosts, !r.app));
  sc.accepted.forEach((a, i) => add(`${sc.name} accept${a.whole ? "(whole-program)" : ""} #${i}`, sc.entry, read(a.program), undefined, false, a.whole));
}
const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".rx") && !e.name.endsWith(".d.rx") ? [join(d, e.name)] : []);
for (const f of walk(join(root, "examples")).sort()) add(`examples/${f.slice(join(root, "examples").length + 1)}`, f, disk, lowerMode ? [] : undefined, false, false, undefined, false);

const plain = (x: unknown) => JSON.parse(JSON.stringify(x, (_k, v) => v instanceof Map ? Object.fromEntries(v) : v instanceof Set ? [...v] : v));
function refOf(r: Req) {
  const read = (p: string) => r.files[p];
  let set; try { set = loadModules(r.entry, read, r.conformance); } catch (e) { return { error: (e as Error).message }; }
  let checked; try { checked = checkModules(set, !!r.spa, !!r.whole, r.hosts ?? []); } catch (e) { return { throws: (e as Error).message }; }
  return plain({
    order: set.order,
    asts: Object.fromEntries(set.order.map(p => [p, set.programs.get(p)])),
    diags: checked.diags,
    advice: checked.advice,
    sigs: Object.fromEntries(set.order.map(p => [p, printSignature(checked.sigs.get(p)!)])),
    models: Object.fromEntries(checked.models),
  });
}
/** The first place two JSON values differ, as a path. */
function diff(a: any, b: any, at = ""): string | null {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object" || Array.isArray(a) !== Array.isArray(b))
    return `${at || "/"}: ref ${JSON.stringify(a)?.slice(0, 200)} ≠ crate ${JSON.stringify(b)?.slice(0, 200)}`;
  const keys = Array.isArray(a) ? [...Array(Math.max(a.length, b.length)).keys()] : [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const k of keys) { const d = diff(a[k as any], b[k as any], `${at}/${k}`); if (d) return d; }
  return null;
}

// --text: every program again with characters of two, three and four bytes in it (a string's text, a comment, CRLF line
// ends), so that an offset counted in the wrong unit shows; and, when checking, broken in two places each — cut short, or
// such a character put between two tokens — where the two must refuse it with one message, on one line. The places are
// drawn from a fixed seed. A program is one that parses no more than the original did: what is compared is the two sides.
if (textMode) {
  let seed = 7; const pick = (n: number) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
  const INS = ["é", "漢", "😀", "e\u0301", "\ufeff", "\u2028", "\u00a0", "\u0085", "é\n", "\"é", "`漢", "/*é", "//é\n", "<é", "\r\n"];
  const own = reqs.splice(0);
  for (const r of own) {
    const entry = r.files[r.entry]; if (entry === undefined) continue;
    const wide = (t: string) => t.replace(/(from\s*|import\s*|fetch\w*\(\s*)?"([^"\n\\]*)"/g, (m, kept, x) => kept ? m : `"é${x}漢😀"`).replace(/\/\/ /g, "// 😀é ");
    const files = (f: (t: string) => string) => ({ ...r.files, [r.entry]: f(entry) });
    reqs.push({ ...r, id: `${r.id} (wide)`, files: files(wide) }, { ...r, id: `${r.id} (crlf)`, files: files(t => wide(t).replace(/\n/g, "\r\n")) });
    if (lowerMode || projectMode) continue;
    const chars = [...entry]; const cut = chars.slice(0, pick(chars.length + 1)).join("");
    const gaps = [0, entry.length]; for (let i = 1; i < entry.length; i++) if (!/^[\w$]{2}$/.test(entry.slice(i - 1, i + 1)) && (entry.slice(0, i) as any).isWellFormed()) gaps.push(i);
    const at = gaps[pick(gaps.length)], ins = INS[pick(INS.length)];
    reqs.push({ ...r, id: `${r.id} (cut ${cut.length})`, files: files(() => cut + ["é", "😀\n", "漢 ", "\"é"][pick(4)]) }, { ...r, id: `${r.id} (${JSON.stringify(ins)} at ${at})`, files: files(t => t.slice(0, at) + ins + t.slice(at)) });
  }
}
execFileSync("cargo", ["build", "--release", "--quiet"], { cwd: join(root, "compiler"), stdio: "inherit" });
if (lowerMode) process.exit(await lower());
if (projectMode) process.exit(await project());
const out = execFileSync(join(root, "compiler/target/release/rxc"), ["conform"], { input: JSON.stringify(reqs), maxBuffer: 1 << 30 }).toString();
const got = new Map((JSON.parse(out) as any[]).map(x => [x.id, x]));
let bad = 0;
for (const r of reqs) {
  const want = refOf(r); const { id: _, spans, ...have } = got.get(r.id) ?? {};
  const broken = textMode && / at \d+\)$/.test(r.id);   // (a line break put after a declaration's word: its span starts on the line before its name's)
  const d = diff(want, have) ?? (!broken && spans && Object.keys(spans).length ? `spans (CP-8): ${JSON.stringify(spans).slice(0, 400)}` : null);
  if (d) { bad++; console.log(`FAIL ${r.id}\n  ${d}`); } else if (verbose) console.log(`ok   ${r.id}`);
}
console.log(`${reqs.length - bad}/${reqs.length} programs: the crate agrees with ref/ (AST, diagnostics, signatures, resolved model), and its spans hold (CP-8)`);
process.exit(bad ? 1 : 0);

/** --lower: ref/compile's modules against the crate's, through Solid's compiler for each target. */
async function lower(): Promise<number> {
  const { compileModules, CompileError } = await import("./compile/emit.ts");
  const { lowerViews, STRING_RENDERER } = await import("./compile/jsx.ts");
  const { transformSync } = await import("esbuild");
  const { parseStmts } = await import("./src/parse.ts");
  const norm = (code: string) => { try { return transformSync(code, { loader: "js", format: "esm", legalComments: "none" }).code; } catch (e) { return `esbuild: ${(e as Error).message}\n${code}`; } };
  const out = execFileSync(join(root, "compiler/target/release/rxc"), ["lower"], { input: JSON.stringify(reqs.map(r => ({ ...r, renderer: STRING_RENDERER, maps: true }))), maxBuffer: 1 << 30 }).toString();
  const got = new Map((JSON.parse(out) as any[]).map(x => [x.id, x]));
  let bad = 0, compiled = 0, modules = 0, mapped = 0;
  for (const r of reqs) {
    const have = got.get(r.id);
    let set: ReturnType<typeof loadModules> | undefined;
    let want: any;
    try {
      set = loadModules(r.entry, p => r.files[p], r.conformance);
      if (checkModules(set).diags.length) want = { refused: true };
      else {
        const extra = (r.extra ?? []).map(s => { try { return parseStmts(s); } catch { return []; } });
        let c; try { c = compileModules(set, { extraStmts: extra }); } catch (e) { if (!(e instanceof CompileError)) throw e; c = null; want = { compileError: (e as Error).message }; }
        if (c) {
          const files: Record<string, Record<string, string>> = {};
          for (const [k, target] of [["universal", "universal"], ["dom", "dom"], ["ssr", "ssr"]] as const) {
            for (const [name, code] of lowerViews(c.files, target)) (files[name] ??= {})[k] = code;
          }
          want = { entry: c.entry, css: c.css, files };
        }
      }
    } catch (e) { want = { error: (e as Error).message }; }
    let d: string | null = null;
    if (want.files && have?.files) {
      compiled++;
      if (want.entry !== have.entry) d = `entry: ref ${want.entry} ≠ crate ${have.entry}`;
      else if (want.css !== have.css) d = `css: ref ${JSON.stringify(want.css).slice(0, 300)} ≠ crate ${JSON.stringify(have.css).slice(0, 300)}`;
      else for (const name of new Set([...Object.keys(want.files), ...Object.keys(have.files)])) {
        modules++;
        for (const k of ["universal", "dom", "ssr"]) {
          const a = want.files[name]?.[k], b = have.files[name]?.[k];
          if (typeof b !== "string") { d = `${name} ${k}: crate ${JSON.stringify(b)}`; break; }
          const [x, y] = [norm(a), norm(b)];
          if (x !== y && process.env.DUMP) { const { writeFileSync } = await import("node:fs"); writeFileSync(`${process.env.DUMP}/ref.${k}.js`, x); writeFileSync(`${process.env.DUMP}/crate.${k}.js`, y); }
          if (x !== y) { const xl = x.split("\n"), yl = y.split("\n"); const i = xl.findIndex((l, j) => l !== yl[j]); d = `${name} ${k} line ${i + 1}:\n    ref:   ${xl[i]}\n    crate: ${yl[i]}`; break; }
        }
        if (d) break;
      }
      if (!d) for (const name of Object.keys(have.files)) {
        const path = name === "main.mjs" ? set!.entry : set!.order[+name.slice(1, -4)];
        for (const k of ["universal", "dom", "ssr"]) { d = checkMap(have.files[name][k], have.maps?.[name]?.[k], set!.programs.get(path)!, r.files[path] ?? "", k); if (d) { d = `${name} ${k} map: ${d}`; break; } mapped++; }
        if (d) break;
      }
    } else d = diff(want, (({ id: _, ...x }) => x)(have ?? {}));
    if (d) { bad++; console.log(`FAIL ${r.id}\n  ${d}`); } else if (verbose) console.log(`ok   ${r.id}`);
  }
  console.log(`${reqs.length - bad}/${reqs.length} programs lowered alike (${compiled} compiled, ${modules} modules × universal, dom, ssr; ${mapped} source maps onto .rx checked)`);
  return bad ? 1 : 0;
}

/** Base64 VLQ `mappings` → [generated line, generated column, source line] (0-based). */
function decodeMappings(mappings: string): [number, number, number][] {
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const out: [number, number, number][] = []; let srcLine = 0;
  mappings.split(";").forEach((line, gl) => {
    let gc = 0;
    for (const seg of line.split(",").filter(Boolean)) {
      const v: number[] = []; let shift = 0, n = 0;
      for (const ch of seg) { const d = B64.indexOf(ch); n += (d & 31) << shift; if (d & 32) shift += 5; else { v.push(n & 1 ? -(n >>> 1) : n >>> 1); n = 0; shift = 0; } }
      gc += v[0]; if (v.length >= 4) { srcLine += v[2]; out.push([gl, gc, srcLine]); }
    }
  });
  return out;
}
/** CP-1c: a module's source map onto its `.rx`. Every mapped line is the module's; each source or equation declared once
 *  is declared (`const v$x`, `const [v$x, w$x]`) at a position mapped to its line; on dom, every element's line is mapped. */
function checkMap(code: string, map: string | undefined, prog: any, text: string, target: string): string | null {
  if (!map) return "none";
  const m = JSON.parse(map); const nlines = text.split("\n").length;
  if (m.sourcesContent?.[0] !== text) return "sourcesContent is not the module's text";
  const toks = decodeMappings(m.mappings);
  const outside = toks.find(t => t[2] < 0 || t[2] >= nlines); if (outside) return `line ${outside[2] + 1} is past the module's ${nlines}`;
  const decls: { name: string; line: number }[] = []; const els = new Set<number>();
  const markup = (ms: any[]) => { for (const x of ms ?? []) { if (x.k === "el" && x.tag && x.line) els.add(x.line); for (const v of Object.values(x)) if (Array.isArray(v) && v.length && typeof v[0] === "object" && v[0]?.k) markup(v as any[]); if (Array.isArray(x.decls)) walk(x.decls); } };
  const walk = (ds: any[]) => { for (const x of ds) { if (x.k === "source" || x.k === "eq") decls.push(x); if (x.decls) walk(x.decls); if (x.view) markup(x.view); } };
  walk(prog.decls);
  const lines = code.split("\n"); let checked = 0;
  for (const dcl of decls) {
    if (decls.filter(x => x.name === dcl.name).length > 1) continue;
    const re = new RegExp(`(?:const|let|var)\\s+\\[?\\s*v\\$${dcl.name.replace(/\$/g, "\\$")}\\b`, "g");
    const hits = [...code.matchAll(re)]; if (hits.length !== 1) continue;
    const before = code.slice(0, hits[0].index!); const gl = before.split("\n").length - 1; const gc = gl ? before.length - before.lastIndexOf("\n") - 1 : before.length;
    const at = toks.filter(t => t[0] === gl && t[1] <= gc).pop();
    if (!at) return `${dcl.name} (line ${dcl.line}): no mapping at ${gl + 1}:${gc + 1} — ${lines[gl]?.trim().slice(0, 80)}`;
    if (at[2] + 1 !== dcl.line) return `${dcl.name} maps to line ${at[2] + 1}, declared on ${dcl.line} — ${lines[gl]?.trim().slice(0, 80)}`;
    checked++;
  }
  if (target === "dom") { const seen = new Set(toks.map(t => t[2] + 1)); const miss = [...els].find(l => !seen.has(l)); if (miss) return `element on line ${miss} is not mapped`; }
  return null;
}

/** --project: types/project.ts's projection against the crate's, and the crate's mappings onto the `.rx`. */
async function project(): Promise<number> {
  const { projectModules, PRELUDE } = await import("./types/project.ts");
  const out = JSON.parse(execFileSync(join(root, "compiler/target/release/rxc"), ["project"], { input: JSON.stringify(reqs), maxBuffer: 1 << 30 }).toString());
  const got = new Map((out.programs as any[]).map(x => [x.id, x]));
  let bad = 0, n = 0, maps = 0, files = 0;
  if (out.prelude !== PRELUDE) { bad++; console.log("FAIL prelude: compiler/src/prelude.ts is not types/project.ts's PRELUDE"); }
  for (const r of reqs) {
    const read = (p: string) => r.files[p];
    let set; try { set = loadModules(r.entry, read, r.conformance); } catch { continue; }
    if (checkModules(set).diags.length) continue;                     // the checker refused it: nothing is projected (types/run.ts)
    n++;
    const want = projectModules(set).map(p => ({ path: p.path, rx: p.rx, code: p.code, lines: p.lines }));
    const have = got.get(r.id);
    const d = have?.files ? diff(want, have.files.map((f: any) => ({ path: f.path, rx: f.rx, code: f.code, lines: f.lines })))
      ?? (have.files.some((f: any) => f.unverified) ? `mappings that do not hold: ${have.files.filter((f: any) => f.unverified).map((f: any) => `${f.path} ${f.unverified}`).join(", ")}` : null)
      : `crate: ${JSON.stringify(have).slice(0, 300)}`;
    if (d) { bad++; console.log(`FAIL ${r.id}\n  ${d}`); continue; }
    for (const f of have.files) { files++; maps += f.mappings.length; }
    if (verbose) console.log(`ok   ${r.id}`);
  }
  console.log(`${n - bad}/${n} accepted programs: the crate's projection is types/project.ts's (${files} files, ${maps} mappings onto .rx, all holding)`);
  return bad ? 1 : 0;
}
