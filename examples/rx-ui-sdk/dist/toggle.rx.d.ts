import type { View } from "./rx-prelude.js";
import { ToggleProps, ToggleState, ToggleGroupProps, ToggleIconProps } from "./bridge.js";
type Shown = {
    attrs: any;
    state: ToggleState;
};
export declare function Toggle(props: Omit<ToggleProps, "children" | "render"> & {
    children?: View | ((s: ToggleState) => View);
    element?: (e: Shown) => View;
}): import("@solidjs/web").JSX.Element;
export declare function ToggleIcon(props: ToggleIconProps): import("@solidjs/web").JSX.Element;
export declare function ToggleGroup(props: ToggleGroupProps): import("@solidjs/web").JSX.Element;
export {};
