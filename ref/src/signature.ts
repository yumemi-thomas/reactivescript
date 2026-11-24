// MO-3 / MO-9: a module's signature as `.d.rx` text, and that text read back. A signature is what an importer is checked
// against (CN-4b), so the text is the whole of it: an importer checked against a printed `.d.rx` gets the verdicts it gets
// against the module's body (`ref/run.ts` checks this for every scenario with modules). One export per line:
//
//   export source products: pending fails(Error) = …        a question (ST-5); `:= …` a plain source
//   export discount: pending fails(Error)                   an equation; `io` when bound to an io value
//   export pure fn qtyOf(id) rejects(Offline) instantiates  a fn (`ref` params; RG-6); `rejects(…)` absent: none
//   export pure fn useCart(): { n: ref pending; add: io; limit: value } instantiates   … and the parts of its result (MO-13i): read,
//                                                           an action, made once; `[ref, io]` a tuple; `ref { add: io; … }` one value, with
//                                                           the parts of it that are actions (R-io-3)
//   export pure fn useForm() instantiates uses(./form.rx#form)   … and the contexts each call reads above it (RG-7b)
//   export server fn add(id) rejects(Error)                 12 SF-1 (`server pure fn` when no io)
//   export action setCoupon
//   export error NotFound(id)
//   export type Product
//   export context theme: source pending Theme = …          rows, then the written type; `= …` a default
//   export component Panel(props: { title; children: catches(Error) provides(./theme.rx#theme) }) fails(Error) uses(./theme.rx#theme, loading) shape(roots section; children-at section)
//
// A prop field: bare (rendered, discharges nothing), `catches(A | B)` / `catches(*)`, `provides(…)` (children), `unrendered`
// (only an action reads it), `action save catches(…)` (an action reads it). `uses(loading)` is SV-7b's need for a `loading`
// above a reader of a client question. `retains(onPick: module, onFocus: ./form.rx#fields)` names the props the component
// stores where they outlive it (O-3) — in its module's sources, or through a provision above it — so a closure passed for one
// is checked at the application. Context keys are paths relative to the signature's own module.
//
// MO-11u, the components a fn declared `renders(H)` is given (H by its declaration's path, as a context is):
//
//   export component Shell(props: {}) hosts(./kit.d.rx#Toaster catches(Error) provides(./theme.rx#theme); ./kit.d.rx#Toaster)
//                                                            each place the component applies H: what is discharged and provided above H's children there
//   export hosts(./kit.d.rx#Toaster provides(./theme.rx#theme))   the same, for the applications the module itself roots (its mounted view)
//   export renders ./kit.d.rx#Toaster from toast:12 fails(Error) uses(./theme.rx#theme, loading) hosts(./kit.d.rx#Toaster)
//                                                            a call of `toast` (line 12) that was given components: what they let out of H's children,
//                                                            and each place they themselves apply a host (from their own root)
import type { ModSig, ExportSig, CompSig, HostSite, Hosted, Result } from "./check.ts";
import { EMPTY_SHAPE, type Shape } from "./content.ts";

