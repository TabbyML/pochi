import z from "zod/v4";

export const UserInfo = z.object({
  name: z.string(),
  email: z.string(),
  image: z.string().optional(),
});

export type UserInfo = z.infer<typeof UserInfo>;

export const VendorConfig = z.object({
  credentials: z.unknown(),
  user: UserInfo.optional(),
});

export type VendorConfig = z.infer<typeof VendorConfig>;

export const PochiVendorConfig = VendorConfig.extend({
  credentials: z.object({
    token: z.string(),
  }),
});

export type PochiVendorConfig = z.infer<typeof PochiVendorConfig>;

export const GeminiCliVendorConfig = VendorConfig.extend({
  credentials: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresAt: z.number(),
    project: z.string(),
  }),
});

export type GeminiCliVendorConfig = z.infer<typeof GeminiCliVendorConfig>;
