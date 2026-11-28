import { execFileSync } from "node:child_process"; import fs from "node:fs";
const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 1e8 });
const lines = t => t.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter(l => l.trim() && !/^\s*\/\//.test(l)).length;
const at = (rev, p) => rev ? git("ls-tree", "-r", "--name-only", rev, `packages/${p}/`).split("\n").filter(Boolean).map(f => [f, () => git("show", `${rev}:./${f}`)]) : fs.readdirSync(`packages/${p}`, { recursive: true }).map(f => [`packages/${p}/${f}`, () => fs.readFileSync(`packages/${p}/${f}`, "utf8")]);
const kinds = { rx: /\/src\/[^/]+(?<!\.d)\.rx$/, js: /\/src\/[^/]+\.js$/, facade: /packages\/[\w-]+\/index\.js$/, decl: /\/src\/[^/]+\.d\.(ts|rx)$/ };
const total = {};
for (const p of fs.readdirSync("packages")) { const row = [p]; for (const rev of [process.argv[2], ""]) { const fs_ = at(rev, p); for (const [k, re] of Object.entries(kinds)) { const n = fs_.filter(([f]) => re.test(f)).reduce((n, [, r]) => n + lines(r()), 0); row.push(n); total[(rev ? "was " : "now ") + k] = (total[(rev ? "was " : "now ") + k] ?? 0) + n; } } console.log(row.join("\t")); }
console.log(total);
