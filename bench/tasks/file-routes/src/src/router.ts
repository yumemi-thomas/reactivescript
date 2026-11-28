/// <reference path="./file-routes.d.ts" />
// The app's router: the route files, as filesystem-routing's manifest lists them, given to @solidjs/router.
import { pageRoutes } from "virtual:file-routes";
import { createRouter } from "@solidjs/router";
import { fileRoutes } from "@solidjs/router/fs";
export const Router = createRouter({ routes: fileRoutes(pageRoutes) });
export const { paths } = Router;
