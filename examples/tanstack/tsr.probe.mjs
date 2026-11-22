// rx-verify's probe for tsr.d.rx (`rx-verify --dom tsr.d.rx`). The scene checks createAppRouter's placement rows by
// running: a factory (what it is given renders inside the component it makes) with nests(children in component) (a
// page renders inside its layout).
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/solid-router";
export const scene = (lib, h) => {
  const Layout = h.component("Layout", props => props.children);
  const Page = h.component("Page");
  const Router = lib.createAppRouter({ component: Layout, children: [{ path: "/", component: Page }] });
  return () => h.s.createComponent(Router, {});
};
// the hooks are checked under a router whose root route renders them (a router with no route at "/" is a not-found,
// which TanStack handles by rendering again: each has an index route)
const routerOf = component => { const root = createRootRoute(component ? { component } : {}); const home = createRoute({ getParentRoute: () => root, path: "/" }); return createRouter({ routeTree: root.addChildren([home]), history: createMemoryHistory({ initialEntries: ["/"] }) }); };
export const probes = {
  createAppRouter: { args: () => [{ component: () => null, children: [{ path: "/", component: () => null }] }] },
  useParams: { args: () => [{ strict: false }] },
};
export const provide = (children, s) => s.createComponent(RouterProvider, { router: routerOf(() => children()) });
