// The original package's types (@solid-primitives/controlled-props, MIT: ../../test/original/LICENSE): the API is the same.
/* @ts-self-types="./index.d.ts" */
import { JSX } from "@solidjs/web";
import { Accessor, Component, Setter, VoidComponent } from "solid-js";
export type TestPropType = "boolean" | "number" | "range" | "string" | "object";
export type TestPropObjectOptions<T> = T[] | Record<string, T> | any;
export type TestPropOptions<T> = (T extends undefined ? {
  initialValue?: T;
} : {
  initialValue: T;
}) & {
  min?: T extends number ? number : undefined;
  max?: T extends number ? number : undefined;
  step?: T extends number ? number : undefined;
  options?: TestPropObjectOptions<T>;
  type?: TestPropType;
};
export type TestPropReturn<T> = [value: Accessor<T>, setValue: Setter<T>, field: Component];
export type TestPropProps<T> = {
  name: string;
  value: Accessor<T>;
  setValue: Setter<T>;
  min?: T extends number ? number : undefined;
  max?: T extends number ? number : undefined;
  step?: T extends number ? number : undefined;
};
export declare const BoolProp: VoidComponent<TestPropProps<boolean>>;
export declare const NumberProp: VoidComponent<TestPropProps<number>>;
export declare const RangeProp: VoidComponent<TestPropProps<number>>;
export declare const StringProp: VoidComponent<TestPropProps<string>>;
export declare const SelectProp: <T>(props: TestPropProps<T> & {
  options: TestPropObjectOptions<T>;
}) => JSX.Element;
/**
 * creates a getter, a setter and a form control for a single prop
 *
 * @param name {string} The name of the property
 * @param options initialValue or Options object
 *
 * @example ```ts
 * createControlledProp('value', 'test');
 * createControlledProp('page', { initialValue: 7, min: 1, max: 99 });
 * createControlledProp('language', {
 *   initialValue: 'en',
 *   options: ['en', 'de', 'it', 'jp', 'cn', 'xy']
 * });
 * // => { value: Accessor<string>, setValue: Setter<string>, field: Component }
 * ```
 */
export declare function createControlledProp<T extends undefined>(name: string, options?: TestPropOptions<T>): TestPropReturn<T>;
export declare function createControlledProp<T = boolean>(name: string, options: TestPropOptions<T> | T): TestPropReturn<T>;
export declare function createControlledProp<T = number>(name: string, options: TestPropOptions<T> | T): TestPropReturn<T>;
export declare function createControlledProp<T = string>(name: string, options: TestPropOptions<T> | T): TestPropReturn<T>;
export declare function createControlledProp<T = any>(name: string, options: TestPropOptions<T>): TestPropReturn<T>;
export declare function createControlledProp<T>(name: string, options: T extends undefined ? never : T extends object ? TestPropOptions<T> : TestPropOptions<T> | T): TestPropReturn<T>;
export type CreateTestProps = <Props extends {
  [name: string]: boolean | number | string | TestPropOptions<boolean | number | string | object>;
}>(props: Props) => [props: { [name in keyof Props]: Accessor<Props[name] extends object ? Props[name]["options"] extends object ? Props[name]["options"][keyof Props[name]["options"]] : Props[name]["initialValue"] : Props[name] extends boolean ? boolean : Props[name]>; } & { [name in keyof Props as `set${Capitalize<name & string>}`]: Setter<Props[name] extends object ? Props[name]["options"] extends object ? Props[name]["options"][keyof Props[name]["options"]] : Props[name]["initialValue"] : Props[name] extends boolean ? boolean : Props[name]>; }, fields: JSX.Element[]];
/**
 * creates reactive props for testing a component
 *
 * @param props {Record<string, TestPropOptions>}
 * @returns ```ts
 * [
 *   props: { [name: string]: Accessor<T>, [setName: string]: Setter<T> }
 *   fields: JSX.Element[]
 * ]
 * ```
 * You get the fields to render the prop controls and getter and setter names derived from the name in `props` based on common practice, i.e. `count` would automatically translate to
 * ```ts
 * { count: Accessor<T>, getCount: Setter<T> }
 * ```
 * @example ```ts
 * const [props, fields] = createControlledProps({
 *   value: { initialValue: '' },
 *   disabled: { initialValue: false },
 *   invalid: { initialValue: false },
 *   type: { initialValue: 'text', options: ['text', 'password', 'email'] }
 * })
 * return <>
 *   <Input {...props} />
 *   {fields}
 * </>
 * ```
 */
export declare const createControlledProps: CreateTestProps;
