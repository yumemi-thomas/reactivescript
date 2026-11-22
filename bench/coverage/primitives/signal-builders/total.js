import { add } from "@solid-primitives/signal-builders";
export const createTotal = (price, tax) => add(price, tax);
