// rx-verify's probe for host.d.rx (`rx-verify --dom src/host.d.rx`): the host's view, run. The scene is what the route
// files do (src/routes) — a root route whose component is given the outlet as its children, a route a page — with a
// recording component in place of each `.rx` one; `act` goes to the other page.
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider, useParams } from "@tanstack/solid-router";
let router;
export const scene = (rx, h) => {
  const root = createRootRoute({ component: () => h.s.createComponent(rx.Root, { get children() { return h.s.createComponent(Outlet, {}); } }) });
  const home = createRoute({ getParentRoute: () => root, path: "/", component: rx.Home });
  const person = createRoute({ getParentRoute: () => root, path: "/people/$id", component: rx.Person });
  router = createRouter({ routeTree: root.addChildren([home, person]), history: createMemoryHistory({ initialEntries: ["/"] }) });
  return () => h.s.createComponent(RouterProvider, { router });
};
export const act = () => router.navigate({ to: "/people/$id", params: { id: "1" } });
// a hook that reads the router's context: it warns where there is no router
export const uses = { router: () => useParams({ strict: false }) };
