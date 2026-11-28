// hold probes by name (PICK)
import holds from "./holds.mjs";
const re = new RegExp(process.env.PICK);
export default holds.filter(t => re.test(t.name));
