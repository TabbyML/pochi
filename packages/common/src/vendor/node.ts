import type { VendorBase } from "./base";
import { createRegistry } from "./registry";

export { type AuthOutput, ModelOptions } from "./types";
export { VendorBase } from "./base";

const { register, get, getAll } = createRegistry<VendorBase>();

export function registerVendor(vendor: VendorBase) {
  register(vendor.vendorId, vendor);
}

export const getVendor = get;
export const getVendors = getAll;
