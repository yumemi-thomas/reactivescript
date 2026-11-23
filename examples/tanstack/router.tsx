// The app's router: the route tree TanStack's generator wrote from routes/, registered so that every link and hook of
// the app is typed by it, and the component that renders it.
import { createRouter, RouterProvider } from "@tanstack/solid-router";
import { routeTree } from "./routeTree.gen";

export const router = createRouter({ routeTree });
declare module "@tanstack/solid-router" {
  interface Register { router: typeof router }
}
export function AppRouter() {
  return <RouterProvider router={router} />;
}
