const at = storage => (storage === undefined ? globalThis.localStorage : storage);
export const read = (storage, key) => Promise.resolve(at(storage)?.getItem(key) ?? null);
export const write = (storage, key, t) => { if (t === null) at(storage)?.removeItem(key); else at(storage)?.setItem(key, t); };
