// 06 AC-1b…AC-1e: what the compiler reads off an imperative body. Which arrows are actions without the keyword (AC-1b), and
// the checks every imperative run gets: a plain write an action holds across an `await` (HELD_WRITE, AC-1c), a read of a
// source the same change already wrote (STALE_OWN_READ, AC-1d), and a write after an `await` computed from the same source
// as read before it (STALE_WRITE_BACK, AC-1e), and a write into an answer after an `await` of anything but the server's (STALE_CAPTURE, AC-1g). Solid sees none of them: a TypeScript body's promises and reads are not
// visible to it, which is why it asks for `action(function* …)` and lets a stale read or a lost update through.
import type { Expr, Stmt } from "./ast.ts";
import { freeNames, show, subExprs } from "./check.ts";

export type Trigger = "optimistic" | "affects" | "write+await";
type Fn = Extract<Expr, { k: "fn" }>;
type Closures = Map<string, Fn>;

/** AC-1: a run suspends only at a statement-level `await` (`await e`, `let v = await e`, either with a `catch`). */
export const stmtAwait = (s: Stmt): boolean => (s.k === "let" || s.k === "expr") && (s.e.k === "await" || (s.e.k === "catch" && s.e.e.k === "await"));

/** The local closures a body's own statements call by name: `let f = () => { … }`, statement-bodied, not an action of its own. */
const closureOf = (s: Stmt): Fn | null => s.k === "let" && s.e.k === "fn" && s.e.stmts && !inferredAction(s.e.stmts) ? s.e : null;
const calledClosure = (e: Expr, cl: Closures): Fn | null => e.k === "call" && e.f.k === "id" && cl.has(e.f.name) ? cl.get(e.f.name)! : null;

/** AC-1b: why an arrow's body is an action — it guesses, declares `affects`, or both writes a source and awaits — or null for
 *  a plain run. Its own statements only: not the bodies of closures in it (each is inferred on its own), not an inline
 *  `action { … }` (its own run), but through the local closures it calls (a call runs the closure's writes in this run). */
export function inferredAction(stmts: Stmt[]): Trigger | null {
  let guess: Trigger | null = null, write = false, wait = false;
  const seen = new Set<Fn>();
  const go = (ss: Stmt[], cl: Closures): void => {
    const local = new Map(cl);
    for (const s of ss) {
      const c = closureOf(s); if (c) local.set((s as { name: string }).name, c); else if (s.k === "let") local.delete(s.name);
      const called = (s.k === "expr" || s.k === "let") ? calledClosure(s.e, local) : null;
      if (called && !seen.has(called)) { seen.add(called); go(called.stmts!, local); }
      switch (s.k) {
        case "optimistic": guess ??= "optimistic"; break;
        case "affects": guess ??= "affects"; break;
        case "write": write = true; break;
        case "let": case "expr": if (stmtAwait(s)) wait = true; break;
        case "sif": go(s.t, local); go(s.f, local); break;
        case "for": go(s.body, local); break;
        case "try": go(s.body, local); if (s.handler) go(s.handler, local); if (s.fin) go(s.fin, local); break;
      }
    }
  };
  go(stmts, new Map());
  return guess ?? (write && wait ? "write+await" : null);
}
/** AC-3 (2026-11-22): what an action's own statements say of its guesses. `holdless`: it guesses (the first one's target and
 *  line) and can start nothing a guess would live over — no statement-level `await`, no `refresh` or `affects`, no plain
 *  write (which a question may be asked again for), no inline action, and no call of anything but the language's hooks (a
 *  call may launch what holds) — so the hold ends with the run and the guess is taken back in the instant it is made.
 *  `late`: its first guess is written after a statement-level `await` (that await, as written): until it answers, nothing
 *  shows. Own statements, as `inferredAction` reads them: through the local closures the body calls by name, not into
 *  other closures. */
