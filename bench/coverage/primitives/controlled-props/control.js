import { createEffect } from "solid-js";
import { createControlledProp } from "@solid-primitives/controlled-props";
export function TextControl(props) {
  const [value, , Field] = createControlledProp(props.name, props.initial);
  createEffect(value, v => { props.onChange?.(v); });
  return Field({});
}
