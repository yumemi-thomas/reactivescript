// The Vite the dev-server and watch suites run: the benchmark's (bench/package.json pins it), from its workspace, so that
// what they test is the release an app gets and one version is bumped in one place. The one in Solid's checkout is what
// Solid's own pnpm lock has (8.1.5 at 99db9bce4), and is used only where the workspace is not installed. `VITE=<dir>` names another.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const bench = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../bench/.out/ws/node_modules/vite");
/** `store`: the node_modules of the plugin in Solid's checkout. */
export function viteDir(store) {
  const dir = process.env.VITE ? path.resolve(process.env.VITE) : existsSync(path.join(bench, "package.json")) ? bench : path.join(store, "vite");
  console.log(`vite ${JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")).version}`);
  return dir;
}
