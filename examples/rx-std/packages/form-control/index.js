import { createContext, useContext } from "solid-js";
import { useField } from "@rx-primitives/form-control/core";
import { access } from "./src/aria.js";

// a context .rx declares is not a value of its module for JavaScript (MO-13f): the original's API exports it, so it is made here
export const FormControlContext = createContext(undefined);
export function useFormControl() {
  const c = useContext(FormControlContext);
  if (c === undefined) throw new Error("[solid-primitives]: `useFormControl` must be used within a `<FormControlContext>` component");
  return c;
}
export { createFormControl } from "@rx-primitives/form-control/core";
export function createFormControlInput(props = {}) {
  const context = useFormControl();
  const id = () => access(props.id) ?? context.generateId("field");
  useField(id, id => context.registerField(id));
  return { fieldProps: {
    id, ariaLabel: () => access(props["aria-label"]),
    ariaLabelledBy: () => context.getAriaLabelledBy(id(), access(props["aria-label"]), access(props["aria-labelledby"])),
    ariaDescribedBy: () => context.getAriaDescribedBy(access(props["aria-describedby"])),
  } };
}
