const el = () => { const e = document.createElement("div"); document.body.append(e); return e; };
export const probes = { createVisibilityObserver: { args: () => { const e = el(); return [() => e, { initialValue: false }]; } } };
