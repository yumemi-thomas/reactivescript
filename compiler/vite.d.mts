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
   * `?rx-lib` import names when `wholeProgram` is on. tsconfig.json's `compilerOptions.paths` are read as well.
   */
  alias?: Record<string, string> | RxAlias[];
}

/** ReactiveScript's front end for `@solidjs/vite-plugin`, which loads it on its own for `.rx` when this package is installed. */
export default function rx(options?: RxOptions): Frontend;
