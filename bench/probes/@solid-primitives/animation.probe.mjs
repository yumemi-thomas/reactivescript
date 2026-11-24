const el = () => { const e = document.createElement("div"); document.body.append(e); return e; };
export const probes = { createAnimate: { args: () => { const e = el(); e.animate = () => ({ cancel() {} }); return [() => e, () => [], () => ({})]; } } };
