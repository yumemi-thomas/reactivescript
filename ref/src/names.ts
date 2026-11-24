// 11 CP-4: the language's functions, by scope (compiler/src/names.rs). A name is its binding's (09 MO-1d): one of these is
// the language's only where nothing binds it. Every stage asks here, with what its own scope says of the name; none keeps
// a list of its own.
import type { Decl } from "./ast.ts";

/** `fn`: `len`, `map`, … — pure, `__B.len`. `log`: io, and only in imperative scope. AC-6; EF-7; EF-8. */
export type Lang = "fn" | "log" | "until" | "onSettled" | "onFlush";
export const NAMES = new Map<string, Lang>([...["len", "str", "map", "filter", "sum", "fail", "fetch", "every", "indexOf"].map(n => [n, "fn"] as [string, Lang]), ["log", "log"], ["until", "until"], ["onSettled", "onSettled"], ["onFlush", "onFlush"]]);
/** The function of the language `name` is where it is mentioned; `bound`: something binds it there. */
export const language = (name: string, bound: unknown): Lang | undefined => bound ? undefined : NAMES.get(name);
const SCALAR = new Set(["len", "str", "sum", "every", "indexOf"]);
/** MO-10k: a function of the language that answers a primitive, whatever it is given. */
export const scalar = (name: string, bound: unknown): boolean => !bound && SCALAR.has(name);
/** What `import { name } from "./prelude"` names, in an import of the prelude. */
export const inPrelude = (d: Extract<Decl, { k: "import" }>, name: string): boolean => { const l = d.prelude ? language(name, false) : undefined; return l === "fn" || l === "log"; };
/** The scenario prelude's own module, as a specifier. The loader takes the mark off where the program has such a module
 *  itself (a file, or a declaration, of that name): then it is that module's. */
export const isPrelude = (from: string): boolean => from.startsWith(".") && from.endsWith("/prelude");
export const PRELUDE_FILES = [".js", ".ts", ".jsx", ".tsx", ".mjs", ".mts", "/index.js", "/index.ts"];
