export { type AuthOutput, ModelOptions } from "./types";
export { VendorBase } from "./base";

import type { VendorBase } from "./base";
import { Pochi } from "./pochi";

const vendors: Record<string, VendorBase> = {
  pochi: new Pochi(),
};

export function registerVendor(vendor: VendorBase) {
  vendors[vendor.vendorId] = vendor;
}

export function getVendor(vendorId: string): VendorBase {
  const vendor = vendors[vendorId];
  if (!vendor) {
    throw new Error(`Vendor ${vendorId} not found`);
  }
  return vendor;
}

export function getVendors() {
  return vendors;
}
