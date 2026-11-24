// The TypeScript checker of the tooling: tsrs (TypeScript 7), at the exact version package.json pins. Everything that asks
// TypeScript for diagnostics asks here — rx-tsc, rx-declare's check of its draft, the boundary check (TY-6), the editor's
// type errors, ref/types — so that there is one answer: files and options in, diagnostics with positions out, in order.
//
// tsrs is a process that stays up, spoken to through its synchronous API: the files that exist only here (a projection, a
// boundary check) are given with the question and never written to disk. There is no other checker to fall back to: a
// second one would be a second set of verdicts, so where tsrs cannot run, the tool that needed it says why and stops.
//
// Why the order of things cannot change an answer: a program is checked by one checker, in the order its files are given
// (tsrs serves the API with one checker a program), and no program is cut to fit a number of
// processes.
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const PINNED = require("../package.json").dependencies.tsrs;

/** Folders tsrs may be taken from where it is not installed beside this file (the extension's bundle): a project's. */
const folders = [];
const lookIn = dir => { if (!folders.includes(dir)) folders.push(dir); };
/** What requires tsrs: this file, else the language server a project has installed, else the project. */
function requirer() {
  try { require.resolve("tsrs"); return require; } catch { /* not beside this file */ }
  for (const dir of folders) for (const via of ["@reactivescript/language-server/package.json", undefined]) {
    try { let r = createRequire(path.join(dir, "package.json")); if (via) r = createRequire(r.resolve(via)); r.resolve("tsrs"); return r; } catch { /* nor there */ }
  }
  return require;
}
/** tsrs's modules, or an error a person can act on. */
let loaded;
function tsrs() {
  if (loaded) return loaded;
  const fail = (why, e) => Object.assign(new Error(`${why}\nReactiveScript type-checks with tsrs ${PINNED} (TypeScript 7), and with nothing else: a check by another TypeScript would give other verdicts.${e ? `\n${e.message}` : ""}`), { code: "RX_NO_CHECKER", cause: e });
  let version, sync, vfs;
  const from = requirer();
  try { version = from("tsrs"); } catch (e) { throw fail("tsrs is not installed with @reactivescript/language-server: install its dependencies again (in an editor: install @reactivescript/language-server in the project).", e); }
  if (version.version !== PINNED && process.env.RX_TSRS_VERSION !== version.version) throw fail(`tsrs ${version.version} is installed where ${PINNED} is pinned: install again (RX_TSRS_VERSION=${version.version} tries it all the same).`);
  try { sync = from("tsrs/sync"); vfs = from("tsrs/fs"); } catch (e) {
    throw fail(e.code === "ERR_REQUIRE_ESM" ? `tsrs's API needs Node 20.19, 22.12 or later (this is ${process.version}).` : "tsrs's API did not load.", e);
  }
  return (loaded = { ...version, ...sync, ...vfs, fail });
}

/** What a tool prints for its version: ours, the checker's, and the TypeScript it is. */
const versions = () => { const t = tsrs(); return { own: require("../package.json").version, tsrs: t.version, typescript: t.typescriptVersion, commit: t.typescriptCommit }; };
const versionText = () => { const v = versions(); return `${v.own} (tsrs ${v.tsrs}, TypeScript ${v.typescript} ${v.commit.slice(0, 12)})`; };

/** A diagnostic's message with its chain, each level two spaces in, as TypeScript prints it. */
function flatten(d, newLine = "\n", level = 0) {
  let text = level ? newLine + "  ".repeat(level) + d.text : d.text;
  for (const c of d.messageChain ?? []) text += flatten(c, newLine, level + 1);
  return text;
}
/** `{ file, start, length, line, column, code, category, message, related }`: `line` from 1, `column` from 0, in UTF-16. */
function plain(d) {
  return {
    file: d.fileName, start: d.fileName === undefined ? undefined : d.pos, length: d.fileName === undefined ? undefined : d.end - d.pos,
    line: d.startPosition ? d.startPosition.line + 1 : 0, column: d.startPosition?.character ?? 0,
    end: d.endPosition ? { line: d.endPosition.line + 1, column: d.endPosition.character } : undefined,
    code: d.code, category: d.category, message: flatten(d), related: (d.relatedInformation ?? []).map(plain),
  };
}
/** TypeScript's order (`sortAndDeduplicateDiagnostics`): no file first, then by file, place, code and text; each once. */
function ordered(ds) {
  const key = d => [d.file ?? "", d.start ?? -1, d.length ?? -1, d.code, d.message];
  const less = (a, b) => { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; };
  const out = [...ds].sort(less);
  return out.filter((d, i) => !i || less(out[i - 1], d) !== 0);
}