type Catch = Set<string> | "all";
const HOLD = "$hold";
const cls = (c: Catch) => c === "all" ? "*" : c.size ? [...c].sort().join(" | ") : "nothing";
const rows = (r: string[], fails: string[]) => [...["io", "pending", "lane"].filter(x => r.includes(x)), ...(fails.length ? [`fails(${[...fails].sort().join(" | ")})`] : [])].join(" ");
/** R-io-3: the parts of a value that are actions, among others: `{ set: io; pair.1: io; … }`; `io`: the value itself. */
const actionsText = (ps: string[] | undefined) => !ps?.length ? "" : ps.includes("") ? "io" : `{ ${ps.map(p => `${p}: io`).join("; ")}; … }`;
const actionsOf = (text: string): string[] | undefined => { if (text === "io") return [""]; const m = /^\{(.*);\s*…\s*\}$/.exec(text); const ps = m ? split(m[1], ";").map(p => /^([\w$.-]+)\s*:\s*io$/.exec(p)?.[1]) : []; return ps.length && ps.every(p => p !== undefined) ? ps as string[] : undefined; };
/** MO-13i: the parts of a fn's result. */
const resultText = (r: Result): string => r.k === "io" ? "io" : r.k === "rec" ? `{ ${r.fields.map(([k, v]) => `${k}: ${resultText(v)}`).join("; ")} }` : r.k === "arr" ? `[${r.items.map(resultText).join(", ")}]` : [r.reader ? "ref" : "value", r.reader ? rows(r.rows, r.fails) : "", actionsText(r.actions)].filter(Boolean).join(" ");
function resultOf(t: string): Result | undefined {
  if (t === "io") return { k: "io" };
  if (/^\{.*\}$/.test(t)) {
    const fields = split(t.slice(1, -1), ";").map((f): [string, Result] | undefined => { const m = /^([\w$-]+)\s*:\s*(.+)$/.exec(f); const r = m && resultOf(m[2]); return r ? [m[1], r] : undefined; });
    return fields.length && fields.every(f => f !== undefined) ? { k: "rec", fields: fields as [string, Result][] } : undefined;
  }
  if (/^\[.*\]$/.test(t)) { const items = split(t.slice(1, -1), ",").map(resultOf); return items.length && items.every(x => x !== undefined) ? { k: "arr", items: items as Result[] } : undefined; }
  const m = /^(ref|value)(?:\s+(.*))?$/.exec(t); if (!m) return undefined;
  const r = m[1] === "ref" ? rowWords(m[2] ?? "") : { rows: [], fails: [], rest: m[2] ?? "" };
  const text = r.rows.includes("io") ? "io" : r.rest; const actions = text ? actionsOf(text) : [];
  return actions && { k: "leaf", reader: m[1] === "ref", rows: r.rows.filter(x => x !== "io"), fails: r.fails, actions };
}
/** R-io-3: the parts of a result that are actions, as paths. */
const resultActions = (r: Result): string[] => (r.k === "io" ? [""] : r.k === "leaf" ? r.actions : (r.k === "rec" ? r.fields : r.items.map((x, i): [string, Result] => [String(i), x])).flatMap(([k, v]) => resultActions(v).map(p => p === "" ? k : `${k}.${p}`))).sort();
const dir = (p: string) => p.split("/").slice(0, -1).join("/");
/** O-3: the props a component stores where they outlive it, and where. */
const retainsText = (file: string, st?: Record<string, string[]>) => {
  const xs = Object.entries(st ?? {}).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).flatMap(([f, ts]) => ts.map(t => `${f === "*" ? "...props" : f}: ${t === "module" ? t : relKey(file, t)}`));
  return xs.length ? ` retains(${xs.join(", ")})` : "";
};
/** A context key relative to the module whose signature names it (`./theme.rx#theme`). */
function relKey(from: string, key: string): string {
  if (key === HOLD) return "loading";
  const [path, name] = [key.slice(0, key.lastIndexOf("#")), key.slice(key.lastIndexOf("#") + 1)];
  const a = dir(from).split("/").filter(Boolean), b = path.split("/").filter(Boolean); let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  const up = a.length - i; const rel = (up ? "../".repeat(up) : "./") + b.slice(i).join("/");
  return `${path.startsWith("/") === from.startsWith("/") ? rel : path}#${name}`;
}
function absKey(from: string, rel: string): string {
  if (rel === "loading") return HOLD;
  const [path, name] = [rel.slice(0, rel.lastIndexOf("#")), rel.slice(rel.lastIndexOf("#") + 1)];
  if (!path.startsWith(".")) return rel;
  const parts = dir(from).split("/"); const lead = from.startsWith("/") ? "/" : "";
  const out = parts.filter(Boolean);
  for (const seg of path.split("/")) { if (seg === "." || seg === "") continue; if (seg === "..") out.pop(); else out.push(seg); }
  return `${lead}${out.join("/")}#${name}`;
}
function shapeText(s: Shape | undefined): string {
  if (!s) return "";
  const parts = [...(s.roots.length ? [`roots ${s.roots.join(" ")}`] : []), ...(s.closesP ? ["closes-p"] : []), ...(s.a ? ["a"] : []), ...(s.form ? ["form"] : []), ...s.childrenAt.map(c => `children-at ${c.join(" ")}`)];
  return parts.length ? ` shape(${parts.join("; ")})` : "";
}

