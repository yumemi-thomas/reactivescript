// A module and what it imports, as one script (Rolldown, the one of the install `from` is a folder of): what the suites give a
// browser. Returns the code (`ids`: `{ code, ids }`, with the files it holds).
//   entry | code, dir     a file, or a module's text and the folder it stands in
//   conditions            `exports` conditions beside `import` and `default`
//   platform              "browser" (default) or "node"; `external`: packages are left to be imported
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TEXT = "\0rx-entry.mjs";
export async function bundle(from, { entry, code, dir, conditions = ["browser"], platform = "browser", external = false, alias, plugins = [], modules, file, ids = false }) {
  const { rolldown } = await import(pathToFileURL(createRequire(path.join(from, "package.json")).resolve("rolldown")).href);
  const text = code === undefined ? [] : [{ name: "rx-entry", resolveId: id => id === TEXT ? TEXT : undefined, load: id => id === TEXT ? code : undefined }];
  const b = await rolldown({
    input: code === undefined ? entry : TEXT, cwd: dir, platform, tsconfig: false, logLevel: "silent", plugins: [...text, ...plugins],
    ...(external ? { external: id => id !== TEXT && !id.startsWith(".") && !path.isAbsolute(id) } : {}),
    resolve: { conditionNames: [...conditions, "import", "default"], ...(alias ? { alias } : {}), ...(modules ? { modules } : {}) },
    moduleTypes: { ".css": "empty" }, ...(platform === "browser" ? { transform: { define: { "process.env.NODE_ENV": '"development"' } } } : {}),
  });
  try { const o = { format: "esm", codeSplitting: false, comments: { legal: false, annotation: true, jsdoc: false } }, out = (file ? await b.write({ ...o, file }) : await b.generate(o)).output[0]; return ids ? { code: out.code, ids: out.moduleIds ?? Object.keys(out.modules ?? {}) } : out.code; } finally { await b.close(); }
}
