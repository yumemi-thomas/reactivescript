// Parses scenarios/*.md (the Markdown is the source) and runs them against the runtime.
import { parseProgram, parseStmts, ParseError } from "./parse.ts";
import { Runtime, RuleError, CheckError } from "./runtime.ts";

type Row = { instant: number; action: string; frame: string; effects: string[] };
type Table = { title: string; program: string | null; rows: Row[] };
type Rejected = { rule: string; program: string; handlers: string[]; warn: boolean; types?: boolean; spa?: boolean; whole?: boolean; hosts?: string[]; app?: boolean };   // app: checked as an app's program, not a conformance build's (CP-4c), an `-- app` line   // whole: checked as the whole program (E-5a), a `-- whole-program` line   // spa: checked as a client-only build (08 CN-3d), a `-- spa` line   // types: refused by the type layer (TY, types/run.ts)
export type Divergence = { table: string; instant: number; frame: string; effects?: string[]; runner: "oracle" | "server" | "hydrated"; ruled?: true };   // effects: the effect log Solid gives at that instant, when it differs too   // what Solid 2.0 shows where the spec rules otherwise (the client's, or the server render's)
export type Scenario = { name: string; program: string; tables: Table[]; rejected: Rejected[]; divergences: Divergence[];
  accepted: { program: string; whole: boolean; advice?: string; untyped?: boolean }[];   // untyped: TypeScript refuses it (a `-- untyped` line; types/run.ts); `-- accept: whole-program` blocks: programs the checker accepts only so (E-5a); `-- accept`: per module
  entry: string; modules: Map<string, string>;
  server: Row[];     // 10: `## Server frames` — what a browser shows from the server's stream (ref/ssr/run.ts only)
  before: Row[];
  css: string | null };   // 07 §6b: `## Scoped CSS` — the compiled stylesheet, each scope hash written h1, h2… in order (ref/compile/run.ts only)   // 10 SV-3e: `## Before hydration` — user events on the served page, then `hydrate` (ref/ssr/run.ts only)   // 09: the entry's module key, and the `## Modules` fences (`-- module: ./lib.rx`) by key

const strip = (s: string) => s.replace(/`/g, "").trim();

import { readFileSync, existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { loadModules, joinPath, type ModuleSet } from "./modules.ts";
import { checkModules, type ModSig, type ExportSig } from "./check.ts";
import { printSignature, parseSignature } from "./signature.ts";

/** MO-9 / CN-4b: each module of a program checked against its imports' printed `.d.rx` — read back in place of their bodies —
 *  gets the verdicts it gets against the bodies, and the text reads back as the signature it was printed from. Null: it holds. */
export function signaturesInPlace(set: ModuleSet): string | null {
  if (set.order.length < 2) return null;
  let full: ReturnType<typeof checkModules>; try { full = checkModules(set); } catch { return null; }
  const norm = (x: ExportSig) => JSON.stringify(x, (k, v) => v instanceof Set ? [...v].sort() : Array.isArray(v) && v.every(y => typeof y === "string") && k !== "params" && k !== "roots" ? [...v].sort() : k === "own" ? [...new Set((v as { cls: string }[]).map(o => o.cls))].sort() : v);
  const back = new Map<string, ModSig>();
  for (const [path, sig] of full.sigs) {
    if (!set.order.includes(path)) continue;
    const text = printSignature(sig); const read = parseSignature(text, path); back.set(path, read);
    for (const [n, x] of sig.exports) { const y = read.exports.get(n); if (!y || norm(x) !== norm(y)) return `${path.split("/").pop()}: ${n} reads back as ${y ? norm(y) : "nothing"}, printed from ${norm(x)}`; }
  }
  const key = (d: { code: string; rule: string; line: number; file?: string }) => `${d.file ?? set.entry}:${d.line} ${d.code} (${d.rule})`;
  for (const path of set.order) {                                       // each module alone, its dependencies by signature
    const alone: ModuleSet = { ...set, programs: new Map([[path, set.programs.get(path)!]]), order: [path], diags: set.diags.filter(d => (d.file ?? set.entry) === path), signatures: new Map([...(set.signatures ?? []), ...[...back].filter(([p]) => p !== path)]) };
    const want = [...new Set(full.diags.filter(d => (d.file ?? set.entry) === path).map(key))].sort().join("; ");
    const got = [...new Set(checkModules(alone).diags.filter(d => (d.file ?? set.entry) === path).map(key))].sort().join("; ");
    if (want !== got) return `${path.split("/").pop()} against its imports' .d.rx: ${got || "no diagnostic"}; against their bodies: ${want || "no diagnostic"}`;
  }
  return null;
}
/** The module set for one of a scenario's programs: the entry is `src`; its `.rx` imports are the `## Modules` fences, else files
 *  beside the entry (a `file:` program). */
