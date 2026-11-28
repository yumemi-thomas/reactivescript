import { createEffect } from "solid-js";
import { createTokenizer, createToken, resolveTokens } from "@solid-primitives/jsx-tokenizer";
const tokenizer = createTokenizer({ name: "tab" });
export const Tab = createToken(tokenizer, props => ({ title: props.title }));
export function Tabs(props) {
  const tokens = resolveTokens(tokenizer, () => props.children);
  const p = document.createElement("p");
  createEffect(() => tokens().map(t => t.data.title), titles => { p.textContent = `tabs: ${titles.join(", ")}`; });
  return p;
}
