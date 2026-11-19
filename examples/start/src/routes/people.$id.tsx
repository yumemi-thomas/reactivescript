import { createFileRoute } from "@tanstack/solid-router";
import { components } from "@reactivescript/runtime";
import pages from "../pages.rx?rx-lib";

const { PersonCard, Counter } = components(pages);

export const Route = createFileRoute("/people/$id")({ component: PersonPage });
function PersonPage() {
  const params = Route.useParams();
  return <><PersonCard id={params().id} /><Counter label="clicks" /></>;
}
