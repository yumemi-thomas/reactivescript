const el = () => { const e = document.createElement("div"); document.body.append(e); return e; };
export const probes = { createInteractOutside: { args: () => { const e = el(); return [{ onInteractOutside: () => {} }, () => e]; }, run: async () => {
  await new Promise(r => setTimeout(r, 20));
  const out = el(); out.dispatchEvent(Object.assign(new Event("pointerdown", { bubbles: true, composed: true }), { button: 0, pointerType: "mouse" }));
} } };