export type GuessFacts = { holdless?: { name: string; line?: number }; late?: { name: string; line?: number; awaited: string } };
/** `hook`: a name is one of the language's hooks in the run's scope; a name a `let` binds is not. */
export function guessFacts(stmts: Stmt[], hook: (n: string) => boolean): GuessFacts {
  let first: { name: string; line?: number } | undefined, late: GuessFacts["late"], awaited: string | undefined, starts = false;
  const seen = new Set<Fn>();
  // a call written in an expression, outside the closures it makes, of anything but a hook of the language
  type Hook = (n: string) => boolean;
  const calls = (n: Expr | Stmt, hook: Hook): boolean => {
    if (n.k === "fn" || n.k === "serverfn") return false;
    if (n.k === "call" && !(n.f.k === "id" && hook(n.f.name))) return true;
    if ((n.k === "write" || n.k === "optimistic") && n.target.path.some(seg => typeof seg !== "string" && calls(seg, hook))) return true;
    return subExprs(n as Expr).some(c => calls(c, hook));
  };
  const go = (ss: Stmt[], cl: Closures, outer: Hook): void => {
    const local = new Map(cl); const lets = new Set(ss.flatMap(s => s.k === "let" || s.k === "for" ? [s.name] : s.k === "try" && s.catchName ? [s.catchName] : [])); const hook: Hook = n => !lets.has(n) && outer(n);
    for (const s of ss) {
      const c = closureOf(s); if (c) { local.set((s as { name: string }).name, c); continue; } else if (s.k === "let") local.delete(s.name);
      const called = (s.k === "expr" || s.k === "let") ? calledClosure(s.e, local) : null;
      if (called) { if (!seen.has(called)) { seen.add(called); go(called.stmts!, local, hook); } continue; }
      switch (s.k) {
        case "optimistic": if (!first) { first = { name: s.target.name, line: s.line }; if (awaited !== undefined) late = { name: s.target.name, line: s.line, awaited }; } break;
        case "affects": case "refresh": case "write": case "action": starts = true; break;
        case "let": case "expr":
          if (stmtAwait(s)) { starts = true; if (awaited === undefined) { const q = s.e.k === "catch" ? s.e.e : s.e; awaited = show(q.k === "await" ? q.e : q); } }
          break;
        case "sif": if (calls(s.c, hook)) starts = true; go(s.t, local, hook); go(s.f, local, hook); break;
        case "for": if (calls(s.e, hook)) starts = true; go(s.body, local, hook); break;
        case "try": go(s.body, local, hook); if (s.handler) go(s.handler, local, hook); if (s.fin) go(s.fin, local, hook); break;
      }
      if (s.k !== "sif" && s.k !== "for" && s.k !== "try" && s.k !== "action" && calls(s, hook)) starts = true;
    }
  };
  go(stmts, new Map(), hook);
  return { ...(!starts && first ? { holdless: first } : {}), ...(late ? { late } : {}) };
}
/** AC-1h: whether an action's change can outlast its call — its body (not a closure's) awaits, re-asks, or declares `affects`,
 *  in a branch, a `try` or a loop's body (a loop's was missed until 2026-11-26: an action that waits in a `for` was taken as
 *  one that settles as it returns, and a handler beside it could mint one id twice, AC-1h's fault). */
export const actionWaits = (ss: Stmt[]): boolean => ss.some(s => stmtAwait(s) || s.k === "refresh" || s.k === "affects" || (s.k === "sif" && (actionWaits(s.t) || actionWaits(s.f))) || (s.k === "for" && actionWaits(s.body)) || (s.k === "try" && (actionWaits(s.body) || actionWaits(s.handler ?? []) || actionWaits(s.fin ?? []))));
/** AC-1i: the first word of a body that makes its change outlive the call — an \`await\`, \`refresh\`, \`affects\`, a guess —
 *  in its own statements as AC-1b reads them: a branch, a \`try\`, a loop, and the local closures the body calls by name (a
 *  call runs the closure's statements in this run), not other closures and not an inline \`action { … }\` (its own run,
 *  launched as a call of a declared action is: what it holds is AC-1h's); with its statement's line. */
