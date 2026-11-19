import { createFileRoute } from "@tanstack/solid-router";
import { Counter, PersonCard } from "../pages.rx?rx-lib";   // typed by pages.rx (rx-tsc)

export const Route = createFileRoute("/people/$id")({ component: PersonPage });
function PersonPage() {
  const params = Route.useParams();
  return <><PersonCard id={params().id} /><Counter label="clicks" /></>;
}
