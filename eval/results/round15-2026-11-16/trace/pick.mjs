// one or more hidden tests by name (PICK="substring|substring"), for tracing
import hidden from "../../../tasks/board/hidden.mjs";
import overlap from "../../../tasks/board/hidden-overlap.mjs";
const re = new RegExp(process.env.PICK);
export default [...hidden, ...overlap].filter(t => re.test(t.name));
