// Packs the extension into dist/: the client, the language server (tooling/rx-language-server) with its dependencies
// bundled, and the crate's WebAssembly build as rxc.wasm, which the server loads in process: one .vsix for every
// platform. TypeScript is not bundled; the server loads the workspace's, or the one VS Code ships (client.js). Nor is
// tsrs, a binary for each platform: the type errors are by the one the project's @reactivescript/language-server installs,
// and TypeScript's where there is none, which the server says (rx-language-server/src/editor.js).
//   node build.js        needs `npm install` here and in ../rx-language-server, and
//                        `cargo build --lib --release --target wasm32-unknown-unknown` in ../../compiler
const { build } = require("rolldown");
const fs = require("node:fs");
const path = require("node:path");

const wasm = process.env.RX_WASM || path.resolve(__dirname, "../../compiler/target/wasm32-unknown-unknown/release/reactivescript.wasm");
if (!fs.existsSync(wasm)) {
  console.error(`no ${wasm}: cargo build --lib --release --target wasm32-unknown-unknown --manifest-path compiler/Cargo.toml`);
  process.exit(1);
}
fs.rmSync(path.join(__dirname, "dist"), { recursive: true, force: true });
const pack = (input, file, external) => build({ input, external, platform: "node", tsconfig: false, logLevel: "warn", checks: { eval: false }, transform: { target: "node18" }, output: { file, format: "cjs", minify: true, sourcemap: false, codeSplitting: false } });
Promise.all([
  pack(path.join(__dirname, "client.js"), "dist/client.js", ["vscode"]),
  pack(path.resolve(__dirname, "../rx-language-server/bin/server.js"), "dist/server.js", ["typescript", "tsrs", /^tsrs\//]),
]).then(() => {
  fs.copyFileSync(wasm, path.join(__dirname, "dist/rxc.wasm"));
  for (const f of fs.readdirSync("dist")) console.log(`dist/${f}  ${(fs.statSync(path.join("dist", f)).size / 1024).toFixed(0)} KB`);
}, e => { console.error(e); process.exit(1); });
