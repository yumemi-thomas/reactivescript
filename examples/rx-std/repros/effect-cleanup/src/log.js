export const log = [];
export const on = () => { log.push("on"); return () => { log.push("off"); }; };
