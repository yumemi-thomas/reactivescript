// `npm pack` (and so `npm publish`) ships package.json without its devDependencies: they link Solid from the pin beside
// the repository (`file:../../solid-next/…`, as ref/ does), which means nothing where the package is installed. prepack
// keeps the file as it is and writes the shipped one; postpack puts it back.   node pack.mjs strip | restore
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
const here = import.meta.dirname, file = path.join(here, "package.json"), kept = path.join(here, ".package.json.dev");
if (process.argv[2] === "strip") {
  if (existsSync(kept)) throw new Error("runtime/.package.json.dev is there: a pack did not finish; `node pack.mjs restore` first");
  const text = readFileSync(file, "utf8"), j = JSON.parse(text);
  writeFileSync(kept, text);
  delete j.devDependencies;
  const local = ["dependencies", "peerDependencies", "optionalDependencies"].flatMap(k => Object.entries(j[k] ?? {}).filter(([, v]) => /^(file|link|workspace):|^\.{0,2}\//.test(v)).map(([n, v]) => `${k}.${n}: ${v}`));
  if (local.length) { renameSync(kept, file); throw new Error(`the shipped package.json would name a local package: ${local.join(", ")}`); }
  writeFileSync(file, JSON.stringify(j, null, 2) + "\n");
} else if (process.argv[2] === "restore") {
  if (existsSync(kept)) renameSync(kept, file);
} else throw new Error("usage: node pack.mjs strip | restore");
