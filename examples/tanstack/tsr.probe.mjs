// rx-verify's probe for tsr.d.rx (`rx-verify --dom tsr.d.rx`): a scene whose root route renders <Outlet />, with a child route at "/"
// under it, so the placement rows (renders(later), nests(component under getParentRoute), outlet) are checked by running
import { createMemoryHistory } from "@tanstack/solid-router";
export const scene = (lib, h) => {
  const Root = h.component("Root", () => h.s.createComponent(lib.Outlet, {}));
  const Home = h.component("Home");
  const root = lib.createRootRoute({ component: Root });
  const home = lib.createRoute({ getParentRoute: () => root, path: "/", component: Home });
  const router = lib.createRouter({ routeTree: root.addChildren([home]), history: createMemoryHistory({ initialEntries: ["/"] }) });
  return () => h.s.createComponent(lib.RouterProvider, { router });
};
