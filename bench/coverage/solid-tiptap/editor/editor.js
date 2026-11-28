import { createSignal } from "solid-js";
import { createTiptapEditor, useEditorHTML } from "solid-tiptap";
import { Node } from "@tiptap/core";
const Doc = Node.create({ name: "doc", topNode: true, content: "block+" });
const Text = Node.create({ name: "text", group: "inline" });
const Paragraph = Node.create({ name: "paragraph", group: "block", content: "inline*", parseHTML: () => [{ tag: "p" }], renderHTML: () => ["p", 0] });
/** An editor over the element it is given, and its document as HTML. */
export function editor(content) {
  const [element, mount] = createSignal(undefined, { ownedWrite: true });
  const made = createTiptapEditor(() => ({ element: element(), extensions: [Doc, Text, Paragraph], content }));
  const html = useEditorHTML(made);
  return { mount: el => { mount(el); }, html: () => html() ?? "" };
}
