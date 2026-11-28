// What the app reports to: a plain JS sink that keeps what it is given, to be read later (as a logger or an undo stack does).
export const kept = [];
export const record = (label, value) => { kept.push({ label, value }); };
export const first = () => kept.length ? JSON.stringify(kept[0].value) : "nothing";
