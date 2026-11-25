// Puts the WebAssembly builds in the package, before `npm pack` or `npm publish`, where src/rxc.js looks first: the
// compiler's (src/rxc.wasm: $RX_WASM, else the repository's, `cargo build --lib --release --target wasm32-unknown-unknown
// --manifest-path compiler/Cargo.toml`) and rx-declare's reading of JavaScript (src/words.wasm: `… -p rx-words …`).
const fs = require("node:fs");
const path = require("node:path");

const built = path.resolve(__dirname, "../../../compiler/target/wasm32-unknown-unknown/release");
for (const [from, to, what] of [[process.env.RX_WASM || path.join(built, "reactivescript.wasm"), "rxc.wasm", "--lib"], [process.env.RX_WORDS_WASM || path.join(built, "rx_words.wasm"), "words.wasm", "-p rx-words"]]) {
  if (!fs.existsSync(from)) {
    console.error(`no ${from}: cargo build ${what} --release --target wasm32-unknown-unknown --manifest-path compiler/Cargo.toml`);
    process.exit(1);
  }
  fs.copyFileSync(from, path.join(__dirname, "../src", to));
}
