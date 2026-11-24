#!/usr/bin/env node
// The .rx language server over stdio (or whatever transport the client asks for): Volar's TypeScript project with the
// .rx language plugin, TypeScript's services, the type errors (src/editor.js), and the crate's diagnostics.
const { createConnection, createServer, createTypeScriptProject, loadTsdkByPath } = require("@volar/language-server/node");
const { create: createTypeScriptServices } = require("volar-service-typescript");
const { URI } = require("vscode-uri");
const { rxLanguagePlugin, rxDiagnostics } = require("../src/index.js");
const { typeErrors, withTypeErrors } = require("../src/editor.js");
const { lookIn } = require("../src/checker.js");

const connection = createConnection();
const server = createServer(connection);

const errors = typeErrors({
  text: file => server.documents.get(URI.file(file))?.getText(),
  say: message => connection.window.showWarningMessage(`ReactiveScript: the type errors are not rx-tsc's. ${message}`),
});

connection.listen();

connection.onInitialize(params => {
  const tsdkPath = params.initializationOptions?.typescript?.tsdk ?? require("node:path").dirname(require.resolve("typescript"));
  for (const f of params.workspaceFolders ?? (params.rootUri ? [{ uri: params.rootUri }] : [])) lookIn(URI.parse(f.uri).fsPath);
  // (TypeScript 7's package has no API in process: hover and the rest are then by the one this package depends on)
  const tsdk = (() => { try { return loadTsdkByPath(tsdkPath, params.locale); } catch (e) { try { return loadTsdkByPath(require("node:path").dirname(require.resolve("typescript")), params.locale); } catch { throw e; } } })();
  return server.initialize(
    params,
    createTypeScriptProject(tsdk.typescript, tsdk.diagnosticMessages, () => ({ languagePlugins: [rxLanguagePlugin(tsdk.typescript)] })),
    [...withTypeErrors(createTypeScriptServices(tsdk.typescript), errors), rxDiagnostics()],
  );
});

connection.onInitialized(server.initialized);
connection.onShutdown(() => { errors.close(); return server.shutdown(); });
