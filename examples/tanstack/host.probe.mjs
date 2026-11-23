// rx-verify's probe for host.d.rx (`rx-verify --dom host.d.rx`): the host's view, run. The scene is what the app does —
// its component around the router's, a root route whose component renders the outlet, a route a page — with a recording
// component in place of each `.rx` one, and `rx.AppRouter` and `rx.Outlet` applied where the app's components apply the
// real ones (`through`); `act` goes to the other page.
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/solid-router";
import { createComponent } from "solid-js";
let router;
export const scene = (rx, h) => {
  const root = createRootRoute({ component: () => h.s.createComponent(rx.Root, { get children() { return h.s.createComponent(rx.Outlet, {}); } }) });
  const home = createRoute({ getParentRoute: () => root, path: "/", component: rx.Home });
  const person = createRoute({ getParentRoute: () => root, path: "/people/$id", component: rx.Person });
  router = createRouter({ routeTree: root.addChildren([home, person]), history: createMemoryHistory({ initialEntries: ["/"] }) });
  return () => h.s.createComponent(rx.App, { get children() { return h.s.createComponent(rx.AppRouter, {}); } });
};
export const act = () => router.navigate({ to: "/people/$id", params: { id: "1" } });
export const through = { Outlet, AppRouter: () => createComponent(RouterProvider, { router }) };
