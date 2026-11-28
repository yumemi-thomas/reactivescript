// Preloaded (node --require) into a runner: the Chromium it starts is a connection to one that is already up (RX_BROWSER,
// `chromium.launchServer`'s address), so that many runners' pages are one browser's.
if (process.env.RX_BROWSER) {
  const Module = require("node:module"), load = Module._load;
  Module._load = function (name, ...rest) {
    const m = load.call(this, name, ...rest);
    if (name === "playwright" && m.chromium && !m.chromium.__shared) { m.chromium.__shared = true; m.chromium.launch = () => m.chromium.connect(process.env.RX_BROWSER); }
    return m;
  };
}
// And a large input of a synchronous child is a file, not a pipe: Node has been seen to wait for ever on one (ref/crate.ts;
// a revision older than its fix pipes).
{
  const cp = require("node:child_process"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), real = cp.execFileSync;
  cp.execFileSync = function (file, args, opts) {
    if (!Array.isArray(args) || typeof opts?.input !== "string" || opts.stdio) return real.apply(this, arguments);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rx-in-")), at = path.join(dir, "in"); fs.writeFileSync(at, opts.input);
    const fd = fs.openSync(at, "r"), { input, ...rest } = opts;
    try { return real.call(this, file, args, { ...rest, stdio: [fd, "pipe", "inherit"] }); } finally { fs.closeSync(fd); fs.rmSync(dir, { recursive: true, force: true }); }
  };
  require("node:module").syncBuiltinESMExports();
}
