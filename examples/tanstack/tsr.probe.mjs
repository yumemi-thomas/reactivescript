// rx-verify's probe for tsr.d.rx (`rx-verify --dom tsr.d.rx`): a scene whose root route renders <Outlet />, with a child route at "/"
// under it, so the placement rows (renders(later), nests(component under getParentRoute), outlet) are checked by running
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/solid-router";
export const scene = (lib, h) => {
  const Root = h.component("Root", () => h.s.createComponent(lib.Outlet, {}));
  const Home = h.component("Home");
  const root = lib.createRootRoute({ component: Root });
  const home = lib.createRoute({ getParentRoute: () => root, path: "/", component: Home });
  const router = lib.createRouter({ routeTree: root.addChildren([home]), history: createMemoryHistory({ initialEntries: ["/"] }) });
  return () => h.s.createComponent(lib.RouterProvider, { router });
};
// RouterProvider's provides(router) is checked by mounting it around a hook that uses only the router (useNavigate);
// useParams needs its options
// (a router with no route at "/" is a not-found, which TanStack handles by rendering again: each has an index route)
const routerOf = component => { const root = createRootRoute(component ? { component } : {}); const home = createRoute({ getParentRoute: () => root, path: "/" }); return createRouter({ routeTree: root.addChildren([home]), history: createMemoryHistory({ initialEntries: ["/"] }) }); };
const probeRouter = () => routerOf();
export const probes = {
  RouterProvider: { props: () => ({ router: probeRouter() }), around: (children, s) => s.createComponent(RouterProvider, { router: routerOf(() => children()) }) },
  useParams: { args: () => [{ strict: false }] },
};
// the providers a hook with arguments needs (useParams' fields are read under them): a router whose root route renders them
export const provide = (children, s) => s.createComponent(RouterProvider, { router: routerOf(() => children()) });
