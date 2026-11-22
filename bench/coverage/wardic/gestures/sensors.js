import { createHover } from "@wardic/solid";
export const createHoverSensor = () => { const hover = createHover(); return { ref: element => hover(element), hovered: () => hover() }; };
