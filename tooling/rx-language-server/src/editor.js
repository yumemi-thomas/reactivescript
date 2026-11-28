// The editor's type errors, by the checker rx-tsc uses (src/checker.js): the project's program with the open documents'
// texts in place of the disk's, read again when the project has changed. What else the editor asks of TypeScript (hover,
// completion, definitions, rename, its hints) is Volar's, over the TypeScript the client names: an answer about a name is
// not a verdict, and tsrs's server has no way to answer for a `.rx` through the crate's mappings.
//
// The extension's bundle holds no tsrs (one .vsix serves every platform; tsrs is a binary for each): it takes the
// workspace's, and where there is none of the pinned version it says so and the type errors are TypeScript's.
const fs = require("node:fs");
const { plain, versionText } = require("./checker.js");
const { Checker, overlay, readConfig, placed } = require("./program.js");

/** @param {{ text: (file: string) => string | undefined, say: (message: string) => void }} editor `text`: an open document's */
function typeErrors({ text, say }) {
  const text_ = f => text(f) ?? fs.readFileSync(f, "utf8");
  const disk = overlay(text_);
  // any open document, not the `.rx` alone
  const over = { ...disk, read: p => disk.read(p) ?? text(p) };
  let checker, unable;
  const projects = new Map();   // a project (its tsconfig, or the folder of one there is none for) → its program, at a version
  const start = () => {
    if (checker || unable) return checker;
    try { checker = new Checker({ overlay: over }); } catch (e) { if (e.code !== "RX_NO_CHECKER") throw e; unable = e.message; say(e.message); }
    return checker;
  };
  const programOf = (file, ts) => {
    const host = ts.languageServiceHost, key = ts.configFileName ?? `inferred:${file}`, version = `${host.getProjectVersion?.()}`;
    const had = projects.get(key);
    if (had && had.version === version) return had;
    had?.dispose(); projects.delete(key);
    checker.forget();
    let roots, options, references;
    if (ts.configFileName) { ({ roots, options, references } = readConfig(checker, ts.configFileName)); }
    else { roots = [file + ".tsx"]; options = host.getCompilationSettings(); }
    if (!roots.includes(file + ".tsx")) roots = [...roots, file + ".tsx"];
    const p = { version, ...checker.program({ roots, references, options: { ...options, noEmit: true, allowArbitraryExtensions: true }, fresh: true }) };
    projects.set(key, p);
    return p;
  };
  return {
    /** Whether the type errors are this checker's; asked first, it starts it. */
    able: () => !!start(),
    /** The type errors of an `.rx` module, on it. */
    of(file, ts) {
      if (!start()) return [];
      const { program } = programOf(file, ts), tsx = file + ".tsx";
      return [...program.getSyntacticDiagnostics(tsx), ...program.getSemanticDiagnostics(tsx)].map(plain).map(placed).filter(d => d && d.file === file);
    },
    close() { for (const p of projects.values()) p.dispose(); projects.clear(); checker?.close(); checker = undefined; },
    version: versionText,
  };
}

/** The services of a server that has it: the errors on the `.rx`, and TypeScript's own service without its errors there. */
function withTypeErrors(services, errors) {
  const { URI } = require("vscode-uri");
  return [
    ...services.map(s => s.name !== "typescript-semantic" ? s : {
      ...s,
      create(context, ...rest) {
        const made = s.create(context, ...rest);
        return { ...made, async provideDiagnostics(document, token) {
          const all = await made.provideDiagnostics?.(document, token);
          const source = context.decodeEmbeddedDocumentUri(URI.parse(document.uri))?.[0];
          if (!source?.path.endsWith(".rx") || !errors.able()) return all;
          return all?.filter(d => d.severity !== 1);   // its hints (an unused name) stay
        } };
      },
    }),
    {
      name: "reactivescript-types",
      capabilities: { diagnosticProvider: { interFileDependencies: true, workspaceDiagnostics: false } },
      create(context) {
        return {
          provideDiagnostics(document) {
            if (document.languageId !== "reactivescript" || !errors.able()) return;
            const uri = URI.parse(document.uri), source = context.decodeEmbeddedDocumentUri(uri)?.[0] ?? uri;
            const project = context.project.typescript;
            if (source.scheme !== "file" || !source.fsPath.endsWith(".rx") || source.fsPath.endsWith(".d.rx") || !project) return;
            return errors.of(source.fsPath, project).map(d => ({
              range: { start: { line: d.line - 1, character: d.column }, end: { line: d.end.line - 1, character: d.end.column } },
              severity: d.category === 1 ? 1 : d.category === 0 ? 2 : 4, source: "ts", code: d.code, message: d.message,
              relatedInformation: d.related.filter(r => r.file !== undefined).map(r => ({ location: { uri: URI.file(r.file).toString(), range: { start: { line: r.line - 1, character: r.column }, end: { line: r.end.line - 1, character: r.end.column } } }, message: r.message })),
            }));
          },
        };
      },
    },
  ];
}

module.exports = { typeErrors, withTypeErrors };
