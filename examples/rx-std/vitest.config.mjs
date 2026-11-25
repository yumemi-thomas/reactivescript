// The original packages' tests (test/original, as they are) against the rewritten packages, or — BASELINE=1 — against the
// published originals, in this same setup. `--mode ssr` runs the server tests with Solid's server build.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import solid from "@solidjs/vite-plugin";
const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGINAL = { "form-control": "a11y" };
export default defineConfig(({ mode }) => {
  const ssr = mode === "ssr", conditions = ssr ? ["node"] : ["browser", "development"];
  const pkg = process.env.BASELINE ? n => `@solid-primitives/${ORIGINAL[n] ?? n}` : n => `@rx-primitives/${n}`;
  const point = {
    name: "point-tests", enforce: "pre",
    transform(code, id) {
      const m = /test\/original\/([\w-]+)\//.exec(id); if (!m) return;
      return code.replace(/from "\.\.\/src\/index\.[jt]sx?"/g, `from "${pkg(m[1])}"`).replace(/\.\.\/\.\.\/\.\.\/scripts\/test-utils\//g, "../../../test-utils/")
        .replaceAll(`"@solid-primitives/${ORIGINAL[m[1]] ?? m[1]}"`, `"${pkg(m[1])}"`).replace(/from "@rx-primitives\/@/g, 'from "@');
    },
  };
  return {
    cacheDir: `node_modules/.vite-${process.env.BASELINE ? "original" : "rx"}-${mode}`,
    plugins: [point, solid({ refresh: false, solid: { generate: ssr ? "ssr" : "dom", omitNestedClosingTags: false, moduleName: "@solidjs/web" } })],
    resolve: { conditions }, ssr: { resolve: { conditions } },
    test: {
      watch: false, isolate: true, environment: ssr ? "node" : "jsdom", maxWorkers: 3,
      server: { deps: { inline: [/solid-js/, /@solidjs\//, /@solid-primitives\//, /@rx-primitives/, /@reactivescript/, /examples\/rx-primitives\/packages/] } },
      include: ssr ? ["test/original/*/server.test.*"] : ["test/original/*/*.test.*", "test/*.test.*"], exclude: ssr ? [] : ["test/original/*/server.test.*"],
    },
  };
});
