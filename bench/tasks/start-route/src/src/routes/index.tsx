import { createFileRoute } from "@tanstack/solid-router";
import { Home } from "../pages.rx?rx-lib";

export const Route = createFileRoute("/")({ component: Home });