/** MO-11u: `hosts(<key> catches(…) provides(…); …)`, one entry an application. */
function hostsText(file: string, hs?: Record<string, HostSite[]>): string {
  const xs = Object.entries(hs ?? {}).flatMap(([k, sites]) => sites.map(x => `${relKey(file, k)}${x.f instanceof Set && x.f.size === 0 ? "" : ` catches(${cls(x.f)})`}${x.p instanceof Set && x.p.size === 0 ? "" : ` provides(${x.p === "all" ? "*" : [...x.p].sort().map(q => relKey(file, q)).join(", ")})`}`));
  return xs.length ? `hosts(${xs.join("; ")})` : "";
}
function hostedText(file: string, h: Hosted): string {
  return `export renders ${relKey(file, h.host)} from ${h.fn}:${h.line}${h.fails.length ? ` fails(${[...h.fails].sort().join(" | ")})` : ""}${h.requires.length ? ` uses(${h.requires.map(k => relKey(file, k)).join(", ")})` : ""}${h.inner ? ` ${hostsText(file, h.inner)}` : ""}`;
}
/** The text inside the balanced parentheses that open at `at` (the index of `(`). */
function balanced(s: string, at: number): string | undefined {
  let depth = 0; for (let i = at; i < s.length; i++) { if (s[i] === "(") depth++; else if (s[i] === ")" && --depth === 0) return s.slice(at + 1, i); }
  return undefined;
}
/** 07 §2: a fn's row without its type parameters, `pure fn f<T>(…)`, and those, as text. */
function typeParamsOf(s: string): { text: string; tparams?: string } {
  const at = /^pure\s+fn\s+[A-Za-z_$][\w$]*\s*</.exec(s)?.[0].length; if (at === undefined) return { text: s };
  let i = at, depth = 1; for (; i < s.length && depth; i++) if (s[i] === "<") depth++; else if (s[i] === ">" && s[i - 1] !== "=") depth--;
  return { text: s.slice(0, at - 1) + s.slice(i), tparams: s.slice(at - 1, i) };
}
function hostsOf(file: string, text: string): Record<string, HostSite[]> {
  const out: Record<string, HostSite[]> = {};
  for (const part of split(text, ";")) {
    const key = part.split(/\s+/)[0]; const rest = part.slice(key.length);
    const c = /\bcatches\(([^)]*)\)/.exec(rest); const p = /\bprovides\(([^)]*)\)/.exec(rest);
    (out[absKey(file, key)] ??= []).push({ f: c ? catchOf(c[1]) : new Set(), p: p ? (p[1].trim() === "*" ? "all" : new Set(p[1].split(",").map(k => absKey(file, k.trim())).filter(Boolean))) : new Set() });
  }
  return out;
}
function line(file: string, name: string, x: ExportSig): string {
  switch (x.kind) {
    case "source": { const r = rows(x.rows, x.fails); return `export source ${name}${r ? `: ${r}` : ""} ${x.question ? "=" : ":="} …`; }
    case "eq": { const r = [rows(x.io ? ["io", ...x.rows] : x.rows, x.fails), x.io ? "" : actionsText(x.actions)].filter(Boolean).join(" "); return `export ${name}${r ? `: ${r}` : ""}`; }
    case "fn": { const a = x.result ? resultText(x.result) : x.actions?.includes("") ? "ref io" : actionsText(x.actions); const r = [rows(x.rows, x.fails), a].filter(Boolean).join(" "); return `export pure fn ${name}${x.tparams ?? ""}(${x.params.map(p => (p.ref ? "ref " : "") + p.name + ((p as { type?: string }).type ? `: ${(p as { type?: string }).type}` : "")).join(", ")})${r ? `: ${r}` : ""}${x.rejects.length ? ` rejects(${x.rejects.join(" | ")})` : ""}${x.instantiating ? " instantiates" : ""}${x.uses?.length ? ` uses(${x.uses.map(k => relKey(file, k)).join(", ")})` : ""}`; }
    case "server": return `export server ${x.io ? "" : "pure "}fn ${name}(${x.params.join(", ")})${x.rejects.length ? ` rejects(${[...x.rejects].sort().join(" | ")})` : ""}`;
    case "action": return `export action ${name}`;
    case "errclass": return `export error ${name}(${x.params.join(", ")})`;
    case "type": return `export type ${name}`;
    case "context": { const t = [x.source ? "source" : "", rows(x.rows, x.fails), x.type ?? ""].filter(Boolean).join(" "); return `export context ${name}${t ? `: ${t}` : ""}${x.dflt ? " = …" : ""}`; }
    case "comp": {
      const s = x.sig;
      const props = Object.entries(s.props).map(([f, v]) => {
        const parts: string[] = [];
        if (v.takes?.length) parts.push(`takes(${v.takes.map(([p, holds, fails]) => `${p}${holds ? " pending" : ""}${fails.length ? ` fails(${fails.join(" | ")})` : ""}`).join(", ")})`);   // MO-10f: the fields it reads as ones that hold or fail
        if (!v.rendered) parts.push("unrendered");
        else {
          if (!(v.f instanceof Set && v.f.size === 0)) parts.push(`catches(${cls(v.f)})`);
          if (!(v.p instanceof Set && v.p.size === 0)) parts.push(`provides(${v.p === "all" ? "*" : [...v.p].map(k => relKey(file, k)).join(", ")})`);
        }
        if (v.action) parts.push(`action ${v.action.name} catches(${cls(v.action.f)})`);
        return `${f === "*" ? "...props" : f}${parts.length ? `: ${parts.join(" ")}` : ""}`;
      });
      const own = [...new Set(s.own.map(o => o.cls))];
      return `export component ${name}(props: ${props.length ? `{ ${props.join("; ")} }` : "{}"})${s.made ? " made" : ""}${own.length ? ` fails(${own.sort().join(" | ")})` : ""}${s.requires.length ? ` uses(${s.requires.map(k => relKey(file, k)).join(", ")})` : ""}${retainsText(file, s.stored)}${s.hosts ? ` ${hostsText(file, s.hosts)}` : ""}${shapeText(s.shape)}`;
    }
  }
}

