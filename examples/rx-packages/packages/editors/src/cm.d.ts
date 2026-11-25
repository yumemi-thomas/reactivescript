import type { EditorView } from "@codemirror/view"; import type { Editor, EditorOptions } from "@tiptap/core"; import type { Extension } from "@codemirror/state";
export type Code = { setValue(v: string): void; setExtensions(e: Extension[]): void; setReadOnly(v: boolean): void; close(): void; view: EditorView };
export type Said = { html: string; empty: boolean; editable: boolean; focused: boolean };
export type Rich = { editor: Editor; isActive(name: string, attrs?: object): boolean; setEditable(v: boolean): void; setContent(html: string): void; run(f: (e: Editor) => void): void; close(): void };
export declare function openCode(parent: any, options: { value: string; extensions: Extension[]; readOnly: boolean }, said: (s: { value?: string; focused?: boolean }) => void): Code;
export declare function openRich(element: any, options: Partial<EditorOptions>, changed: (s: Said) => void): Rich;
