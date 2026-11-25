// The original's types (@solid-primitives/a11y's form-control, MIT).
/* @ts-self-types="./form-control.d.ts" */
import { CreateFormControlInputProps, CreateFormControlProps, FormControlContextValue } from "./types.js";
import { Context } from "solid-js";
/**
 * Solid context that carries the `FormControlContextValue` produced by `createFormControl`.
 * Provide it with `<FormControlContext value={ctx}>` and consume it with `useFormControl()`.
 */
export declare const FormControlContext: Context<FormControlContextValue | undefined>;
/**
 * Reads `FormControlContext` from the nearest ancestor `<FormControlContext>` provider.
 * Throws a descriptive error if called outside a provider — use this in sub-components
 * (`TextFieldLabel`, `TextFieldInput`, etc.) that must always be rendered inside a root.
 */
export declare function useFormControl(): FormControlContextValue;
/**
 * Creates the ARIA accessibility context for a labeled form field group.
 *
 * Tracks which sub-elements (label, field, description, error message) are currently mounted,
 * and computes the correct `aria-labelledby` / `aria-describedby` chains. Pass the returned
 * value to `<FormControlContext>` so descendant components can register themselves.
 *
 * @param props - Field metadata: `id`, `name`, `validationState`, `required`, `disabled`, `readOnly`.
 *   All props accept static values or reactive accessors.
 * @returns `FormControlContextValue` — spread onto `<FormControlContext value={ctx}>`.
 *
 * @example
 * ```tsx
 * // Minimal usage — plain DOM, no sub-components
 * const ctx = createFormControl({ id: "email", validationState: () => error ? "invalid" : undefined });
 * onCleanup(ctx.registerLabel("email-label"));
 *
 * return (
 *   <FormControlContext value={ctx}>
 *     <label id="email-label">Email</label>
 *     <input
 *       aria-labelledby={ctx.getAriaLabelledBy("email-input", undefined, undefined)}
 *       aria-describedby={ctx.getAriaDescribedBy(undefined)}
 *     />
 *   </FormControlContext>
 * );
 * ```
 *
 * @example
 * ```tsx
 * // Kobalte-style sub-component pattern
 * const TextFieldRoot = (props) => {
 *   const ctx = createFormControl(props);
 *   return <FormControlContext value={ctx}>{props.children}</FormControlContext>;
 * };
 * ```
 *
 * @see https://github.com/solidjs-community/solid-primitives/tree/main/packages/a11y
 */
export declare function createFormControl(props: CreateFormControlProps): FormControlContextValue;
/**
 * Reads the nearest `FormControlContext` and returns pre-computed ARIA props for the actual
 * input element. Must be called inside a component that is rendered within a
 * `<FormControlContext>` provider (i.e. inside a `TextFieldRoot` or equivalent).
 *
 * Registers the input's ID with `context.registerField` so the context always knows which
 * element is the interactive control — used to build the correct `aria-labelledby` chain when
 * both a visible label and an `aria-label` prop are present.
 *
 * @param props - Optional overrides: explicit `id`, `aria-label`, `aria-labelledby`,
 *   `aria-describedby`. Merged with context-registered IDs; all accept reactive accessors.
 * @returns `{ fieldProps }` — an object whose properties are reactive accessors ready to
 *   spread onto an `<input>` (or any focusable element).
 *
 * @example
 * ```tsx
 * const TextFieldInput = (props) => {
 *   const { fieldProps } = createFormControlInput();
 *   const ctx = useFormControl();
 *   return (
 *     <input
 *       id={fieldProps.id()}
 *       aria-labelledby={fieldProps.ariaLabelledBy()}
 *       aria-describedby={fieldProps.ariaDescribedBy()}
 *       aria-invalid={ctx.validationState() === "invalid" ? "true" : undefined}
 *     />
 *   );
 * };
 * ```
 */
export declare function createFormControlInput(props?: CreateFormControlInputProps): {
  fieldProps: {
    id: () => string;
    ariaLabel: () => string | undefined;
    ariaLabelledBy: () => string | undefined;
    ariaDescribedBy: () => string | undefined;
  };
};