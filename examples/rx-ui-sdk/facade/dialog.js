import { DialogTrigger as T } from "@rx-ui-sdk/solid/dialog"; import { withRender } from "./render.js";
export const DialogTrigger = withRender(T);
export { Dialog, DialogBackdrop, DialogContent, DialogTitle, DialogDescription, DialogClose, DialogShortcut } from "@rx-ui-sdk/solid/dialog";
export { createDialogController } from "@ui-sdk/core/dialog";
