// What only the browser knows (here: whether there is a window; in an app: the locale, the time zone, the viewport).
export const whereAmI = async () => (typeof window === "undefined" ? "the server" : "the browser");
export const whereNow = () => (typeof window === "undefined" ? "the server" : "the browser");
