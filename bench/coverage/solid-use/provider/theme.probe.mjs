import { ThemeScope } from "./theme.js";
export const provide = (children, s) => s.createComponent(ThemeScope, { value: "dark", get children() { return children(); } });
