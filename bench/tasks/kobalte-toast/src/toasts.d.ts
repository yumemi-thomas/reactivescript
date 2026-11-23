import type { Component } from "solid-js";
export { Toast } from "@kobalte/core/toast";
/** Shows a toast: the component is rendered by `<Toast.List>`, with the id the toaster gave it. */
export declare function show(toast: Component<{ toastId: number }>): number;
