import z from "zod/v4";

export const UserInfo = z.object({
  name: z.string(),
  email: z.string().optional(),
  image: z.string().optional(),
});

export type UserInfo = z.infer<typeof UserInfo>;

export const VendorConfig = z.object({
  credentials: z.unknown(),
  user: UserInfo.optional(),
});

export type VendorConfig = z.infer<typeof VendorConfig>;
