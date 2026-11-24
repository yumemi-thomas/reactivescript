// rx-verify's probe for host.d.rx: the host's view, run, with the routes as the generated tree nests them (as
// bench/tasks/router-provider's): a route that has children is its component around the library's outlet (routes/__root.tsx).
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider, useRouter } from "@tanstack/solid-router";
let router;
export const scene = (rx, h, routes) => {
  const shown = node => node.children.length ? () => h.s.createComponent(node.component, { get children() { return h.s.createComponent(Outlet, {}); } }) : node.component;
  const make = (node, parent) => {
    const route = parent ? createRoute({ getParentRoute: () => parent, path: node.path, component: shown(node) }) : createRootRoute({ component: shown(node) });
    if (node.children.length) route.addChildren(node.children.map(child => make(child, route)));
    return route;
  };
  router = createRouter({ routeTree: make(routes[0]), history: createMemoryHistory({ initialEntries: ["/"] }) });
  return () => h.s.createComponent(RouterProvider, { router });
};
export const act = (rx, h, route) => router.navigate({ to: route.path.replace(/\$\w+/g, "1") });
export const uses = { router: useRouter };
