/// <reference types="vite/client" />
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/solid-router";
import type { JSX } from "@solidjs/web";
import { Layout } from "../pages.rx?rx-lib";

export const Route = createRootRoute({ shellComponent: RootDocument, component: () => <div id="app"><Layout><Outlet /></Layout></div> });

function RootDocument(props: { children: JSX.Element }) {
  return (
    <html>
      <head><meta charset="utf-8" /><HeadContent /></head>
      <body>{props.children}<Scripts /></body>
    </html>
  );
}
