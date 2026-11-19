/// <reference types="vite/client" />
import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/solid-router";
import type { JSX } from "@solidjs/web";

export const Route = createRootRoute({ shellComponent: RootDocument, component: RootLayout });

function RootDocument(props: { children: JSX.Element }) {
  return (
    <html>
      <head><meta charset="utf-8" /><HeadContent /></head>
      <body>{props.children}<Scripts /></body>
    </html>
  );
}
function RootLayout() {
  return (
    <div id="app">
      <nav>
        <Link to="/">Home</Link> <Link to="/people/$id" params={{ id: "1" }}>Ann</Link> <Link to="/people/$id" params={{ id: "2" }}>Bo</Link> <Link to="/people/$id" params={{ id: "9" }}>Nobody</Link>
      </nav>
      <main><Outlet /></main>
    </div>
  );
}
