import type { Frontend } from "@solidjs/vite-plugin";

/** An alias as Vite's `resolve.alias` writes one: `find` replaced by `replacement` at the start of an import. */
export interface RxAlias {
  find: string | RegExp;
  replacement: string;
}

export interface RxOptions {
  /**
   * MO-8l: draft a declaration for each package the program imports that nothing declares, into
   * `node_modules/.rx-types` (also off with `RX_GENERATE=0`).
   * @default true
   */
  generate?: boolean;
  /**
   * E-5a: check each build as the whole program, so a kept `peek` is decided by every application, provision and export
   * across its modules. A module a JS file imports with `?rx-lib` counts as applied from outside. Off by default, so a
   * build and the editor (which checks per module) agree.
   * @default false
   */
  wholeProgram?: boolean;
  /**
   * The aliases the project gives Vite (`resolve.alias`, the same object), used to find which `.rx` module a JS file's
   * `?rx-lib` import names when `wholeProgram` is on, where Vite itself does not answer: a `@solidjs/vite-plugin` that
   * hands front ends its resolver (`context.resolve`) resolves each import as the bundle will, and this, with
   * tsconfig.json's `compilerOptions.paths`, is the fallback.
   */
  alias?: Record<string, string> | RxAlias[];
  /**
   * E-5a: folders or files beyond the Vite root (against it) whose JS imports modules of this build with `?rx-lib` when
   * `wholeProgram` is on: another app's pages, a server's entry. The scan covers the Vite root on its own; a host
   * anywhere else is not counted unless it is named here. A host there resolves its imports relatively, by its own
   * project's tsconfig.json `paths`, then as this build does.
   */
  hostRoots?: string[];
  /**
   * CP-4d: `.rx` modules (against the Vite root) that a JS host names by file and imports with no query, for their
   * default component — compiled as a page, as an import with `?rx-page` is. Solid's start mode takes its root so:
   * `solid({ start: { app: "src/App.rx" }, frontends: { ".rx": rx({ pages: ["src/App.rx"] }) } })`. A module named
   * here is not also a program's entry (what `createApp` mounts): that is the same import, with the other meaning.
   */
  pages?: string[];
}

/** ReactiveScript's front end for `@solidjs/vite-plugin`, which loads it on its own for `.rx` when this package is installed. */
export default function rx(options?: RxOptions): Frontend;
