import { generateHydrationScript, renderToStream, renderToString } from "@solidjs/web";
import { cases } from "./cases";
export { generateHydrationScript };
export const string = (name: string) => { const C = cases[name]; return renderToString(() => <C />); };
export const stream = (name: string, sink: any) => { const C = cases[name]; renderToStream(() => <C />).pipe(sink); };
