// The platform packages (npm/*) at this package's version (`npm version` runs this), and, with `--publish`, this
// package's optionalDependencies on them, which the publish job writes just before it publishes
// (.github/workflows/compiler.yml). They are never committed: a committed optionalDependencies puts the platform
// packages in the lock once they exist on npm, and a version bump then leaves the lock out of sync (`npm ci` refuses
// it) until the new ones are published.
// `--publish` also writes the rest of the published manifest (published.mjs: the runtime as a dependency, Solid as a
// peer), for the same reason.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { published } from "./published.mjs";

const read = f => JSON.parse(readFileSync(f, "utf8"));
const write = (f, j) => writeFileSync(f, JSON.stringify(j, null, 2) + "\n");
const publish = process.argv.includes("--publish");
const pkg = publish ? published(read("package.json"), read("../runtime/package.json")) : read("package.json");
if (publish) pkg.optionalDependencies = {};
for (const dir of readdirSync("npm")) {
  const p = read(`npm/${dir}/package.json`);
  p.version = pkg.version;
  write(`npm/${dir}/package.json`, p);
  if (publish) pkg.optionalDependencies[p.name] = pkg.version;
}
if (publish) write("package.json", pkg);
