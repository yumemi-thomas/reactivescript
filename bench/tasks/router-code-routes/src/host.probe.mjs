// rx-verify's probe for host.d.rx (`rx-verify --dom host.d.rx`): the host's view, run. The declaration is derived from
// the router main.rx exports (`//@ routes ./main.rx`), so the scene is too: rx-verify hands it the routes as the router
// nests them (`routes`: each with its path and the recording component that stands for its `.rx` one), and the probe
// makes TanStack's route objects of them. It names no route. `rx.RouterProvider` and `rx.Outlet` are applied where the
// app's components apply the real ones (`through`); `act` is called for each page, and goes to it.
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/solid-router";
import { createComponent } from "solid-js";
let router;
export const scene = (rx, h, routes) => {
  const shown = node => node.children.length ? () => h.s.createComponent(node.component, { get children() { return h.s.createComponent(rx.Outlet, {}); } }) : node.component;
  const make = (node, parent) => {
    const route = parent ? createRoute({ getParentRoute: () => parent, path: node.path, component: shown(node) }) : createRootRoute({ component: shown(node) });
    if (node.children.length) route.addChildren(node.children.map(child => make(child, route)));
    return route;
  };
  router = createRouter({ routeTree: make(routes[0]), history: createMemoryHistory({ initialEntries: ["/"] }) });
  return () => h.s.createComponent(rx.App, { get children() { return h.s.createComponent(rx.RouterProvider, {}); } });
};
export const act = (rx, h, route) => router.navigate({ to: route.path.replace(/\$\w+/g, "1") });
// the components the host renders through: the library's outlet, and its provider, given the scene's router
export const through = { Outlet, RouterProvider: () => createComponent(RouterProvider, { router }) };
