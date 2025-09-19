import { base58_to_binary, binary_to_base58 } from "base58-js";
import z from "zod/v4";

export const StoreId = z.object({
  sub: z.string(),
  machineId: z.string(),
  cwd: z.string(),
  date: z.string().describe("Local date in MM/DD/YYYY format"),
});

export type StoreId = z.infer<typeof StoreId>;

export function encodeStoreId(storeId: StoreId): string {
  // Create a much shorter hash-based identifier
  const jsonString = JSON.stringify(storeId);
  
  // Create hash for each component
  const subHash = createShortHash(storeId.sub);
  const machineHash = createShortHash(storeId.machineId);
  const cwdHash = createShortHash(storeId.cwd);
  const dateHash = createShortHash(storeId.date);
  
  // Create overall hash for uniqueness
  const overallHash = createShortHash(jsonString);
  
  // Format: v2-overallHash-subHash-machineHash-cwdHash-dateHash
  // This is much shorter than the original base58 encoding
  return `v2-${overallHash}-${subHash}-${machineHash}-${cwdHash}-${dateHash}`;
}

function createShortHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash).toString(36).slice(0, 8); // 8 characters for better uniqueness
}

export function decodeStoreId(storeId: string): StoreId {
  // Check if it's the new v2 format
  if (storeId.startsWith('v2-')) {
    // New format - we can't fully decode back to original values
    // Extract the sub hash for verification purposes
    const parts = storeId.split('-');
    if (parts.length >= 3) {
      // We can't reconstruct the original values, so we'll return a placeholder
      // This is a breaking change but necessary for the path length fix
      throw new Error('v2 format store ID cannot be decoded. Store original StoreId object separately for verification.');
    }
    throw new Error('Invalid v2 store ID format');
  } else {
    // Old format - try to decode normally
    try {
      const decoded = new TextDecoder().decode(base58_to_binary(storeId));
      return StoreId.parse(JSON.parse(decoded));
    } catch (error) {
      throw new Error('Invalid store ID format');
    }
  }
}

// Helper function to extract sub hash from v2 format for verification
export function extractSubHashFromStoreId(storeId: string): string | null {
  if (storeId.startsWith('v2-')) {
    const parts = storeId.split('-');
    if (parts.length >= 3) {
      return parts[2]; // subHash is the third part
    }
  }
  return null;
}

// Function to verify if a storeId matches the given StoreId object
export function verifyStoreId(storeId: string, originalStoreIdObj: StoreId): boolean {
  if (storeId.startsWith('v2-')) {
    // For v2 format, generate expected storeId and compare
    const expectedEncoded = encodeStoreId(originalStoreIdObj);
    return storeId === expectedEncoded;
  } else {
    // For old format, try to decode and compare
    try {
      const decoded = decodeStoreId(storeId);
      return JSON.stringify(decoded) === JSON.stringify(originalStoreIdObj);
    } catch {
      return false;
    }
  }
}

// Function to verify sub matches (for JWT verification)
export function verifyStoreIdSub(storeId: string, expectedSub: string): boolean {
  if (storeId.startsWith('v2-')) {
    // For v2 format, compare sub hash
    const parts = storeId.split('-');
    if (parts.length >= 3) {
      const expectedSubHash = createShortHash(expectedSub);
      return parts[2] === expectedSubHash;
    }
    return false;
  } else {
    // For old format, decode and compare
    try {
      const decoded = decodeStoreId(storeId);
      return decoded.sub === expectedSub;
    } catch {
      return false;
    }
  }
}