export const heldWord = (stmts: Stmt[]): { word: string; line?: number } | undefined => {
  const seen = new Set<Fn>();
  const go = (ss: Stmt[], cl: Closures): { word: string; line?: number } | undefined => {
    const local = new Map(cl);
    for (const s of ss) {
      const c = closureOf(s); if (c) { local.set((s as { name: string }).name, c); continue; } else if (s.k === "let") local.delete(s.name);
      const called = (s.k === "expr" || s.k === "let") ? calledClosure(s.e, local) : null;
      if (called && !seen.has(called)) { seen.add(called); const r = go(called.stmts!, local); if (r) return { word: r.word, line: (s as { line?: number }).line || r.line }; }
      const w = stmtAwait(s) ? "await" : s.k === "refresh" ? "refresh" : s.k === "affects" ? "affects" : s.k === "optimistic" ? "guess" : undefined;
      if (w) return { word: w, line: (s as { line?: number }).line };
      const inner = s.k === "sif" ? [s.t, s.f] : s.k === "for" ? [s.body] : s.k === "try" ? [s.body, s.handler ?? [], s.fin ?? []] : [];
      for (const b of inner) { const r = go(b, local); if (r) return r; }
    }
    return undefined;
  };
  return go(stmts, new Map());
};
/** AC-1h, AC-1 (D-7): the action a run launches whose change outlasts the call — so the run's own writes join that change
 *  and are held with it: a call by name of an action \`outlasting\` says outlasts (a declared one that waits, or one that
 *  launches such an action itself), a local closure that is an action of its own and waits, or an inline \`action { … }\`
 *  that waits. Own statements, as AC-1b reads them (through the local closures the body calls by name); a name a \`let\`,
 *  a loop or a \`catch\` of the block binds is not the action's. */
export function actionJoins(stmts: Stmt[], outlasting: (n: string) => boolean): string | undefined {
  const seen = new Set<Fn>();
  type Out = (n: string) => boolean;
  const callIn = (n: Expr | Stmt, out: Out): string | undefined => {
    if (n.k === "fn" || n.k === "serverfn") return undefined;
    if (n.k === "call" && n.f.k === "id" && out(n.f.name)) return n.f.name;
    if ((n.k === "write" || n.k === "optimistic")) for (const seg of n.target.path) if (typeof seg !== "string") { const r = callIn(seg, out); if (r) return r; }
    for (const c of subExprs(n as Expr)) { const r = callIn(c, out); if (r) return r; }
    return undefined;
  };
  const go = (ss: Stmt[], cl: Closures, acts0: Set<string>, outer: Out): string | undefined => {
    const local = new Map(cl); const acts = new Set(acts0);
    const lets = new Set(ss.flatMap(s => s.k === "let" || s.k === "for" ? [s.name] : s.k === "try" && s.catchName ? [s.catchName] : []));
    for (const s of ss) {
      if (s.k === "let") { acts.delete(s.name); if (s.e.k === "fn" && s.e.stmts && inferredAction(s.e.stmts) && (actionWaits(s.e.stmts) || go(s.e.stmts, local, acts, outer) !== undefined)) acts.add(s.name); }
      const c = closureOf(s); if (c) { local.set((s as { name: string }).name, c); continue; } else if (s.k === "let") local.delete(s.name);
      const called = (s.k === "expr" || s.k === "let") ? calledClosure(s.e, local) : null;
      if (called) { if (!seen.has(called)) { seen.add(called); const r = go(called.stmts!, local, acts, outer); if (r) return r; } continue; }
      const out: Out = n => acts.has(n) || (!lets.has(n) && outer(n));
      let r: string | undefined;
      switch (s.k) {
        case "action": if (actionWaits(s.body) || go(s.body, local, acts, outer) !== undefined) return "action { … }"; break;
        case "sif": r = callIn(s.c, out) ?? go(s.t, local, acts, out) ?? go(s.f, local, acts, out); break;
        case "for": r = callIn(s.e, out) ?? go(s.body, local, acts, out); break;
        case "try": r = go(s.body, local, acts, out) ?? (s.handler ? go(s.handler, local, acts, out) : undefined) ?? (s.fin ? go(s.fin, local, acts, out) : undefined); break;
        default: r = callIn(s, out);
      }
      if (r) return r;
    }
    return undefined;
  };
  return go(stmts, new Map(), new Set(), outlasting);
}
export const triggerText = (t: Trigger): string => t === "write+await" ? "it writes and awaits" : `it has \`${t === "optimistic" ? "guess" : t}\``;

