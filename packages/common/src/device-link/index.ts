import { getSessionFromCtx } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { type BetterAuthPlugin, createAuthEndpoint } from "better-auth/plugins";
import { z } from "zod";

type TokenValue = {
  deviceName: string;
  userId?: string;
};

export const deviceLink = () => {
  return {
    id: "device-link",
    endpoints: {
      signInDeviceLink: createAuthEndpoint(
        "/sign-in/device-link",
        {
          method: "POST",
          body: z.object({
            deviceName: z.string().describe("Name of the device"),
          }),
          requireHeaders: true,
          metadata: {
            openapi: {
              description: "Sign in with device link",
              responses: {
                200: {
                  description: "Success",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          token: {
                            type: "string",
                          },
                          approveLink: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        async (ctx) => {
          const { deviceName } = ctx.body;
          const token = generateRandomString(32, "a-z", "A-Z");
          await ctx.context.internalAdapter.createVerificationValue({
            identifier: token,
            value: JSON.stringify({ deviceName }),
            expiresAt: new Date(Date.now() + 60 * 5 * 1000),
          });
          const baseURL = new URL(ctx.context.baseURL);
          const approveLink = `${baseURL.origin}/auth/device-link?token=${token}`;
          return ctx.json({ token, approveLink });
        },
      ),
      verifyDeviceLink: createAuthEndpoint(
        "/device-link/verify",
        {
          method: "GET",
          query: z.object({
            token: z.string().describe("Device link token"),
          }),
          requireHeaders: true,
          metadata: {
            openapi: {
              description: "Load session information from a device link token",
              responses: {
                200: {
                  description: "Success",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          session: {
                            $ref: "#/components/schemas/Session",
                          },
                          user: {
                            $ref: "#/components/schemas/User",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        async (ctx) => {
          const { token } = ctx.query;
          let tokenValue: Awaited<
            ReturnType<typeof ctx.context.internalAdapter.findVerificationValue>
          >;
          let parsedTokenValue: TokenValue;
          do {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            tokenValue =
              await ctx.context.internalAdapter.findVerificationValue(token);
            if (!tokenValue) {
              return ctx.json({ error: "INVALID_TOKEN" }, { status: 400 });
            }
            if (tokenValue.expiresAt < new Date()) {
              await ctx.context.internalAdapter.deleteVerificationValue(
                tokenValue.id,
              );
              return ctx.json({ error: "EXPIRED_TOKEN" }, { status: 400 });
            }
            parsedTokenValue = JSON.parse(tokenValue.value);
          } while (!parsedTokenValue.userId);

          // tokenValue is set, so we can safely delete it
          await ctx.context.internalAdapter.deleteVerificationValue(
            tokenValue.id,
          );
          const user = await ctx.context.internalAdapter.findUserById(
            parsedTokenValue.userId,
          );

          if (!user) {
            return ctx.json({ error: "USER_NOT_FOUND" }, { status: 400 });
          }

          const session = await ctx.context.internalAdapter.createSession(
            user.id,
            ctx,
          );

          if (!session) {
            return ctx.json(
              { error: "FAILED_TO_CREATE_SESSION" },
              { status: 400 },
            );
          }

          await setSessionCookie(ctx, {
            session,
            user,
          });

          return ctx.json({
            session,
            user,
          });
        },
      ),
      infoDeviceLink: createAuthEndpoint(
        "/device-link/info",
        {
          method: "GET",
          query: z.object({
            token: z.string().describe("Device link token"),
          }),
          requireHeaders: true,
          metadata: {
            openapi: {
              description: "Get basic info about device link",
              responses: {
                200: {
                  description: "Success",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          deviceName: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        async (ctx) => {
          const { token } = ctx.query;
          const tokenValue =
            await ctx.context.internalAdapter.findVerificationValue(token);
          if (!tokenValue) {
            return ctx.error(400, { message: "INVALID_TOKEN" });
          }
          if (tokenValue.expiresAt < new Date()) {
            await ctx.context.internalAdapter.deleteVerificationValue(
              tokenValue.id,
            );
            return ctx.error(400, { message: "EXPIRED_TOKEN" });
          }
          const parsedTokenValue: TokenValue = JSON.parse(tokenValue.value);
          // value is already set by another approval.
          if (parsedTokenValue.userId) {
            return ctx.error(400, { message: "INVALID_TOKEN" });
          }

          const session = await getSessionFromCtx(ctx, {
            disableRefresh: true,
          });
          if (!session) {
            return ctx.error(401, { message: "UNAUTHORIZED" });
          }

          return ctx.json({
            deviceName: parsedTokenValue.deviceName,
          });
        },
      ),
      approveDeviceLink: createAuthEndpoint(
        "/device-link/approve",
        {
          method: "POST",
          body: z.object({
            token: z.string().describe("Device link token"),
          }),
          requireHeaders: true,
          metadata: {
            openapi: {
              description: "Load session information from a device link token",
              responses: {
                200: {
                  description: "Success",
                },
              },
            },
          },
        },
        async (ctx) => {
          const { token } = ctx.body;
          const tokenValue =
            await ctx.context.internalAdapter.findVerificationValue(token);
          if (!tokenValue) {
            return ctx.error(400, { message: "INVALID_TOKEN" });
          }
          if (tokenValue.expiresAt < new Date()) {
            await ctx.context.internalAdapter.deleteVerificationValue(
              tokenValue.id,
            );
            return ctx.error(400, { message: "EXPIRED_TOKEN" });
          }
          const parsedTokenValue: TokenValue = JSON.parse(tokenValue.value);
          // value is already set by another approval.
          if (parsedTokenValue.userId) {
            return ctx.error(400, { message: "INVALID_TOKEN" });
          }

          const session = await getSessionFromCtx(ctx, {
            disableRefresh: true,
          });
          if (!session) {
            return ctx.error(401, { message: "UNAUTHORIZED" });
          }
          // approve verification token to be logined as the current user.
          await ctx.context.internalAdapter.updateVerificationValue(
            tokenValue.id,
            {
              value: JSON.stringify({
                ...parsedTokenValue,
                userId: session.user.id,
              }),
            },
          );

          return ctx.json({ success: true });
        },
      ),
    },
    rateLimit: [
      {
        pathMatcher(path) {
          return (
            path.startsWith("/sign-in/device-link") ||
            path.startsWith("/device-link")
          );
        },
        window: 60,
        max: 5,
      },
    ],
  } satisfies BetterAuthPlugin;
};
