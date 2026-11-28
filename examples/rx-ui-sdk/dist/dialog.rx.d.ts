import type { View } from "./rx-prelude.js";
import { DialogProps, DialogTriggerProps, DialogTriggerState, DialogBackdropProps, DialogContentProps, DialogTitleProps, DialogDescriptionProps, DialogCloseProps, DialogShortcutProps } from "./bridge.js";
type TriggerShown = {
    attrs: any;
    state: DialogTriggerState;
};
export declare function Dialog(props: DialogProps): import("@solidjs/web").JSX.Element;
export declare function DialogTrigger(props: Omit<DialogTriggerProps, "children" | "render"> & {
    children?: View | ((s: DialogTriggerState) => View);
    element?: (e: TriggerShown) => View;
}): import("@solidjs/web").JSX.Element;
export declare function DialogBackdrop(props: DialogBackdropProps): import("@solidjs/web").JSX.Element;
export declare function DialogContent(props: DialogContentProps): import("@solidjs/web").JSX.Element;
export declare function DialogTitle(props: DialogTitleProps): import("@solidjs/web").JSX.Element;
export declare function DialogDescription(props: DialogDescriptionProps): import("@solidjs/web").JSX.Element;
export declare function DialogClose(props: DialogCloseProps): import("@solidjs/web").JSX.Element;
export declare function DialogShortcut(props: DialogShortcutProps): import("@solidjs/web").JSX.Element;
export {};
