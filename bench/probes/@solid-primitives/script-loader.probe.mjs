export const probes = { createScriptLoader: { args: () => [{ src: "/a.js", onLoad: () => {} }], run: script => { script.dispatchEvent(new Event("load")); } } };
