// TanStack's type-safe routing: the router registers its type, so every <Link to>, params and useParams({ from }) in the
// app is checked against the route tree (rx-tsc, and the production build, TY-1d).
import type { router } from "./main.rx";
declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router;
  }
}
