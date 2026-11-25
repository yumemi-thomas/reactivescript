// node upstream/run.mjs <copy of vercel-labs/ui> <orig | rx,toggle,…> <out.json> specs… — the project's own Playwright specs, in Chromium.
import path from "node:path"; import { openSync } from "node:fs"; import { group } from "./group.mjs";
const [ui, which, out, ...specs] = process.argv.slice(2);
const log = openSync(out.replace(/json$/, "log"), "w");
const g = group(process.execPath, [path.join(ui, "node_modules/@playwright/test/cli.js"), "test", ...specs, "--project", "solid", "--project", "solid-ssr", "--workers", "3", "--timeout", "8000", "--retries", process.env.RETRIES ?? "2", "--max-failures", process.env.MAX ?? "15", "--reporter", "json", ...(process.env.GREP ? ["-g", process.env.GREP] : [])],
  { cwd: path.join(ui, "tests"), seconds: +(process.env.SECONDS_MAX ?? 240), stdio: ["ignore", log, log], env: { ...process.env, UI: which === "orig" ? "" : which, PLAYGROUND_PORT: process.env.PORT ?? "5371", PLAYWRIGHT_JSON_OUTPUT_NAME: path.resolve(out) } });
const r = await g.done; if (r.ended && r.ended !== "done") console.log("ended:", r.ended);
const { readFileSync } = await import("node:fs"); const j = JSON.parse(readFileSync(out, "utf8")); console.log(j.stats);
const walk = (s, at = []) => { for (const x of s.specs ?? []) for (const t of x.tests) if (t.status === "unexpected" || t.status === "flaky") console.log(t.status, `[${t.projectName}]`, x.file + ":" + x.line, x.title, "—", (t.results.at(-1)?.status === "passed" ? t.results[0] : t.results.at(-1))?.error?.message?.replace(/\x1b\[\d+m/g, "").split("\n").slice(0, +(process.env.L ?? 3)).join(" ").slice(0, 400)); for (const k of s.suites ?? []) walk(k); }; walk(j);
