const later = ms => new Promise(r => setTimeout(r, ms));
const el = () => document.body.appendChild(document.createElement("div"));
export const probes = {
  on: { args: () => [document.body, "click", () => {}], act: () => document.body.click() },
  onWindow: { args: () => ["resize", () => {}], act: () => window.dispatchEvent(new Event("resize")) },
  onDocument: { args: () => ["click", () => {}], act: () => document.dispatchEvent(new Event("click")) },
  onVisible: { args: () => [() => {}], act: () => document.dispatchEvent(new Event("visibilitychange")) },
  onFrame: { args: () => [() => {}], act: () => later(40) },
  onMutation: { args: () => [globalThis.__m ??= el(), () => {}, { childList: true }], act: async () => { globalThis.__m.append("x"); await later(10); } },
  onMedia: { args: () => ["(min-width: 1px)", () => {}] }, onResize: { args: () => [el(), () => {}] }, onIntersect: { args: () => [el(), () => {}] },
};