export function moduleSet(sc: Scenario, src: string, conformance = true): ModuleSet {
  return loadModules(sc.entry, p => p === sc.entry ? src : sc.modules.get(p) ?? (existsSync(p) ? readFileSync(p, "utf8") : undefined), conformance);   // CP-4c: the runners' is a conformance build
}
/** Headings that are prose, and hold no block. */
const PROSE = ["What writing it found"];
/** A scenario, read whole: a heading, a block, a line of a block, a column or a row that no runner reads is refused — what
 *  is not read is not run, and nothing said so. */
export function parseScenario(name: string, md: string, baseDir = "."): Scenario {
  const refused: string[] = []; const refuse = (where: string, what: string) => { refused.push(`${name}, ${where}: ${what}`); };
  const parts = md.split(/^## /m);
  const sections = parts.slice(1).map(s => { const nl = s.indexOf("\n"); return { title: (nl < 0 ? s : s.slice(0, nl)).trim(), body: nl < 0 ? "" : s.slice(nl + 1) }; });
  /** The section's fenced blocks; a `text` one is an illustration, read by nothing. `rest`: its lines outside any fence. */
  const blocks = (title: string, b: string): { fences: string[]; rest: string[] } => {
    const fences: string[] = [], rest: string[] = []; let open: { lang: string; lines: string[] } | null = null;
    for (const l of b.split("\n")) {
      if (open) { if (/^```\s*$/.test(l)) { if (open.lang !== "text") fences.push(open.lines.map(x => x + "\n").join("")); open = null; } else open.lines.push(l); }
      else if (l.startsWith("```")) open = { lang: l.slice(3).trim(), lines: [] };
      else { if (/^\s+```/.test(l)) refuse(title, "a fence that is indented"); rest.push(l); }
    }
    if (open) refuse(title, "a fence that is not closed");
    return { fences, rest };
  };
  const COLUMNS = ["instant", "action", "frame", "effect", "note"];       // note: a remark, read by nothing
  const table = (title: string, rest: string[]): Row[] => {
    const at = rest.findIndex(l => l.trim().startsWith("|")); let end = at; while (end >= 0 && end < rest.length && rest[end].trim().startsWith("|")) end++;
    const lines = at < 0 ? [] : rest.slice(at, end);
    if (at >= 0 && rest.slice(end).some(l => l.trim().startsWith("|"))) refuse(title, "two tables (or one with a line that is not a row in it)");
    if (lines.length < 3) { refuse(title, "a table with no row"); return []; }
    const cellsOf = (l: string) => l.trim().replace(/\|$/, "").split("|").map(strip);
    const head = cellsOf(lines[0]).map(s => s.toLowerCase());
    for (const c of head.slice(1)) if (!COLUMNS.includes(c)) refuse(title, `a column nothing reads: ${c}`);
    for (const c of COLUMNS.slice(0, 3)) if (!head.includes(c)) refuse(title, `a table with no ${c} column`);
    if (!/^[\s|:-]+$/.test(lines[1])) refuse(title, "a table with no line of dashes under its header");
    const col = (n: string) => head.indexOf(n); let last = -1;
    return lines.slice(2).map(l => {
      const cells = cellsOf(l); const instant = Number(cells[col("instant")] || NaN);
      if (cells.length !== head.length) refuse(title, `a row of ${cells.length - 1} cells under ${head.length - 1} columns: ${l.trim()}`);
      if (!Number.isInteger(instant) || instant <= last) refuse(title, `an instant that is not after the row before: ${l.trim()}`); last = instant;
      const eff = col("effect") >= 0 ? cells[col("effect")] ?? "" : "—";
      return { instant, action: cells[col("action")] ?? "", frame: cells[col("frame")] ?? "",
        effects: eff === "—" || eff === "" ? [] : eff.split(";").map(s => s.trim()) };
    });
  };
  /** A block's program without its directives — the lines that begin with `--` (a style sheet's `--x: …` is indented). */
  const directives = (title: string, lines: string[], known: RegExp): { program: string; said: string[] } => {
    const said: string[] = []; const program: string[] = [];
    for (const l of lines) {
      if (/^\s+--\s/.test(l) || (l.startsWith("--") && !known.test(l))) refuse(title, `a line no runner knows: ${l.trim()}`);
      else if (l.startsWith("--")) said.push(l.trim().slice(3)); else program.push(l);
    }
    return { program: program.join("\n"), said };
  };
  const NONE = /^$/;
  let program = ""; let entry = "main.rx"; const modules = new Map<string, string>();
  const tables: Table[] = []; const rejected: Rejected[] = []; const accepted: Scenario["accepted"] = []; const divergences: Divergence[] = []; let server: Row[] = []; let before: Row[] = []; let css: string | null = null;
  if (blocks("before the first heading", parts[0]).fences.length) refuse("before the first heading", "a block, which nothing reads there");
  for (const t of new Set(sections.map(s => s.title))) if (sections.filter(s => s.title === t).length > 1) refuse(t, "the heading twice");
  if (!sections.some(s => s.title === "Program")) refuse("Program", "no such heading");
  for (const s of sections) {
    const { fences, rest } = blocks(s.title, s.body); const none = () => { if (fences.length) refuse(s.title, "a block, which nothing reads under this heading"); };
    const only = (n: number) => { if (fences.length > n) refuse(s.title, `${fences.length} blocks, of which one is read`); };
    const isTable = ["Frames", "Server frames", "Before hydration"].includes(s.title) || s.title.startsWith("Variant: ");
    if (!isTable && !PROSE.includes(s.title) && rest.some(l => l.trim().startsWith("|"))) refuse(s.title, "a table, which nothing reads under this heading");
    if (s.title === "Program") {                                          // `file: ../examples/x.rx`: a real program
      const f = /^file:\s*(\S+)/m.exec(rest.join("\n")); if (f) { none(); entry = resolvePath(baseDir, f[1]); } else { only(1); if (!fences.length) refuse(s.title, "no program"); }
      program = f ? readFileSync(entry, "utf8") : directives(s.title, (fences[0] ?? "").split("\n"), NONE).program;
    }
    else if (s.title === "Modules") {
      if (!fences.length) refuse(s.title, "no module");
      for (const b of fences) {
        const [first, ...lines] = b.split("\n"); const k = /^-- module: (\S+)\s*$/.exec(first);
        if (!k) { refuse(s.title, `a block that does not begin with -- module: ./x (or is not marked text): ${first}`); continue; }
        const path = joinPath("main.rx", k[1]); if (modules.has(path)) refuse(s.title, `${k[1]} twice`);
        modules.set(path, directives(s.title, lines, NONE).program);
      }
    }
    else if (s.title === "Server frames") { none(); server = table(s.title, rest); }
    else if (s.title === "Before hydration") { none(); before = table(s.title, rest); }
    else if (s.title === "Scoped CSS") { only(1); if (!fences.length) refuse(s.title, "no stylesheet"); css = fences[0] ?? null; }
    else if (s.title === "Frames") { none(); tables.push({ title: "Frames", program: null, rows: table(s.title, rest) }); }
    else if (s.title.startsWith("Variant: ")) { only(1); tables.push({ title: s.title, program: fences.length ? directives(s.title, fences[0].split("\n"), NONE).program : null, rows: table(s.title, rest) }); }
    else if (s.title === "Hydration window" || /^Divergences( \(DV-\d+\))?$/.test(s.title)) {   // SV-3b: frames of a client that took over before the server answered — ruled, not divergences
      none(); const ruled = s.title === "Hydration window"; const marks = rest.filter(l => /^\s*[-*] /.test(l));
      if (!marks.length) refuse(s.title, "no row (`- …`)");
      for (const l of marks) {
        const m = /^- (?:(oracle|server|hydrated) )?"([^"]*)" instant (\d+): `([^`]*)`(?: effects `([^`]*)`)?/.exec(l);
        if (!m || ruled === !!m[1]) { refuse(s.title, `a row no runner reads: ${l}`); continue; }
        divergences.push({ runner: ruled ? "hydrated" : m[1] as Divergence["runner"], table: m[2], instant: Number(m[3]), frame: m[4], ...(m[5] !== undefined && !ruled ? { effects: m[5] === "—" || m[5] === "" ? [] : m[5].split(";").map(x => x.trim()) } : {}), ...(ruled ? { ruled: true as const } : {}) });
      }
    }
    else if (/^(Rejected|Accepted) variants\b/.test(s.title)) {
      if (!fences.length) refuse(s.title, "no program");
      for (const b of fences) {
        const [first, ...lines] = b.split("\n");
        const ok = /^-- accept(: whole-program|: advice ([A-Z_]+))?\s*$/.exec(first);
        if (ok) { const { program, said } = directives(s.title, lines, /^-- untyped\s*$/); accepted.push({ program, whole: !!ok[1] && !ok[2], ...(ok[2] ? { advice: ok[2] } : {}), ...(said.length ? { untyped: true } : {}) }); continue; }   // a program the checker accepts, per module (a regression's other side)
        const r = s.title.startsWith("Rejected") ? /^-- (reject|warn|types): ([\w-]+)\s*$/.exec(first) : null;
        if (!r) { refuse(s.title, `a block that begins with no directive of this heading: ${first}`); continue; }
        const { program, said } = directives(s.title, lines, /^-- (spa|app|whole-program|handler: \S.*|host: \S+)\s*$/);
        const values = (k: string) => said.flatMap(x => x.startsWith(k + ": ") ? [x.slice(k.length + 2).trim()] : []);
        const hosts = values("host"), handlers = values("handler"); const how = said.filter(x => /^(spa|app|whole-program)$/.test(x));
        if ((how.length && r[1] !== "reject") || (hosts.length && !how.length) || (handlers.length && (how.length || r[1] === "types"))) refuse(s.title, `directives that are not read together: ${first.slice(3)}, ${said.join(", ")}`);
        rejected.push({ rule: r[2], warn: r[1] === "warn", types: r[1] === "types", program, handlers, ...(how.includes("spa") ? { spa: true } : {}), ...(how.includes("app") ? { app: true } : {}), ...(how.includes("whole-program") ? { whole: true } : {}), ...(hosts.length ? { hosts } : {}) });   // host: a module a JS host imports with ?rx-lib (CP-4d)
      }
    }
    else if (PROSE.includes(s.title)) none();
    else refuse(s.title, "a heading no runner reads");
  }
  for (const d of divergences) {
    const rows = d.table === "Before hydration" ? before : d.table === "Server frames" ? server : tables.find(t => t.title === d.table)?.rows;
    if (!rows?.some(r => r.instant === d.instant)) refuse("Divergences", `no row "${d.table}" instant ${d.instant}`);
  }
  if (refused.length) throw new Error(`not a scenario a runner reads whole (scenarios/TEMPLATE.md):\n  ${refused.join("\n  ")}`);
  return { name, program, tables, rejected, divergences, accepted, entry, modules, server, before, css };
}

export type Result = { ok: boolean; lines: string[] };

export function runScenario(sc: Scenario): Result {
  const lines: string[] = []; let ok = true;
  for (const [title, src] of [["Program", sc.program], ...sc.tables.filter(t => t.program).map(t => [t.title, t.program!]), ...sc.rejected.filter(r => !r.types).map(r => [`rejected(${r.rule})`, r.program]), ...sc.accepted.map(a => ["accepted", a.program])] as [string, string][]) {
    let set: ModuleSet; try { set = moduleSet(sc, src); } catch { continue; }
    if (set.order.length < 2) continue;
    const bad = signaturesInPlace(set);
    if (bad) { ok = false; lines.push(`  ✗ ${title}: signatures in place (MO-9): ${bad}`); } else lines.push(`  ✓ ${title}: checked against its imports' .d.rx as against their bodies (MO-9)`);
  }
  if (!sc.tables.length && sc.program) {                                // a program with nothing to run (MO-9: modules by signature) is still checked
    try { const d = checkModules(moduleSet(sc, sc.program)).diags; if (d.length) { ok = false; lines.push(`  ✗ Program: refused — ${d.map(x => `${x.code} (${x.rule}) line ${x.line}`).join(", ")}`); } else lines.push("  ✓ Program: accepted by the checker"); }
    catch (e) { ok = false; lines.push(`  ✗ Program: ${(e as Error).message}`); }
  }
  const base = sc.tables.find(t => t.title === "Frames");
  for (const t of sc.tables) {
    const src = t.program ?? sc.program;
    let rows = t.rows; let own = 0;
    if (t !== base && base && rows.length && rows[0].instant > 0) { const pre = base.rows.filter(r => r.instant < rows[0].instant); own = pre.length; rows = [...pre, ...rows]; }
    let rt: Runtime;
    try { rt = new Runtime(moduleSet(sc, src)); } catch (e) { ok = false; lines.push(`  ✗ ${t.title}: ${(e as Error).message}`); continue; }
    let pending: { frame: string; effects: string[] }[] = [];
    for (const r of rows) {
      let got: { frame: string; effects: string[] } | undefined;
      try {
        if (r.action === "mount") { pending = rt.step([]); got = pending.shift(); }
        else if ((r.action === "(effect)" || r.action === "(flush)")) got = pending.shift();
        else if (r.action.startsWith("handler")) { pending = rt.handler(parseStmts(r.action.slice(7))); got = pending.shift(); }
        else if (/^(resolve|reject)\s/.test(r.action)) {
          const m = /^(resolve|reject)\s+(\S+)\s+([\s\S]*)$/.exec(r.action)!;
          const valueExpr = parseStmts(m[3])[0]; const value = valueExpr.k === "expr" ? rt.runStmts([valueExpr], (rt as any).virtualScope(), new Map()) : undefined;
          pending = rt.land(m[2], value, m[1] === "reject"); got = pending.shift();
        }
        else throw new Error(`unknown action '${r.action}'`);
      } catch (e) { ok = false; lines.push(`  ✗ ${t.title} instant ${r.instant}: ${(e as Error).message}`); break; }
      if (!got) { ok = false; lines.push(`  ✗ ${t.title} instant ${r.instant}: no instant produced`); break; }
      const norm = (s: string) => s.replace(/\s+/g, " ").trim();
      const frameOk = norm(got.frame) === norm(r.frame);
      const prefixed = rows.indexOf(r) < own;
      const effOk = prefixed || got.effects.join("; ") === r.effects.join("; ");
      if (prefixed && t.program) { continue; }                          // a variant with its own program: prefix rows only drive state
      if (frameOk && effOk) lines.push(`  ✓ ${t.title} instant ${r.instant}: ${norm(got.frame)}${got.effects.length ? "  [" + got.effects.join("; ") + "]" : ""}`);
      else { ok = false; lines.push(`  ✗ ${t.title} instant ${r.instant}: expected frame '${norm(r.frame)}' effects [${r.effects.join("; ")}], got '${norm(got.frame)}' effects [${got.effects.join("; ")}]`); }
    }
    if (pending.length) { ok = false; lines.push(`  ✗ ${t.title}: ${pending.length} unlisted chained instant(s): ${pending.map(p => p.frame).join(" | ")}`); }
  }
  for (const ac of sc.accepted) {                                       // E-5a: accepted when checked as the whole program; `-- accept`: per module
    const how = ac.whole ? "whole program" : "per module";
    let d, advice: string[]; try { const c = checkModules(moduleSet(sc, ac.program), false, ac.whole); d = c.diags; advice = c.advice.map(x => x.code); } catch (e) { ok = false; lines.push(`  ✗ accepted(${how}): ${(e as Error).message}`); continue; }
    if (!d.length && ac.advice !== undefined && !advice.includes(ac.advice)) { ok = false; lines.push(`  ✗ accepted(${how}): no advice ${ac.advice}`); }
    else if (!d.length) lines.push(`  ✓ accepted(${how}${ac.advice ? `, advice ${ac.advice}` : ""})`); else { ok = false; lines.push(`  ✗ accepted(${how}): got ${d.map(x => `${x.code} line ${x.line}`).join(", ")}`); }
  }
  for (const rj of sc.rejected) {
    if (rj.types) continue;                                              // TY: the type layer's, over the projection (types/run.ts)
    if (rj.spa || rj.whole || rj.app) {                                            // CN-3d: the checker, as a client-only build; E-5a: as the whole program
      const ms = moduleSet(sc, rj.program, !rj.app); const d = checkModules(ms, !!rj.spa, !!rj.whole, (rj.hosts ?? []).map(h => joinPath(ms.entry, h))).diags; const hit = d.find(x => x.rule === rj.rule || x.code === rj.rule);
      const how = rj.app ? "an app" : rj.spa ? "client-only" : "whole program";
      if (hit) lines.push(`  ✓ rejected(${rj.rule}, ${how}): ${hit.code} (${hit.rule}) line ${hit.line}: ${hit.msg}`); else { ok = false; lines.push(`  ✗ rejected(${rj.rule}, ${how}): got ${d.map(x => x.code).join(", ") || "accepted"}`); }
      continue;
    }
    if (rj.warn) {
      try {
        const rt = new Runtime(moduleSet(sc, rj.program)); rt.step([]);
        const hit = rt.diagnostics.find(d => d.startsWith(rj.rule));
        if (hit) lines.push(`  ✓ warn(${rj.rule}): ${hit}`); else { ok = false; lines.push(`  ✗ warn(${rj.rule}): no diagnostic (got: ${rt.diagnostics.join(" | ") || "none"})`); }
      } catch (e) { ok = false; lines.push(`  ✗ warn(${rj.rule}): ${(e as Error).message}`); }
      continue;
    }
    try {
      const rt = new Runtime(moduleSet(sc, rj.program));
      rt.step([]);
      // handlers in rejected programs: run any `handler:` comment lines
      for (const m of rj.handlers) rt.handler(parseStmts(m));
      ok = false; lines.push(`  ✗ rejected(${rj.rule}): accepted`);
    } catch (e) {
      if (e instanceof CheckError) {                                     // the checker: any diagnostic may carry the expected rule id or code
        const hit = e.diagnostics.find(d => d.rule === rj.rule || d.code === rj.rule);
        if (hit) lines.push(`  ✓ rejected(${rj.rule}): ${hit.code} (${hit.rule}) line ${hit.line}: ${hit.msg}`);
        else { ok = false; lines.push(`  ✗ rejected(${rj.rule}): got ${e.diagnostics.map(d => `${d.code} (${d.rule})`).join(", ")}: ${e.message}`); }
        continue;
      }
      const rule = e instanceof RuleError ? e.rule : e instanceof ParseError ? (/([A-Z]+-\d+)/.exec(e.message)?.[1] ?? "parse") : "crash";
      if (rule === rj.rule || (e instanceof ParseError && e.code === rj.rule)) lines.push(`  ✓ rejected(${rj.rule}): ${(e as Error).message}`);
      else { ok = false; lines.push(`  ✗ rejected(${rj.rule}): got ${rule}: ${(e as Error).message}`); }
    }
  }
  return { ok, lines };
}
