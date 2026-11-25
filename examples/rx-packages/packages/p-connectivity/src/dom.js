export const online = () => typeof navigator === "undefined" ? true : navigator.onLine;
