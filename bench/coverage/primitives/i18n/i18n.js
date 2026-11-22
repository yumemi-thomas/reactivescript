import { flatten, translator, resolveTemplate } from "@solid-primitives/i18n";
const dictionaries = { en: flatten({ hello: "hello {{ name }}" }), fr: flatten({ hello: "bonjour {{ name }}" }) };
export const createI18n = locale => ({ t: translator(() => dictionaries[locale()], resolveTemplate) });
