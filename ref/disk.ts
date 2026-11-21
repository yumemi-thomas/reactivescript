// What the command lines read from disk: a module's source, or undefined when there is none there — a path that does not
// exist, or one that is not a file (a folder named `x.rx` is not the module `x.rx`: MODULE_NOT_FOUND, as the crate's
// `read_disk` answers, not a read error).
import { readFileSync, statSync } from "node:fs";

export const isFile = (p: string): boolean => { try { return statSync(p).isFile(); } catch { return false; } };
export const readDisk = (p: string): string | undefined => isFile(p) ? readFileSync(p, "utf8") : undefined;
