import { createMemo } from "solid-js";
import { createGeolocation } from "@solid-primitives/geolocation";
export const createPosition = () => { const [location] = createGeolocation(); return createMemo(() => location()); };
