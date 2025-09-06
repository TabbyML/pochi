export { type AuthOutput, ModelOptions } from "./types";
export { VendorBase } from "./base";

import type { VendorBase } from "./base";

const vendors: Record<string, VendorBase> = {};

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