export type Finding = { code: "HELD_WRITE" | "STALE_OWN_READ" | "STALE_WRITE_BACK" | "STALE_CAPTURE" | "STALE_NEXT_READ"; name: string; via?: string; /** AC-1h, AC-1d (2026-11-27): where the write or the read is — a called action, an equation read */ at?: string };
/** A parameter type that names a plain value (an id, a title, a position), not a row: `number`, `string`, `boolean`, literals, `null`. */
export const scalarType = (t?: string): boolean => !!t && t.split("|").every(m => /^\s*(number|string|boolean|null|undefined|"[^"]*"|'[^']*'|-?\d+(\.\d+)?)\s*$/.test(m));
export type RunOpts = { ptypes?: (string | undefined)[]; answered?: (name: string) => boolean; stateful?: (name: string) => boolean; isAction?: (name: string) => boolean;
  /** AC-1h (2026-11-27): an action of the scope that settles as it returns: the sources its run writes computed from their own value (its writes land in the caller's instant) */
  staleOf?: (name: string) => string[] | undefined;
  /** AC-1h, AC-1d (2026-11-27): an equation of the scope: the sources it is computed from, at their paths (a plain read of it in a run is a read of them as committed) */
  eqDeps?: (name: string) => { k: string; path: string[] }[] | undefined;
  /** the summary of `staleOf`: every write computed from its own source, held or not, is collected here instead of reported */
  collect?: string[] };
type Path = string[];                                                   // keys from the source; "*" a computed key
type Dep = { k: string; path: Path; epoch: number; thru?: string };     // AC-1e: a source read, and the awaits passed when it was read; thru: the equation it was read through
// taint: the source reads each local's value was computed from; epoch: the awaits passed on this path (the most, after a merge)
type State = { written: Map<string, Path[]>; held: Set<string>; dead: boolean; taint: Map<string, Dep[]>; epoch: number };
const clone = (s: State): State => ({ written: new Map([...s.written].map(([k, v]) => [k, [...v]])), held: new Set(s.held), dead: s.dead, taint: new Map([...s.taint].map(([k, v]) => [k, [...v]])), epoch: s.epoch });
const merge = (...ss: State[]): State => {
  const live = ss.filter(s => !s.dead); if (!live.length) return { ...clone(ss[0]), dead: true };
  const out: State = { written: new Map(), held: new Set(), dead: false, taint: new Map(), epoch: 0 };
  for (const s of live) {
    for (const [k, v] of s.written) out.written.set(k, [...(out.written.get(k) ?? []), ...v]); s.held.forEach(h => out.held.add(h));
    for (const [k, v] of s.taint) out.taint.set(k, [...(out.taint.get(k) ?? []), ...v]); out.epoch = Math.max(out.epoch, s.epoch);
  }
  return out;
};
const overlaps = (a: Path, b: Path): boolean => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i] && a[i] !== "*" && b[i] !== "*") return false; return true; };

/** AC-1c…AC-1e and AC-1g over one imperative run. `action`: the body is one change across its awaits (AC-1); a plain run's change
 *  ends at each `await` (07 §5). `inferred`: an action by AC-1b, the only kind HELD_WRITE applies to — a declared `action`
 *  holds an early write on purpose (a transition: `action go() { id := 2; await prefetch() }`, S-solid-20). `bound`: the
 *  run's parameters. In source order, per path: a plain write that reaches an `await` in an inferred action is HELD_WRITE;
 *  a read of a source this change wrote, at an overlapping key, is STALE_OWN_READ; a plain write after an `await` whose value comes from a read of the same source (at an overlapping key) taken before that `await`, directly or through a local, is STALE_WRITE_BACK.
 *  In a declared action (`opts`), a write after an `await` into a source with a question (an answer) whose value — closures
 *  included — names a source or equation, a local read from one, or a parameter typed as a row (not a plain value), is
 *  STALE_CAPTURE (AC-1g): it takes only the `await`'s value, plain arguments, and its own value at the write. A guess is not a held write (it shows now, H-11) but is a write a read does not see (H-10). A
 *  functional write (`x := v => …`, W-6) reads nothing now; a closure's body runs later, unless it is a local closure called
 *  here; `pending?` and `latest` are probes, not snapshots. Each finding once per name. */
/** AC-1h (2026-11-27): the sources a run writes computed from their own value — what a caller's run takes on when it calls
 *  an action that settles as it returns (its writes are the caller's). */