export function printSignature(sig: ModSig): string {
  const out = [`//@ signature ${sig.file.split("/").pop()} (09-modules MO-3, MO-13a). Sources are read-only to importers (MO-2).`];
  for (const [n, x] of sig.exports) out.push(line(sig.file, n, x));
  if (sig.hosts && Object.keys(sig.hosts).length) out.push(`export ${hostsText(sig.file, sig.hosts)}`);   // MO-11u
  for (const h of sig.hosted ?? []) out.push(hostedText(sig.file, h));
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------- reading it back (MO-9)
export class SignatureError extends Error { name = "SignatureError"; }
const ROW = /^(io|pending|lane|fails\(([^)]*)\))$/;
const classesOf = (s: string): string[] => s.split("|").map(x => x.trim()).filter(x => x && x !== "nothing");
const catchOf = (s: string): Catch => s.trim() === "*" ? "all" : new Set(classesOf(s));
/** Split on `sep` outside parentheses and braces. */
function split(s: string, sep: string): string[] {
  const out: string[] = []; let depth = 0, cur = "";
  for (const ch of s) { if ("({[<".includes(ch)) depth++; if (")}]>".includes(ch) && !(ch === ">" && cur.endsWith("="))) depth--; if (ch === sep && depth === 0) { out.push(cur); cur = ""; } else cur += ch; }
  if (cur.trim()) out.push(cur); return out.map(x => x.trim()).filter(Boolean);
}
/** Leading row words; the rest of the text (a context's type). */
function rowWords(s: string): { rows: string[]; fails: string[]; rest: string } {
  const words = split(s, " "); const rows: string[] = []; let fails: string[] = []; let i = 0;
  for (; i < words.length; i++) { const m = ROW.exec(words[i]); if (!m) break; if (m[2] !== undefined) fails = classesOf(m[2]); else rows.push(m[1]); }
  return { rows, fails, rest: words.slice(i).join(" ") };
}
/** SV-7d's words, `roots p div; closes-p; children-at div` (MO-9b; a JS component's, MO-11a). */
export function contentShapeOf(s: string | undefined): Shape {
  if (!s) return { ...EMPTY_SHAPE, roots: [], childrenAt: [] };
  const sh: Shape = { roots: [], closesP: false, a: false, form: false, childrenAt: [] };
  for (const p of s.split(";").map(x => x.trim()).filter(Boolean)) {
    const [w, ...rest] = p.split(/\s+/);
    if (w === "roots") sh.roots = rest; else if (w === "closes-p") sh.closesP = true; else if (w === "a") sh.a = true; else if (w === "form") sh.form = true;
    else if (w === "children-at") sh.childrenAt.push(rest); else throw new SignatureError(`shape: ${p}`);
  }
  return sh;
}

