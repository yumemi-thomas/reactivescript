// For rx-tsc and editors (TY-1c): TypeScript reads this beside router.js, so defineRoute's own inference types each
// route's component from its path (MO-11h). The .d.rx beside it is what the checker reads.
export { createRouter, defineRoute, useParams, useNavigate, useSubmissions } from "@solidjs/router";
