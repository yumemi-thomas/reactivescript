import { createFileRoute } from "@tanstack/solid-router";
import { Counter, PersonCard } from "../pages.rx?rx-lib";   // typed by pages.rx (rx-tsc)

export const Route = createFileRoute("/people/$id")({
  validateSearch: (search: Record<string, unknown>): { tab?: "role" | "name" } => (search.tab === "role" ? { tab: "role" } : {}),
  component: PersonPage,
});
function PersonPage() {
  const params = Route.useParams();
  const search = Route.useSearch();
  return <><PersonCard id={params().id} tab={search().tab ?? "name"} /><Counter label="clicks" /></>;
}
