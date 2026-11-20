// rx-verify's probe for formisch.d.rx: the arguments the app passes to valibot's builders, so `pure` is checked.
import { string, minLength } from "valibot";
export const probes = {
  object: { args: () => [{ email: string() }] },
  pipe: { args: () => [string(), minLength(8)] },
  minLength: { args: () => [8, "At least 8 characters"] },
};