/** A `.d.rx` printed for (or written as) an `.rx` module's signature, read in place of the module. `file` is the `.rx`
 *  module's path: context keys are its, and relative keys resolve against it. */
export function parseSignature(src: string, file: string): ModSig {
  const exports = new Map<string, ExportSig>(); let hosts: Record<string, HostSite[]> | undefined; const hosted: Hosted[] = [];
  src.split("\n").forEach((raw, i) => {
    const t = raw.replace(/\s\/\/.*$/, "").replace(/^\/\/.*$/, "").trim(); if (!t) return;
    const fail = (msg: string): never => { throw new SignatureError(`${file.replace(/\.rx$/, ".d.rx")}:${i + 1}: ${msg}: ${t}`); };
    let m: RegExpExecArray | null;
    if (!t.startsWith("export ")) fail("a signature declares exports");
    const s = t.slice(7).trim();
    // MO-11u
    if (s.startsWith("hosts(")) { const inner = balanced(s, 5); if (inner === undefined) fail("hosts(…)"); hosts = hostsOf(file, inner!); return; }
    if (/^renders\s/.test(s)) {
      let row = s; let inner: Record<string, HostSite[]> | undefined;
      const at = /\shosts\(/.exec(row); if (at) { const open = at.index + at[0].length - 1; const text = balanced(row, open); if (text === undefined) fail("hosts(…)"); inner = hostsOf(file, text!); row = (row.slice(0, at.index) + row.slice(open + text!.length + 2)).trim(); }
      if ((m = /^renders\s+(\S+)\s+from\s+([A-Za-z_$][\w$.]*):(\d+)\s*(?:fails\(([^)]*)\))?\s*(?:uses\(([^)]*)\))?$/.exec(row))) { const host = absKey(file, m[1]); hosted.push({ host, name: host.slice(host.lastIndexOf("#") + 1), fn: m[2], line: Number(m[3]), fails: classesOf(m[4] ?? "").sort(), requires: (m[5] ?? "").split(",").map(k => k.trim()).filter(Boolean).map(k => absKey(file, k)), ...(inner ? { inner } : {}) }); return; }
    }
    if ((m = /^type\s+([A-Za-z_$][\w$]*)/.exec(s))) { exports.set(m[1], { kind: "type" }); return; }
    if ((m = /^action\s+([A-Za-z_$][\w$]*)$/.exec(s))) { exports.set(m[1], { kind: "action" }); return; }
    if ((m = /^error\s+([A-Za-z_$][\w$]*)\s*(?:\(([^)]*)\))?$/.exec(s))) { exports.set(m[1], { kind: "errclass", params: (m[2] ?? "").split(",").map(x => x.trim()).filter(Boolean) }); return; }
    if ((m = /^source\s+([A-Za-z_$][\w$]*)\s*(?::(?!=)\s*(.*?))?\s*(:?=)\s*…$/.exec(s))) { const r = rowWords(m[2] ?? ""); if (r.rest) fail("a source's rows"); exports.set(m[1], { kind: "source", question: m[3] === "=", rows: r.rows, fails: r.fails }); return; }
    if ((m = /^server\s+(pure\s+)?fn\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?:rejects\(([^)]*)\))?$/.exec(s))) { exports.set(m[2], { kind: "server", io: !m[1], params: m[3].split(",").map(x => x.trim()).filter(Boolean), rejects: classesOf(m[4] ?? "") }); return; }
    const g = typeParamsOf(s);
    if ((m = /^pure\s+fn\s+([A-Za-z_$][\w$]*)\s*\(/.exec(g.text))) {
      const s = g.text; const ps = balanced(s, m[0].length - 1); if (ps === undefined) fail("a fn's parameters");
      const t = /^\s*(?::\s*(.*?))?\s*(?:\brejects\(([^)]*)\))?\s*(\binstantiates)?\s*(?:\buses\(([^)]*)\))?$/.exec(s.slice(m[0].length + ps!.length + 1)); if (!t) return fail("a fn's rows");
      const params = split(ps!, ",").map(p0 => { const ref = /^ref\s/.test(p0); const p = ref ? p0.slice(4).trim() : p0; const c = p.indexOf(":"); return { name: (c < 0 ? p : p.slice(0, c)).trim(), ref, ...(c < 0 ? {} : { type: p.slice(c + 1).trim() }) }; });
      const r = rowWords(t[1] ?? ""); const text = r.rows.includes("io") ? "io" : r.rest;
      const open = text && text !== "io" ? actionsOf(text) : undefined;   // some parts of one value are actions: what else it holds is not said
      const result = text && !open ? resultOf(text) : undefined; if (text && !open && !result) fail("a fn's rows");
      const acts = open ?? (result ? resultActions(result) : []); const one = result?.k === "leaf" && result.reader;
      exports.set(m[1], { kind: "fn", ...(g.tparams ? { tparams: g.tparams } : {}), params, instantiating: !!t[3], rows: r.rows.filter(x => x !== "io"), fails: r.fails, rejects: classesOf(t[2] ?? ""), ...(acts.length ? { actions: acts } : {}), ...(result && !one ? { result } : {}), ...(t[4] ? { uses: t[4].split(",").map(k => absKey(file, k.trim())) } : {}) }); return;
    }
    if ((m = /^context\s+([A-Za-z_$][\w$]*)\s*(?::\s*(.*?))?\s*(=\s*…)?$/.exec(s))) {
      let body = (m[2] ?? "").trim(); const source = /^source\b/.test(body); if (source) body = body.slice(6).trim();
      const r = rowWords(body);
      exports.set(m[1], { kind: "context", key: `${file}#${m[1]}`, source, dflt: !!m[3], rows: r.rows, fails: r.fails, ...(r.rest ? { type: r.rest } : {}) }); return;
    }
    if ((m = /^component\s+([A-Za-z_$][\w$]*)\s*\(props:\s*(\{.*?\}|\{\})\)(.*)$/.exec(s))) {
      const sig: CompSig = { own: [], requires: [], props: {}, shape: undefined };
      for (const f of split(m[2].slice(1, -1), ";")) {
        const [fname0, spec = ""] = f.includes(":") ? [f.slice(0, f.indexOf(":")).trim(), f.slice(f.indexOf(":") + 1).trim()] : [f.trim(), ""];
        const fname = fname0 === "...props" ? "*" : fname0;
        const v: CompSig["props"][string] = { f: new Set(), p: new Set(), rendered: true };
        const a = /\baction\s+([A-Za-z_$][\w$]*)\s+catches\(([^)]*)\)/.exec(spec); if (a) v.action = { f: catchOf(a[2]), name: a[1] };
        let rest = a ? spec.replace(a[0], "") : spec;
        const tk = /(^|[^A-Za-z0-9_])takes\(((?:[^()]|\([^()]*\))*)\)/.exec(rest);          // `takes(data pending fails(Error), result.more pending)`
        if (tk) {
          v.takes = split(tk[2], ",").flatMap(part => { const path = part.trim().split(/\s+/)[0] ?? ""; const fl = /fails\(([^)]*)\)/.exec(part); return path ? [[path, /(^|\s)pending(\s|$)/.test(part.trim()), fl ? fl[1].split("|").map(c => c.trim()).filter(Boolean) : []] as [string, boolean, string[]]] : []; });
          rest = rest.replace(tk[0], tk[1]);
        }
        if (/\bunrendered\b/.test(rest)) { v.rendered = false; v.f = "all"; v.p = "all"; }
        const c = /\bcatches\(([^)]*)\)/.exec(rest); if (c) v.f = catchOf(c[1]);
        const p = /\bprovides\(([^)]*)\)/.exec(rest); if (p) v.p = p[1].trim() === "*" ? "all" : new Set(p[1].split(",").map(k => absKey(file, k.trim())).filter(Boolean));
        sig.props[fname] = v;
      }
      let tail = m[3];
      { const at = /(^|\s)hosts\(/.exec(tail); if (at) { const open = at.index + at[0].length - 1; const inner = balanced(tail, open); if (inner === undefined) fail("hosts(…)"); sig.hosts = hostsOf(file, inner!); tail = tail.slice(0, at.index) + tail.slice(open + inner!.length + 2); } }   // MO-11u
      if (/^\s*made\b/.test(tail)) sig.made = true;   // MO-11j: a JS factory's component, applied as JSX's <X />
      const fl = /\bfails\(([^)]*)\)/.exec(tail); if (fl) sig.own = classesOf(fl[1]).map(c => ({ cls: c, what: `${m![1]}'s root`, at: file.split("/").pop() }));
      const us = /\buses\(([^)]*)\)/.exec(tail); if (us) sig.requires = us[1].split(",").map(k => absKey(file, k.trim()));
      const so = /\bretains\(([^)]*)\)/.exec(tail); if (so) { sig.stored = {}; for (const x of split(so[1], ",")) { const i = x.indexOf(":"); const f0 = x.slice(0, i).trim(); const f = f0 === "...props" ? "*" : f0; const t = x.slice(i + 1).trim(); (sig.stored[f] ??= []).push(t === "module" ? t : absKey(file, t)); } }   // O-3
      sig.shape = contentShapeOf(/\bshape\(([^)]*)\)/.exec(tail)?.[1]);
      exports.set(m[1], { kind: "comp", sig }); return;
    }
    if ((m = /^([A-Za-z_$][\w$]*)\s*(?::\s*(.*))?$/.exec(s))) { const r = rowWords(m[2] ?? ""); const acts = actionsOf(r.rest); if (r.rest && !acts) fail("an equation's rows"); exports.set(m[1], { kind: "eq", rows: r.rows.filter(x => x !== "io"), fails: r.fails, io: r.rows.includes("io"), ...(acts ? { actions: acts } : {}) }); return; }
    fail("not an export");
  });
  return { file, exports, ...(hosted.length ? { hosted } : {}), ...(hosts ? { hosts } : {}) };
}
