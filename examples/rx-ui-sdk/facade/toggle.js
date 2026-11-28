// What a .tsx app imports: the parts, with core's controllers beside them, as @ui-sdk/solid/toggle has them.
import { Toggle as T } from "@rx-ui-sdk/solid/toggle"; import { withRender } from "./render.js";
export const Toggle = withRender(T);
export { ToggleGroup, ToggleIcon } from "@rx-ui-sdk/solid/toggle";
export { createToggleController, createToggleGroupController } from "@ui-sdk/core/toggle";