class Checker {
  /** @param {{ cwd?: string, fs?: object }} how `fs`: an overlay of the disk for files this process stands in for (`{ file,
   *  dir, read, list }`, each answering undefined for the disk's own), asked at every look tsrs takes; `record`: every
   *  look is made here, with Node's fs (TY-1d: what the run read). */
  constructor({ cwd = process.cwd(), overlay, record = false } = {}) {
    const t = tsrs(), { useOS } = t.serverFS;
    const real = record ? recorded(useOS) : { file: () => useOS, dir: () => useOS, read: () => useOS, list: () => useOS, stat: () => useOS };
    const o = overlay ?? {};
    const or = (f, g) => p => { const v = f?.(p); return v === undefined ? g(p) : v; };
    const cb = overlay || record ? {
      fileExists: or(o.file, real.file), directoryExists: or(o.dir, real.dir), readFile: or(o.read, real.read),
      getAccessibleEntries: o.list || record ? or(o.list, real.list) : useOS, stat: record ? real.stat : useOS,
      realpath: useOS, writeFile: useOS, removeFile: useOS,
    } : undefined;
    this.cwd = path.resolve(cwd);
    try { this.api = new t.API({ cwd: this.cwd, ...(cb ? { fs: cb } : {}) }); this.api.parseCommandLine([]); }
    catch (e) { throw t.fail("tsrs could not be started.", e); }
    this.resolvers = new Map();
  }
  /** The options of a question as tsrs takes them: the ones it would refuse as raw options left out. */
  options(o = {}) { const { configFile, configFilePath, pathsBasePath, ...rest } = o; return { ...rest, ...(configFilePath ? { configFilePath } : {}), ...(pathsBasePath ? { pathsBasePath } : {}) }; }
  /** Where `spec`, imported from a file of `dir`, resolves: tsrs's answer (`{ resolvedFileName, … }`) or undefined. */
  resolve(spec, dir, options) {
    const k = JSON.stringify(options ?? {});
    if (!this.resolvers.has(k)) this.resolvers.set(k, this.api.createModuleResolver(this.options(options)));
    return this.resolvers.get(k).resolveModuleName(spec, dir).resolvedModule;
  }
  /** What was resolved is not kept past a change of the disk. */
  forget() { for (const r of this.resolvers.values()) r.dispose?.(); this.resolvers.clear(); }
  /** The program of `roots` under `options`. `files`: the texts that are not on disk (absolute path → text); `resolutions`:
   *  the imports that are settled here (`{ moduleName, containingDirectory, result }`), every other as TypeScript resolves it;
   *  `fresh`: whatever this checker read before, the files are read again.
   *  Dispose of it when done. */
  program({ roots, files, options, resolutions, references, configErrors, fresh }) {
    const t = tsrs();
    const resolver = resolutions?.length ? this.api.createModuleResolver(this.options(options), { moduleResolutions: { fallback: "resolve", entries: resolutions } }) : undefined;
    const snapshot = this.api.createSnapshot({
      ...(fresh ? { fileNotifications: { invalidateAll: true } } : {}),
      ...(files?.size ? { fileSystem: t.createFileSystemLayer([...files]) } : {}),
      createPrograms: [{ rootFiles: roots, compilerOptions: this.options(options), options: { ...(resolver ? { moduleResolver: resolver } : {}), ...(references?.length ? { projectReferences: references } : {}), ...(configErrors?.length ? { configFileParsingDiagnostics: configErrors } : {}) } }],
    });
    return { program: snapshot.operation.createdPrograms[0], dispose: () => { snapshot.dispose(); resolver?.dispose?.(); } };
  }
  /** The syntactic and semantic diagnostics of `ask` (default: the roots), file by file in the order given. */
  check({ ask, ...how }) {
    const { program, dispose } = this.program(how);
    try { const of = ask ?? how.roots; return of.flatMap(f => [...program.getSyntacticDiagnostics(f), ...program.getSemanticDiagnostics(f)].map(plain)); }
    finally { dispose(); }
  }
  close() { this.forget(); this.api.close(); }
}

