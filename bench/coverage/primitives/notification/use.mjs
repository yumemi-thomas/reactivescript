import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/notification", title: "the notification permission; asking is a function of the result", ssr: /notifications: unknown/, dom: /notifications: (prompt|default|granted|denied)/ });
