import { createFileRoute } from "@tanstack/solid-router";
import { Counter } from "../pages.rx?rx-lib";

export const Route = createFileRoute("/")({ component: Home });
function Home() {
  return <><h1>People</h1><Counter label="clicks" /></>;
}