/** Node's fs as the server asks for it: every look made in this process, where src/inputs.js records it. */
function recorded() {
  return {
    file: p => { try { return fs.statSync(p).isFile(); } catch { return false; } },
    dir: p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } },
    read: p => { try { const b = fs.readFileSync(p); return b[0] === 0xfe && b[1] === 0xff ? b.swap16().toString("utf16le", 2) : b[0] === 0xff && b[1] === 0xfe ? b.toString("utf16le", 2) : b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? b.toString("utf8", 3) : b.toString("utf8"); } catch { return undefined; } },
    list: p => {
      const files = [], directories = [], symlinks = [];
      let entries; try { entries = fs.readdirSync(p, { withFileTypes: true }); } catch { return { files, directories, symlinks: undefined }; }
      for (const e of entries) {
        let d = e.isDirectory(), f = e.isFile();
        if (e.isSymbolicLink()) { symlinks.push(e.name); try { const s = fs.statSync(path.join(p, e.name)); d = s.isDirectory(); f = s.isFile(); } catch { /* broken */ } }
        if (d) directories.push(e.name); else if (f) files.push(e.name);
      }
      return { files, directories, symlinks: symlinks.length ? symlinks : undefined };
    },
    stat: p => { try { const s = fs.statSync(p); return { mode: s.mode, size: s.size, mtime: s.mtime }; } catch { return undefined; } },
  };
}

/** A specifier TypeScript resolves through node_modules (not a relative or an absolute path). */
const bare = name => !name.startsWith(".") && !path.isAbsolute(name) && !/^[A-Za-z]:[\\/]/.test(name);

/** MO-8o: a check whose bare imports are the declared library's. A boundary check is given a folder of its own (a name no
 *  folder has), so that what its imports resolve to is settled for it alone: a bare specifier as the library `lib` (a
 *  file) resolves it, then as `beside` does; a relative one as a file of `beside` (the declaration's folder) would.
 *  @returns {{ file: string, resolutions: object[] }} where the check stands, and its settled imports */
function asLibrary(checker, { name, code, beside, lib }, options) {
  const dir = path.join(beside, `__rx_${name.replace(/[^\w.-]+/g, "_")}`), file = path.join(dir, name);
  const resolutions = [];
  for (const spec of new Set([...code.matchAll(/\b(?:from|import)\s*\(?\s*("(?:[^"\\\n]|\\.)*")/g)].map(m => JSON.parse(m[1])))) {
    const r = (lib && bare(spec) && checker.resolve(spec, path.dirname(lib), options)) || checker.resolve(spec, beside, options);
    if (r) resolutions.push({ moduleName: spec, containingDirectory: dir, result: { resolvedFileName: r.resolvedFileName, ...(r.originalPath ? { originalPath: r.originalPath } : {}), ...(r.packageId ? { packageId: r.packageId } : {}) } });
  }
  return { file, resolutions };
}

/** The process's own checker, for tools that ask about the disk as it is: one a working directory, closed with the process. */
const shared = new Map();
function checker(cwd = process.cwd()) {
  const k = path.resolve(cwd);
  if (!shared.has(k)) shared.set(k, new Checker({ cwd: k }));
  return shared.get(k);
}

const closeAll = () => { for (const c of shared.values()) c.close(); shared.clear(); };

module.exports = { Checker, checker, closeAll, lookIn, asLibrary, bare, flatten, plain, ordered, versions, versionText, tsrs };
