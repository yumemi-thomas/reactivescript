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
