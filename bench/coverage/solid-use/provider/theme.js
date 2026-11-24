import { createProvider, provide, inject, withProvider } from "solid-use/provider";
const Theme = createProvider(undefined);
export const ThemeScope = withProvider(props => { provide(Theme, () => props.value); return props.children; });
// (no default: solid-use's `inject` answers one in silence)
export const useTheme = () => { const theme = inject(Theme); if (theme === undefined) throw new Error("useTheme is called with no ThemeScope above it"); return theme; };
