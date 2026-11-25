// A library's declarations parsed once in a process: `share(file)` makes the TypeScript package whose main file is `file`
// hand out one SourceFile for a file under node_modules, to every program of the same options — what TypeScript's own
// document registry does. A file that changed (device, inode, size, mtime, ctime) is read again; a project's own files (its
// `rx-types` too, and everything outside node_modules) are read every time. Programs, checkers and their caches are not shared.
const fs = require("node:fs");
const shared = new Set(), keeps = [];
exports.forget = () => { for (const k of keeps) k.clear(); };
exports.share = file => {
  if (shared.has(file)) return; shared.add(file);
  const ts = require(file), kept = new Map(), make = ts.createCompilerHost; keeps.push(kept);
  const functions = (k, v) => k === "packageJsonScope" ? !!v : v;   // (an answer about the file's folder: the same for the same file)
  const createCompilerHost = (options, parents) => {
    const host = make(options, parents), read = host.getSourceFile, set = JSON.stringify([options, !!parents]);
    host.getSourceFile = function (f, how, ...rest) {
      if (!/[\\/]node_modules[\\/]/.test(f) || /[\\/](?:rx-types|\.rx-types|\.reactivescript)[\\/]/.test(f)) return read.call(this, f, how, ...rest);
      const st = fs.statSync(f, { throwIfNoEntry: false, bigint: true }); if (!st) return read.call(this, f, how, ...rest);
      const key = `${f}\0${set}\0${JSON.stringify(how, functions)}`, at = `${st.dev}:${st.ino}:${st.size}:${st.mtimeNs}:${st.ctimeNs}`, was = kept.get(key);
      if (was?.at === at) return was.sf;
      const sf = read.call(this, f, how, ...rest); kept.set(key, { at, sf }); return sf;
    };
    return host;
  };
  require.cache[file].exports = new Proxy(ts, { get: (t, p) => p === "createCompilerHost" ? createCompilerHost : t[p] });
};
