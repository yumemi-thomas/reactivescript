// TanStack's type-safe routing: the router registers its type, so every <Link to> and useParams({ from }) is checked.
import type { router } from "./main.rx";
declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router;
  }
}
