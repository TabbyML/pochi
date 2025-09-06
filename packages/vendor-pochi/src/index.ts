import { registerVendor } from "@getpochi/common/vendor";
import { Pochi } from "./vendor";

export { createPochiModel } from "./model";

registerVendor(new Pochi());
