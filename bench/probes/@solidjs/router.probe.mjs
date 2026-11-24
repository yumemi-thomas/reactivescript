const inside = make => (children, s) => s.createComponent(make({ routes: [{ path: "*all", component: () => children() }] }), {});
export const providers = { router: (children, s, lib) => inside(lib.createRouter)(children, s) };
const form = () => {};
export const probes = {
  createRouter: { around: providers.router },
  useSubmissions: { args: () => [form] },
};
export const scene = (lib, h) => {
  const Layout = h.component("Layout", p => p.children);
  const Made = lib.createRouter({ routes: [{ path: "/", component: Layout, children: [{ path: "/", component: h.component("Home") }] }] });
  return () => h.s.createComponent(Made, {});
};
