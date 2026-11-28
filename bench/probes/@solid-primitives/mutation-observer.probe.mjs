const el = () => { const e = document.createElement("div"); document.body.append(e); return e; };
let node;
export const probes = { createMutationObserver: { args: () => { node = el(); return [() => [[node, { childList: true }]], () => {}]; }, run: async () => { node.append(document.createElement("i")); await new Promise(r => setTimeout(r, 30)); } } };
