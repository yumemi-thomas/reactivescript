// CodeMirror and Tiptap, as they are: an editor made in an element, and what ends it.
import { Compartment, EditorState, Annotation } from "@codemirror/state"; import { EditorView } from "@codemirror/view"; import { Editor } from "@tiptap/core";
const External = Annotation.define();
export function openCode(parent, { value, extensions, readOnly }, said) {
  const extra = new Compartment(), ro = new Compartment();
  const view = new EditorView({ parent, state: EditorState.create({ doc: value, extensions: [extra.of(extensions), ro.of(EditorState.readOnly.of(readOnly)), EditorView.focusChangeEffect.of(() => null), EditorView.updateListener.of((u) => { if (u.focusChanged) said({ focused: u.view.hasFocus }); if (u.docChanged && !u.transactions.some((t) => t.annotation(External))) said({ value: u.state.doc.toString() }); })] }) });
  return { setValue(v) { const now = view.state.doc.toString(); if (v !== now) view.dispatch({ changes: { from: 0, to: now.length, insert: v }, annotations: External.of(true) }); }, setExtensions(e) { view.dispatch({ effects: extra.reconfigure(e) }); }, setReadOnly(v) { view.dispatch({ effects: ro.reconfigure(EditorState.readOnly.of(v)) }); }, close() { view.destroy(); }, view };
}
export function openRich(element, options, changed) {
  const e = new Editor({ ...options, element }); const tell = () => changed({ html: e.getHTML(), empty: e.isEmpty, editable: e.isEditable, focused: e.isFocused });
  e.on("transaction", tell); e.on("focus", tell); e.on("blur", tell); tell();
  return { editor: e, isActive: (name, attrs) => e.isActive(name, attrs), setEditable: (v) => e.setEditable(v), setContent: (h) => { if (h !== e.getHTML()) e.commands.setContent(h, { emitUpdate: false }); }, run: (f) => f(e), close: () => e.destroy() };
}
