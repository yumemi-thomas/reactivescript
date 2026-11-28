import { createFileRoute } from "@tanstack/solid-router";
import { Person } from "../pages.rx?rx-lib";   // typed by pages.rx (rx-tsc)

export const Route = createFileRoute("/people/$id")({
  validateSearch: (search: Record<string, unknown>): { tab?: "role" | "name" } => (search.tab === "role" ? { tab: "role" } : {}),
  component: () => <Person tab={Route.useSearch()().tab ?? "name"} />,
});
