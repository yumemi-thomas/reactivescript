import { Outlet, createRootRoute } from "@tanstack/solid-router";
import { Root } from "../pages.rx?rx-lib";

export const Route = createRootRoute({ component: () => <Root><Outlet /></Root> });
