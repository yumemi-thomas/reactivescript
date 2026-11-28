import type { Component, JSX } from "solid-js";
export { Link, useParams, useNavigate } from "@tanstack/solid-router";
/** A route as a record: a layout's pages are its `children`, and it renders them as `props.children`. */
export type RouteRecord = { path?: string; component: Component<{ children?: JSX.Element }>; children?: RouteRecord[] };
export declare function createAppRouter(tree: RouteRecord): Component;
