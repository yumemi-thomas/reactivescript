import { isServer } from "@solidjs/web";
import * as core from "@rx-primitives/history/core";
// on the server an action does not run (SV-2); the original's answer there does nothing
export const createUndoHistory = isServer ? () => ({ canUndo: () => false, canRedo: () => false, undo() {}, redo() {} }) : core.createUndoHistory;
