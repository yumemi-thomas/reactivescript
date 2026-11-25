// The originals' own tests (test/<package>, as published in their repositories) against the rewrite, or — ORIGINAL=1 —
// against the published original, in one setup. `--mode ssr`: the server's build.
import { existsSync } from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
// Nothing transformed is kept between the two runs (fsModuleCache): the same test file is read two ways, and a kept one is the other's.
import { defineConfig } from "vitest/config";
import solid from "@solidjs/vite-plugin";
const here = path.dirname(fileURLToPath(import.meta.url)), orig = !!process.env.ORIGINAL;
const OF = { kobalte: "@kobalte/core", terracotta: "terracotta", cmdk: "cmdk-solid" };
const SKIP = new Set((process.env.SKIP ?? "").split(","));
export default defineConfig(({ mode }) => {
  const ssr = mode === "ssr", conditions = ssr ? ["node", "development"] : ["development", "browser"];
  const point = { name: "point", api: { vitest: { experimental: { ignoreFsModuleCache: true } } }, enforce: "pre", transform(code, id) {
    const m = /\/test\/([\w-]+)\/([\w-]+?)(\.ssr)?\.test\.tsx?$/.exec(id); if (!m) return;
    const [, pkg, part] = m, at = (p) => orig ? (OF[pkg] === "terracotta" || OF[pkg] === "cmdk-solid" ? OF[pkg] : pkg === "primitives" ? `@solid-primitives/${p}` : `${OF[pkg]}/${p}`) : pkg === "primitives" ? `@rx-packages/${p}` : existsSync(path.join(here, "packages", pkg, "facade", p + ".ts")) ? path.join(here, "packages", pkg, "facade", p + ".ts") : `@rx-packages/${pkg}/${p}`;
    return code.replace(/from "\.(?:\/index(?:\.tsx?)?)?"/g, `from "${at(part)}"`).replace(/from "\.\.\/src(?:\/index(?:\.[jt]sx?)?)?"/g, `from "${at(part)}"`).replaceAll('"@kobalte/tests"', `"${path.join(here, "test/utils/index.ts")}"`);
  } };
  return {
    cacheDir: `node_modules/.vite-${orig ? "original" : "rx"}-${mode}`,
    plugins: [point, solid({ refresh: false, solid: { generate: ssr ? "ssr" : "dom", omitNestedClosingTags: false, moduleName: "@solidjs/web" } })],
    resolve: { conditions, dedupe: ["solid-js", "@solidjs/web"] }, ssr: { resolve: { conditions }, noExternal: true },
    test: { watch: false, experimental: { fsModuleCache: false }, environment: ssr ? "node" : "jsdom", globals: true, isolate: true, maxWorkers: 3, testTimeout: 10000,
      setupFiles: ssr ? [] : ["@testing-library/jest-dom/vitest", "./test/setup.ts"],
      server: { deps: { inline: [/solid-js/, /@solidjs\//, /solid-primitives\//, /rx-packages\//, /@reactivescript/, /kobalte/, /terracotta/, /cmdk-solid/] } },
      include: ssr ? ["test/*/*.ssr.test.*", "test/*/server.test.*"] : ["test/*/*.test.*"], exclude: ssr ? [] : ["test/*/*.ssr.test.*", "test/*/server.test.*"] },
  };
});
