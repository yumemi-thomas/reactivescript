// A router whose root route's component renders what it is given, loaded before anything is mounted.
import { createMemoryHistory, createRootRoute, createRouter } from "@tanstack/solid-router";
let kids = () => null;
const history = () => createMemoryHistory({ initialEntries: ["/"] });
const router = createRouter({ routeTree: createRootRoute({ component: () => kids() }), history: history() });
await router.load();
const inside = Provider => (children, s) => { kids = children; return s.createComponent(Provider, { router }); };
export const providers = { router: (children, s, lib) => inside(lib.RouterProvider)(children, s) };
const from = () => [{ from: "__root__" }];
export const probes = {
  RouterProvider: { around: providers.router },
  useParams: { args: from }, useLoaderData: { args: from }, useSearch: { args: from },
  Link: { props: () => ({ to: "/", children: "home" }) },
};
export const scene = async (lib, h) => {
  const around = name => h.component(name, p => p.children);
  const root = lib.createRootRoute({ component: h.component("Root", () => h.s.createComponent(lib.Outlet, {})) });
  const home = lib.createRoute({ getParentRoute: () => root, path: "/", component: h.component("Home") });
  const made = createRouter({ routeTree: root.addChildren([home]), history: history() });
  await made.load();
  return () => h.s.createComponent(lib.RouterProvider, { router: made, Wrap: around("Wrap"), InnerWrap: around("InnerWrap") });
};
