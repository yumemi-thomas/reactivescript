// A process that stays up and runs the language server's tools one after another (scripts/lib/tools.mjs asks): each
// request runs the tool's own bin/ file, in its own folder, with its own arguments and environment and every module of
// the tool loaded again: what is saved is Node's start. Anything that does not end as a process of its own would (it throws, it hangs) is answered `again`:
// the one that asked runs it in a process of its own.
//   node tool-worker.cjs <the language server's folder> <a folder the questions and answers are files of>
const fs = require("node:fs"), path = require("node:path");
const [root, at] = process.argv.slice(2).map(p => fs.realpathSync(p));
const base = { ...process.env }, home = process.cwd(), argv = process.argv.slice(0, 1);
class Exit { constructor(code) { this.code = code; } }
let out, said, ended;
const write = k => (text, enc, cb) => { out[k] += typeof text === "string" ? text : Buffer.from(text).toString("utf8"); const f = typeof enc === "function" ? enc : cb; if (f) queueMicrotask(() => { try { f(); } catch (e) { if (!(e instanceof Exit)) ended({ error: e }); } }); return true; };
const own = { stdout: process.stdout.write.bind(process.stdout), exit: process.exit.bind(process) };
process.stdout.write = write("stdout"); process.stderr.write = write("stderr");
process.exit = code => { const c = code ?? process.exitCode ?? 0; said ??= c; ended?.({ code: said }); throw new Exit(c); };
process.on("unhandledRejection", e => { if (!(e instanceof Exit)) ended?.({ error: e }); });
process.on("uncaughtException", e => { if (!(e instanceof Exit)) ended?.({ error: e }); });
async function run({ bin, args, cwd, env }) {
  out = { stdout: "", stderr: "" }; said = undefined; process.exitCode = undefined;
  for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k]; Object.assign(process.env, env);
  process.chdir(cwd); process.argv = [...argv, path.join(root, "bin", bin), ...args];
  for (const k of Object.keys(require.cache)) if (k.startsWith(root + path.sep) && !k.startsWith(path.join(root, "node_modules") + path.sep)) delete require.cache[k];
  const listeners = process.listeners("exit");
  const done = new Promise(res => { ended = res; });
  try { require(process.argv[1]); if (bin === "tsc.js") ended({ code: process.exitCode ?? 0 }); } catch (e) { ended(e instanceof Exit ? { code: e.code } : { error: e }); }
  const r = await Promise.race([done, new Promise(res => setTimeout(res, 240000, { error: new Error("it did not end") }).unref())]);
  ended = undefined;
  for (const l of process.listeners("exit")) if (!listeners.includes(l)) process.removeListener("exit", l);
  const checker = require.cache[path.join(root, "src/checker.js")]; try { checker?.exports.closeAll(); } catch { return { again: "its checker did not close" }; }
  return r.error ? { again: String(r.error?.stack ?? r.error).slice(0, 2000) } : { status: r.code, signal: null, ...out };
}
const question = path.join(at, "ask"), answer = path.join(at, "answer");
const parent = process.ppid;
process.on("SIGTERM", () => own.exit(0));
async function turn() {
  if (process.ppid !== parent) return own.exit(0);   // (the suite is gone)
  let text; try { text = fs.readFileSync(question, "utf8"); } catch { setTimeout(turn, 2); return; }
  fs.rmSync(question, { force: true });
  const { id, ...ask } = JSON.parse(text); let r; try { r = await run(ask); } catch (e) { r = { again: String(e?.stack ?? e) }; }
  process.chdir(home); for (const k of Object.keys(process.env)) if (!(k in base)) delete process.env[k]; Object.assign(process.env, base);
  // what it keeps is let go of when it is much; one that has grown all the same, or has gone wrong, is not used again
  const { rss } = process.memoryUsage();
  const last = !!r.again || rss > (Number(process.env.RX_TOOLS_MB) || 1500) * (1 << 20);
  fs.writeFileSync(answer + ".tmp", JSON.stringify({ id, last, ...r })); fs.renameSync(answer + ".tmp", answer);
  if (last) return own.exit(0);
  setTimeout(turn, 0);
}
turn();
