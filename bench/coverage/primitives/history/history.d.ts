export declare function createUndoHistory<T>(value: () => T, restore: (value: T) => void): { canUndo: () => boolean; canRedo: () => boolean; undo: () => void; redo: () => void };
