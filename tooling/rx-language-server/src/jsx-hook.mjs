// A Node module hook for rx-declare and rx-verify: a package that ships `.jsx` (or `.tsx`) — its `solid` build, meant for
// a bundler — is compiled when it is loaded, by the project's own Solid compiler (`@solidjs/compiler`, the Vite plugin's),
// for the browser build that the run step uses (generate: "dom", over @solidjs/web).
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let compiler;
export async function initialize(data) { compiler = createRequire(data.from)(data.compiler); }
export async function load(url, context, next) {
  if (url.startsWith("file:") && /\.(jsx|tsx)$/.test(new URL(url).pathname)) {
    const filename = fileURLToPath(url);
    const out = compiler.transform(readFileSync(filename, "utf8"), { filename, generate: "dom", moduleName: "@solidjs/web", hydratable: false });
    return { format: "module", source: out.code, shortCircuit: true };
  }
  return next(url, context);
}
