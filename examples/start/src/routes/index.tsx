import { createFileRoute } from "@tanstack/solid-router";
import { components } from "@reactivescript/runtime";
import pages from "../pages.rx?rx-lib";

const { Counter } = components(pages);

export const Route = createFileRoute("/")({ component: Home });
function Home() {
  return <><h1>People</h1><Counter label="clicks" /></>;
}
