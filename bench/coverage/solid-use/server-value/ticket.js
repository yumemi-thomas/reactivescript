import useServerValue from "solid-use/server-value";
export const useTicket = () => useServerValue(() => Math.random().toString(36).slice(2, 8));
