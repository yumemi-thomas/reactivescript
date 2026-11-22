import { createProvider, provide, inject, withProvider } from "solid-use/provider";
const Theme = createProvider("light");
export const ThemeScope = withProvider(props => { provide(Theme, props.value); return props.children; });
export const useTheme = () => inject(Theme);
