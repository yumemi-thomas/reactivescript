// desk9 hidden tests by name (PICK), for tracing
import hidden from "../../../tasks/desk9/hidden.mjs";
import overlap from "../../../tasks/desk9/hidden-overlap.mjs";
const re = new RegExp(process.env.PICK);
export default [...hidden, ...overlap].filter(t => re.test(t.name));
