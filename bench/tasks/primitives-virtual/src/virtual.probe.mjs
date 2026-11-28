export const probes = { createVirtualizer: { args: () => { const e = document.createElement("div"); return [() => ({ count: 3, getScrollElement: () => e, estimateSize: () => 10 })]; } } };
