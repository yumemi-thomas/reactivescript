// Installs UI SDK's packages as built from a copy of the repository (node install.mjs <copy of vercel-labs/ui>): the manifest as published.
import { cpSync, readFileSync, rmSync, mkdirSync, writeFileSync, existsSync, symlinkSync } from "node:fs"; import path from "node:path";
const here = path.dirname(new URL(import.meta.url).pathname), ui = process.argv[2];
for (const name of ["core", "solid"]) {
  const from = path.join(ui, "packages", name), to = path.join(here, "node_modules/@ui-sdk", name);
  const j = JSON.parse(readFileSync(path.join(from, "package.json"), "utf8")); const pub = j.publishConfig ?? {}; delete j.publishConfig; Object.assign(j, pub); delete j.devDependencies; delete j.scripts;
  rmSync(to, { recursive: true, force: true }); mkdirSync(to, { recursive: true }); cpSync(path.join(from, "dist"), path.join(to, "dist"), { recursive: true }); writeFileSync(path.join(to, "package.json"), JSON.stringify(j, null, 2)); cpSync(path.join(ui, "LICENSE"), path.join(to, "LICENSE"));
}
const self = path.join(here, "node_modules/@rx-ui-sdk"); mkdirSync(self, { recursive: true }); if (!existsSync(self + "/solid")) symlinkSync(here, self + "/solid", "dir");
