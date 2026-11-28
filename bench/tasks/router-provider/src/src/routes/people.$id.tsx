import { createFileRoute } from "@tanstack/solid-router";
import { Person } from "../pages.rx?rx-lib";

export const Route = createFileRoute("/people/$id")({ component: Person });
