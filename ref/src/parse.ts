// Hand-rolled scanner/parser for the abstract syntax (spec/02-core.md §1).
import type { Decl, Expr, Markup, Param, Program, Stmt, Target } from "./ast.ts";
import type { Shape as ContentShape } from "./content.ts";
import { contentShapeOf } from "./signature.ts";

/** A parse error; `code` names the habit it looks like when `hint` recognises one (guide/diagnostics.md), else `PARSE`. */
export class ParseError extends Error { code = "PARSE"; }

const JS_APIS = /\b(useState|useReducer|useMemo|useCallback|useEffect|useRef|createSignal|createMemo|createEffect|createStore|createResource|createAsync)\s*\(/;
/** What a parse failure at `i` most likely meant, when the line reads like JavaScript, React or Solid: `[code, text]`.
 *  `src/parse.rs` `hint` is the same function. */
export function hint(src: string, i: number, msg: string): [string, string] | null {
  const rest = src.slice(i);
  const at = rest.length && !/^\s*$/.test(rest.split("\n")[0]) ? i : src.slice(0, i).trimEnd().length - 1;
  const p = Math.max(0, at);
  const lineStart = (k: number) => src.slice(0, k).lastIndexOf("\n") + 1;
  const line = src.slice(lineStart(p), (src.indexOf("\n", p) + 1 || src.length + 1) - 1).trim();
  const before = src.slice(lineStart(i), i);
  const name = /([A-Za-z_$][A-Za-z0-9_$.]*)\s*$/.exec(before)?.[1] ?? "x";
  if (msg.startsWith("W-2") && rest.startsWith(":=") && /=>\s*[A-Za-z_$][A-Za-z0-9_$.]*\s*$/.test(before))
    return ["REACTIVE_WRITE_IN_OWNED_SCOPE", `an arrow that writes takes a braced body, \`() => { ${name} := … }\`: an expression-bodied arrow is a pure function (SC-3)`];
  if (/^(\+\+|--|(\*\*|\|\||&&|\?\?|[-+*\/%])=|=(?![=>]))/.test(rest))
    return ["ASSIGNMENT", `a source is written with \`:=\`, as a statement in a handler or action: \`${name} := ${name} + 1\`, or \`${name} := v => v + 1\` (W-1, W-6); .rx has no \`=\`, \`+=\` or \`++\` on state`];
  if (/^(export\s+)?(default\s+)?(async\s+)?function\b/.test(line))
    return ["JS_FUNCTION", "`function` is not .rx: a pure function is `fn f(x) => …`, one that writes or awaits is `action f(x) { … }`, one that renders is `component F(props) { … }`"];
  const local = /^(const|let|var)\b/.exec(line);
  if (local)
    return ["JS_LOCAL", `\`${local[1]}\` declares a local only in a handler or action body: in a component or at a module's top level, state is \`source x := …\` and a value computed from others is an equation, \`x = …\``];
  if (/^return\b/.test(line))
    return ["JS_RETURN", "a component has no `return`: its body is declarations, then its markup"];
  const api = JS_APIS.exec(line);
  if (api)
    return ["JS_API", `\`${api[1]}\` is not .rx: state is \`source x := …\`, a value computed from others is \`x = …\`, a side effect is \`effect (x) { … }\``];
  return null;
}
let viewAt = 0;
/** The offset where a program's view begins (after its last declaration) — for tools that edit programs. */
export function viewStart(src: string): number { parseProgram(src); return viewAt; }

class Cursor {
  i = 0;
  pendingStmts: Stmt[] = [];           // a destructuring `let` (07 §5) is several statements: the rest of them, after the first
  imported = new Set<string>();        // the names this module imports so far (a hook's pair is a habit only when it is not one of them)
  temps = 0;                           // `$$n`: the bound value of a destructuring whose right side is not a name (RG-4b)
  src: string;
  constructor(src: string) { this.src = src; }
  get line() { return this.src.slice(0, this.i).split("\n").length; }
  eof() { return this.i >= this.src.length; }
  peek(n = 0) { return this.src[this.i + n] ?? ""; }
  ws(newlines = true) {
    for (;;) {
      const c = this.peek();
      if (c === " " || c === "\t" || c === "\r" || (newlines && c === "\n")) this.i++;
      else if (c === "/" && this.peek(1) === "/") { while (!this.eof() && this.peek() !== "\n") this.i++; }
      else if (c === "/" && this.peek(1) === "*") { const j = this.src.indexOf("*/", this.i + 2); this.i = j < 0 ? this.src.length : j + 2; }
      else break;
    }
  }
  startsWith(s: string) { return this.src.startsWith(s, this.i); }
  eat(s: string) { if (this.startsWith(s)) { this.i += s.length; return true; } return false; }
  expect(s: string) { if (!this.eat(s)) this.fail(`expected '${s}'`); }
  fail(msg: string): never {
    const h = hint(this.src, this.i, msg);
    const near = this.src.slice(this.i, this.i + 20).split("\n")[0];
    const e = new ParseError(`line ${this.line}: ${msg} ${near.trim() ? `near '${near}'` : "at the end of the line"}${h ? ` — ${h[1]}` : ""}`);
    if (h) e.code = h[0];
    throw e;
  }
  ident(): string | null {
    const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(this.src.slice(this.i));
    if (!m) return null;
    this.i += m[0].length;
    return m[0];
  }
  tagName(): string | null {                                          // JSX names: `my-element`, `data-id`, `on:click`
    const m = /^[A-Za-z_$][A-Za-z0-9_$:.-]*/.exec(this.src.slice(this.i));
    if (!m) return null; this.i += m[0].length; return m[0];
  }
  peekIdent(): string | null {
    const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(this.src.slice(this.i));
    return m ? m[0] : null;
  }
  keyword(k: string) {
    const save = this.i;
    if (this.ident() === k && !/[A-Za-z0-9_$]/.test(this.peek())) return true;
    this.i = save; return false;
  }
}

/** A TypeScript type, kept as text: balanced up to a depth-0 stop (`=`, `:=`, `,`, `)`, `=>`, `{` when `braceStops`). 07 §2. */
/** A type's text, up to where the declaration goes on. `=>` inside brackets is a function type, as it is anywhere in a
 *  type alias (`arrows`); elsewhere at the top it starts a body (`fn f(): T => …`). */
function parseType(c: Cursor, braceStops = false, arrows = false): string {
  const start = c.i; let depth = 0;
  while (!c.eof()) {
    const ch = c.peek();
    if (c.startsWith("=>") && (depth > 0 || arrows)) { c.i += 2; continue; }
    if (depth === 0) {
      if (c.startsWith("//") || c.startsWith("=>") || c.startsWith(":=") || ch === "=" || ch === "," || ch === ")" || ch === ";" || ch === "\n" || (braceStops && ch === "{")) break;
    }
    if (ch === '"' || ch === "'" || ch === "`") {   // a string literal type is one token: a `//`, `,` or `)` inside it does not end the type
      c.i++; while (!c.eof() && c.peek() !== ch && c.peek() !== "\n") { if (c.peek() === "\\") c.i++; c.i++; } if (!c.eof() && c.peek() === ch) c.i++; continue;
    }
    if (ch === "(" || ch === "[" || ch === "{" || ch === "<") depth++;
    else if (ch === ")" || ch === "]" || ch === "}" || ch === ">") depth--;
    c.i++;
  }
  const t = c.src.slice(start, c.i).trim(); if (!t) c.fail("type"); return t;
}
/** `x: T key k = …` (ST-4): the type ends where the key begins (found by the type layer: the key was read as type text). */
function splitKey(type: string | undefined): { type?: string; key?: string } { const m = type ? /^([\s\S]*?)\s+key\s+([A-Za-z_$][\w$]*)$/.exec(type) : null; return m ? { type: m[1], key: m[2] } : { type }; }
function optType(c: Cursor, braceStops = false): string | undefined { c.ws(false); if (c.peek() === ":" && c.peek(1) !== "=") { c.i++; c.ws(); return parseType(c, braceStops); } return undefined; }

/** R-f: `A | B` — error class names. `Error` (or TS's `unknown`/`any`) is every failure: undefined. */
function parseClasses(c: Cursor): string[] | undefined {
  const out: string[] = [];
  for (;;) { c.ws(); out.push(c.ident() ?? c.fail("error class")); c.ws(false); if (c.peek() === "|" && c.peek(1) !== "|") { c.i++; continue; } break; }
  return out.some(n => n === "Error" || n === "unknown" || n === "any") ? undefined : out;
}

const KEYWORDS = new Set(["source", "effect", "component", "ref", "await", "latest", "loading", "errored", "fallback", "on", "deferred", "action", "guess", "refresh", "affects", "if", "else", "pre", "peek", "fn", "let", "for", "in", "true", "false", "undefined", "null", "provide", "context", "use", "import", "export", "from", "pure", "return", "type", "interface", "try", "catch", "finally", "throw", "portal"]);

export function parseProgram(src: string): Program {
  const c = new Cursor(src);
  const decls: Decl[] = [];
  c.ws();
  while (!c.eof() && looksLikeDecl(c)) { decls.push(...parseDecls1(c)); c.ws(); c.eat(";"); c.ws(); }
  viewAt = c.i;
  const view = parseMarkup(c, null);
  c.ws();
  if (!c.eof()) c.fail("expected a declaration or markup");
  const dflt = decls.filter(d => d.k === "component" && d.isDefault);
  if (dflt.length > 1) c.fail("two default components: a module has one entry");
  if (view.length === 0 && dflt.length) return { decls, view: [{ k: "el", tag: (dflt[0] as { name: string }).name, attrs: [], children: [], line: dflt[0].line }] };   // MO-1c: the mounted view is the default component, applied
  return { decls, view, legacyView: view.length > 0 };
}

/** MO-8: a declaration file (`api.d.rx`) for a JS module — what each export is, in rows: `export pure fn f(a) rejects(A | B)`,
 *  `export fn g(a)` (io: dirty is the default, R-io-4), `export error NotFound` (a JS class that is an error class), `export type T`. */
/** MO-8l: a declaration the tooling drafted. */
export const isGenerated = (declaration: string): boolean => /(^|\/)node_modules\/\.rx-types\//.test(declaration);
/** MO-10a: whether an import of this row is a primitive the checker binds (`instantiates`). MO-8l: of a draft, an import
 *  that says `pure` is read as with no declaration, where the row has no part only a primitive has (a `ref`, a draft, a
 *  component it makes) to read. */
export function instance(x: JsDecl, declaration: string, importPure: boolean): boolean {
  if (x.kind !== "fn" || !x.instantiates) return false;
  return !(importPure && isGenerated(declaration)) || !!x.refs?.some(Boolean) || shapeHasRef(x.shape) || x.shape === "comp" || !!x.partDrafts || !!x.held || !!x.waits;
}
export type JsDecl =
  | { kind: "fn"; name: string; pure: boolean; params: string[]; draftArgs?: number[]; rejects?: string[]; line: number; side?: "server" | "client"; ptypes?: (string | undefined)[]; ret?: string; refs?: boolean[]; shape?: Shape; instantiates?: boolean; uses?: string[]; provides?: string[]; tparams?: string;  nests?: { kids: string; inside: string }; renders?: string; held?: [string, boolean, string[]][]; waits?: [boolean, string[]]; cbs?: ([boolean, string[]] | null)[]; opts?: boolean[]; drafts?: [number, number[]][]; partDrafts?: Record<string, [number, number[]][]> }   // drafts, partDrafts: MO-10i   // opts: MO-8e, parameters a caller may leave out   // side: 12 SF-5; types: text, for TY (types/), `ref` taken out; MO-10: refs (ref parameters), shape (what its result is), instantiates (written, or inferred from a ref)
  | { kind: "error"; name: string; line: number; fields?: string[] }   // fields: SV-5a, what of an instance is sent (`export error HttpError(status, code?)`; `code?`: it may be absent)
  | { kind: "type"; name: string; line: number; text?: string }
  | { kind: "comp"; name: string; line: number; props: JsProp[]; fails: string[]; content?: ContentShape; uses?: string[]; provides?: string[]; tparams?: string; propsType?: string }   // propsType: MO-8o, the props are a type the library declares, and the record after `&` its fields that carry words   // tparams: MO-8d, a generic component's (`component Select<Option>(…)`)   // MO-11a: a Solid component
  | { kind: "context"; name: string; line: number; from?: string; resolved?: string }   // from: MO-12e, the context is another module's (`export context router from "@tanstack/solid-router"`); resolved: that module's declaration file (the loader's)
  | { kind: "import"; names: { name: string; alias: string }[]; from: string; line: number; span: [number, number] }   // MO-14a: a host declaration's import of the `.rx` components the host renders — or, from a JS module, of the host's own components an `.rx` component applies (MO-14f); span: the row's text
  | { kind: "host"; line: number; provides?: string[]; nests?: { kids: string; inside: string }; span: [number, number, number] }   // MO-14b: the view a JS host makes — `export default component provides(c) nests(children in component) = <tree>`; span: the row's start, its tree's start and end
  | { kind: "value"; name: string; line: number; type?: string };   // MO-8g: a value the module exports (`export const pageSearch: Schema`)   // MO-12a: a JS context (Solid's createContext), named by uses(…) and provides(…)
/** MO-11a: a declared JS component's prop — its TypeScript type, what the component discharges for it, and whether it takes a
 *  component value (MO-11c: its type is `Component`). */
export type JsProp = { name: string; optional: boolean; type?: string; catches?: string[] | "*"; component: boolean; components?: boolean; render?: boolean; callback?: boolean; pure?: boolean; view?: boolean };   // components: MO-11c (2026-11-24), its type holds a `Component` inside a record or an array (`builtins: { Heading?: Component }`): each component in the literal given to it is applied there   // view: MO-11t, it takes a view (typed `View`, not `children`): a component given to it by name is applied there   // render: MO-11k, a function giving a View; callback: MO-10g, any other function
export function parseDeclarations(src: string): JsDecl[] {
  const c = new Cursor(src); const out: JsDecl[] = [];
  const hosts: [string, string, number][] = [];   // MO-11u: each `renders(H)` — the fn, H, and where the word's `(` is
  const members: [string, number][] = [];   // MO-8t: each fn named as a method (`toaster.show`), and where its name ends
  for (;;) {
    c.ws();
    if (c.eof()) {   // MO-11u: H is a component this file declares — the place is said in the library's own rows, and named by no path
      for (const [fn, h, at] of hosts) if (!out.some(d => d.kind === "comp" && d.name === h)) { c.i = at; c.fail(`renders(${h}) on fn ${fn}: this file declares no component ${h} — the word names the component beneath which the library renders what the fn is given, declared here as \`export component ${h}(props: { … })\` (MO-11u)`); }
      // MO-8t: a method's row is written beside its object's — a `const`, or a fn that has methods of its own
      for (const [fn, at] of members) { const base = fn.slice(0, fn.indexOf(".")); if (!out.some(d => (d.kind === "value" || d.kind === "fn") && d.name === base)) { c.i = at; c.fail(`fn ${fn}: this file declares no const or fn ${base} — a method's row is written beside its object's, \`export const ${base}: …\` (MO-8t)`); } }
      return out;
    }
    const line = c.line;
    // MO-14: a host declaration (`host.d.rx`) — the `.rx` components a JS host renders, imported as an `.rx` module imports
    // them, and the view it makes of them (`export default component … = <tree>`)
    if (c.startsWith("import") && /^import[\s{]/.test(c.src.slice(c.i))) {
      const start = c.i; c.keyword("import"); c.ws(); const names: { name: string; alias: string }[] = [];
      if (!c.eat("{")) c.fail("a host declaration imports the components the host renders by their names, `import { Layout, Person } from \"./pages.rx\"` (MO-14a)");
      c.ws(); while (!c.startsWith("}")) { const name = c.ident() ?? c.fail("import name"); c.ws(); let alias = name; if (c.keyword("as")) { c.ws(); alias = c.ident() ?? c.fail("alias"); c.ws(); } names.push({ name, alias }); if (!c.eat(",")) break; c.ws(); } c.expect("}");
      c.ws(); if (!c.keyword("from")) c.fail("from"); c.ws();
      const from = parsePrimary(c); if (from.k !== "lit" || typeof from.v !== "string") c.fail("module path");
      // MO-14f: any other module is JavaScript — a component of the host's own, which an `.rx` component applies and the host renders through
      if (/\.rx$/.test((from as { v: string }).v) && !/^\.{1,2}\//.test((from as { v: string }).v)) c.fail(`import … from ${JSON.stringify((from as { v: string }).v)}: a host declaration imports the \`.rx\` modules whose components the host renders by a relative path (MO-14a)`);
      out.push({ kind: "import", names, from: (from as { v: string }).v, line, span: [start, c.i] }); continue;
    }
    const rowStart = c.i;
    if (!c.keyword("export")) c.fail("a declaration file declares exports: `export pure fn …`, `export fn …`, `export component …`, `export error …`, `export type …`");
    c.ws();
    if (c.keyword("default")) {   // MO-14b
      c.ws(); if (!c.keyword("component")) c.fail("export default component … = <tree>: the view a JS host makes of the `.rx` components it renders (MO-14b)");
      if (out.some(d => d.kind === "host")) c.fail("a host declaration states one view: `export default component … = …` is written once (MO-14b)");
      let provides: string[] | undefined; let nests: { kids: string; inside: string } | undefined;
      for (;;) {
        c.ws(false);
        if (c.keyword("provides")) { c.ws(false); provides = [...(provides ?? []), ...contextNames(c)]; continue; }
        if (c.keyword("nests")) { c.ws(false); c.expect("("); c.ws(); const kids = c.ident() ?? c.fail("nests(children in component): a field of the record (MO-11i)"); c.ws(); if (!c.keyword("in")) c.fail("nests(children in component) (MO-11i)"); c.ws(); const inside = c.ident() ?? c.fail("nests(children in component): the field that holds the component"); c.ws(); c.expect(")"); nests = { kids, inside }; continue; }
        break;
      }
      c.ws(false); if (!c.eat("=")) c.fail("export default component provides(…) nests(children in component) = <tree>: the words a factory's row has, then the records the host renders (MO-14b)");
      c.ws(); if (c.peek() !== "{" && c.peek() !== "[") c.fail("the host's tree is a record or a list of records, `{ component: Layout, children: [{ component: Person }] }` (MO-14b)");
      const treeStart = c.i; parsePrimary(c);
      out.push({ kind: "host", line, ...(provides ? { provides } : {}), ...(nests ? { nests } : {}), span: [rowStart, treeStart, c.i] }); continue;
    }
    if (c.startsWith("type") || c.startsWith("interface")) { const t0 = c.i; c.keyword("type") || c.keyword("interface"); c.ws(); const name = c.ident() ?? c.fail("type name"); c.ws(); typeParams(c); c.ws(); if (c.eat("=")) { c.ws(); parseType(c, false, true); } else if (c.startsWith("{")) { let depth = 0; do { if (c.peek() === "{") depth++; if (c.peek() === "}") depth--; c.i++; } while (!c.eof() && depth); } out.push({ kind: "type", name, line, text: c.src.slice(t0, c.i) }); continue; }
    if (c.keyword("error")) {
      c.ws(); const name = c.ident() ?? c.fail("error class name"); c.ws(false);
      let fields: string[] | undefined;   // SV-5a: `(status, code: string)`, the fields of an instance sent to the client; none, name and message only
      if (c.eat("(")) { const t0 = c.i; let depth = 1; while (!c.eof() && depth) { const ch = c.peek(); if ("([{<".includes(ch)) depth++; else if (")]}>".includes(ch)) depth--; c.i++; } fields = splitTop(c.src.slice(t0, c.i - 1), ",").map(f => f.split(":")[0].replace(/\s+/g, "")).filter(f => f && f !== "?"); }   // an optional field keeps its `?` (`code?`): an instance may come without it
      out.push({ kind: "error", name, line, ...(fields?.length ? { fields } : {}) }); continue;
    }
    if (c.keyword("const")) { c.ws(); const name = c.ident() ?? c.fail("const name"); c.ws(false); const type = c.eat(":") ? (c.ws(), parseType(c, false, true)) : undefined; out.push({ kind: "value", name, line, ...(type ? { type } : {}) }); continue; }   // MO-8g
    if (c.keyword("context")) { c.ws(); const name = c.ident() ?? c.fail("context name");   // MO-12a
      const save = c.i; c.ws(false); let from: string | undefined;
      if (c.keyword("from")) { c.ws(false); const m = parsePrimary(c); if (m.k !== "lit" || typeof m.v !== "string") c.fail("export context c from \"<module>\": the module whose declaration declares the context (MO-12e)"); from = (m as { v: string }).v; } else c.i = save;   // MO-12e
      out.push({ kind: "context", name, line, ...(from !== undefined ? { from } : {}) }); continue; }
    if (c.keyword("component")) { out.push(parseJsComponent(c, line)); continue; }
    const side = c.keyword("server") ? "server" as const : c.keyword("client") ? "client" as const : undefined; c.ws();   // 12 SF-5: runs on one side only
    const pure = c.keyword("pure"); c.ws();
    if (!c.keyword("fn")) c.fail("fn");
    c.ws(); let name = c.ident() ?? c.fail("fn name");
    // MO-8t (2026-11-25): a method of a value this file declares — `export fn toaster.show(…)`, `export fn toast.success(…)`
    { const at = c.i; while (c.peek() === ".") { c.i++; name += "." + (c.ident() ?? c.fail("a method's name: `fn toaster.show(…)` (MO-8t)")); } if (name.split(".").length > 2) c.fail("a method is named by one step from the value this file declares: `fn toaster.show(…)` (MO-8t)"); if (name.includes(".")) members.push([name, at]); }
    c.ws(); const tparams = typeParams(c); c.ws(); c.expect("("); c.ws();   // MO-8d: `fn f<const S extends string>(…)`, TypeScript's, for TY
    const params: string[] = []; const ptypes: (string | undefined)[] = []; const refs: boolean[] = [];
    const opts: boolean[] = [];
    const draftArgs: number[] = [];   // MO-10i (2026-11-22): `draft list: T[]` — a parameter the fn changes in place, now, and does not keep: a draft is given to it as it is
    while (!c.startsWith(")")) { const r = c.keyword("ref"); if (r) c.ws(); refs.push(r);
      { const sd = c.i; if (!r && c.keyword("draft")) { c.ws(); if (/^[A-Za-z_$]/.test(c.peek())) draftArgs.push(refs.length - 1); else c.i = sd; } }   /* a parameter named draft stays a name */ const rest = !r && c.eat("...");   /* MO-8h: a rest parameter, `...items: T[]` */ params.push((rest ? "..." : "") + (c.ident() ?? c.fail("param"))); c.ws(false); opts.push(c.eat("?")); c.ws(false); ptypes.push(c.peek() === ":" ? (c.i++, c.ws(), parseType(c, false, true)) : undefined); c.ws(); if (!c.eat(",")) break; c.ws(); }   // MO-10a: a ref parameter takes an accessor
    c.expect(")");
    if (pure && draftArgs.length) c.fail(`${name}: a fn that changes what it is given (\`draft ${params[draftArgs[0]]}\`) is not \`pure\` (MO-10i)`);
    const save = c.i; c.ws(false); let ret: string | undefined; let shape: Shape | undefined; let held: [string, boolean, string[]][] | undefined; let waits: [boolean, string[]] | undefined;
    if (c.peek() === ":" ) { c.i++; c.ws(); const line0 = c.src.slice(c.i).split("\n")[0]; const t = codeOf(line0); const r = /\brejects\(|\binstantiates\b|\buses\(|\bprovides\(|\bnests\(|\brenders\b|\bcarries\b|\bunder\(|\btrusted\b|\bforwards\b|\bjoins\(|\bmethods\(/.exec(masked(t));   /* row words only at the row's top level: not in a string literal or inside brackets (`: "renders"`, `: { renders: boolean }`) */ if (/(^|[:,\[{]\s*)holds\b/.test(r ? t.slice(0, r.index) : t)) c.fail(gone("holds")); const fr = typeWords(r ? t.slice(0, r.index) : t, "result"); if (!fr) c.fail(gone("pending"));   /* MO-10l: `pending` and `fails(…)` before a `ref` part; before a plain field (MO-10f, withdrawn, MO-8r 2026-11-23) they are refused by name, wherever in the result they are written */ held = fr.held; waits = fr.whole; shape = fr.parts ? shapeOf(fr.parts) : undefined; ret = fr.text || undefined; c.i += r ? r.index : line0.length; } else c.i = save;   // MO-10b: `ref T` is an accessor, read as T
    c.ws(false); let rejects: string[] | undefined;
    if (c.keyword("rejects")) { c.ws(); c.expect("("); rejects = parseClasses(c) ?? ["Error"]; c.ws(); c.expect(")"); }
    let written = false; let uses: string[] | undefined; let provides: string[] | undefined; let nests: { kids: string; inside: string } | undefined; let renders: string | undefined;
    for (;;) {                                                                             // MO-12b: `instantiates`, `uses(…)`, `provides(…)`, in any order
      c.ws(false);
      if (c.keyword("instantiates")) { written = true; continue; }
      for (const [w, why] of GONE_WORDS) if (c.keyword(w)) c.fail(why);
      // MO-11r: the placement vocabulary is `nests(children in component)` on a factory, and no word (MO-11s). The rest is
      // withdrawn (MO-8r), each refused by name with what is written instead
      if (c.keyword("carries")) c.fail(gone("renders(later)"));
      if (c.keyword("under")) c.fail(gone("nests(under)"));
      if (c.keyword("renders")) { c.ws(false);
        if (c.peek() !== "(") c.fail(gone("renders"));   // MO-11l, withdrawn (MO-8r, 2026-11-23): "here, where its result is bound"
        const at = c.i; c.i++; c.ws();
        if (c.keyword("root")) c.fail(gone("renders(root)"));
        if (c.keyword("later")) c.fail(gone("renders(later)"));   // MO-11o, withdrawn (MO-8r, 2026-11-23): "later, where a prop declared `renders` renders the result"
        // MO-11u (2026-11-24): `renders(H)` — the components the fn is given are rendered later, beneath an application of H, a component this file declares
        let h = c.ident(); if (!h || !/^[A-Z]/.test(h)) c.fail(RENDERS_HOST);
        while (c.peek() === ".") { c.i++; h += "." + (c.ident() ?? c.fail(RENDERS_HOST)); }
        c.ws(); if (!c.eat(")")) c.fail(RENDERS_HOST);
        if (renders !== undefined) c.fail(`fn ${name} says \`renders(…)\` twice: the components it is given are rendered beneath one component (MO-11u)`);
        renders = h!; hosts.push([name, h!, at]); continue; }
      if (c.keyword("uses")) { c.ws(false); uses = [...(uses ?? []), ...contextNames(c)]; continue; }
      if (c.keyword("provides")) { c.ws(false); provides = [...(provides ?? []), ...contextNames(c)]; continue; }
      if (c.keyword("nests")) { c.ws(false); c.expect("("); c.ws(); const first = c.ident() ?? c.fail("nests(children in component): a field of the record (MO-11i)"); c.ws();
        if (c.keyword("in")) { c.ws(); const inside = c.ident() ?? c.fail("nests(children in component): the field that holds the component"); c.ws(); c.expect(")"); nests = { kids: first, inside }; continue; }   // MO-11i: a children field
        if (c.keyword("under")) c.fail(gone("nests(under)"));   // MO-11p, withdrawn (MO-8r, 2026-11-23): a parent link
        c.fail("nests(children in component) (MO-11i)"); }
      break;
    }
    const instantiates = written || refs.some(x => x) || shapeHasRef(shape) || shape === "comp" || !!uses || !!held || !!draftParts(ret) || (pure && renders !== undefined);   // MO-11u: a `pure` fn that keeps the components it is given, for H to render, made something to keep them in (a route) — one that makes nothing keeps nothing (MO-11g)   // MO-10i (2026-11-22): a result with a function part that hands out drafts is state the call made   // MO-10a: inferred from a ref on either side; MO-11f: a component handed back; MO-12b: a context read needs the caller's owner
    if (nests && shape !== "comp") c.fail(`nests(…) on fn ${name}: only a fn that hands back a Component renders what it is given (MO-11i)`);
    if (provides && shape !== "comp") c.fail(`provides(…) on fn ${name}: only a fn that hands back a Component provides a context, to what it renders (MO-12c)`);
    if (renders !== undefined && shape === "comp") c.fail(`renders(${renders}) on fn ${name}: a fn that hands back a Component renders what it is given inside the component it makes (MO-11f) — leave the word out`);
    // MO-10i: callbacks whose parameters are a library's drafts (`(update: (draft state: T) => void) => void`), by position;
    // the word is the .d.rx's, not TypeScript's
    const drafts = ptypes.flatMap((t, i) => { const ds = draftParams(t); return ds.length ? [[i, ds] as [number, number[]]] : []; });
    const partDrafts = draftParts(ret);
    for (const t of [...ptypes, ret]) if (t && TRACKED_WORD.test(maskedStrings(t))) c.fail(gone("tracked"));
    for (const t of [...ptypes, ret]) if (t && HANDLER_MISPLACED.test(maskedStrings(t))) c.fail(`\`handler\` on fn ${name}: it goes before a function type, one the library calls later, outside any computation (MO-10g)`);
    const cbs = callbacks(ptypes);   // MO-10g: before the word is taken out — only a function type marked `handler` is a callback
    for (let i = 0; i < ptypes.length; i++) ptypes[i] = stripHandler(stripDraft(ptypes[i])); ret = stripHandler(stripDraft(ret));
    const row: Extract<JsDecl, { kind: "fn" }> = { kind: "fn", name, pure, params, rejects, line, ptypes, ret, ...(draftArgs.length ? { draftArgs } : {}), ...(drafts.length ? { drafts } : {}), ...(partDrafts ? { partDrafts } : {}), ...(side ? { side } : {}), ...(instantiates ? { refs, shape: shape ?? "value", instantiates } : {}), ...(uses ? { uses } : {}), ...(provides ? { provides } : {}), ...(tparams ? { tparams } : {}), ...(nests ? { nests } : {}), ...(renders !== undefined ? { renders } : {}),  ...(held ? { held } : {}), ...(waits ? { waits } : {}), ...(cbs ? { cbs } : {}), ...(opts.some(Boolean) ? { opts } : {}) };
    // one row an export: a fn with several signatures (TypeScript's overloads) is declared by one of them, and the library's own types say the rest (13 TY-4b)
    if (out.some(d => d.kind === "fn" && d.name === name)) c.fail(`fn ${name} is declared again: an export has one row. A fn with several signatures is declared by one of them (its words are the fn's), and TypeScript reads the others from the library's own types (MO-8b)`);
    out.push(row);
  }
}
/** `t` with every character inside a string literal, or inside brackets (`()`, `[]`, `{}`, `<>`), replaced by `_`: the
 *  same offsets, with only the row's top level left to search for row words. The crate's `masked`, step for step. */
function masked(t: string): string {
  const out = t.split(""); let q = "", depth = 0;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { out[i] = "_"; if (ch === "\\" && i + 1 < t.length) { out[i + 1] = "_"; i++; } else if (ch === q) q = ""; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { q = ch; out[i] = "_"; continue; }
    if ("([{<".includes(ch)) { if (depth > 0) out[i] = "_"; depth++; continue; }
    if (")]}".includes(ch) || (ch === ">" && t[i - 1] !== "=")) { depth = Math.max(0, depth - 1); if (depth > 0) out[i] = "_"; continue; }
    if (depth > 0) out[i] = "_";
  }
  return out.join("");
}
/** A declaration line without its `// comment` (not a `//` inside a string literal type): words in a comment are not rows. */
function codeOf(line: string): string {
  let q = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === "\\") i++; else if (ch === q) q = ""; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { q = ch; continue; }
    if (ch === "/" && line[i + 1] === "/") return line.slice(0, i);
  }
  return line;
}
/** MO-10g: where a declared fn takes callbacks, by parameter: the whole parameter (`[true, []]`), or the fields of a record
 *  parameter (`[false, ["onSuccess"]]`); null where it takes none. A callback is a function type marked `handler` (revised
 *  2026-11-21): a function type alone says nothing of when the library calls it, so a closure passed there is pure. */
const isHandler = (t: string) => /^handler\s+\(/.test(t);
function callbacks(ptypes: (string | undefined)[]): ([boolean, string[]] | null)[] | undefined {
  const out = ptypes.map((t): [boolean, string[]] | null => {
    if (!t) return null;
    if (isHandler(t)) return [true, []];
    if (t.startsWith("{") && t.endsWith("}")) { const fs = splitTop(t.slice(1, -1), ",;").filter(f => f.includes(":") && isHandler(f.slice(f.indexOf(":") + 1).trim())).map(f => fieldName(f.slice(0, f.indexOf(":")))); return fs.length ? [false, fs] : null; }
    return null;
  });
  return out.some(Boolean) ? out : undefined;
}
/** A type text with what its string literals hold blanked, so a word inside one is not read as a row. */
function maskedStrings(t: string): string {
  let out = ""; let q = "";
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { out += "_"; if (ch === "\\" && i + 1 < t.length) { out += "_"; i++; } else if (ch === q) q = ""; }
    else if (ch === '"' || ch === "'" || ch === "`") { q = ch; out += "_"; }
    else out += ch;
  }
  return out;
}
type Held = [string, boolean, string[]][];
/** What `typeWords` read: `text`, the type as TypeScript reads it (the words taken out, the rest as written); `parts`, the
 *  same with each `ref` left where it stood (what MO-10b reads a result's shape off); `held`, the rows by tuple index or
 *  field path (`data`, `result.data`); `whole`, the rows of a result that is itself a `ref`. */
export type TypeWords = { text: string; parts: string; held?: Held; whole?: [boolean, string[]] };
/** The one reader of the words written before a type — `pending`, `fails(E)`, `ref` — by the type's structure: the whole
 *  type, the items of a tuple, the fields of a record. A word is one only at the head of such a part: inside a string
 *  literal (`"ref label"`), a type argument or a parameter list it is the type's own text.
 *  `result` (MO-10b, MO-10l): a declared result — `ref T` at the whole result, an item of its tuple or a field of its
 *  record, with `pending` and `fails(…)` before a `ref` and nowhere else (undefined otherwise).
 *  `props` (MO-10f): a native prop's type — `pending` and `fails(…)` before a field's type, in a record at any depth. */
export function typeWords(src: string, at: "result" | "props"): TypeWords | undefined {
  const t = src.trim(); const rows: [number, number][] = []; const refs: [number, number][] = []; const held: Held = []; let whole: [boolean, string[]] | undefined; let bad = false;
  const fields = (a: number, b: number, prefix: string, depth: number) => {
    for (const [x0, y0] of topRanges(t.slice(a + 1, b - 1), ",;")) {
      const x = x0 + a + 1, y = y0 + a + 1; const i = t.slice(x, y).indexOf(":"); if (i < 0) continue;
      const v = t.slice(x + i + 1, y);
      part(y - v.trimStart().length, y, prefix + fieldName(t.slice(x, x + i)), depth + 1);
    }
  };
  const part = (a: number, b: number, path: string | null, depth: number) => {
    let i = a; let holds = false; let fails: string[] = []; let any = false;
    if (at === "result" || depth > 0) for (let m; (m = /^(pending\b|fails\(([^)]*)\))\s*/.exec(t.slice(i, b))); i += m[0].length) { any = true; if (m[1] === "pending") holds = true; else fails = m[2].split("|").map(y => y.trim()).filter(Boolean); }
    if (any) rows.push([a, i]);
    const rest = t.slice(i, b); const record = rest.length >= 2 && rest.startsWith("{") && rest.endsWith("}");
    if (at === "props") { if (any) held.push([path ?? "", holds, fails]); if (record) fields(i, b, path === null ? "" : path + ".", depth); return; }
    const r = /^ref\s+/.exec(rest);
    if (r) { refs.push([i, i + r[0].length]); if (any) { if (path === null) whole = [holds, fails]; else held.push([path, holds, fails]); } }
    else if (any) bad = true;
    else if (depth === 0) {
      const ro = /^readonly\s+(?=\[)/.exec(rest)?.[0].length ?? 0; const body = rest.slice(ro);
      if (body.length >= 2 && body.startsWith("[") && body.endsWith("]")) topRanges(body.slice(1, -1), ",").forEach(([x, y], k) => part(i + ro + 1 + x, i + ro + 1 + y, String(k), 1));
      else if (!ro && record) fields(i, b, "", 0);
    }
  };
  part(0, t.length, null, 0);
  const without = (cuts: [number, number][]) => { let out = ""; let from = 0; for (const [a, b] of [...cuts].sort((p, q) => p[0] - q[0])) { out += t.slice(from, a); from = b; } return out + t.slice(from); };
  const parts = without(rows);
  if (at === "result" && (bad || /\bpending\s+[A-Za-z_$({\["']|\bfails\([^)]*\)\s*[A-Za-z_$({\["']/.test(maskedStrings(parts)))) return undefined;
  return { text: without([...rows, ...refs]), parts, ...(held.length ? { held } : {}), ...(whole ? { whole } : {}) };
}
/** MO-10f: a native prop's field rows, `{ data: pending fails(Error) T }` — the type as TypeScript reads it, and the rows
 *  by field path; the row words are `.rx`'s own (CN-4a), so a field reads as an `.rx` value with those rows would (MO-8i). */
export function fieldRows(t: string): { text: string; held?: Held } { const w = typeWords(t, "props")!; return { text: w.text, ...(w.held ? { held: w.held } : {}) }; }
/** MO-8d: a declaration's type parameters, `<const S extends string>`, as text (TypeScript's: the checker reads none of it). */
function typeParams(c: Cursor): string | undefined {
  if (c.peek() !== "<") return undefined;
  const t0 = c.i; let depth = 0;
  do { const ch = c.peek(); if (ch === "<") depth++; else if (ch === ">" && c.src[c.i - 1] !== "=") depth--; c.i++; } while (!c.eof() && depth);
  return c.src.slice(t0, c.i);
}

/** MO-11: `Component` or `Component<P>`, and nothing that only contains one (`Component[]`). */
/** MO-11t: `View`, `View | undefined`, `string | View` — a prop that takes a view where the library reads it. A function
 *  giving one is a render prop (MO-11k), and a union with a function in it is not read as either. */
function isViewType(t: string): boolean {
  const alts = splitTop(t, "|"); return alts.some(a => a.trim() === "View") && !alts.some(a => a.includes("=>") || isComponentType(a));
}
/** MO-11c (2026-11-24): a type that holds a `Component` inside a record or an array, read from its text — a record's
 *  field, an array's element, the last argument of `Array<…>`, `Record<K, …>`, `Partial<…>`, `Readonly<…>`, `Required<…>`:
 *  `{ Heading?: Component<{ depth: number }> }`, `Record<string, Component>`, `Component[]`. A function type holds none
 *  (what it is given is the library's to say), and a `Component` itself is MO-11c's own case. */
export function holdsComponent(t: string, inside = false, depth = 0): boolean {
  t = t.trim().replace(/^readonly\s+/, ""); if (!t || depth > 8) return false;
  const alts = splitTop(t, "|"); if (alts.length > 1) return alts.some(a => holdsComponent(a, inside, depth + 1));
  const parts = splitTop(t, "&"); if (parts.length > 1) return parts.some(a => holdsComponent(a, inside, depth + 1));
  if (partOf(t) === "fn") return false;
  if (isComponentType(t)) return inside;
  if (t.endsWith("[]")) return holdsComponent(t.slice(0, -2), true, depth + 1);
  if (t.startsWith("[") && t.endsWith("]")) return splitTop(t.slice(1, -1), ",").some(x => holdsComponent(x, true, depth + 1));
  if (t.startsWith("{") && t.endsWith("}")) return splitTop(t.slice(1, -1), ",;\n").some(f => { const i = f.indexOf(":"); return i >= 0 && holdsComponent(f.slice(i + 1), true, depth + 1); });
  const g = /^(?:Array|ReadonlyArray|Record|Partial|Readonly|Required)\s*</.exec(t);
  if (g && t.endsWith(">")) { const args = splitTop(t.slice(g[0].length, -1), ","); return args.length > 0 && holdsComponent(args[args.length - 1], true, depth + 1); }
  return false;
}
function isComponentType(t: string): boolean {
  const alts = splitTop(t, "|"); if (alts.length > 1) return alts.some(a => isComponentType(a));   // MO-11c: `string | Component` (a polymorphic `as`), `Component | undefined`
  const parts = splitTop(t, "&"); if (parts.length > 1) return isComponentType(parts[0]);   // MO-11m: `Component & { paths: … }`, a component with properties
  const m = /^Component\s*/.exec(t); if (!m) return false; const r = t.slice(m[0].length); if (!r) return true; if (r[0] !== "<") return false;
  let depth = 0; for (let i = 0; i < r.length; i++) { if (r[i] === "<") depth++; else if (r[i] === ">" && r[i - 1] !== "=" && --depth === 0) return i === r.length - 1; }
  return false;
}
/** MO-10i: a function type's parameter list (`(a: A, b: B) => R` → `a: A, b: B`), or null. */
function fnParamsText(t: string): string | null {
  t = t.trim(); if (!t.startsWith("(")) return null; let depth = 0;
  for (let i = 0; i < t.length; i++) { const ch = t[i]; if ("([{<".includes(ch)) depth++; else if (")]}".includes(ch) || (ch === ">" && t[i - 1] !== "=")) { if (--depth === 0) return /^\s*=>/.test(t.slice(i + 1)) ? t.slice(1, i) : null; } }
  return null;
}
/** MO-10i: the positions of a function type's parameters written `draft` (`(draft state: T) => void` → [0]). */
function draftParams(t: string | undefined): number[] {
  const ps = t === undefined ? null : fnParamsText(t); if (ps === null) return [];
  return splitTop(ps, ",").flatMap((p, i) => /^draft\s+[A-Za-z_$]/.test(p) ? [i] : []);
}
/** MO-10i: for a function type, its callback parameters' draft positions. */
function draftsOfFn(t: string): [number, number[]][] {
  const ps = fnParamsText(t); if (ps === null) return [];
  return splitTop(ps, ",").flatMap((p, i) => { const c = p.indexOf(":"); const ds = c < 0 ? [] : draftParams(p.slice(c + 1).trim()); return ds.length ? [[i, ds] as [number, number[]]] : []; });
}
/** MO-10i: a result's function parts that take draft callbacks (`[ref T, (update: (draft s: T) => void) => void]`), by tuple index or field name. */
function draftParts(ret: string | undefined): Record<string, [number, number[]][]> | undefined {
  if (!ret) return undefined; const t = ret.trim(); const out: Record<string, [number, number[]][]> = {};
  if (t.startsWith("[") && t.endsWith("]")) splitTop(t.slice(1, -1), ",").forEach((x, i) => { const d = draftsOfFn(x); if (d.length) out[String(i)] = d; });
  else if (t.startsWith("{") && t.endsWith("}")) for (const f of splitTop(t.slice(1, -1), ",;")) { const c = f.indexOf(":"); if (c < 0) continue; const d = draftsOfFn(f.slice(c + 1).trim()); if (d.length) out[fieldName(f.slice(0, c))] = d; }
  return Object.keys(out).length ? out : undefined;
}
/** The words and forms a declaration had and has no more, each with what says it now: a row written with one is refused
 *  by that message, not read as a type that ends in a name (09 MO-8i, the pruning of 2026-11-22; MO-8r, the withdrawals
 *  of 2026-11-23). One table: a migration message is found here and nowhere else. The first four are plain words,
 *  refused wherever a row's words are read (`GONE_WORDS`); the rest are refused where their form is recognised. */
const GONE: [string, string][] = [
  ["forwards", "`forwards` is not a word of a declaration: a `pure` fn that makes nothing hands what it is given back only as its result, so its call among a factory's arguments already hands its components on (MO-11g) — leave the word out"],
  ["joins", "`joins(…)` is not a word of a declaration: how a router joins a nested path with its parents' is that router's rule (08 CN-8c), and its own types say it — leave the word out"],
  ["methods", "`methods(…)` is not a word of a declaration: a method of an instance is a call whose answer may change (02 E-10); where it is made once, the argument says so with `peek` — leave the word out"],
  ["trusted", "`trusted` is not a word of a declaration (MO-8j): a row is taken on the declaration's word unless the project asks for strict declarations, and then it is shown by `rx-verify --record` — leave the word out"],
  ["renders", "`renders` alone is not a word of a declaration (MO-8r, withdrawn 2026-11-23: one library wrote it): a component given to a fn that says nothing of where it renders it is checked under a root of its own (MO-11s) — leave the word out, and give the component what it needs as its props; where the library renders what the fn is given beneath a component of its own, the row names that component, `renders(Toaster)` (MO-11u)"],
  ["pending", "`pending` before a result's plain field is not a word of a declaration, nor is `fails(…)` there (MO-8r, withdrawn 2026-11-23: one library wrote them): they are written before a `ref` part of a result — the whole result, an item of its tuple or a field of its record — an accessor that waits or fails where it is read, `pending fails(Error) ref T` (MO-10l). A store whose plain fields wait is handed out by a few lines of the app's own JavaScript, a function a field (`data: () => q.data`), declared `{ data: pending fails(Error) ref T }` (MO-10c)"],
  ["renders(later)", "`renders(later)` is not a word of a declaration, nor is `renders` before a prop's type (MO-8r, withdrawn 2026-11-23: one library wrote them): a tree of components a library renders later is given to a factory — a fn of the app's own JavaScript that takes the tree as records and hands back the component that renders it, declared `Component provides(…) nests(children in component)` (MO-11f, MO-11i) — or is built in JavaScript, in a module that imports the `.rx` pages (11 CP-4d). With no word, a component given to a fn is checked under a root of its own (MO-11s); where the library renders what the fn is given beneath a component of its own, the row names that component, `renders(RouterProvider)` (MO-11u)"],
  ["nests(under)", "`nests(component under parent)` is not a word of a declaration (MO-8r, withdrawn 2026-11-23: one library wrote it): a tree is written as records, each one's children in a field — `nests(children in component)` on the factory that is given them (MO-11i), which a few lines of the app's own JavaScript make of a library that links a child to its parent"],
  ["outlet", "`outlet` is not a word of a declaration (MO-8r, withdrawn 2026-11-23: one library wrote it): a layout renders its pages as `props.children`, which a factory declared `nests(children in component)` gives it (MO-11i) — the app's own module passes the library's outlet as the layout's children. Leave the word out: the component is then one that renders nothing of the app's"],
  ["tracked", "`tracked` is not a word of a declaration: a function type without `handler` is a pure function already, however the library calls it (MO-10g) — leave the word out"],
  ["renders(root)", "`renders(root, …)` is not a word of a declaration: a component given to a fn that says nothing of where it renders it is already checked under a root of its own (MO-11s) — leave the word out"],
  ["holds", "`holds` on a field is now `pending`, the row `.rx` reads it with (MO-8i)"],
];
const GONE_WORDS = GONE.slice(0, 4);
const gone = (word: string): string => GONE.find(g => g[0] === word)![1];
/** `tracked` was a word before a function type (a callback the library calls inside a computation of its own). A function
 *  type without `handler` is a pure function already (MO-10g), which is all the checker read of it: the word is refused, so
 *  that a row written with it is not read by the prop's name instead. */
const TRACKED_WORD = /\btracked\s+(?=\()/;
const RENDERS_HOST = "renders(H): H is a component this file declares, named as its tag is (`renders(Toaster)`, `renders(Toast.List)`) — the components the fn is given are rendered later, beneath an application of it (MO-11u). `renders(later)` and `renders(root, …)` are not words of a declaration";
/** MO-10g: `handler` before a function type — the library calls it later, outside any computation (an event, a mutation's
 *  `onSuccess`), so a closure passed there is a handler's: imperative scope. The word is the .d.rx's, not TypeScript's. */
const HANDLER_MISPLACED = /\bhandler\s+(?!\()/;
/** `t` without what `re` finds outside its string literals: a word of the type's own text (`"handler (x)"`) is not the `.d.rx`'s. */
const cutWords = (t: string | undefined, re: RegExp) => { if (t === undefined) return t; let out = ""; let at = 0; for (const m of maskedStrings(t).matchAll(re)) { out += t.slice(at, m.index); at = m.index + m[0].length; } return out + t.slice(at); };
const stripHandler = (t: string | undefined) => cutWords(t, /\bhandler\s+(?=\()/g);
const stripDraft = (t: string | undefined) => cutWords(t, /\bdraft\s+(?=[A-Za-z_$][\w$]*\s*[?:,)])/g);

/** MO-11a: `component A(props: { href: string; children?: View }) fails(…) shape(…)`. */
function parseJsComponent(c: Cursor, line: number): JsDecl {
  c.ws(); let name = c.ident() ?? c.fail("component name");
  while (c.peek() === ".") { c.i++; name += "." + (c.ident() ?? c.fail("a member component's name: `component Dialog.Root(…)`")); }   // MO-11q
  c.ws(); const tparams = typeParams(c);   // MO-8d: `component Select<Option, G = never>(…)`, TypeScript's, for TY
  c.ws(); c.expect("("); c.ws();
  const props: JsProp[] = []; let propsType: string | undefined;
  if (!c.startsWith(")")) {
    if (c.ident() !== "props") c.fail("a component's props: `(props: { … })`"); c.ws(); c.expect(":"); c.ws();
    if (!c.startsWith("{") || !closesProps(c.src, c.i)) propsType = propsTypeOf(c);   // MO-8o: `props: import("kit").SelectProps<Option> & { onChange?: handler (v: Option) => void }`
    if (c.startsWith("{")) { c.expect("{");
    for (;;) {
      c.ws(); if (c.eat("}")) break;
      { const at = c.i; if (c.keyword("readonly")) { c.ws(false); if (c.startsWith("?") || c.startsWith(":")) c.i = at; } }   // MO-10b: `readonly` is a modifier of the field, not its name (a prop may be named `readonly`)
      const fname = c.ident() ?? c.fail("a prop name"); c.ws(false); const optional = c.eat("?"); c.ws(false);
      let type: string | undefined; let catches: string[] | "*" | undefined;
      if (c.eat(":")) {
        c.ws(false);
        if (c.keyword("catches")) { c.ws(false); c.expect("("); c.ws(); if (c.eat("*")) catches = "*"; else catches = parseClasses(c) ?? "*"; c.ws(); c.expect(")"); c.ws(false); }
        const t0 = c.i; let depth = 0;
        while (!c.eof()) {
          const ch = c.peek(); if (depth === 0 && (ch === ";" || ch === "," || ch === "}" || ch === "\n" || c.startsWith("//"))) break;
          if (ch === '"' || ch === "'" || ch === "`") { c.i++; while (!c.eof() && c.peek() !== ch) { if (c.peek() === "\\") c.i++; c.i++; } c.i++; continue; }   // a string literal type
          if ("([{<".includes(ch)) depth++; else if (")]}".includes(ch) || (ch === ">" && c.src[c.i - 1] !== "=")) depth--; c.i++;
        }
        type = c.src.slice(t0, c.i).trim() || undefined;
      }
      if (type && /^renders\s+/.test(type)) c.fail(gone("renders(later)"));   // MO-11o, withdrawn (MO-8r, 2026-11-23): `router: renders any`
      if (type && TRACKED_WORD.test(maskedStrings(type))) c.fail(gone("tracked"));
      let handler = false; if (type && /^handler\s+/.test(type)) { handler = true; type = type.replace(/^handler\s+/, "") || undefined; if (!type || partOf(type) !== "fn") c.fail(`\`handler\` on prop ${fname}: it goes before a function type, one the library calls later, outside any computation (MO-10g)`); }
      props.push({ name: fname, optional, ...(type ? { type } : {}), ...(catches ? { catches } : {}),  component: !!type && isComponentType(type), ...(type && holdsComponent(type) ? { components: true } : {}), ...(fname !== "children" && type && isViewType(type) ? { view: true } : {}), ...(type && /=>\s*View\s*$/.test(type) ? { render: true } : type && handler && !isComponentType(type) && partOf(type) === "fn" ? { callback: true } : type && !isComponentType(type) && partOf(type) === "fn" ? { pure: true } : {}) });   // pure: MO-10g, a function type without `handler`: the declaration decides, whatever the prop's name
      c.ws(false); if (!c.eat(";") && !c.eat(",") && c.peek() !== "\n") { c.ws(); c.expect("}"); break; }   // a newline separates fields too, as in TypeScript
    } }
    c.ws();
  }
  c.expect(")");
  let fails: string[] = []; let content: ContentShape | undefined; let uses: string[] | undefined; let provides: string[] | undefined;
  for (;;) {
    c.ws(false);
    for (const [w, why] of GONE_WORDS) if (c.keyword(w)) c.fail(why);
    if (c.keyword("outlet")) c.fail(gone("outlet"));   // MO-11p, withdrawn (MO-8r, 2026-11-23)
    if (c.keyword("fails")) { c.ws(false); c.expect("("); fails = parseClasses(c) ?? ["Error"]; c.ws(); c.expect(")"); continue; }
    if (c.keyword("uses")) { c.ws(false); uses = [...(uses ?? []), ...contextNames(c)]; continue; }          // MO-12b
    if (c.keyword("provides")) { c.ws(false); provides = [...(provides ?? []), ...contextNames(c)]; continue; }   // MO-12c
    if (c.keyword("shape")) { c.ws(false); c.expect("("); const t0 = c.i; while (!c.eof() && c.peek() !== ")") c.i++; const t = c.src.slice(t0, c.i); c.expect(")"); try { content = contentShapeOf(t); } catch (e) { c.fail((e as Error).message); } continue; }
    break;
  }
  return { kind: "comp", name, line, props, fails, ...(content ? { content } : {}), ...(uses ? { uses } : {}), ...(provides ? { provides } : {}), ...(tparams ? { tparams } : {}), ...(propsType ? { propsType } : {}) };
}
/** MO-8o: a component's props as a type the library declares, `props: Kit.SelectProps<Option>`, with the fields that carry
 *  words in a record after it, `… & { onChange?: handler (v: Option) => void }`: the type's text, TypeScript's (the checker
 *  reads none of it), up to the `&` before a record that closes the props, or to the `)` that does. The cursor is left on
 *  that record's `{`, or on the `)`. */
const skipStringAt = (src: string, j: number) => { const q = src[j]; j++; while (j < src.length && src[j] !== q) { if (src[j] === "\\") j++; j++; } return j + 1; };
/** Whether the record that opens at `j` closes a component's props: its `}` is followed by the `)` of the parameter. */
function closesProps(src: string, j: number): boolean {
  let k = j, braces = 0;
  for (; k < src.length; k++) { const x = src[k]; if (x === '"' || x === "'" || x === "`") { k = skipStringAt(src, k) - 1; continue; } if (x === "{") braces++; else if (x === "}" && --braces === 0) break; }
  let e = k + 1; while (/\s/.test(src[e] ?? "")) e++;
  return src[e] === ")";
}
function propsTypeOf(c: Cursor): string {
  const t0 = c.i; let depth = 0;
  const skipString = (j: number) => skipStringAt(c.src, j);
  const done = (end: number) => { const t = c.src.slice(t0, end).trim(); if (!t) c.fail("a component's props: `(props: { … })`, or a type and the fields that carry words, `(props: Kit.Props & { … })`"); return t; };
  while (!c.eof()) {
    const ch = c.peek();
    if (ch === '"' || ch === "'" || ch === "`") { c.i = skipString(c.i); continue; }
    if (depth === 0 && ch === ")") return done(c.i);
    if (depth === 0 && ch === "&") {
      let j = c.i + 1; while (/\s/.test(c.src[j] ?? "")) j++;
      if (c.src[j] === "{" && closesProps(c.src, j)) { const t = done(c.i); c.i = j; return t; }
    }
    if ("([{<".includes(ch)) depth++; else if (")]}".includes(ch) || (ch === ">" && c.src[c.i - 1] !== "=")) depth--;
    c.i++;
  }
  return c.fail("a component's props: the `)` that closes them");
}
/** MO-12: `(router, theme)` — contexts the same declaration file declares. */
function contextNames(c: Cursor): string[] {
  c.expect("("); const out: string[] = [];
  for (;;) { c.ws(); if (c.eat(")")) return out; out.push(c.ident() ?? c.fail("a context name")); c.ws(); if (!c.eat(",")) { c.ws(); c.expect(")"); return out; } }
}

/** MO-10b: what a primitive's result is — a reader (`ref T`, an accessor), an io function, a value; or a tuple or record of
 *  those (only the result and its parts are declared). */
export type Part = "ref" | "fn" | "value";
export type Shape = Part | "comp" | { items: Part[] } | { fields: [string, Part][] };   // "comp": the whole result is a component (MO-11f)
/** The pieces of a type's text between separators written at its top level: not inside brackets, and not inside a string
 *  literal (`"a, b"` is one piece). Each as the range of the piece, trimmed; empty pieces are left out. */
export function topRanges(s: string, seps: string): [number, number][] {
  const out: [number, number][] = []; let depth = 0, from = 0, q = "";
  const push = (a: number, b: number) => { const piece = s.slice(a, b); const t = piece.trim(); if (t) { const at = a + piece.length - piece.trimStart().length; out.push([at, at + t.length]); } };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === "\\") i++; else if (ch === q) q = ""; }
    else if (ch === '"' || ch === "'" || ch === "`") q = ch;
    else if ("([{<".includes(ch)) depth++; else if (")]}>".includes(ch) && !(ch === ">" && s[i - 1] === "=")) depth--; else if (depth === 0 && seps.includes(ch)) { push(from, i); from = i + 1; }
  }
  push(from, s.length); return out;
}
export function splitTop(s: string, seps: string): string[] { return topRanges(s, seps).map(([a, b]) => s.slice(a, b)); }
function partOf(t: string): Part {
  if (/^ref\s/.test(t)) return "ref";
  if (t.startsWith("(") && /\)\s*=>/.test(t)) return "fn";
  return "value";
}
/** A declared field's name: `readonly width?` is `width` (the modifier and the `?` are TypeScript's, not the name's). */
function fieldName(k: string): string { return k.trim().replace(/^readonly\s+/, "").replace(/\?$/, ""); }
function shapeOf(t: string): Shape {
  if (/^readonly\s+\[/.test(t)) return shapeOf(t.replace(/^readonly\s+/, ""));   // MO-10b: a read-only tuple is a tuple (`as const` results)
  if (t.startsWith("[") && t.endsWith("]")) return { items: splitTop(t.slice(1, -1), ",").map(partOf) };
  if (t.startsWith("{") && t.endsWith("}")) return { fields: splitTop(t.slice(1, -1), ",;").map(f => { const i = f.indexOf(":"); return [fieldName(f.slice(0, i)), partOf(f.slice(i + 1).trim())] as [string, Part]; }) };
  if (isComponentType(t)) return "comp";
  return partOf(t);
}
export function shapeHasRef(s?: Shape): boolean { return !!s && (s === "ref" || (typeof s === "object" && ("items" in s ? s.items : s.fields.map(f => f[1])).includes("ref"))); }

/** RG-4b, 07 §5: a destructuring pattern, `{ a, b: c, d = 1, e: { f }, ...rest }` or `[a, , b, ...rest]`. */
type Pat = { k: "name"; name: string; line: number } | { k: "obj"; props: { key: string; pat: Pat; dflt?: Expr }[]; rest?: Pat } | { k: "arr"; items: ({ pat: Pat; dflt?: Expr } | null)[]; rest?: Pat };
function parseRest(c: Cursor, close: string): Pat {
  c.i += 3; c.ws(); const line = c.line; const name = c.ident(); if (!name || KEYWORDS.has(name)) c.fail("a name for the rest"); c.ws();
  if (!c.startsWith(close)) c.fail(`a rest element is last, with no default: \`...${name}${close}\``);
  return { k: "name", name: name!, line };
}
function parsePattern(c: Cursor): Pat {
  c.ws();
  if (c.eat("{")) {
    const props: { key: string; pat: Pat; dflt?: Expr }[] = [];
    for (;;) {
      c.ws(); if (c.startsWith("}")) break;
      if (c.startsWith("...")) { const rest = parseRest(c, "}"); c.expect("}"); return { k: "obj", props, rest }; }
      const kline = c.line; const key = c.ident() ?? c.fail("a field name"); c.ws();
      const pat: Pat = c.eat(":") ? parsePattern(c) : { k: "name", name: key, line: kline }; c.ws();
      const dflt = c.peek() === "=" && c.peek(1) !== "=" && c.peek(1) !== ">" ? (c.i++, c.ws(), parseExpr(c)) : undefined;
      props.push({ key, pat, dflt }); c.ws();
      if (!c.eat(",")) break;
    }
    c.ws(); c.expect("}"); return { k: "obj", props };
  }
  if (c.eat("[")) {
    const items: ({ pat: Pat; dflt?: Expr } | null)[] = [];
    for (;;) {
      c.ws(); if (c.startsWith("]")) break;
      if (c.startsWith(",")) { c.i++; items.push(null); continue; }
      if (c.startsWith("...")) { const rest = parseRest(c, "]"); c.expect("]"); return { k: "arr", items, rest }; }
      const pat = parsePattern(c); c.ws();
      const dflt = c.peek() === "=" && c.peek(1) !== "=" && c.peek(1) !== ">" ? (c.i++, c.ws(), parseExpr(c)) : undefined;
      items.push({ pat, dflt }); c.ws();
      if (!c.eat(",")) break;
    }
    c.ws(); c.expect("]"); return { k: "arr", items };
  }
  const line = c.line; const name = c.ident(); if (!name || KEYWORDS.has(name)) c.fail("a name to bind");
  return { k: "name", name: name!, line };
}
/** Each name a pattern binds, with its projection of `base` (a default applies when the field is `undefined`, as in JS).
 *  An object rest is `omit` of the named keys: Solid's live view in reactive scope, a copy of it when `snap` (a `let`). */
function expandPattern(pat: Pat, base: Expr, out: { name: string; e: Expr; line: number }[], snap = false) {
  const dfl = (v: Expr, d?: Expr): Expr => d ? { k: "if", c: { k: "bin", op: "==", l: v, r: { k: "lit", v: undefined } }, t: d, f: v } : v;
  if (pat.k === "name") out.push({ name: pat.name, e: base, line: pat.line });
  else if (pat.k === "obj") {
    for (const p of pat.props) expandPattern(p.pat, dfl({ k: "member", o: base, p: p.key }, p.dflt), out, snap);
    if (pat.rest) { const o: Expr = { k: "omit", e: base, keys: pat.props.map(p => p.key) }; expandPattern(pat.rest, snap ? { k: "rec", fields: [{ spread: o }] } : o, out, snap); }
  } else {
    pat.items.forEach((it, i) => { if (it) expandPattern(it.pat, dfl({ k: "index", o: base, i: { k: "lit", v: i } }, it.dflt), out, snap); });
    if (pat.rest) expandPattern(pat.rest, { k: "call", f: { k: "member", o: base, p: "slice" }, args: [{ k: "lit", v: pat.items.length }] }, out, snap);
  }
}
/** A right side that is read again per name without asking twice: a name or a path of names. */
const isPath = (e: Expr): boolean => e.k === "id" || (e.k === "member" && !e.opt && isPath(e.o));
/** At a block's `{ … } = e` or `[ … ] = e`: a destructuring declaration, not a read in the view. */
function destructuringAhead(c: Cursor): boolean {
  const open = c.peek(); if (open !== "{" && open !== "[") return false;
  let depth = 0, j = c.i;
  for (; j < c.src.length; j++) { const ch = c.src[j]; if (ch === "{" || ch === "[") depth++; else if (ch === "}" || ch === "]") { depth--; if (depth === 0) break; } else if (ch === "\"" || ch === "'") { const q = ch; for (j++; j < c.src.length && c.src[j] !== q && c.src[j] !== "\n"; j++) if (c.src[j] === "\\") j++; } else if (ch === "\n" || ch === "<" || ch === "`") return false; }
  const rest = c.src.slice(j + 1);
  return /^[ \t]*=(?![=>])/.test(rest);
}
/** RG-4b: `{ a, b } = e` is one equation per name, each a projection of `e` that keeps updating. */
function parseDestructuringDecl(c: Cursor): Decl[] {
  const line = c.line;
  const pat = parsePattern(c); c.ws(); c.expect("="); c.ws();
  { const m = JS_APIS.exec(c.src.slice(c.i).split("\n", 1)[0]); if (m?.index === 0 && !c.imported.has(m[1])) c.fail("a hook's pair is not .rx"); }   // `[n, setN] = createSignal(0)`: JS_API's hint — unless the module imports that name from a declared JS module (`[todos, setTodos] = createStore(…)`, MO-10i)
  let base = parseExpr(c);
  const out: Decl[] = [];
  if (!isPath(base)) { const t = `$$${++c.temps}`; out.push({ k: "eq", name: t, e: base, line }); base = { k: "id", name: t }; }
  const names: { name: string; e: Expr; line: number }[] = []; expandPattern(pat, base, names);
  for (const n of names) out.push({ k: "eq", name: n.name, e: n.e, line: n.line });
  return out;
}
/** One declaration, or the several a destructuring declares. */
function parseDecls1(c: Cursor): Decl[] { c.ws(); return destructuringAhead(c) ? parseDestructuringDecl(c) : [parseDecl(c)]; }

function parseDecl(c: Cursor): Decl {
  c.ws();
  const line = c.line;
  if (c.keyword("export")) { c.ws();
    if (c.keyword("default")) { c.ws(); const d = parseDecl(c); if (d.k !== "component") c.fail("export default: only a component is a module's default export (the app's entry, MO-1c)"); d.exported = true; d.isDefault = true; return d; }
    const d = parseDecl(c); if (d.k === "import" || d.k === "effect" || d.k === "provide") c.fail("export of a non-declaration"); (d as { exported?: boolean }).exported = true; return d; }
  if (c.keyword("import")) {                                           // 07 §1: `import pure? { a, b as c } from "m"` / `import X from "m"`
    c.ws();
    if (c.peek() === '"' || c.peek() === "'") {                                         // 07 §1a: `import "./styles.css"`, for its effect (a stylesheet, a polyfill)
      const from = parsePrimary(c); if (from.k !== "lit" || typeof from.v !== "string") c.fail("module path");
      if (/\.rx$/.test(from.v)) c.fail(`import ${JSON.stringify(from.v)}: an .rx module is imported for what it exports, \`import { … } from ${JSON.stringify(from.v)}\``);
      return { k: "import", names: [], from: from.v, pure: false, line };
    } const side = /^(server|client)\s+(pure\b|\{)/.test(c.src.slice(c.i)) ? (c.keyword("server") ? "server" as const : (c.keyword("client"), "client" as const)) : undefined; c.ws();   // 12 SF-5: `import server pure { q }`
    const pure = c.keyword("pure"); c.ws();
    const names: { name: string; alias: string }[] = [];
    if (c.eat("{")) { c.ws(); while (!c.startsWith("}")) { const name = c.ident() ?? c.fail("import name"); c.ws(); let alias = name; if (c.keyword("as")) { c.ws(); alias = c.ident() ?? c.fail("alias"); c.ws(); } names.push({ name, alias }); c.imported.add(alias); if (!c.eat(",")) break; c.ws(); } c.expect("}"); }
    else { const name = c.ident() ?? c.fail("import name"); names.push({ name: "default", alias: name }); c.imported.add(name); }
    c.ws(); if (!c.keyword("from")) c.fail("from"); c.ws();
    const from = parsePrimary(c); if (from.k !== "lit" || typeof from.v !== "string") c.fail("module path");
    const save = c.i; c.ws(false);
    const sd = side ? { side } : {};
    if (c.keyword("fails")) { c.ws(); const fails = parseClasses(c) ?? ["Error"]; return { k: "import", names, from: from.v, pure, line, fails, ...sd }; }   // R-f-8
    c.i = save;
    return { k: "import", names, from: from.v, pure, line, ...sd };
  }
  if (/^error\s+[A-Z]/.test(c.src.slice(c.i))) {                     // R-f-1: `error NotFound(id: number) => \`no user ${id}\``
    c.keyword("error"); c.ws(); const name = c.ident() ?? c.fail("error class name"); c.ws(false);
    const params: string[] = []; const ptypes: (string | undefined)[] = [];
    if (c.eat("(")) { c.ws(); while (!c.startsWith(")")) { params.push(c.ident() ?? c.fail("field")); ptypes.push(optType(c)); c.ws(); if (!c.eat(",")) break; c.ws(); } c.expect(")"); }
    const save = c.i; c.ws(false);
    if (c.eat("=>")) { c.ws(); return { k: "error", name, params, ptypes, msg: parseExpr(c), line }; }
    c.i = save;
    return { k: "error", name, params, ptypes, line };
  }
  if (/^(type|interface)\b/.test(c.src.slice(c.i))) {                // a TS type declaration: kept as text, not a binding
    const t0 = c.i; c.keyword("type") || c.keyword("interface");
    c.ws(); const name = c.ident() ?? c.fail("type name"); c.ws();
    if (c.eat("=")) { c.ws(); parseType(c, false, true); } else { c.expect("{"); let depth = 1; while (!c.eof() && depth) { if (c.peek() === "{") depth++; if (c.peek() === "}") depth--; c.i++; } }
    return { k: "typedecl", name, line, text: c.src.slice(t0, c.i) };
  }
  if (c.keyword("source")) {
    c.ws(); const name = c.ident() ?? c.fail("source name"); const tk = splitKey(optType(c)); const type = tk.type; c.ws();
    let key: string | undefined = tk.key;
    if (/^key\s+[A-Za-z_$][\w$]*\s*(=|:=)[^=>]/.test(c.src.slice(c.i))) { c.keyword("key"); c.ws(); key = c.ident() ?? c.fail("key name"); c.ws(); }   // ST-4a on a source
    if (c.eat(":=")) { c.ws(); return { k: "source", name, init: parseExpr(c), line, type, key }; }
    c.expect("="); c.ws();
    return { k: "source", name, init: parseExpr(c), line, question: true, type, key };   // ST-5: a source with a standing question
  }
  if (c.keyword("effect")) {
    c.ws(); c.expect("("); c.ws();
    const inputs: Expr[] = [];
    while (!c.startsWith(")")) { inputs.push(parseExpr(c)); c.ws(); if (!c.eat(",")) break; c.ws(); }
    c.expect(")"); c.ws();
    return { k: "effect", inputs, body: parseBlock(c), line };
  }
  if (c.keyword("deferred")) {
    c.ws(); const name = c.ident() ?? c.fail("deferred name"); const type = optType(c); c.ws(); c.expect("="); c.ws();
    return { k: "eq", name, e: parseExpr(c), line, deferred: true, type };
  }
  if (c.keyword("action")) {
    c.ws(); const name = c.ident() ?? c.fail("action name"); c.ws(); c.expect("("); c.ws();
    const params: string[] = []; const ptypes: (string | undefined)[] = [];
    while (!c.startsWith(")")) { params.push(c.ident() ?? c.fail("param")); ptypes.push(optType(c)); c.ws(); if (!c.eat(",")) break; c.ws(); }
    c.expect(")"); c.ws();
    return { k: "action", name, params, ptypes, body: parseBlock(c), line };
  }
  if (/^server\s+(fn|action)\b/.test(c.src.slice(c.i))) {             // 12 SF-1: `server fn f(a) { … }`
    c.keyword("server"); c.ws(); if (c.keyword("action")) c.fail("`server fn` (SF-1: one form — it is io when its body is; there is no `server action`)"); c.keyword("fn");
    c.ws(); const name = c.ident() ?? c.fail("server function name"); c.ws(); c.expect("("); c.ws();
    const params: string[] = []; const ptypes: (string | undefined)[] = [];
    while (!c.startsWith(")")) { params.push(c.ident() ?? c.fail("param")); ptypes.push(optType(c)); c.ws(); if (!c.eat(",")) break; c.ws(); }
    c.expect(")"); const ret = optType(c, true); c.ws();
    return { k: "server", name, params, ptypes, ret, body: parseBlock(c), line };
  }
  if (c.keyword("context")) {                                         // RG-7: `context name: [source] Type [= default]`
    c.ws(); const name = c.ident() ?? c.fail("context name"); c.ws(false);
    let type: string | undefined; let source = false;
    if (c.peek() === ":" && c.peek(1) !== "=") { c.i++; c.ws(); source = c.keyword("source"); c.ws(); type = parseType(c); }
    const save = c.i; c.ws(false);
    if (c.peek() === "=" && c.peek(1) !== "=" && c.peek(1) !== ">") { c.i++; c.ws(); return { k: "context", name, type, source, dflt: parseExpr(c), line }; }
    c.i = save;
    return { k: "context", name, type, source, line };
  }
  if (c.keyword("provide")) { c.ws(); const name = c.ident() ?? c.fail("provide name"); c.ws(); c.expect("="); c.ws(); return { k: "provide", name, e: parseExpr(c), line }; }
  if (c.keyword("fn")) {
    c.ws(); const name = c.ident() ?? c.fail("fn name"); c.ws(); c.expect("("); c.ws();
    const params: Param[] = [];
    while (!c.startsWith(")")) { const ref = c.keyword("ref"); c.ws(); const pname = c.ident() ?? c.fail("param"); const type = optType(c); params.push({ name: pname, ref, type }); c.ws(); if (!c.eat(",")) break; c.ws(); }
    c.expect(")"); const ret = optType(c, true); c.ws();
    if (c.eat("=>")) { c.ws(); return { k: "fn", name, params, decls: [], tail: parseExpr(c), line, ret }; }
    c.expect("{");
    const decls: Decl[] = [];
    for (;;) { c.ws(); if (!looksLikeDecl(c)) break; decls.push(...parseDecls1(c)); c.ws(); c.eat(";"); }
    c.ws(); const tail = parseExpr(c); c.ws(); c.expect("}");
    return { k: "fn", name, params, decls, tail, line, ret };
  }
  if (c.keyword("component")) {
    c.ws(); const name = c.ident() ?? c.fail("component name"); c.ws(); c.expect("("); c.ws();
    const sig = c.peek() === "{" ? parsePattern(c) : null;           // RG-4b: `component C({ a, b })` — each name a projection of props
    const noneDeclared = !sig && c.peek() === ")";
    const props = sig || c.peek() === ")" ? "props" : (c.ident() ?? c.fail("props name")); const propsType = optType(c); c.ws(); c.expect(")"); c.ws(); c.expect("{");   // `component C()`: no props (found by S-ai2-tracker)
    const { decls, body } = parseBlockBody(c);
    if (sig) { const names: { name: string; e: Expr; line: number }[] = []; expandPattern(sig, { k: "id", name: props }, names); decls.unshift(...names.map(n => ({ k: "eq" as const, name: n.name, e: n.e, line: n.line }))); }
    return { k: "component", name, props, decls, view: body, line, propsType, ...(!sig && props === "props" && noneDeclared ? { noProps: true } : {}) };
  }
  const save = c.i;
  const name = c.ident();
  c.ws(false);
  let key: string | undefined; let type: string | undefined;
  if (name && !KEYWORDS.has(name)) { const tk = splitKey(optType(c)); type = tk.type; key = tk.key; c.ws(false); }
  if (name && !KEYWORDS.has(name) && /^key\s+[A-Za-z_$][\w$]*\s*=[^=>]/.test(c.src.slice(c.i))) { c.keyword("key"); c.ws(); key = c.ident() ?? c.fail("key name"); c.ws(false); }   // ST-4: `x key k = e`
  if (name && !KEYWORDS.has(name) && c.peek() === "=" && c.peek(1) !== "=" && c.peek(1) !== ">") {
    c.i++; c.ws();
    return { k: "eq", name, e: parseExpr(c), line, key, type };
  }
  c.i = save;
  if (c.peekIdent() && /^[A-Za-z_$][A-Za-z0-9_$.\[\]]*\s*:=/.test(c.src.slice(c.i)))
    c.fail("W-2: write in reactive scope (no statement position)");
  c.fail("declaration");
}

export function parseBlock(c: Cursor): Stmt[] {
  c.ws(); c.expect("{"); c.ws();
  const out: Stmt[] = [];
  while (!c.startsWith("}")) { out.push(parseStmt(c), ...c.pendingStmts.splice(0)); c.ws(); c.eat(";"); c.ws(); }
  c.expect("}");
  return out;
}

export function parseStmts(src: string): Stmt[] {
  const c = new Cursor(src);
  const out: Stmt[] = [];
  c.ws();
  while (!c.eof()) { out.push(parseStmt(c), ...c.pendingStmts.splice(0)); c.ws(); c.eat(";"); c.ws(); }
  return out;
}

/** A statement, with the line it starts on (2026-11-22): what a diagnostic about one statement of a long body is placed
 *  on — the `await` an advice is about, not the action's first line. A destructuring's statements share its line. */
function parseStmt(c: Cursor): Stmt {
  c.ws();
  const line = c.line, had = c.pendingStmts.length;
  const s = parseStmt0(c);
  s.line ??= line;
  for (const p of c.pendingStmts.slice(had)) p.line ??= line;
  return s;
}
function parseStmt0(c: Cursor): Stmt {
  c.ws();
  if (c.keyword("guess")) {
    c.ws(); const name = c.ident() ?? c.fail("target"); const path: Target["path"] = [];
    for (;;) { if (c.eat(".")) path.push(c.ident() ?? c.fail("member")); else if (c.eat("[")) { c.ws(); path.push(parseExpr(c)); c.ws(); c.expect("]"); } else break; }
    c.ws(); c.expect(":="); c.ws(); return { k: "optimistic", target: { name, path }, e: parseExpr(c) };
  }
  if (c.keyword("refresh")) { c.ws(); return { k: "refresh", name: c.ident() ?? c.fail("name") }; }
  if (c.keyword("affects")) { c.ws(); return { k: "affects", name: c.ident() ?? c.fail("name") }; }
  if (c.keyword("action")) { c.ws(); return { k: "action", body: parseBlock(c) }; }
  if (c.keyword("let") || c.keyword("const")) { c.ws();
    if (c.peek() === "{" || c.peek() === "[") {                      // 07 §5: a destructuring local — each name a snapshot, as in JS
      const pat = parsePattern(c); c.ws(); c.expect("="); c.ws();
      let base = parseExpr(c); const out: Stmt[] = [];
      if (!isPath(base)) { const t = `$$${++c.temps}`; out.push({ k: "let", name: t, e: base }); base = { k: "id", name: t }; }
      const names: { name: string; e: Expr; line: number }[] = []; expandPattern(pat, base, names, true);
      for (const n of names) out.push({ k: "let", name: n.name, e: n.e });
      if (!out.length) c.fail("a destructuring that binds nothing");
      c.pendingStmts.push(...out.slice(1)); return out[0];
    }
    const name = c.ident() ?? c.fail("let name"); const type = optType(c); c.ws(); c.expect("="); c.ws(); return { k: "let", name, e: parseExpr(c), type }; }
  if (c.keyword("try")) {                                              // AC-7
    c.ws(); const body = parseBlock(c); c.ws();
    let catchName: string | undefined, handler: Stmt[] | undefined, fin: Stmt[] | undefined;
    let catchClasses: string[] | undefined;
    if (c.keyword("catch")) { c.ws(); if (c.eat("(")) { c.ws(); catchName = c.ident() ?? c.fail("catch name"); c.ws(false); if (c.eat(":")) catchClasses = parseClasses(c); c.ws(); c.expect(")"); } c.ws(); handler = parseBlock(c); c.ws(); }
    if (c.keyword("finally")) { c.ws(); fin = parseBlock(c); }
    if (!handler && !fin) c.fail("catch or finally");
    return { k: "try", body, catchName, catchClasses, handler, fin };
  }
  if (c.keyword("throw")) { c.ws(); return { k: "throw", e: parseExpr(c) }; }
  if (c.keyword("return")) { c.ws(false); if (c.peek() === "}" || c.peek() === ";" || c.peek() === "\n" || c.eof()) return { k: "return" }; return { k: "return", e: parseExpr(c) }; }
  if (c.keyword("if")) {                                               // imperative `if (c) { … } else { … }`
    c.ws(); c.expect("("); c.ws(); const cond = parseExpr(c); c.ws(); c.expect(")"); c.ws();
    const t = c.peek() === "{" ? parseBlock(c) : [parseStmt(c), ...c.pendingStmts.splice(0)]; c.ws();
    let f: Stmt[] = [];
    if (c.keyword("else")) { c.ws(); f = c.peek() === "{" ? parseBlock(c) : [parseStmt(c), ...c.pendingStmts.splice(0)]; }
    return { k: "sif", c: cond, t, f };
  }
  if (c.keyword("for")) {                                              // 07 §5: `for (const x of e) { … }` — a loop over what `e` holds now, its body imperative scope
    c.ws(); c.expect("("); c.ws();
    if (!(c.keyword("const") || c.keyword("let"))) c.fail("`for (const x of e) { … }`: the loop of imperative scope binds one name per turn");
    c.ws(); const name = c.ident() ?? c.fail("loop variable"); c.ws();
    if (!c.keyword("of")) c.fail("`of`: the loop of imperative scope is `for (const x of e) { … }`");
    c.ws(); const e = parseExpr(c); c.ws(); c.expect(")"); c.ws();
    return { k: "for", name, e, body: parseBlock(c) };
  }
  // write?  target := expr
  const save = c.i;
  let name = c.ident();
  let ctx = false;
  if (name === "use") { c.ws(); name = c.ident() ?? c.fail("provision name"); ctx = true; }   // `use p := e`: a write through a provision (O-4, RG-7)
  if (name && (!KEYWORDS.has(name) || ctx)) {
    const path: Target["path"] = [];
    for (;;) {
      if (c.eat(".")) path.push(c.ident() ?? c.fail("member"));
      else if (c.eat("[")) { c.ws(); path.push(parseExpr(c)); c.ws(); c.expect("]"); }
      else break;
    }
    c.ws(false);
    if (c.eat(":=")) { c.ws(); return { k: "write", target: { name, path, ctx }, e: parseExpr(c) }; }
  }
  c.i = save;
  return { k: "expr", e: parseExpr(c) };
}

// ---- expressions ----
/** An expression, with any trailing `catch (x: A | B) => alt` (R-f-4): looser than every operator, so the conditional's arms stop before it. */
export function parseExpr(c: Cursor): Expr {
  let e = parseExprNoCatch(c);
  for (;;) {
    const save = c.i; c.ws();
    if (!c.keyword("catch")) { c.i = save; return e; }
    c.ws(); let name: string | undefined, classes: string[] | undefined;
    if (c.eat("(")) { c.ws(); name = c.ident() ?? c.fail("catch name"); c.ws(false); if (c.eat(":")) classes = parseClasses(c); c.ws(); c.expect(")"); c.ws(); }
    c.expect("=>"); c.ws();
    e = { k: "catch", e, name, classes, alt: parseExprNoCatch(c) };
  }
}
function parseExprNoCatch(c: Cursor): Expr {
  c.ws();
  if (c.startsWith("draft") && /^draft\s*\(/.test(c.src.slice(c.i)) && (() => {   // ST-3: `draft(e) { d.k := v }` — contextual: only with a block after the parens
    let i = c.i + 5, depth = 0; while (i < c.src.length) { const ch = c.src[i]; if (ch === "(") depth++; else if (ch === ")") { depth--; if (depth === 0) break; } i++; }
    return /^\s*\{/.test(c.src.slice(i + 1));
  })()) {
    c.keyword("draft"); c.ws(); c.expect("("); c.ws(); const seed = parseExpr(c); c.ws(); c.expect(")"); c.ws();
    return { k: "draft", seed, body: parseBlock(c) };
  }
  {                                                                   // 07 §3: TS arrow functions, verbatim — `x => e`, `(a, b) => e`
    const save = c.i; const params: string[] = []; const ptypes: (string | undefined)[] = []; let ok = false;
    if (c.peek() === "(") { c.i++; c.ws(); ok = true; while (!c.startsWith(")")) { const id = c.ident(); if (!id) { ok = false; break; } params.push(id); c.ws(); if (c.startsWith(":") && !c.startsWith(":=")) { c.i++; c.ws(); let t: string; try { t = parseType(c, false, true).trim(); /* a `=>` in it is a function type's (`(g: () => string) => g()`): the arrow's own follows the list's `)` */ } catch (e) { if (!(e instanceof ParseError)) throw e; ok = false; break; } if (!t) { ok = false; break; } ptypes.push(t); c.ws(); } else ptypes.push(undefined); /* `:=` is a write, not a type */ if (!c.eat(",")) break; c.ws(); } if (ok && c.eat(")")) { c.ws(false); ok = c.startsWith("=>"); } else ok = false; }
    else { const id = c.ident(); if (id && !KEYWORDS.has(id)) { params.push(id); c.ws(false); ok = c.startsWith("=>"); } }
    if (ok) {
      c.expect("=>"); c.ws();
      if (c.peek() === "{") {                                        // `=> { … }`: a statement body (imperative scope) unless it reads as a record literal
        const at = c.i;
        try { const stmts = parseBlock(c); if (stmts.some(st => !(st.k === "expr" && st.e.k === "id"))) return { k: "fn", params, body: { k: "lit", v: undefined }, stmts, ...(ptypes.some(Boolean) ? { ptypes } : {}) }; } catch (e) { if (!(e instanceof ParseError)) throw e; }
        c.i = at;
      }
      return { k: "fn", params, body: parseExpr(c), ...(ptypes.some(Boolean) ? { ptypes } : {}) };   // 07 §3: `(v: string) => …`, the type is TypeScript's
    }
    c.i = save;
  }
  if (c.keyword("fn")) {
    c.ws(); c.expect("("); c.ws(); const params: string[] = [];
    while (!c.startsWith(")")) { params.push(c.ident() ?? c.fail("param")); c.ws(); if (!c.eat(",")) break; c.ws(); }
    c.expect(")"); c.ws(); c.expect("=>"); c.ws();
    return { k: "fn", params, body: parseExpr(c) };
  }
  const cond = parseBin(c, 0);
  c.ws(false);
  if (c.startsWith(":=")) c.fail("W-2: write in reactive scope (no statement position)");   // U: the grammar has no position for a write here
  if (c.peek() === "?" && c.peek(1) !== ".") {                         // E-11: `c ? a : b`, TS verbatim (ruled 2026-10-22: the only spelling)
    c.i++; c.ws(); const t = parseExprNoCatch(c); c.ws(); c.expect(":"); c.ws(); const f = parseExprNoCatch(c);
    return { k: "if", c: cond, t, f };
  }
  return cond;
}

const LEVELS: string[][] = [["??"], ["||"], ["&&"], ["===", "!==", "==", "!="], ["<=", ">=", "<", ">"], ["+", "-"], ["*", "/", "%"]];
const OP_ALIAS: Record<string, string> = { "===": "==", "!==": "!=" };
function parseBin(c: Cursor, lvl: number): Expr {
  if (lvl >= LEVELS.length) return parseUnary(c);
  let l = parseBin(c, lvl + 1);
  for (;;) {
    c.ws(false);
    const op = LEVELS[lvl].find(o => c.startsWith(o) && !(o === "-" && c.peek(1) === ">"));
    if (!op) return l;
    c.i += op.length; c.ws();
    l = { k: "bin", op: OP_ALIAS[op] ?? op, l, r: parseBin(c, lvl + 1) };
  }
}
function parseUnary(c: Cursor): Expr {
  c.ws();
  if (c.eat("!")) return { k: "un", op: "!", e: parseUnary(c) };
  if (c.peek() === "-" && c.peek(1) !== ">") { c.i++; return { k: "un", op: "-", e: parseUnary(c) }; }
  if (c.keyword("pre")) {
    c.ws(); const name = c.ident() ?? c.fail("pre name"); c.ws(false);
    if (c.eat("->")) { c.ws(); return { k: "pre", name, init: parseUnary(c) }; }
    return { k: "pre", name };
  }
  if (c.keyword("peek")) { c.ws(); return { k: "peek", e: parseUnary(c) }; }
  if (c.keyword("await")) {
    const stream = c.eat("*"); c.ws(); const e = parseUnary(c); c.ws(false);   // `await*`: the latest answer of a stream (ST-6b)
    if (c.eat("->")) { c.ws(); return { k: "await", e, init: parseUnary(c), stream }; }
    return { k: "await", e, stream };
  }
  if (c.keyword("latest")) { c.ws(); return { k: "latest", e: parseUnary(c) }; }
  if (c.keyword("throw")) { c.ws(); return { k: "throw", e: parseUnary(c) }; }   // R-f-3: a throw expression (TC39's shape)
  if (c.keyword("use")) { c.ws(); return { k: "use", name: c.ident() ?? c.fail("context name") }; }
  if (c.startsWith("pending?")) { c.i += 8; c.ws(); return { k: "pending", e: parseUnary(c) }; }
  return parsePostfix(c);
}
/** 07 §3: type arguments at a call, `f<T>(…)`: a balanced `<…>` written right after the callee (no space) and followed
 *  directly by `(`; else null (`a < b` stays a comparison). The list may span lines, so a formatter that breaks a long
 *  type does not turn the call into comparisons. */
/** 07 §3: whether `text`, between a call's `<` and `>`, is TypeScript type arguments: a comma-separated list of types
 *  that a type grammar consumes completely, as TypeScript decides when it tries them and falls back to comparisons.
 *  `a<b && c>(d)`, `a<b + c>(d)` and `a<b[c+1]>(d)` are comparisons; `f<{ a: string }[]>(x)`, `f<A | B>(x)`,
 *  `f<(x: T) => U>(x)`, `f<K extends keyof T ? T[K] : never>(x)` are calls. (The crate's `looks_like_types`, token for token.) */
type TyTok = { w: string } | { lit: "num" | "str" } | { p: string };   // a number is a type after `-`, a string is not
const TY_PUNCT = ["...", "=>", "-?", "+?", "<", ">", "(", ")", "[", "]", "{", "}", ",", ";", ":", "?", "|", "&", ".", "=", "-", "+"];
const TY_RESERVED = new Set(["extends", "keyof", "typeof", "infer", "readonly", "unique", "new", "abstract", "import", "is", "asserts", "in", "as", "this"]);
/** R4 (RFC 11): the index just past the string or template literal opening at `s[j]`, with the spans of a template's own
 *  substitutions in `subs`. A substitution is scanned as code: braces nest, and a string or template inside it is skipped
 *  whole, so `${"}"}` does not end it. Null when the literal is not closed. */
export function quotedEnd(s: string, j: number, subs: [number, number][]): number | null {
  const q = s[j]; j++;
  while (j < s.length) {
    if (s[j] === "\\") j += 2;
    else if (s[j] === q) return j + 1;
    else if (q === "`" && s[j] === "$" && s[j + 1] === "{") {
      const start = j + 2; let depth = 1; j = start;
      while (depth > 0) {
        if (j >= s.length) return null;
        const c = s[j];
        if (c === "{") { depth++; j++; }
        else if (c === "}") { if (--depth === 0) subs.push([start, j]); j++; }
        else if (c === '"' || c === "'" || c === "`") { const e = quotedEnd(s, j, []); if (e === null) return null; j = e; }
        else j++;
      }
    } else j++;
  }
  return null;
}
function tyTokens(s: string): { t: TyTok[]; nl: boolean[] } | null {   // the tokens, and whether a line break comes before each (a member of an object type may end at one)
  const out: TyTok[] = [], nl: boolean[] = []; let j = 0, brk = false;
  const wordCh = (c: string) => /[\w$]/.test(c) || c.charCodeAt(0) >= 0x80;
  while (j < s.length) {
    const ch = s[j];
    if (/\s/.test(ch)) { brk ||= ch === "\n"; j++; continue; }
    nl.push(brk); brk = false;
    if (ch === '"' || ch === "'" || ch === "`") {
      const subs: [number, number][] = []; const e = quotedEnd(s, j, subs); if (e === null) return null; j = e;
      if (subs.some(([a, z]) => !oneType(s.slice(a, z)))) return null;   // a template literal type's substitution is a type: `${c+1}` makes the whole a comparison
      out.push({ lit: "str" }); continue;
    }
    if (/[0-9]/.test(ch)) { while (j < s.length && /[A-Za-z0-9._]/.test(s[j])) j++; out.push({ lit: "num" }); continue; }
    if (wordCh(ch)) { const k = j; while (j < s.length && wordCh(s[j])) j++; out.push({ w: s.slice(k, j) }); continue; }
    const p = TY_PUNCT.find(p => s.startsWith(p, j)); if (!p) return null;   // `+`, `-?`, `+?` only as a mapped type's modifiers; elsewhere the grammar refuses them
    out.push({ p }); j += p.length;
  }
  return { t: out, nl };
}
export function looksLikeTypes(text: string): boolean { return tyGrammar(text, false); }
function oneType(text: string): boolean { return tyGrammar(text, true); }   // one type, consumed whole (a template literal type's substitution)
function tyGrammar(text: string, one: boolean): boolean {
  const tk = tyTokens(text); if (!tk) return false; const { t, nl } = tk;
  let i = 0;
  const isP = (k: number, p: string) => { const x = t[k]; return !!x && "p" in x && x.p === p; };
  const isW = (k: number, w?: string) => { const x = t[k]; return !!x && "w" in x && (w === undefined || x.w === w); };
  const isLit = (k: number, kind?: "num" | "str") => { const x = t[k]; return !!x && "lit" in x && (kind === undefined || x.lit === kind); };
  const at = (p: string) => isP(i, p), atWord = (w: string) => isW(i, w);
  const eat = (p: string) => at(p) ? (i++, true) : false;
  const eatWord = (w: string) => atWord(w) ? (i++, true) : false;
  const name = () => isW(i) ? (i++, true) : false;
  const OPEN = ["(", "[", "{"], CLOSE = [")", "]", "}"];
  const list = (): boolean => { for (;;) { if (!ty()) return false; if (!eat(",")) return true; if (i === t.length) return true; } };
  const ty = (): boolean => {
    if (fnType()) return true;
    if (!union()) return false;
    if (eatWord("extends")) { if (!union()) return false; return eat("?") && ty() && eat(":") && ty(); }   // a conditional type
    return true;
  };
  const fnType = (): boolean => {   // `(…) => T`, `<T>(…) => T`, `new (…) => T`; a parenthesized type is not one
    const start = i; eatWord("abstract"); const ctor = eatWord("new");
    if (at("<")) { i++; if (!typeParams()) { i = start; return false; } }
    if (!at("(")) { i = start; return false; }
    let depth = 0, k = i;
    for (; k < t.length; k++) { const x = t[k]; if ("p" in x && OPEN.includes(x.p)) depth++; else if ("p" in x && CLOSE.includes(x.p)) { if (--depth === 0) break; } }
    if (!isP(k + 1, "=>")) { if (ctor) return false; i = start; return false; }
    i++; if (!params(")")) return false; if (!eat("=>")) return false; return ret();
  };
  const ret = (): boolean => {   // a type, or a predicate `x is T` / `asserts x [is T]`
    const save = i;
    if (eatWord("asserts") && name()) { if (eatWord("is")) return ty(); return true; }
    i = save; if (name() && eatWord("is")) return ty();
    i = save; return ty();
  };
  const typeParams = (): boolean => {
    for (;;) {
      eatWord("const"); eatWord("in"); eatWord("out");
      if (!name()) return false;
      if (eatWord("extends") && !ty()) return false;
      if (eat("=") && !ty()) return false;
      if (eat(">")) return true; if (!eat(",")) return false; if (eat(">")) return true;
    }
  };
  const params = (close: string): boolean => {
    for (;;) {
      if (eat(close)) return true;
      eat("...");
      if (at("{") || at("[")) { if (!skipBalanced()) return false; } else if (!name()) return false;
      eat("?");
      if (eat(":") && !ty()) return false;
      if (eat("=")) return false;   // no initializer in a type
      if (eat(close)) return true; if (!eat(",")) return false;
    }
  };
  const skipBalanced = (): boolean => {
    let depth = 0;
    for (; i < t.length; i++) { const x = t[i]; if ("p" in x && OPEN.includes(x.p)) depth++; else if ("p" in x && CLOSE.includes(x.p)) { if (--depth === 0) { i++; return true; } } }
    return false;
  };
  const union = (): boolean => { eat("|"); for (;;) { if (!intersection()) return false; if (!eat("|")) return true; } };
  const intersection = (): boolean => { eat("&"); for (;;) { if (!operator()) return false; if (!eat("&")) return true; } };
  const operator = (): boolean => {
    if (eatWord("keyof") || eatWord("unique") || eatWord("readonly")) return operator();
    if (eatWord("infer")) {
      if (!name()) return false;
      const save = i; if (eatWord("extends")) { if (!(operator() && !at("?"))) i = save; }   // `infer U extends T`, unless it begins a conditional type's `extends`
      return true;
    }
    return postfix();
  };
  const postfix = (): boolean => {
    if (!primary()) return false;
    while (at("[")) { i++; if (eat("]")) continue; if (!(ty() && eat("]"))) return false; }
    return true;
  };
  const args = (): boolean => {   // after a name: `<T, U>`
    if (!eat("<")) return true;
    for (;;) { if (!ty()) return false; if (eat(">")) return true; if (!eat(",")) return false; }
  };
  const dotted = (): boolean => { while (eat(".")) if (!name()) return false; return true; };
  const primary = (): boolean => {
    const x = t[i]; if (!x) return false;
    if ("lit" in x) { i++; return true; }
    if ("p" in x) {
      if (x.p === "-") { i++; if (isLit(i, "num")) { i++; return true; } return false; }
      if (x.p === "(") { i++; return ty() && eat(")"); }
      if (x.p === "[") { i++; return tuple(); }
      if (x.p === "{") { i++; return object(); }
      return false;
    }
    if (x.w === "typeof") { i++; if (!eatWord("import") && !name()) return false; return dotted() && args(); }
    if (x.w === "import") { i++; if (!(eat("(") && isLit(i, "str"))) return false; i++; if (!eat(")")) return false; return dotted() && args(); }
    if (!TY_RESERVED.has(x.w) || x.w === "this") { i++; return dotted() && args(); }
    return false;
  };
  const tuple = (): boolean => {
    for (;;) {
      if (eat("]")) return true;
      eat("...");
      const save = i; if (name()) { eat("?"); if (!eat(":")) i = save; }   // a labelled element, `name?: T`
      if (!ty()) return false;
      eat("?");
      if (eat("]")) return true; if (!eat(",")) return false;
    }
  };
  const propName = (): boolean => (isW(i) || isLit(i)) ? (i++, true) : false;
  const object = (): boolean => {
    for (;;) { if (eat("}")) return true; if (!member()) return false; if (eat("}")) return true; if (!(eat(",") || eat(";") || nl[i])) return false; }
  };
  const member = (): boolean => {
    const save = i;   // a call or construct signature: `(…): T`, `<T>(…): T`, `new (…): T`
    if (atWord("new") && (isP(i + 1, "(") || isP(i + 1, "<"))) i++;
    if (at("(") || at("<")) { if (eat("<") && !typeParams()) return false; return eat("(") && params(")") && (!eat(":") || ret()); }
    i = save;
    if ((at("-") || at("+")) && isW(i + 1, "readonly")) i++;   // modifiers: `readonly`, `+readonly`, `-readonly`, `get`/`set` accessors
    if (atWord("readonly") && !(isP(i + 1, ":") || isP(i + 1, "?") || isP(i + 1, "(") || isP(i + 1, ",") || isP(i + 1, ";") || isP(i + 1, "}"))) i++;
    if ((atWord("get") || atWord("set")) && (isW(i + 1) || isLit(i + 1) || isP(i + 1, "["))) i++;
    if (eat("[")) {   // an index signature `[k: string]: T`, a mapped type `[K in T as U]-?: V`, or a computed name `[Symbol.iterator]`
      const s2 = i;
      if (name() && eat(":")) { if (!(ty() && eat("]"))) return false; }
      else { i = s2;
        if (name() && eatWord("in")) { if (!ty()) return false; if (eatWord("as") && !ty()) return false; if (!eat("]")) return false; }
        else { i = s2; if (!name()) return false; if (!dotted()) return false; if (!eat("]")) return false; } }
    } else if (!propName()) return false;
    void (eat("?") || eat("-?") || eat("+?"));
    if (at("(") || at("<")) { if (eat("<") && !typeParams()) return false; return eat("(") && params(")") && (!eat(":") || ret()); }   // a method
    if (eat(":")) return ty();
    return false;   // a member with no type is `any` in a declaration but not in an object type literal
  };
  return (one ? ty() : list()) && i === t.length;
}
function typeArgsAt(s: string, i: number): { text: string; end: number } | null {
  if (s[i] !== "<") return null; let depth = 0;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (ch === '"' || ch === "'" || ch === "`") { const e = quotedEnd(s, j, []); if (e === null) return null; j = e - 1; continue; }   // R4: a string type argument is skipped whole (`f<"}">(x)`)
    if ("<([{".includes(ch)) depth++;
    else if (")]}".includes(ch) || (ch === ">" && s[j - 1] !== "=")) {
      if (--depth === 0) { const text = s.slice(i + 1, j).trim(); return ch === ">" && s[j + 1] === "(" && looksLikeTypes(text) ? { text, end: j + 1 } : null; }
    }
  }
  return null;
}
function parsePostfix(c: Cursor): Expr {
  let e = parsePrimary(c); let targs: string | undefined;
  for (;;) {
    if (c.peek() === "<" && (e.k === "id" || e.k === "member")) { const t = typeArgsAt(c.src, c.i); if (!t) return e; c.i = t.end; targs = t.text; continue; }
    if (c.eat("?.")) { if (c.peek() === "[") { c.i++; c.ws(); const i = parseExpr(c); c.ws(); c.expect("]"); e = { k: "index", o: e, i, opt: true }; } else e = { k: "member", o: e, p: c.ident() ?? c.fail("member"), opt: true }; }
    else if (c.eat(".")) e = { k: "member", o: e, p: c.ident() ?? c.fail("member") };
    else if (c.peek() === "[") { c.i++; c.ws(); const i = parseExpr(c); c.ws(); c.expect("]"); e = { k: "index", o: e, i }; }
    else if (c.peek() === "(") {
      c.i++; c.ws(); const args: Expr[] = [];
      while (!c.startsWith(")")) { args.push(parseExpr(c)); c.ws(); if (!c.eat(",")) break; c.ws(); }
      c.expect(")"); e = { k: "call", f: e, args, ...(targs ? { targs } : {}) }; targs = undefined;
    } else return e;
  }
}
function parsePrimary(c: Cursor): Expr {
  c.ws();
  if (/^<style\b/.test(c.src.slice(c.i))) {                           // 07 CSS-5: a stylesheet as a value — its class map
    const line = c.line; c.i += "<style".length; c.ws(); if (!c.eat(">")) c.fail("CSS-5: a class map is `<style>…</style>`, with no attributes");
    const end = c.src.indexOf("</style>", c.i); if (end < 0) c.fail("expected </style>");
    const css = c.src.slice(c.i, end); c.i = end + "</style>".length; return { k: "stylemap", css, line };
  }
  if (/^server\s+fn\s*\(/.test(c.src.slice(c.i))) {                   // 12 SF-1d: an anonymous server fn, for whatever wraps it
    c.keyword("server"); c.ws(); c.keyword("fn"); c.ws(); c.expect("("); c.ws();
    const params: string[] = []; const ptypes: (string | undefined)[] = [];
    while (!c.startsWith(")")) { params.push(c.ident() ?? c.fail("param")); ptypes.push(optType(c)); c.ws(); if (!c.eat(",")) break; c.ws(); }
    c.expect(")"); const ret = optType(c, true); c.ws();
    return { k: "serverfn", params, ptypes, ret, body: parseBlock(c) };
  }
  const ch = c.peek();
  if (ch === "`") {                                                   // template literal
    c.i++; const parts: (string | Expr)[] = []; let s = "";
    while (!c.eof() && c.peek() !== "`") {
      if (c.startsWith("${")) { c.i += 2; if (s) parts.push(s); s = ""; c.ws(); parts.push(parseExpr(c)); c.ws(); c.expect("}"); continue; }
      if (c.peek() === "\\") c.i++;
      s += c.peek(); c.i++;
    }
    c.expect("`"); if (s || !parts.length) parts.push(s); return { k: "tpl", parts };
  }
  if (ch === '"' || ch === "'") {
    c.i++; let s = "";
    while (!c.eof() && c.peek() !== ch) { if (c.peek() === "\\") { c.i++; } s += c.peek(); c.i++; }
    c.expect(ch); return { k: "lit", v: s };
  }
  const num = /^\d[\d_]*(\.\d+)?/.exec(c.src.slice(c.i));
  if (num) { c.i += num[0].length; return { k: "lit", v: Number(num[0].replace(/_/g, "")) }; }
  if (c.eat("(")) { c.ws(); const e = parseExpr(c); c.ws(); c.expect(")"); return e; }
  if (c.eat("[")) {
    c.ws(); const items: Expr[] = [];
    while (!c.startsWith("]")) { if (c.eat("...")) { c.ws(); items.push({ k: "spread", e: parseExpr(c) }); } else items.push(parseExpr(c)); c.ws(); if (!c.eat(",")) break; c.ws(); }
    c.expect("]"); return { k: "arr", items };
  }
  if (c.eat("{")) {
    c.ws(); const fields: ({ key: string; v: Expr } | { spread: Expr })[] = [];
    while (!c.startsWith("}")) {
      if (c.eat("...")) { c.ws(); fields.push({ spread: parseExpr(c) }); c.ws(); if (!c.eat(",")) break; c.ws(); continue; }
      const key = c.ident() ?? (c.peek() === '"' || c.peek() === "'" ? String((parsePrimary(c) as { v: unknown }).v) : c.fail("field")); c.ws();
      if (c.eat(":")) { c.ws(); fields.push({ key, v: parseExpr(c) }); } else fields.push({ key, v: { k: "id", name: key } });
      c.ws(); if (!c.eat(",")) break; c.ws();
    }
    c.expect("}"); return { k: "rec", fields };
  }
  if (c.keyword("true")) return { k: "lit", v: true };
  if (c.keyword("false")) return { k: "lit", v: false };
  if (c.keyword("undefined")) return { k: "lit", v: undefined };
  if (c.keyword("null")) return { k: "lit", v: null };
  const id = c.ident();
  if (id) return { k: "id", name: id };
  c.fail("expression");
}

// ---- markup ----
// Markup continues until `closeTag` is seen (or end of input for top level).
function parseMarkup(c: Cursor, closeTag: string | null): Markup[] {
  const out: Markup[] = [];
  const inElement = closeTag !== null && closeTag !== "}";
  let broke = false;   // JSX whitespace (07: elements are JSX): whitespace that holds a line break is not text — except between two text runs, which it joins with one space
  for (;;) {
    if (inElement) {
      let s = ""; while (!c.eof() && " \t\r\n".includes(c.peek())) { s += c.peek(); c.i++; }
      broke = s.includes("\n");
      if (s && !broke && !c.startsWith(`</${closeTag}>`) && out.length) out.push({ k: "text", s: " " });   // same-line whitespace between nodes is a space
    } else c.ws();
    if (c.eof()) { if (closeTag !== null) c.fail(`expected </${closeTag}>`); return out; }
    if (closeTag !== null && closeTag !== "}" && c.startsWith(`</${closeTag}>`)) { c.i += closeTag.length + 3; return out; }   // `""` is a fragment's close tag
    if (closeTag === "}" && c.startsWith("}")) { c.i++; return out; }
    const line = c.line;                                             // for diagnostics: the line a reader or an application is on
    if (c.startsWith("<")) { out.push({ ...parseElement(c), line }); continue; }
    if (c.startsWith("{")) {
      c.i++; c.ws();
      const ctl = parseControl(c);                                   // `{if …}` / `{for …}` / `{loading …}` inside an element
      if (ctl) { c.ws(); c.expect("}"); out.push({ ...ctl, line }); continue; }
      const e = parseExpr(c); c.ws(); c.expect("}"); out.push({ k: "read", e, line }); continue;
    }
    if (!inElement) { const ctl = parseControl(c); if (ctl) { out.push({ ...ctl, line }); continue; } }
    if (closeTag === null && looksLikeDecl(c)) c.fail("declaration after markup: a block is declarations, then its view");
    // text up to < { } or newline; a line's trailing whitespace is not text (JSX)
    let s = "";
    while (!c.eof() && !"<{}\n".includes(c.peek())) { s += c.peek(); c.i++; }
    if (c.peek() === "\n" || c.eof()) s = s.replace(/[ \t\r]+$/, "");
    if (!inElement) {
      // outside an element, bare text is not markup: a block is declarations, then markup
      if (s.trim() === "") { if (c.peek() === "}") c.fail("expected a declaration or markup");   /* a `}` that closes nothing (it was read again and again, with no end) */ if (c.peek() === "\n") c.i++; continue; }
      if (s.includes(":=")) c.fail("W-2: write in reactive scope (no statement position)");
      c.fail("expected a declaration or markup");
    }
    if (broke && out.length && out[out.length - 1].k === "text") out.push({ k: "text", s: " " });   // text on two lines: one space between
    if (s) out.push({ k: "text", s });
  }
}
/** Control forms of a view: `if c { … } else if d { … } else { … }`, `for x in e { … }`, `loading … { … }`. Bare at block level, braced inside elements. */
function parseControl(c: Cursor): Markup | null {
  const save = c.i;
  if (c.keyword("if")) {
    c.ws(); const cond = parseExpr(c); c.ws();
    if (!c.startsWith("{")) { c.i = save; return null; }              // `if … then …` is an expression (E-11)
    c.expect("{");
      const t = parseBlockBody(c); c.ws();
      let f: { decls: Decl[]; body: Markup[] } = { decls: [], body: [] };
      if (c.keyword("else")) {
        c.ws(); const at = c.i;
        if (c.keyword("if")) {                                          // `else if c { … }` is `else { if c { … } }`
          c.i = at; const next = parseControl(c);
          if (!next) c.fail("a block after `else if`: else if c { … }");
          f = { decls: [], body: [next] };
        } else { c.expect("{"); f = parseBlockBody(c); }
      }
      return { k: "mif", c: cond, t: t.body, tDecls: t.decls, f: f.body, fDecls: f.decls };
  }
  if (c.keyword("loading")) {
      c.ws(); let on: Expr | undefined;
      if (c.keyword("on")) { c.ws(); c.expect("("); c.ws(); on = parseExpr(c); c.ws(); c.expect(")"); c.ws(); }
      if (!c.keyword("fallback")) c.fail("fallback"); c.ws(); c.expect("{");
      const fallback = parseMarkup(c, "}"); c.ws(); c.expect("{");
      const { decls, body } = parseBlockBody(c);
      return { k: "loading", on, fallback, decls, body };
  }
  if (c.keyword("portal")) {                                         // RG-8: `portal { … }` / `portal to(e) { … }`
      c.ws(); let to: Expr | undefined;
      if (c.keyword("to")) { c.ws(); c.expect("("); c.ws(); to = parseExpr(c); c.ws(); c.expect(")"); c.ws(); }
      c.expect("{"); const { decls, body } = parseBlockBody(c);
      return { k: "portal", to, decls, body };
  }
  if (c.keyword("errored")) {
      c.ws(); if (!c.keyword("fallback")) c.fail("fallback"); c.ws(false);
      let errName: string | undefined;
      let classes: string[] | undefined;
      if (c.eat("(")) { c.ws(); errName = c.ident() ?? c.fail("error name"); c.ws(false); if (c.eat(":")) classes = parseClasses(c); c.ws(); c.expect(")"); }   // `fallback(e)` / `fallback(e: A | B)` (R-f-4)
      c.ws(); c.expect("{");
      const fallback = parseMarkup(c, "}"); c.ws(); c.expect("{");
      const { decls, body } = parseBlockBody(c);
      return { k: "errored", fallback, decls, body, errName, classes };
  }
  {                                                                                          // MO-11k: `view (a, b) { … }`, only with names in the parentheses and a block after them
    const save = c.i;
    if (c.keyword("view")) {
      c.ws(); let prop: string | undefined; if (!c.startsWith("(")) { const n = c.ident(); if (n && !KEYWORDS.has(n)) { prop = n; c.ws(); } }   // a named render prop
      const params: string[] = []; let ok = c.eat("(");
      while (ok) { c.ws(); if (c.eat(")")) break; const n = c.ident(); if (!n || KEYWORDS.has(n)) { ok = false; break; } params.push(n); c.ws(); if (!c.eat(",") && !c.startsWith(")")) ok = false; }
      if (ok) { c.ws(); if (c.eat("{")) { const { decls, body } = parseBlockBody(c); return { k: "mview", ...(prop ? { prop } : {}), params, decls, body }; } }
    }
    c.i = save;
  }
  if (c.keyword("for")) {
      c.ws(); const name = c.ident() ?? c.fail("for name"); c.ws();
      if (!c.keyword("in")) c.fail("in"); c.ws(); const xs = parseExpr(c); c.ws(); c.expect("{");
      const { decls, body } = parseBlockBody(c);
      return { k: "mfor", name, xs, decls, body };
  }
  return null;
}
/** A reactive block body: declarations, then markup, up to the closing `}` (03: any block is decls then view). */
function parseBlockBody(c: Cursor): { decls: Decl[]; body: Markup[] } {
  const decls: Decl[] = [];
  for (;;) {
    c.ws();
    if (!looksLikeDecl(c)) break;
    decls.push(...parseDecls1(c)); c.ws(); c.eat(";");
  }
  return { decls, body: parseMarkup(c, "}") };
}
function looksLikeDecl(c: Cursor) {
  const save = c.i; c.ws();
  const r = destructuringAhead(c) || c.startsWith("source ") || c.startsWith("effect") || c.startsWith("fn ") || c.startsWith("component ") || c.startsWith("deferred ") || c.startsWith("action ") || c.startsWith("provide ") || c.startsWith("context ") || c.startsWith("import ") || c.startsWith("export ") || c.startsWith("type ") || c.startsWith("interface ") || /^error\s+[A-Z]/.test(c.src.slice(c.i)) || /^server\s+(fn|action)\b/.test(c.src.slice(c.i)) ||
    (() => { const id = c.ident(); c.ws(false); if (!id || KEYWORDS.has(id)) return false; if (c.peek() === ":" && c.peek(1) !== "=") return true; const ok = (c.peek() === "=" && c.peek(1) !== "=") || /^key\s+[A-Za-z_$][\w$]*\s*=[^=>]/.test(c.src.slice(c.i)); return ok; })();
  c.i = save; return r;
}
function parseElement(c: Cursor): Markup {
  c.expect("<");
  if (c.eat(">")) return { k: "el", tag: "", attrs: [], children: parseMarkup(c, "") };   // fragment `<>…</>`
  const tag = c.tagName() ?? c.fail("tag");
  if (tag === "style") {                                               // 07 §6b CSS-1: a stylesheet is raw text — no `{…}` holes exist
    c.ws(); if (!c.eat(">")) c.fail(c.src.slice(c.i).startsWith("ref") ? "CSS-5: a class map is a declaration, `styles = <style>…</style>` — TSRX's `<style ref={styles}>` assigns into a variable, and a name here is bound once, by its declaration" : "CSS-1: a <style> takes no attributes: `<style>…</style>`");
    const end = c.src.indexOf("</style>", c.i); if (end < 0) c.fail("expected </style>");
    const css = c.src.slice(c.i, end); c.i = end + "</style>".length;
    return { k: "style", css };
  }
  const attrs: { name: string; e: Expr }[] = [];
  for (;;) {
    c.ws();
    if (c.eat("/>")) return { k: "el", tag, attrs, children: [] };
    if (c.eat(">")) break;
    if (c.startsWith("{")) {                                            // 07 §4: a spread attribute, `{...e}`: every field of e, in order with the named ones
      c.eat("{"); c.ws(); if (!c.eat("...")) c.fail("attr: an attribute in braces is a spread, `{...props}`"); c.ws();
      attrs.push({ name: "...", e: parseExpr(c) }); c.ws(); c.expect("}"); continue;
    }
    const name = c.tagName() ?? c.fail("attr"); c.ws(false);
    if (!c.eat("=")) { attrs.push({ name, e: { k: "lit", v: true } }); continue; }   // boolean attribute
    c.ws();
    if (c.eat("{")) { c.ws(); attrs.push({ name, e: parseExpr(c) }); c.ws(); c.expect("}"); }
    else attrs.push({ name, e: parsePrimary(c) });
  }
  const children = parseMarkup(c, tag);
  return { k: "el", tag, attrs, children };
}
