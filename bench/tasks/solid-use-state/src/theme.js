import { createProvider, provide, inject, withProvider } from "solid-use/provider";
const Theme = createProvider(() => "light");
// the scope provides an accessor, so what it provides follows the prop
export const ThemeScope = withProvider(props => { provide(Theme, () => props.value); return props.children; });
export const useTheme = () => inject(Theme);