export function ownNextWrites(stmts: Stmt[], bound: string[], opts: RunOpts): string[] { const collect: string[] = []; runFindings(stmts, false, bound, false, { ...opts, collect }); return collect; }
/** AC-1h, AC-1d (2026-11-27): what an expression is computed from, read where it stands (an equation's: no locals) — the
 *  names it reads, at their paths, as a run's `deps` reads them (a closure, a probe, `peek`, an `await` read nothing now). */
export function exprDeps(e: Expr, out: { k: string; path: string[] }[] = []): { k: string; path: string[] }[] {
  const path: Path = []; let x = e;
  while (x.k === "member" || x.k === "index") { if (x.k === "member") path.unshift(x.p); else { path.unshift(x.i.k === "lit" && typeof x.i.v === "string" ? x.i.v : "*"); exprDeps(x.i, out); } x = x.o; }
  if (x.k === "id") { out.push({ k: x.name, path }); return out; }
  if (x.k === "use") return out;
  if (x !== e) return exprDeps(x, out);
  switch (x.k) {
    case "fn": case "serverfn": case "draft": case "pending": case "latest": case "lit": case "pre": case "peek": case "stylemap": case "await": return out;
    default:
      for (const v of Object.values(x as object)) {
        if (Array.isArray(v)) v.forEach(y => { if (y && typeof y === "object") { if ("k" in y) exprDeps(y as Expr, out); else if ("v" in y) exprDeps((y as { v: Expr }).v, out); else if ("spread" in y) exprDeps((y as { spread: Expr }).spread, out); } });
        else if (v && typeof v === "object" && "k" in (v as object)) exprDeps(v as Expr, out);
      }
      return out;
  }
}
export function runFindings(stmts: Stmt[], action: boolean, bound: string[] = [], inferred = false, opts: RunOpts = {}): Finding[] {
  const out: Finding[] = []; const said = new Set<string>();
  const report = (code: Finding["code"], name: string, via?: string, at?: string) => { const k = code + name; if (!said.has(k)) { said.add(k); out.push({ code, name, ...(via ? { via } : {}), ...(at ? { at } : {}) }); } };
  const key = (name: string, ctx?: boolean) => (ctx ? "use " : "") + name;
  // AC-1h: plain writes computed from their own source, in a change that is held — a declared action's body before an
  // `await`, or a plain run's stretch that calls an action by name (it joins that action's change, AC-1). An inferred
  // action's are HELD_WRITE already.
  let next: string[] = []; let joins: string | null = null; let seen = new Set<string>(); const localActions = new Set<string>();   // seen: sources this change read plainly (a functional write beside one still leaves that read stale)
  const nextAt = new Map<string, string>();                                                    // where a write of `next` is, when it is not this run's own statement
  const flushNext = (held: boolean) => { if (opts.collect) opts.collect.push(...next.filter(n => !opts.collect!.includes(n))); else if (held && !inferred) next.forEach(n => report("STALE_NEXT_READ", n, joins ?? undefined, nextAt.get(n))); next = []; joins = null; seen = new Set(); nextAt.clear(); };
  const pushNext = (k: string, at?: string) => { if (!next.includes(k)) { next.push(k); if (at) nextAt.set(k, at); } };
  const walk = (ss: Stmt[], st: State, shadow: Set<string>, cl: Closures, depth: Set<Fn>): State => {
    const sh = new Set(shadow); const local = new Map(cl);
    const read = (e: Expr): void => {
      const path: Path = []; let x = e;
      while (x.k === "member" || x.k === "index") { if (x.k === "member") path.unshift(x.p); else { path.unshift(x.i.k === "lit" && typeof x.i.v === "string" ? x.i.v : "*"); read(x.i); } x = x.o; }
      if ((x.k === "id" && !sh.has(x.name)) || x.k === "use") {
        const k = key(x.name, x.k === "use"); const ws = st.written.get(k);
        if (ws?.some(w => overlaps(w, path))) report("STALE_OWN_READ", k);
        seen.add(k);
        if (x.k === "id") for (const d of opts.eqDeps?.(x.name) ?? []) seen.add(d.k);   // AC-1h: an equation reads its sources as committed (not AC-1d's: comparing with the value before a write through an equation is common and right — kobalte's collapsible, radio)
        return;
      }
      if (x !== e) { read(x); return; }
      switch (x.k) {
        case "fn": case "serverfn": case "draft": case "pending": case "latest": case "lit": case "pre": case "peek": case "stylemap": return;
        case "call": {
          const c = calledClosure(x, local);
          if (!c && x.f.k === "id" && !joins && ((!sh.has(x.f.name) && opts.isAction?.(x.f.name)) || localActions.has(x.f.name))) joins = x.f.name;
          x.args.forEach(read);
          if (!c && x.f.k === "id" && !sh.has(x.f.name)) for (const k of opts.staleOf?.(x.f.name) ?? []) pushNext(k, `in ${x.f.name}, which this run calls`);   // AC-1h (2026-11-27): its writes are this run's
          if (c) { if (!depth.has(c)) { const inner = new Set(sh); c.params.forEach(p => inner.add(p)); const after = walk(c.stmts!, { ...clone(st), dead: false }, inner, local, new Set([...depth, c])); st.written = after.written; st.held = after.held; st.epoch = after.epoch; } return; }
          read(x.f); return;
        }
        default:
          for (const v of Object.values(x as object)) {
            if (Array.isArray(v)) v.forEach(y => { if (y && typeof y === "object") { if ("k" in y) read(y as Expr); else if ("v" in y) read((y as { v: Expr }).v); else if ("spread" in y) read((y as { spread: Expr }).spread); } });
            else if (v && typeof v === "object" && "k" in (v as object)) read(v as Expr);
          }
      }
    };
    // AC-1e: the source reads a value is computed from now — read directly (at this epoch) or through a local's taint. A
    // closure's body runs later; an awaited answer is the server's, not a snapshot of a source.
    const deps = (e: Expr, out: Dep[] = []): Dep[] => {
      const path: Path = []; let x = e;
      while (x.k === "member" || x.k === "index") { if (x.k === "member") path.unshift(x.p); else { path.unshift(x.i.k === "lit" && typeof x.i.v === "string" ? x.i.v : "*"); deps(x.i, out); } x = x.o; }
      if (x.k === "id" && sh.has(x.name)) { out.push(...(st.taint.get(x.name) ?? [])); return out; }
      if (x.k === "id" || x.k === "use") { out.push({ k: key(x.name, x.k === "use"), path, epoch: st.epoch }); if (x.k === "id") for (const d of opts.eqDeps?.(x.name) ?? []) out.push({ k: d.k, path: d.path, epoch: st.epoch, thru: x.name }); return out; }
      if (x !== e) return deps(x, out);
      switch (x.k) {
        case "fn": case "serverfn": case "draft": case "pending": case "latest": case "lit": case "pre": case "peek": case "stylemap": case "await": return out;
        default:
          for (const v of Object.values(x as object)) {
            if (Array.isArray(v)) v.forEach(y => { if (y && typeof y === "object") { if ("k" in y) deps(y as Expr, out); else if ("v" in y) deps((y as { v: Expr }).v, out); else if ("spread" in y) deps((y as { spread: Expr }).spread, out); } });
            else if (v && typeof v === "object" && "k" in (v as object)) deps(v as Expr, out);
          }
          return out;
      }
    };
    // AC-1g: the locals and parameters a write's value names, closures included (a functional write's closure runs at the
    // write, but a local it names was fixed before it) — with each one's taint.
    const caps = (e: Expr): { via: string; d: Dep }[] => { const ns = new Set<string>(); freeNames(e, new Set(), ns); return [...ns].filter(n => sh.has(n)).flatMap(n => (st.taint.get(n) ?? []).map(d => ({ via: n, d }))); };
    const onAwait = () => { if (action) { st.held.forEach(h => report("HELD_WRITE", h)); st.held.clear(); flushNext(true); } else { st.written.clear(); flushNext(!!joins); } };
    for (const s of ss) {
      if (st.dead) break;
      switch (s.k) {
        case "let": case "expr": {
          read(s.e);
          const d = stmtAwait(s) ? [] : deps(s.e);
          if (stmtAwait(s)) { st.epoch++; onAwait(); }
          if (s.k === "let") { const c = closureOf(s); sh.add(s.name); st.taint.set(s.name, d); if (c) local.set(s.name, c); else local.delete(s.name); if (s.e.k === "fn" && s.e.stmts && inferredAction(s.e.stmts)) localActions.add(s.name); else localActions.delete(s.name); }
          break;
        }
        case "write": case "optimistic": {
          for (const p of s.target.path) if (typeof p !== "string") read(p);
          if (s.e.k !== "fn") read(s.e);
          const k = key(s.target.name, s.target.ctx);
          const wpath = s.target.path.map(p => typeof p === "string" ? p : p.k === "lit" && typeof p.v === "string" ? p.v : "*");
          const back = s.k === "write" && s.e.k !== "fn" && deps(s.e).some(d => d.k === k && d.epoch < st.epoch && overlaps(d.path, wpath));
          if (back) report("STALE_WRITE_BACK", k);
          else if (s.k === "write" && (s.e.k === "fn" ? seen.has(k) : deps(s.e).some(d => d.k === k && (action || d.epoch === st.epoch) && overlaps(d.path, wpath)))) { const d = s.e.k === "fn" ? undefined : deps(s.e).find(d => d.k === k && (action || d.epoch === st.epoch) && overlaps(d.path, wpath)); pushNext(k, d?.thru ? `through ${d.thru}` : undefined); }
          else if (s.k === "write" && st.epoch > 0 && !s.target.ctx && opts.answered?.(s.target.name)) {
            // the answer takes the server's answer, plain arguments and its own value at the write (the closure's argument):
            // a row parameter, a local read from any source (before the `await` or after it), or another source read here is not the server's
            const c = caps(s.e)[0]?.via; const ns = new Set<string>(); freeNames(s.e, new Set(), ns);
            const o = c ?? [...ns].find(n => !sh.has(n) && !!opts.stateful?.(n));
            if (o) report("STALE_CAPTURE", k, o);
          }
          st.written.set(k, [...(st.written.get(k) ?? []), wpath]);
          if (s.k === "write" && inferred) st.held.add(k);
          break;
        }
        case "return": if (s.e) read(s.e); st.dead = true; break;
        case "throw": read(s.e); st.dead = true; break;
        case "sif": { read(s.c); const t = walk(s.t, clone(st), sh, local, depth), f = walk(s.f, clone(st), sh, local, depth); Object.assign(st, merge(t, f)); break; }
        // 07 §5: a loop's body may not run, run once, or run again over what its last turn wrote
        case "for": { read(s.e); const bs = new Set([...sh, s.name]); const once = walk(s.body, clone(st), bs, local, depth); const again = walk(s.body, { ...clone(once), dead: false }, bs, local, depth); Object.assign(st, merge(st, once, again)); break; }
        case "try": {
          const before = clone(st);
          const body = walk(s.body, clone(st), sh, local, depth);
          const caught = s.handler ? walk(s.handler, merge(before, { ...body, dead: false }), s.catchName ? new Set([...sh, s.catchName]) : sh, local, depth) : null;
          const end = caught ? merge(body, caught) : body;
          if (s.fin) { const fin = walk(s.fin, merge(before, { ...end, dead: false }), sh, local, depth); Object.assign(st, fin, { dead: fin.dead || end.dead }); }
          else Object.assign(st, end);
          break;
        }
        // an inline action is its own run, checked on its own; AC-1 (D-7): one that waits is launched as a declared one is,
        // and the run's writes join its change
        case "action": if (!joins && (actionWaits(s.body) || actionJoins(s.body, n => !!opts.isAction?.(n)) !== undefined)) joins = "action { … }"; break;
        case "refresh": case "affects": break;
      }
    }
    return st;
  };
  const taint0 = new Map<string, Dep[]>(); bound.forEach((p, i) => { const t = opts.ptypes?.[i]; if (t && !scalarType(t)) taint0.set(p, [{ k: "param " + p, path: [], epoch: 0 }]); });
  walk(stmts, { written: new Map(), held: new Set(), dead: false, taint: taint0, epoch: 0 }, new Set(bound), new Map(), new Set());
  flushNext(!!joins);                                                  // a declared action's writes after its last `await` land as it ends — unless it launches an action that waits there: they join that change (AC-1h, D-7; 2026-11-27)
  return out.filter(f => f.code !== "STALE_NEXT_READ" || !said.has("HELD_WRITE" + f.name));
}

