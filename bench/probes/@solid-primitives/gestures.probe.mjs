const el = () => { const e = document.createElement("div"); document.body.append(e); return e; };
export const probes = { tap: { args: () => [{ callback: () => {} }], run: bind => {
  const e = el(); bind(e);
  e.setPointerCapture ??= () => {};
  for (const type of ["pointerdown", "pointerup"]) e.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { pointerId: 1, clientX: 1, clientY: 1 }));
} } };
